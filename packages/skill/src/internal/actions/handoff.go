package actions

import (
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// 交接：先写进对方分片，再删我分片那行，再记一笔。

// Handoff 写序：对方分片 → 删我分片那行 → 过程文档记一笔。
func Handoff(repo string, me core.Identity, tid, to string) (*Result, error) {
	index := store.NewOwnersIndex(repo)
	record, ok, err := index.Get(to)
	if err != nil {
		return nil, err
	}
	if !ok || record == nil {
		return nil, core.Failf("%s 还没在索引里登记过 ⇒ 不能交接给他（写出一份对别人不存在的分片，他自己也看不到）。", to)
	}

	mine := store.NewTaskStore(repo, core.ShardRel(me.UUID), &me)
	task, ok, err := mine.Get(tid)
	if err != nil {
		return nil, err
	}
	if !ok || task == nil {
		return nil, core.Failf("任务 %s 不在我的分片里，交接不了。", tid)
	}

	toKey := core.Normalize(to)
	owner := ownerOf(task)
	if owner != core.Normalize(me.UUID) && owner != toKey {
		return nil, core.Failf("任务 %s 的负责人是 %s，不是你（%s），交接不了。\n  处理：跑 validate 看台账是不是脏了。", tid, owner, me.Label())
	}
	toName, _ := record["name"].(string)
	who := toName
	if who == "" {
		who = toKey
	}
	whoStamp := core.Identity{UUID: toKey, Name: toName}.Stamp()

	toStore := store.NewTaskStore(repo, core.ShardRel(toKey), nil)
	moved := map[string]any{}
	for k, v := range task {
		moved[k] = v
	}
	moved["owner"] = toKey
	moved["owner_name"] = nilIfEmpty(toName)
	moved["updated"] = core.Now()

	existing, ok, err := toStore.Get(tid)
	if err != nil {
		return nil, err
	}
	if ok && existing != nil {
		if !SameTaskIgnoringStamp(existing, moved) {
			return nil, core.Failf("任务 %s 在 %s 的分片里已经存在，且内容与本次不一致 ⇒ 拒绝交接。", tid, toKey)
		}
		// 重跑：以对方那份为准，只补删我这边
		if err := mine.Drop(tid); err != nil {
			return nil, err
		}
		logs := store.NewWorklogStore(repo)
		worklog, _ := moved["worklog"].(string)
		if path := logs.Find(tid, worklog); path != "" {
			now := core.Now()
			logs.AppendExec(path,
				core.ExecLine(now, me.Stamp(), "set", "handed off to @"+whoStamp+" (cleanup)"),
				&core.StatusLine{Status: "doing", Name: toName, UUID: toKey, When: now})
		}
		return &Result{
			AlreadyDone: true,
			Where:       StrOrNil(Rel(repo, toStore.Path)),
			Message:     StrOrNil("交接 " + tid + " → " + who + "：补齐上次未完成的清理"),
			Notices:     []string{"任务 " + tid + " 已在对方分片里（内容一致），本次只补删我分片那行。"},
		}, nil
	}

	if err := toStore.Put(tid, moved); err != nil {
		return nil, err
	}
	if err := mine.Drop(tid); err != nil {
		return nil, err
	}

	now := core.Now()
	logs := store.NewWorklogStore(repo)
	worklog, _ := moved["worklog"].(string)
	var notice string
	if path := logs.Find(tid, worklog); path == "" {
		notice = "任务 " + tid + " 已交给 " + who + "，但过程文档没找到，跳过执行记录。"
	} else {
		logs.AppendExec(path,
			core.ExecLine(now, me.Stamp(), "set", "handed off to @"+whoStamp),
			&core.StatusLine{Status: "doing", Name: toName, UUID: toKey, When: now})
	}
	result := &Result{
		Changed: []string{"owner", "owner_name", "updated"},
		Where:   StrOrNil(Rel(repo, toStore.Path)),
		Message: StrOrNil("交接 " + tid + " → " + who),
	}
	if notice != "" {
		result.Notices = []string{notice}
	}
	return result, nil
}
