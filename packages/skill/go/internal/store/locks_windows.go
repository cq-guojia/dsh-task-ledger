//go:build windows

package store

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"syscall"
	"time"
	"unsafe"

	"github.com/cq-guojia/dsh-task-ledger/skill/internal/core"
)

// 文件锁（Windows 版）：用 LockFileEx 代替 flock，语义对齐 unix 那份。
// 锁的不是目标文件本身：按绝对路径 hash 在系统临时目录开 `<hash>.lock` 再加锁。

const (
	lockfileFailImmediately = 0x00000001
	lockfileExclusiveLock   = 0x00000002
)

// overlapped OVERLAPPED 结构（LockFileEx 要它，哪怕只锁 1 个字节）。
type overlapped struct {
	Internal     uintptr
	InternalHigh uintptr
	Offset       uint32
	OffsetHigh   uint32
	HEvent       syscall.Handle
}

var (
	procLockFileEx   = syscall.NewLazyDLL("kernel32.dll").NewProc("LockFileEx")
	procUnlockFileEx = syscall.NewLazyDLL("kernel32.dll").NewProc("UnlockFileEx")
)

func lockFile(f *os.File, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for {
		var ol overlapped
		ok, _, err := procLockFileEx.Call(
			f.Fd(),
			uintptr(lockfileExclusiveLock|lockfileFailImmediately),
			0, 1, 0,
			uintptr(unsafe.Pointer(&ol)),
		)
		if ok != 0 {
			return nil
		}
		if !time.Now().Before(deadline) {
			return err
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func unlockFile(f *os.File) {
	var ol overlapped
	_, _, _ = procUnlockFileEx.Call(f.Fd(), 0, 1, 0, uintptr(unsafe.Pointer(&ol)))
}

// ProgressLock 给一个台账文件加互斥锁：阻塞等待（长超时兜底）、不可重入。返回解锁函数。
func ProgressLock(path string) (func(), error) {
	sum := sha256.Sum256([]byte(resolvePath(path)))
	key := hex.EncodeToString(sum[:])[:16]
	lockPath := filepath.Join(os.TempDir(), "koc-progress-"+key+".lock")
	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0o666)
	if err != nil {
		return nil, core.Failf("加锁 %s 失败：%v", lockPath, err)
	}
	// unix 的 flock(LOCK_EX) 是死等；这里给 24h 兜底，避免拿不到锁时进程永远挂着
	if err := lockFile(f, 24*time.Hour); err != nil {
		f.Close()
		return nil, core.Failf("加锁 %s 失败：%v", lockPath, err)
	}
	return func() {
		unlockFile(f)
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
	if err := lockFile(f, timeout); err != nil {
		f.Close()
		return nil, core.Failf("另一个会话正在同步同一份台账（已等 %d 秒），请稍后重试。", int(timeout.Seconds()))
	}
	return func() {
		unlockFile(f)
		f.Close()
	}, nil
}
