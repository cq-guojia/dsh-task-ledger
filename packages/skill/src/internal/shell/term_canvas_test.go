package shell

import (
	"bytes"
	"strings"
	"testing"
)

// 终端交互这块最容易出的两类错：
//  1. 回显按字节搞错（中文变乱码）；
//  2. 收尾没把画出来的那几行抹掉（屏幕上摞着一堆残留）。
// 所以这里钉的是**字节序列**：画了什么、抹了什么，一字节一字节对。

func newTestCanvas() (canvas, *bytes.Buffer) {
	buf := &bytes.Buffer{}
	c := newCanvas(buf)
	return c, buf
}

func TestEditorLayoutPutsCursorOnPromptLine(t *testing.T) {
	c, buf := newTestCanvas()
	newLineEditor(&c, "输入用户名：", "帮助")

	// 提示行 → 空行 → 帮助行；光标回到提示行末尾（按显示宽度定位：12 列）。
	want := "\r\n" + "输入用户名：" + "\r\n" + dim("帮助") + "\r\n" + "\x1b[2A" + "\r\x1b[12C"
	if got := buf.String(); got != want {
		t.Fatalf("输入框布局不对：\n得到 %q\n期望 %q", got, want)
	}
}

func TestEditorEchoesUTF8BytesVerbatim(t *testing.T) {
	// 回归：曾经把字节当码点再编码（string(ch)），「中」变成 6 字节乱码。
	c, buf := newTestCanvas()
	editor := newLineEditor(&c, "名字：", "")

	for _, b := range []byte("中") {
		editor.typeByte(b)
	}
	got := buf.String()
	if !strings.Contains(got, "中") {
		t.Fatalf("中文没原样回显，输出 %q", got)
	}
	// 「中」被二次编码后的样子：U+00E4 U+00B8 U+00AD
	if strings.Contains(got, "\u00e4\u00b8\u00ad") {
		t.Fatalf("中文被二次编码了（字节当码点），输出 %q", got)
	}
	if string(editor.buf) != "中" {
		t.Fatalf("收进来的内容不对：%q", string(editor.buf))
	}
	if c.col != 8 { // 「名字：」6 列 + 「中」2 列
		t.Fatalf("光标列不对：%d", c.col)
	}
}

func TestEditorBackspaceRemovesWholeRune(t *testing.T) {
	c, buf := newTestCanvas()
	editor := newLineEditor(&c, "名字：", "")

	for _, b := range []byte("中文") {
		editor.typeByte(b)
	}
	buf.Reset()

	editor.backspace()
	if string(editor.buf) != "中" {
		t.Fatalf("退格应按字符退（中文一个字），实际 %q", string(editor.buf))
	}
	// 宽字符占两列：左移 2 → 擦两格 → 再左移 2
	want := "\x1b[2D  \x1b[2D"
	if got := buf.String(); got != want {
		t.Fatalf("退格擦除序列不对：\n得到 %q\n期望 %q", got, want)
	}
}

func TestEditorKeepLeavesPromptRemovesHint(t *testing.T) {
	c, buf := newTestCanvas()
	editor := newLineEditor(&c, "名字：", "帮助")
	buf.Reset()

	editor.keep()
	// 往下两行（空行 + 帮助行）抹掉，光标停在提示行下面。
	want := "\x1b[2B\x1b[2K\r\x1b[1A\x1b[2K\r"
	if got := buf.String(); got != want {
		t.Fatalf("确认后的收尾序列不对：\n得到 %q\n期望 %q", got, want)
	}
}

func TestEditorWipeClearsWholeBlock(t *testing.T) {
	c, buf := newTestCanvas()
	editor := newLineEditor(&c, "名字：", "帮助")
	buf.Reset()

	editor.wipe()
	// 三行全抹（提示行 + 空行 + 帮助行），光标回到块顶行首。
	want := "\x1b[2K\r\x1b[1B\x1b[2K\r\x1b[1B\x1b[2K\r\x1b[2A"
	if got := buf.String(); got != want {
		t.Fatalf("取消后的收尾序列不对：\n得到 %q\n期望 %q", got, want)
	}
	if c.row != 0 || c.dirty {
		t.Fatalf("取消后光标应回到块顶行首：row=%d dirty=%v", c.row, c.dirty)
	}
}

func TestCanvasEraseBlockOnlyTouchesOwnRows(t *testing.T) {
	// 选择框收尾：只抹自己那几行，不能把上面那行（shell 提示）也吃掉。
	c, buf := newTestCanvas()
	c.beginBlock()
	c.drawRows([]string{"一", "二", "三"})
	buf.Reset()

	c.eraseBlock()
	want := "\x1b[1A\x1b[2K\r" + "\x1b[1A\x1b[2K\r" + "\x1b[1A\x1b[2K\r"
	if got := buf.String(); got != want {
		t.Fatalf("抹块的序列不对（多一行会吃掉上面的输出）：\n得到 %q\n期望 %q", got, want)
	}
	if c.row != 0 {
		t.Fatalf("抹完光标应停在块顶：row=%d", c.row)
	}
}

func TestCanvasRedrawGoesBackToBlockTop(t *testing.T) {
	c, buf := newTestCanvas()
	c.beginBlock()
	c.drawRows([]string{"一", "二"})
	buf.Reset()

	c.redraw()
	if got := buf.String(); got != "\x1b[2A" {
		t.Fatalf("重画应先回到块顶，得到 %q", got)
	}
	if c.row != 0 {
		t.Fatalf("重画后光标应在块顶：row=%d", c.row)
	}
}

func TestDisplayWidthIgnoresANSISequences(t *testing.T) {
	cases := []struct {
		text string
		want int
	}{
		{"abc", 3},
		{"输入用户名：", 12},
		{"中", 2},
		{dim("帮助"), 4},
		{"\x1b[1;36m" + "标题" + "\x1b[0m", 4},
	}
	for _, c := range cases {
		if got := displayWidth(c.text); got != c.want {
			t.Errorf("displayWidth(%q) = %d，期望 %d", c.text, got, c.want)
		}
	}
}
