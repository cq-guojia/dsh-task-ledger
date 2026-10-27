// Package notices 进程级提示收集器：只收文本，永不打印。
// 各层都能往里放，最后由 shell/render 一次性打到 stderr；同一句只收一次。
package notices

import "strings"

var (
	seen  = map[string]bool{}
	items []string
)

// Note 收一条提示；重复的同一句自动忽略。
func Note(text string) {
	line := strings.TrimSpace(text)
	if line == "" || seen[line] {
		return
	}
	seen[line] = true
	items = append(items, line)
}

// Warnings 取当前全部提示。
func Warnings() []string { return append([]string{}, items...) }

// Clear 清空。
func Clear() {
	seen = map[string]bool{}
	items = nil
}
