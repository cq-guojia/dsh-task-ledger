//go:build linux || darwin

package store

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"syscall"
	"time"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
)

// 文件锁（unix 版）：只负责定义，**调用权归 actions/atom**（数据层禁止调用）。
// 锁的不是目标文件本身：按绝对路径 hash 在系统临时目录开 `<hash>.lock` 再 flock。

// ProgressLock 给一个台账文件加互斥锁：阻塞等待、没有超时、不可重入。返回解锁函数。
func ProgressLock(path string) (func(), error) {
	sum := sha256.Sum256([]byte(resolvePath(path)))
	key := hex.EncodeToString(sum[:])[:16]
	lockPath := filepath.Join(os.TempDir(), "koc-progress-"+key+".lock")
	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0o666)
	if err != nil {
		return nil, core.Failf("加锁 %s 失败：%v", lockPath, err)
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX); err != nil {
		f.Close()
		return nil, core.Failf("加锁 %s 失败：%v", lockPath, err)
	}
	return func() {
		_ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
		f.Close()
	}, nil
}

// SyncLock 整条命令的进程级互斥：写前同步 → 命令写入 → 提交推送，同一 clone 只允许一个。
//
// ProgressLock 只管单文件的读改写，盖不住「检查本地干净 → 覆盖文件」这两步之间的缝。
// 锁文件放 git 目录里（不进仓库、不被 git 状态看见）。拿不到就等，超时返回业务错误。
func SyncLock(dir string, timeout time.Duration) (func(), error) {
	lockPath := filepath.Join(dir, "dsh-task-ledger.sync.lock")
	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		return nil, core.Failf("拿不到同步锁 %s（%v），本次未做任何写入。\n"+
			"  处理：确认 git 目录可写；只需写本地文件可加 --no-sync，之后手动提交。", lockPath, err)
	}
	deadline := time.Now().Add(timeout)
	for {
		if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err == nil {
			break
		}
		if !time.Now().Before(deadline) {
			f.Close()
			return nil, core.Failf("另一个会话正在同步同一份台账（已等 %d 秒），请稍后重试。", int(timeout.Seconds()))
		}
		time.Sleep(100 * time.Millisecond)
	}
	return func() {
		_ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
		f.Close()
	}, nil
}

// LedgerLock 见 locks_common.go（多文件按路径排序依次加，平台无关）。
