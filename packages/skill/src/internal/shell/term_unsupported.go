//go:build !linux && !darwin && !windows

package shell

import "errors"

// 没适配过的平台：没有终端交互能力。
//
// isTerminal 恒假 ⇒ 进不了 raw 模式、init 退回「打印名单 + 让用户自己跑 --claim/--new」，
// 不崩、不误判成终端。只为让这些平台能编译通过；交付的三平台各走 term_unix.go / term_windows.go。

func isTerminal(fd int) bool { return false }

type termState struct{ fd int }

func makeRaw(fd int) (*termState, error) {
	return nil, errors.New("这个平台没有终端交互支持")
}

func (t *termState) restore() {}

func (t *termState) setReadTimeout(on bool) {}

func (t *termState) readKey() key { return keyCancel }

// promptLineRaw 这份平台没有终端交互能力，走普通行读。
func promptLineRaw(prompt, hint string) (string, lineResult, bool) { return "", lineEOF, false }
