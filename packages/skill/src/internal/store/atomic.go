package store

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
)

// 怎么安全地写一个文件：唯一写盘出口。不打印、不跑 git、不自己加锁。

// EnsureDir 建目录（mkdir -p 语义）。**全仓唯一建目录的地方**。
func EnsureDir(path string) error {
	if err := os.MkdirAll(path, 0o777); err != nil {
		return core.Failf("建目录 %s 失败：%v", path, err)
	}
	return nil
}

// WriteTextAtomic 原子写文本：同目录临时文件 → 写 → fsync → 继承权限 → replace → fsync 父目录。
func WriteTextAtomic(path, text string, track bool) error {
	parent := filepath.Dir(path)
	info, statErr := os.Lstat(parent)
	if statErr != nil || !info.IsDir() {
		return core.Failf("写 %s 失败：父目录 %s 不存在（建目录要显式调 EnsureDir）。", path, parent)
	}
	if fi, err := os.Lstat(path); err == nil && fi.Mode()&os.ModeSymlink != 0 {
		return core.Failf("拒绝写入 %s：它是符号链接，写入会把它替换成普通文件", path)
	}
	mode := os.FileMode(0o644)
	existed := false
	if fi, err := os.Stat(path); err == nil {
		mode = fi.Mode().Perm()
		existed = true
	}
	tmp, err := os.CreateTemp(parent, filepath.Base(path)+".*.tmp")
	if err != nil {
		return core.Failf("写 %s 失败：%v\n  处理：确认该路径可写、磁盘没满，然后重跑这条命令（文件是整份替换，不会写坏）。", path, err)
	}
	tmpName := tmp.Name()
	cleanup := func() {
		tmp.Close()
		os.Remove(tmpName)
	}
	if _, err := tmp.WriteString(text); err != nil {
		cleanup()
		return core.Failf("写 %s 失败：%v\n  处理：确认该路径可写、磁盘没满，然后重跑这条命令（文件是整份替换，不会写坏）。", path, err)
	}
	if err := tmp.Sync(); err != nil {
		cleanup()
		return core.Failf("写 %s 失败：%v", path, err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return core.Failf("写 %s 失败：%v", path, err)
	}
	if err := os.Chmod(tmpName, mode); err != nil {
		os.Remove(tmpName)
		return core.Failf("写 %s 失败：%v", path, err)
	}
	if err := os.Rename(tmpName, path); err != nil {
		os.Remove(tmpName)
		return core.Failf("写 %s 失败：%v\n  处理：确认该路径可写、磁盘没满，然后重跑这条命令（文件是整份替换，不会写坏）。", path, err)
	}
	fsyncDir(parent)
	Current().Record(path, track, !existed)
	return nil
}

// fsyncDir 刷父目录：掉电时 rename 的目录项可能丢，只刷文件是不够的。
func fsyncDir(dir string) {
	f, err := os.Open(dir)
	if err != nil {
		return
	}
	defer f.Close()
	_ = f.Sync()
}

// Fingerprint 文件内容 sha256，用来判「我读完以后别人动过没有」。
func Fingerprint(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return ""
		}
		return "unreadable"
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// Snapshot 写之前把原文留一份字节；原本不存在返回 (nil,false)。
func Snapshot(path string) ([]byte, bool, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, false, nil
		}
		return nil, false, core.Failf("读 %s 失败：%v", path, err)
	}
	return data, true, nil
}

// Restore 按字节还原：had=false 表示原本不存在 ⇒ 删掉。恢复本身不进记账本。
func Restore(path string, before []byte, had bool) error {
	if !had {
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return core.Failf("撤销 %s 失败：%v", path, err)
		}
		return nil
	}
	return WriteTextAtomic(path, string(before), false)
}

// 让 fmt 在本文件被用到（错误文案统一走 core.Failf）。
var _ = fmt.Sprintf
