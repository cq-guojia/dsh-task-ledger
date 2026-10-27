//go:build windows

package shell

import (
	"syscall"
)

// Windows 控制台版 raw 模式：等价 unix 那份的能力集，不引第三方依赖。
//
// 两个关键点：
//   - 打开 ENABLE_VIRTUAL_TERMINAL_INPUT（Win10 1607+）后，方向键会像终端一样吐
//     `ESC [ A/B` 字节，正好复用同一套解析；老系统开不起来就退回控制台扫描码
//     （0x00 / 0xE0 前缀 + 0x48 上 / 0x50 下）。
//   - 没有 VTIME，所以「等 100ms 看有没有后续字节」用 WaitForSingleObject 实现。
//
// 注：这份实现只做过交叉编译，没在真实 Windows 控制台上跑过（本机无环境）。
// 逻辑与 unix 版逐分支对应，参数取自 Win32 文档。

const (
	enableProcessedInput = 0x0001
	enableLineInput      = 0x0002
	enableEchoInput      = 0x0004
	enableVTInput        = 0x0200
)

var procSetConsoleMode = syscall.NewLazyDLL("kernel32.dll").NewProc("SetConsoleMode")

// termState 原控制台模式，退出时原样放回。
type termState struct {
	fd   int
	orig uint32
}

// isTerminal 拿得到控制台模式就是终端。
func isTerminal(fd int) bool {
	var mode uint32
	return syscall.GetConsoleMode(syscall.Handle(fd), &mode) == nil
}

// makeRaw 关行缓冲 / 回显 / 信号处理，并尽量打开 VT 输入。
func makeRaw(fd int) (*termState, error) {
	handle := syscall.Handle(fd)
	var orig uint32
	if err := syscall.GetConsoleMode(handle, &orig); err != nil {
		return nil, err
	}
	want := orig &^ uint32(enableEchoInput|enableLineInput|enableProcessedInput)
	// VT 输入能开就开（方向键走 ESC 序列）；开不起来也不报错，readKey 里兼容扫描码
	if err := setConsoleMode(handle, want|enableVTInput); err != nil {
		_ = setConsoleMode(handle, want)
	}
	return &termState{fd: fd, orig: orig}, nil
}

func setConsoleMode(handle syscall.Handle, mode uint32) error {
	result, _, err := procSetConsoleMode.Call(uintptr(handle), uintptr(mode))
	if result == 0 {
		return err
	}
	return nil
}

// restore 原样放回调用前的控制台模式。
func (t *termState) restore() {
	if t == nil {
		return
	}
	_ = setConsoleMode(syscall.Handle(t.fd), t.orig)
}

// setReadTimeout Windows 没有 VTIME：超时改由 waitInput 显式等。
func (t *termState) setReadTimeout(on bool) {}

// waitInput 最多等 timeoutMs 毫秒看有没有可读输入。
func waitInput(fd int, timeoutMs uint32) bool {
	event, err := syscall.WaitForSingleObject(syscall.Handle(fd), timeoutMs)
	return err == nil && event == syscall.WAIT_OBJECT_0
}

// readOne 读一个字节。ok=false 表示这次没读到（超时或 EOF），不是错误。
func readOne(fd int) (byte, bool, error) {
	var buf [1]byte
	for {
		n, err := syscall.Read(syscall.Handle(fd), buf[:])
		if n == 1 {
			return buf[0], true, nil
		}
		if err == nil {
			return 0, false, nil
		}
		if errno, ok := err.(syscall.Errno); ok && errno == syscall.ERROR_IO_PENDING {
			continue // 控制台输入端偶发：重试一次即可
		}
		return 0, false, err
	}
}

// readKey 与 unix 版同语义：方向键 → 上/下，ESC 单独按 → 取消，Enter → 确认，Ctrl-C → 取消。
// promptLineRaw 这份平台暂不做逐键读行（走普通行读，ESC 不生效）。
func promptLineRaw(prompt string) (string, bool, bool) { return "", false, false }

func (t *termState) readKey() key {
	ch, ok, err := readOne(t.fd)
	if err != nil || !ok {
		return keyCancel
	}
	switch ch {
	case 0x1b:
		// VT 输入正常时的方向键：ESC [ A/B（或 ESC O A/B）
		if !waitInput(t.fd, 100) {
			return keyCancel
		}
		next, gotNext, _ := readOne(t.fd)
		if !gotNext {
			return keyNone
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
	case 0x00, 0xe0:
		// 老系统 / 没开 VT 输入时的控制台扫描码
		scan, gotScan, _ := readOne(t.fd)
		if !gotScan {
			return keyNone
		}
		switch scan {
		case 0x48:
			return keyUp
		case 0x50:
			return keyDown
		}
		return keyNone
	case '\r', '\n':
		return keyEnter
	case 0x03: // Ctrl-C（已关 ENABLE_PROCESSED_INPUT，信号变成字节）
		return keyCancel
	}
	return keyNone
}
