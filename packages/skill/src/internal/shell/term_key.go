package shell

// 按键语义：菜单只关心这几个，具体怎么从终端读出来各平台自己实现
// （unix 解析 ESC 序列、Windows 解析控制台扫描码）。
type key int

const (
	keyNone key = iota
	keyUp
	keyDown
	keyEnter
	keyCancel
)
