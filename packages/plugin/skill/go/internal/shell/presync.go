package shell

import (
	"github.com/cq-guojia/dsh-task-ledger/skill/internal/actions"
	"github.com/cq-guojia/dsh-task-ledger/skill/internal/core"
)

// 取最新要刷哪些文件：**全仓唯一算锁集的地方**。
// 返回两份 Scope（自举那份、动作那份）。runner 拿它做三件事：
// SyncDown(boot | act) / Atom(*boot.Files) 包自举 / Atom(*act.Files) 包动作。
// 它本来就不碰 git —— --no-sync 也照调。

// PresyncScope (自举那份, 动作那份)。只读动作由 runner 直接跳过，不进这里。
func PresyncScope(repo string, me core.Identity, action string, params map[string]any) (actions.Scope, actions.Scope, error) {
	boot, err := actions.LockScope(repo, me, "bootstrap", params)
	if err != nil {
		return actions.Scope{}, actions.Scope{}, err
	}
	if action == "bootstrap" {
		return boot, actions.Scope{}, nil
	}
	act, err := actions.LockScope(repo, me, action, params)
	if err != nil {
		return actions.Scope{}, actions.Scope{}, err
	}
	return boot, act, nil
}
