package shell

import (
	"io"
	"os"
	"strconv"
	"strings"
	"unicode/utf8"
)

// 终端画布：只管我们自己画出来的那几行。
//
// 为什么自己记账：raw 模式下没法问终端「光标在哪」（要发 DSR 等回包，交互程序里不值当），
// 所以光标位置一律自己推：
//   - row：光标相对**块顶**的行偏移；
//   - col：光标所在列；
//   - dirty：当前行有没有内容（false = 空行，下一块可以原地画，不留空行）。
//
// 有这三样，「画一块 / 重画一块 / 抹掉一块」才算得准：屏幕上不会留残迹，
// 光标也不会飘到别的行上去。

// canvas 我们自己画出来的那几行。
type canvas struct {
	w      io.Writer
	row    int  // 光标相对块顶的行偏移
	col    int  // 光标所在列
	dirty  bool // 当前行有内容吗
	height int  // 当前块占几行
}

// screen 全局画布：选择框与输入框共用一份光标账（同一块屏幕，账不能分两份）。
var screen = newCanvas(os.Stdout)

// newCanvas 一块新画布。dirty 初值 true：进程刚起来时光标停在 shell 提示行末尾（那行有内容）。
func newCanvas(w io.Writer) canvas {
	return canvas{w: w, dirty: true}
}

// writeRaw 写一串字节。**终端写失败无处可报**（stdout 断了就没了），所以这里显式丢掉，
// 不让每一步都拖一条返回值。
func writeRaw(w io.Writer, text string) {
	_, _ = w.Write([]byte(text))
}

// write 输出文本并推进光标列。
func (c *canvas) write(text string) {
	writeRaw(c.w, text)
	c.col += displayWidth(text)
	c.dirty = true
}

// newline 换行。raw 模式关了 OPOST，光秃秃的 "\n" 只下移不回车 —— 必须写 "\r\n"。
func (c *canvas) newline() {
	writeRaw(c.w, "\r\n")
	c.row++
	c.col = 0
	c.dirty = false
}

// up 光标上移 n 行（列不变）。
func (c *canvas) up(n int) {
	if n <= 0 {
		return
	}
	writeRaw(c.w, "\x1b["+strconv.Itoa(n)+"A")
	c.row -= n
}

// down 光标下移 n 行（列不变）。
func (c *canvas) down(n int) {
	if n <= 0 {
		return
	}
	writeRaw(c.w, "\x1b["+strconv.Itoa(n)+"B")
	c.row += n
}

// toCol 光标移到指定列（从行首算）。
func (c *canvas) toCol(col int) {
	if col <= 0 {
		writeRaw(c.w, "\r")
		c.col = 0
		return
	}
	writeRaw(c.w, "\r\x1b["+strconv.Itoa(col)+"C")
	c.col = col
}

// clearLine 清整行，光标回行首。
func (c *canvas) clearLine() {
	writeRaw(c.w, "\x1b[2K\r")
	c.col = 0
	c.dirty = false
}

// beginBlock 开始画一块：当前行有内容就先换到新行（不能盖掉用户已有的输出）。
func (c *canvas) beginBlock() {
	if c.dirty {
		c.newline()
	}
	c.row = 0
	c.height = 0
}

// drawRows 画若干行（每行覆盖当前行），块高记进 height。
func (c *canvas) drawRows(rows []string) {
	for _, row := range rows {
		c.clearLine()
		c.write(row)
		c.newline()
	}
	c.height = len(rows)
}

// redraw 重画当前块：先回到块顶。
func (c *canvas) redraw() {
	c.up(c.height)
	c.height = 0
}

// eraseBlock 抹掉当前块：逐行往上清，光标停在块顶行首（屏幕回到画之前的样子）。
func (c *canvas) eraseBlock() {
	for i := 0; i < c.height; i++ {
		c.up(1)
		c.clearLine()
	}
	c.height = 0
}

// lineEditor 一个输入框：提示行 → 空行 → 灰色帮助行，光标落在提示行末尾。
type lineEditor struct {
	c       *canvas
	buf     []byte // 已收齐的字符（UTF-8 字节）
	pending []byte // 还没收齐的多字节字符（半个中文）
}

// newLineEditor 画出输入框，光标定位到提示行末尾。
func newLineEditor(c *canvas, prompt, hint string) *lineEditor {
	e := &lineEditor{c: c}
	e.c.beginBlock()
	e.c.write(prompt)    // 提示行（块顶）
	e.c.newline()        // 空行：真留一排，这一排什么都不画
	e.c.newline()        // 再下一排 → 帮助行
	e.c.write(dim(hint)) // 帮助行
	e.c.newline()        // 走到块下面
	e.c.up(3)            // 回到提示行
	e.c.toCol(displayWidth(prompt))
	e.c.height = 3
	return e
}

