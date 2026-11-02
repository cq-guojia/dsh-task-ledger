package actions

import (
	"os"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/env"
)

// Logout 清掉本机身份文件：这台机器回到「没有身份」。
// **不动任何台账**——名册行与分片由 forget 逐本各删各的。
//
// 为什么单独一条命令：界面删自己时要把所有台账都摘一遍，而 forget 一旦顺手清身份，
// 先跑完的那本就会让后面几本读不到身份（报「这台机器还没有初始化身份」）。
// 于是 forget 带 --keep-identity 跑完，最后才由这里退出登录。
func Logout(me core.Identity) (*Result, error) {
	path, err := env.IdentityFile()
	if err != nil {
		return nil, err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return nil, core.Failf("清本机身份失败：%s\n  处理：确认该文件可删（权限 / 只读挂载）后重试；台账数据不受影响。", err.Error())
	}
	payload := map[string]any{"cleared": true}
	if me.UUID != "" {
		payload["uuid"] = me.UUID
	}
	if me.Name != "" {
		payload["name"] = me.Name
	}
	return &Result{Payload: payload}, nil
}
