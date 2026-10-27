package actions

import (
	"github.com/cq-guojia/dsh-task-ledger/skill/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/internal/store"
)

// 只读：看一条任务。文档优先 —— 读到文档就知道状态，不再翻索引。
//   ① 文档存在且头部有状态行 ⇒ 完全按文档自述回答，已结案的也看得到；
//   ② 文档没有状态行（老文档）或根本没有文档 ⇒ 回退 LoadTask 查在办索引，标 Legacy。

// ShowTask 看一条任务。
func ShowTask(repo string, me core.Identity, tid string) (*ShowResult, error) {
	_ = me
	logs := store.NewWorklogStore(repo)
	path := logs.Find(tid, "")
	text, err := "", error(nil)
	if path != "" {
		text, err = logs.Read(path)
		if err != nil {
			return nil, err
		}
	}
	if status := core.ReadStatus(text); status != nil && path != "" {
		headTid, title := core.HeadTitle(text)
		if headTid == "" {
			headTid = tid
		}
		task := map[string]any{
			"tid":        headTid,
			"title":      title,
			"status":     status.Status,
			"owner":      nilIfEmpty(status.UUID),
			"owner_name": nilIfEmpty(status.Name),
			"created":    nilIfEmpty(core.HeadCreated(text)),
			"updated":    nilIfEmpty(status.When),
			"finished":   nilIfEmpty(core.HeadFrozen(text)),
		}
		relPath := Rel(repo, path)
		return &ShowResult{
			Task:    task,
			Worklog: &WorklogView{Path: &relPath, Text: &text},
		}, nil
	}

	task, where, err := LoadTask(repo, tid)
	if err != nil {
		return nil, err
	}
	result := &ShowResult{Task: task, Legacy: true}
	if path == "" {
		msg := "这条任务没有过程文档（或文档已不在原处）。"
		result.Worklog = &WorklogView{Error: &msg}
	} else {
		relPath := Rel(repo, path)
		result.Worklog = &WorklogView{Path: &relPath, Text: StrOrNil(text)}
	}
	for _, p := range where {
		result.Others = append(result.Others, Rel(repo, p))
	}
	return result, nil
}
