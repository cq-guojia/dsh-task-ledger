// 命令入口：只转发参数与退出码，逻辑全在 internal/shell。
package main

import (
	"os"

	"github.com/cq-guojia/dsh-task-ledger/skill/internal/shell"
)

func main() {
	os.Exit(shell.Main(os.Args[1:]))
}
