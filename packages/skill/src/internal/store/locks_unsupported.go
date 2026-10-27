//go:build !linux && !darwin && !windows

package store

import "time"

// 没适配过的平台：不加锁，直接放行（与旧实现「平台没有 fcntl / msvcrt 时直接不加锁」同口径）。
//
// 只为让这些平台能编译通过；交付的三平台各走 locks.go（flock）/ locks_windows.go（LockFileEx）。
// 不加锁的后果：同一台账被两个进程同时写时可能互相覆盖 —— 个人单机场景的既有取舍，别在这里补兜底。

// ProgressLock 单文件互斥：本平台不支持，返回空解锁。
func ProgressLock(path string) (func(), error) { return func() {}, nil }

// SyncLock 整条命令互斥：本平台不支持，返回空解锁。
func SyncLock(dir string, timeout time.Duration) (func(), error) { return func() {}, nil }
