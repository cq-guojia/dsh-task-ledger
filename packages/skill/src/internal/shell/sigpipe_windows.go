//go:build windows

package shell

// IgnoreSIGPIPE Windows 没有 SIGPIPE 语义（管道断裂表现为写错误），无需处理。
func IgnoreSIGPIPE() {}
