//go:build linux || darwin

package shell

import (
	"os"
	"syscall"
	"unicode/utf8"
	"unsafe"
)

// 终端 raw 模式：关行缓冲 / 回显 / 信号，按字节即时可读。
//
// 只碰 termios 的位与 VMIN / VTIME 两个槽位，ioctl 号按平台在 term_ioctl_*.go 里给，
// 不引任何第三方依赖。「读有没有后续字节」也不靠 select / FIONREAD，而是临时把
// VMIN 设 0、VTIME 设 1（read 最多等 100ms 就返回 0），拿完再设回来 —— 纯 termios 语义，
// 两平台一致。

func ioctlTermios(fd int, req uintptr, term *syscall.Termios) error {
	if req == 0 {
		return syscall.ENOTTY
	}
	_, _, errno := syscall.Syscall(syscall.SYS_IOCTL, uintptr(fd), req, uintptr(unsafe.Pointer(term)))
	if errno != 0 {
		return errno
	}
	return nil
}

// isTerminal 这个 fd 是不是终端（拿得到 termios 就是）。
func isTerminal(fd int) bool {
	var term syscall.Termios
	return ioctlTermios(fd, ioctlGetTermios, &term) == nil
}

// termState 原 termios，退出时原样放回。
type termState struct {
	fd   int
	orig syscall.Termios
}

// makeRaw 进 raw 模式：关行缓冲 / 回显 / 信号，按字节即时可读。
func makeRaw(fd int) (*termState, error) {
	var orig syscall.Termios
	if err := ioctlTermios(fd, ioctlGetTermios, &orig); err != nil {
		return nil, err
	}
	raw := orig
	raw.Iflag &^= syscall.BRKINT | syscall.ICRNL | syscall.INPCK | syscall.ISTRIP | syscall.IXON
	raw.Oflag &^= syscall.OPOST
	raw.Cflag &^= syscall.CSIZE | syscall.PARENB
	raw.Cflag |= syscall.CS8
	raw.Lflag &^= syscall.ECHO | syscall.ICANON | syscall.IEXTEN | syscall.ISIG
	raw.Cc[syscall.VMIN] = 1
	raw.Cc[syscall.VTIME] = 0
	if err := ioctlTermios(fd, ioctlSetTermios, &raw); err != nil {
		return nil, err
	}
	return &termState{fd: fd, orig: orig}, nil
}

// restore 原样放回调用前的终端设置。
func (t *termState) restore() {
	if t == nil {
		return
	}
	orig := t.orig
	_ = ioctlTermios(t.fd, ioctlSetTermios, &orig)
}

// setReadTimeout 开/关「读超时」：VMIN=0 + VTIME=1 ⇒ read 最多等 100ms，没字节就返回 0。
func (t *termState) setReadTimeout(on bool) {
	if t == nil {
		return
	}
	var term syscall.Termios
	if err := ioctlTermios(t.fd, ioctlGetTermios, &term); err != nil {
		return
	}
	if on {
		term.Cc[syscall.VMIN] = 0
		term.Cc[syscall.VTIME] = 1
	} else {
		term.Cc[syscall.VMIN] = 1
		term.Cc[syscall.VTIME] = 0
	}
	_ = ioctlTermios(t.fd, ioctlSetTermios, &term)
}

// readOne 读一个字节。ok=false 表示这次没读到（超时或 EOF），不是错误。
func readOne(fd int) (byte, bool, error) {
	var buf [1]byte
	for {
		n, err := syscall.Read(fd, buf[:])
		if n == 1 {
			return buf[0], true, nil
		}
		if err == syscall.EINTR {
			continue
		}
		if err != nil {
			return 0, false, err
		}
		return 0, false, nil
	}
}

// readKey 读一次按键：方向键是 ESC 序列（ESC [ A/B 或 ESC O A/B），ESC 单独按 = 取消。
// 区分「单独 ESC」与「方向键前缀」靠 100ms 读超时。
func (t *termState) readKey() key {
	ch, ok, err := readOne(t.fd)
	if err != nil || !ok {
		return keyCancel
	}
	switch ch {
	case 0x1b:
		t.setReadTimeout(true)
		next, gotNext, _ := readOne(t.fd)
		t.setReadTimeout(false)
		if !gotNext {
			return keyCancel
		}
		if next != '[' && next != 'O' {
			return keyNone
		}
		arrow, gotArrow, _ := readOne(t.fd)
		if !gotArrow {
			return keyNone
		}
		switch arrow {
		case 'A':
			return keyUp
		case 'B':
			return keyDown
		}
		return keyNone
	case '\r', '\n':
		return keyEnter
	case 0x03: // Ctrl-C（raw 关了 ISIG，信号变成字节）
		return keyCancel
	}
	return keyNone
}

// promptLineRaw 在 raw 模式逐键读一行：ESC 回上一步、Ctrl-C 取消、Enter 确认、Backspace 退格。
// 输入框下面垫一行灰色帮助（hint）。返回 (读到的内容, 结果, 是否由本函数处理)；
// handled=false 表示拿不到 raw 终端（非终端 / raw 失败），调用方退回普通行读。
//
// 渲染用整块重绘：光标始终停在 hint 行末尾，每键从行首重画输入行 —— 不做任何
// 光标算术（算不准 prompt 的显示宽度，中文双宽一算就歪）。
func promptLineRaw(prompt, hint string) (string, lineResult, bool) {
	fd := int(os.Stdin.Fd())
	state, err := makeRaw(fd)
	if err != nil {
		return "", lineEOF, false
	}
	defer state.restore()

	var buf []byte
	redraw := func() {
		os.Stdout.WriteString("\x1b[1A\x1b[2K\r" + prompt + string(buf) + "\r\n\x1b[2K\r" + dim(hint))
	}
	os.Stdout.WriteString(prompt + "\r\n" + dim(hint))

	for {
		ch, ok, err := readOne(fd)
		if err != nil || !ok {
			os.Stdout.WriteString("\r\n")
			return "", lineEOF, true
		}
		switch ch {
		case 0x1b:
			// 单独 ESC = 回上一步；ESC [ / ESC O 开头的方向键序列吞掉（输入名字用不上方向键）
			state.setReadTimeout(true)
			next, gotNext, _ := readOne(fd)
			state.setReadTimeout(false)
			if gotNext && (next == '[' || next == 'O') {
				readOne(fd) // 吞掉方向键的第三个字节
				continue
			}
			os.Stdout.WriteString("\r\n")
			return "", lineBack, true
		case '\r', '\n':
			os.Stdout.WriteString("\r\n")
			return string(buf), lineOK, true
		case 0x03: // Ctrl-C
			os.Stdout.WriteString("\r\n")
			return "", lineEOF, true
		case 0x7f, 0x08: // Backspace / Ctrl-H
			if len(buf) == 0 {
				continue
			}
			_, size := utf8.DecodeLastRuneInString(string(buf))
			if size <= 0 {
				size = 1
			}
			buf = buf[:len(buf)-size]
			redraw()
		default:
			buf = append(buf, ch)
			redraw()
		}
	}
}
