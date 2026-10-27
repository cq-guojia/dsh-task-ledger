//go:build darwin || freebsd || netbsd || openbsd || dragonfly

package shell

import "syscall"

// BSD 系的 termios ioctl 号。
var (
	ioctlGetTermios = uintptr(syscall.TIOCGETA)
	ioctlSetTermios = uintptr(syscall.TIOCSETA)
)
