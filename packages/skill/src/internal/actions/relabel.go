package actions

import (
	"strings"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// 改标签：分片 tags + 过程文档头部标签行，一次写两处。
// **分类不可改**（2026-10-27 拍板）：它在 new 时定死，之后没有任何入口能改。

// Relabel 写序：算最终值 → 过程文档（标签行 + 执行记录 + 状态行，一次写）→ 分片。
func Relabel(repo string, me core.Identity, tid string, tags []string) (*Result, error) {
	if len(tags) == 0 {
		return nil, core.Failf("改标签要给 `--tags <a、b>`。")
	}
	newTags, err := core.ParseTags(tags)
	if err != nil {
		return nil, err
	}
	if len(newTags) == 0 {
		return nil, core.Failf("标签是空的，没有可写的值。")
	}

	mine := store.NewTaskStore(repo, core.ShardRel(me.UUID), &me)
	task, ok, err := mine.Get(tid)
	if err != nil {
		return nil, err
	}
	if !ok || task == nil {
		return nil, core.Failf("任务 %s 不在我的分片里（只能改自己名下在办的任务；已结案的任务改不了）。", tid)
	}
	if err := RequireOwner(task, tid, me); err != nil {
		return nil, err
	}

	when := core.Now()
	updated := map[string]any{}
	for k, v := range task {
		updated[k] = v
	}
	updated["tags"] = newTags
	updated["updated"] = when

	logs := store.NewWorklogStore(repo)
	worklog, _ := task["worklog"].(string)
	path := logs.Find(tid, worklog)
	if path == "" {
		if err := mine.Put(tid, updated); err != nil {
			return nil, err
		}
		return &Result{
			Changed: []string{"tags", "updated"},
			Where:   StrOrNil(Rel(repo, mine.Path)),
			Message: StrOrNil(tid + "：改标签"),
			Notices: []string{"提示：这条任务没有过程文档，只改了分片，文档与历史里看不到。"},
		}, nil
	}

	text, err := logs.Read(path)
	if err != nil {
		return nil, err
	}
	text = core.RewriteLabelLine(text, newTags)
	text = core.AppendExecLog(text, core.ExecLine(when, me.Stamp(), "set", "改标签："+strings.Join(newTags, "、")))
	status, _ := task["status"].(string)
	if status == "" {
		status = "doing"
	}
	text = core.RewriteStatusLine(text, core.StatusLine{Status: status, Name: me.Name, UUID: me.UUID, When: when})
	if err := logs.Write(path, text); err != nil {
		return nil, err
	}
	if err := mine.Put(tid, updated); err != nil {
		return nil, err
	}
	return &Result{
		Changed: []string{"tags", "updated"},
		Where:   StrOrNil(Rel(repo, mine.Path)),
		Message: StrOrNil(tid + "：改标签"),
	}, nil
}
