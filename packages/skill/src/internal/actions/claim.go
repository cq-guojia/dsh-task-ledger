package actions

import (
	"path/filepath"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// 认领：先写进我的分片，再删池里那行。顺序反了任务会凭空消失。

// Claim 写序：我的分片 → 删池里那行 → 过程文档记一笔。
func Claim(repo string, me core.Identity, tid string) (*Result, error) {
	pool := store.NewTaskStore(repo, core.PoolRel, nil)
	mine := store.NewTaskStore(repo, core.ShardRel(me.UUID), &me)
	meKey := core.Normalize(me.UUID)
	logs := store.NewWorklogStore(repo)

	index := store.NewOwnersIndex(repo)
	shards, err := index.Shards()
	if err != nil {
		return nil, err
	}
	for key, path := range shards {
		if key == meKey {
			continue
		}
		rel, relErr := filepath.Rel(filepath.Join(repo, core.LedgerDir), path)
		if relErr != nil {
			continue
		}
		other := store.NewTaskStore(repo, filepath.ToSlash(rel), nil)
		if task, ok, err := other.Get(tid); err != nil {
			return nil, err
		} else if ok && task != nil {
			return nil, core.Failf("任务 %s 已在 %s 的分片里（别人正在做），不能认领。", tid, key)
		}
	}

	task, ok, err := pool.Get(tid)
	if err != nil {
		return nil, err
	}
	if !ok || task == nil {
		already, ok, err := mine.Get(tid)
		if err != nil {
			return nil, err
		}
		if ok && already != nil {
			if err := pool.Drop(tid); err != nil {
				return nil, err
			}
			if worklog, ok := already["worklog"].(string); ok && worklog != "" {
				if path := logs.Find(tid, worklog); path != "" {
					now := core.Now()
					logs.AppendExec(path,
						core.ExecLine(now, me.UUID, "claim", "认领（补齐上次未完成的清理）"),
						&core.StatusLine{Status: "doing", Name: me.Name, UUID: me.UUID, When: now})
				}
			}
			message := "认领 " + tid + "：补齐上次未完成的清理"
			return &Result{
				AlreadyDone: true,
				Where:       StrOrNil(Rel(repo, mine.Path)),
				Message:     &message,
				Notices:     []string{"任务 " + tid + " 已经在我的分片里，本次只补删公共池那行。"},
			}, nil
		}
		return nil, core.Failf("公共池里没有任务 %s（已经被人认领或不存在）。", tid)
	}

	if current, _ := task["status"].(string); current != "open" {
		return nil, core.Failf("任务 %s 在公共池里但状态是 %s（应为 open）—— 先跑 validate 看台账是不是乱了。", tid, current)
	}

	now := core.Now()
	moved := map[string]any{}
	for k, v := range task {
		moved[k] = v
	}
	moved["owner"] = me.UUID
	moved["owner_name"] = nilIfEmpty(me.Name)
	moved["status"] = "doing"
	if started, ok := moved["started"].(string); !ok || started == "" {
		moved["started"] = now
	}
	moved["updated"] = now
	if err := mine.Put(tid, moved); err != nil {
		return nil, err
	}
	if err := pool.Drop(tid); err != nil {
		return nil, err
	}

	var notice string
	worklog, _ := moved["worklog"].(string)
	if path := logs.Find(tid, worklog); path != "" {
		logs.AppendExec(path,
			core.ExecLine(now, me.Stamp(), "claim", "认领 → doing"),
			&core.StatusLine{Status: "doing", Name: me.Name, UUID: me.UUID, When: now})
	} else {
		notice = "任务 " + tid + " 已记到我的分片，过程文档没找到，跳过执行记录。"
	}
	title, _ := moved["title"].(string)
	message := "认领 " + tid + "：" + title
	result := &Result{
		Changed: []string{"owner", "started", "updated"},
		Where:   StrOrNil(Rel(repo, mine.Path)),
		Message: &message,
		Payload: map[string]any{},
	}
	if notice != "" {
		result.Notices = []string{notice}
	}
	return result, nil
}
