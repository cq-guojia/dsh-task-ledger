package actions

import (
	"github.com/cq-guojia/dsh-task-ledger/skill/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/internal/store"
)

// 释放：写回公共池，再删我分片那行，再记一笔。

// Release 写序：写回池（已有同号就不覆盖）→ 删我分片那行 → 过程文档记一笔。
func Release(repo string, me core.Identity, tid string) (*Result, error) {
	pool := store.NewTaskStore(repo, core.PoolRel, nil)
	mine := store.NewTaskStore(repo, core.ShardRel(me.UUID), &me)
	task, ok, err := mine.Get(tid)
	if err != nil {
		return nil, err
	}
	if !ok || task == nil {
		inPool, ok, err := pool.Get(tid)
		if err != nil {
			return nil, err
		}
		if ok && inPool != nil {
			// 幂等分支也要验「池里那条真的已经是没人要的开放任务」
			if ownerOf(inPool) != "" || statusOf(inPool) != "open" {
				return nil, core.Failf("任务 %s 在公共池里，但身上还挂着 owner / 不是 open —— 台账脏了。\n  处理：跑 validate 看清单，别用 release 强行覆盖。", tid)
			}
			return &Result{
				AlreadyDone: true,
				Where:       StrOrNil(Rel(repo, pool.Path)),
				Notices:     []string{"任务 " + tid + " 已经在公共池里，无需重复释放。"},
			}, nil
		}
		return nil, core.Failf("任务 %s 不在我的分片里，也没在公共池里。", tid)
	}
	if err := RequireOwner(task, tid, me); err != nil {
		return nil, err
	}

	now := core.Now()
	back := map[string]any{}
	for k, v := range task {
		back[k] = v
	}
	back["owner"] = nil
	back["owner_name"] = nil
	back["status"] = "open"
	back["updated"] = now

	if existing, ok, err := pool.Get(tid); err != nil {
		return nil, err
	} else if !ok || existing == nil {
		if err := pool.Put(tid, back); err != nil {
			return nil, err
		}
	} else {
		// 池里已有同号：那份必须是干净的空位，否则不写回
		if ownerOf(existing) != "" || statusOf(existing) != "open" {
			return nil, core.Failf("公共池里已经有一条 %s，且它带着 owner / 不是 open —— 台账脏了。\n  处理：跑 validate 看清单，先确认哪条是真的。", tid)
		}
	}
	if err := mine.Drop(tid); err != nil {
		return nil, err
	}

	logs := store.NewWorklogStore(repo)
	worklog, _ := back["worklog"].(string)
	var notice string
	if path := logs.Find(tid, worklog); path == "" {
		notice = "任务 " + tid + " 已退回公共池，但过程文档没找到，跳过执行记录。"
	} else {
		logs.AppendExec(path,
			core.ExecLine(now, me.Stamp(), "release", "释放回公共池"),
			&core.StatusLine{Status: "open", When: now})
	}

	title, _ := back["title"].(string)
	result := &Result{
		Changed: []string{"owner", "owner_name", "status", "updated"},
		Where:   StrOrNil(Rel(repo, pool.Path)),
		Message: StrOrNil("释放 " + tid + "：" + title),
	}
	if notice != "" {
		result.Notices = []string{notice}
	}
	return result, nil
}