// typeByte 收一个输入字节。多字节字符（中文）等收齐了整字才上屏：半个字上屏就是乱码。
func (e *lineEditor) typeByte(ch byte) {
	if len(e.pending) == 0 && ch < 0x80 {
		e.buf = append(e.buf, ch)
		writeRaw(e.c.w, string(ch)) // 字节原样回写：终端自己按 UTF-8 渲染
		e.c.col++
		e.c.dirty = true
		return
	}
	e.pending = append(e.pending, ch)
	if !utf8.FullRune(e.pending) {
		return // 还没收齐，等下一个字节
	}
	r, size := utf8.DecodeRune(e.pending)
	if r == utf8.RuneError && size <= 1 {
		e.pending = nil // 不是合法 UTF-8：丢掉，不上屏
		return
	}
	writeRaw(e.c.w, string(e.pending))
	e.buf = append(e.buf, e.pending...)
	e.c.col += runeWidth(r)
	e.c.dirty = true
	e.pending = nil
}

// backspace 退格：按**字符**退（不是按字节），并把屏幕上那几列擦干净。
func (e *lineEditor) backspace() {
	if len(e.buf) == 0 {
		return
	}
	r, size := utf8.DecodeLastRuneInString(string(e.buf))
	if size <= 0 {
		size = 1
	}
	e.buf = e.buf[:len(e.buf)-size]
	w := runeWidth(r) // 宽字符占两列
	e.c.col -= w
	writeRaw(e.c.w, "\x1b["+strconv.Itoa(w)+"D"+strings.Repeat(" ", w)+"\x1b["+strconv.Itoa(w)+"D")
}

// keep 收尾（确认）：留下提示行当输入记录，空行与帮助行抹掉，光标停在提示行下面。
func (e *lineEditor) keep() {
	e.c.down(2)     // → 帮助行
	e.c.clearLine() // 抹掉
	e.c.up(1)       // → 空行
	e.c.clearLine() // 抹掉
	e.c.height = 1
}

// wipe 收尾（取消 / 输入无效）：整块抹掉，光标回到块顶行首 —— 屏幕上不留残迹。
func (e *lineEditor) wipe() {
	if e.c.height == 0 {
		return
	}
	e.c.up(e.c.row) // 回到块顶
	e.c.clearLine()
	for i := 1; i < e.c.height; i++ {
		e.c.down(1)
		e.c.clearLine()
	}
	e.c.up(e.c.height - 1)
	e.c.height = 0
}

// displayWidth 终端显示宽度：宽字符（中日韩、全角）算两列，其余一列；ANSI 转义序列不算宽度。
func displayWidth(s string) int {
	w := 0
	for _, r := range stripANSI(s) {
		w += runeWidth(r)
	}
	return w
}

// runeWidth 单个 rune 的显示宽度（1 或 2）。
func runeWidth(r rune) int {
	switch {
	case r >= 0x1100 && r <= 0x115F, // 韩文字母
		r >= 0x2E80 && r <= 0xA4CF,   // CJK 部首 … 彝文
		r >= 0xAC00 && r <= 0xD7A3,   // 韩文音节
		r >= 0xF900 && r <= 0xFAFF,   // CJK 兼容表意文字
		r >= 0xFE30 && r <= 0xFE6F,   // CJK 兼容形式
		r >= 0xFF00 && r <= 0xFF60,   // 全角 ASCII
		r >= 0xFFE0 && r <= 0xFFE6,   // 全角符号
		r >= 0x20000 && r <= 0x3FFFD: // CJK 扩展 B 起
		return 2
	}
	return 1
}

// stripANSI 去掉 ANSI 转义序列（算显示宽度前先剥掉）。
func stripANSI(s string) string {
	if !strings.Contains(s, "\x1b[") {
		return s
	}
	var b strings.Builder
	for i := 0; i < len(s); {
		if s[i] == 0x1b && i+1 < len(s) && s[i+1] == '[' {
			j := i + 2
			for j < len(s) && (s[j] < 0x40 || s[j] > 0x7e) {
				j++
			}
			if j < len(s) {
				j++
			}
			i = j
			continue
		}
		b.WriteByte(s[i])
		i++
	}
	return b.String()
}
