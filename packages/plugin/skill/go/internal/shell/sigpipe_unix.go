//go:build !windows

package shell

import (
	"os"
	"os/signal"
	"syscall"
)

// IgnoreSIGPIPE 让「下游提前关管道」变成写失败而不是进程直接被信号杀掉。
//
// 输出被 `head` 之类截断时，文件已经写完，提交推送必须照常走完
// （否则台账留在「已写未提交」，下一条写命令被写前 guard 拦死）。
func IgnoreSIGPIPE() {
	signal.Notify(make(chan os.Signal, 1), syscall.SIGPIPE)
}
