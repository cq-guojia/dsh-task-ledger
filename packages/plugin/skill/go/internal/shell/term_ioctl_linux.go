//go:build linux

package shell

import "syscall"

// Linux 的 termios ioctl 号（amd64 / arm64 同值）。
var (
	ioctlGetTermios = uintptr(syscall.TCGETS)
	ioctlSetTermios = uintptr(syscall.TCSETS)
)
