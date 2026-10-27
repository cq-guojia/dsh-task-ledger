package actions

import (
	"strings"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// 记进展：刷分片的「最后更新」，再往过程文档追加一行。
// 文档写不进不算失败：分片已经刷了就照常提交，只留一条警告。

// LogProgress 写序：刷 updated → 过程文档追加一行。
func LogProgress(repo string, me core.Identity, tid, note string) (*Result, error) {
	text := strings.Join(strings.Fields(note), " ")
	if text == "" {
		return nil, core.Failf("--note 不能为空。")
	}
	mine := store.NewTaskStore(repo, core.ShardRel(me.UUID), &me)
	task, ok, err := mine.Get(tid)
	if err != nil {
		return nil, err
	}
	if !ok || task == nil {
		return nil, core.Failf("任务 %s 不在我的分片里（只能给自己的任务记进展）。", tid)
	}
	if err := RequireOwner(task, tid, me); err != nil {
		return nil, err
	}

	now := core.Now()
	updated := map[string]any{}
	for k, v := range task {
		updated[k] = v
	}
	updated["updated"] = now
	if err := mine.Put(tid, updated); err != nil {
		return nil, err
	}

	result := &Result{
		Changed: []string{"updated"},
		Where:   StrOrNil(Rel(repo, mine.Path)),
		Message: StrOrNil(tid + "：记进展"),
	}
	logs := store.NewWorklogStore(repo)
	worklog, _ := updated["worklog"].(string)
	path := logs.Find(tid, worklog)
	if path == "" {
		result.Notices = []string{"提示：这条任务没有过程文档，已跳过执行记录（分片的最后更新已刷）。"}
		return result, nil
	}
	okExec := logs.AppendExec(path,
		core.ExecLine(now, me.Stamp(), "log", text),
		&core.StatusLine{Status: "doing", Name: me.Name, UUID: me.UUID, When: now})
	if !okExec {
		result.Notices = []string{"警告：分片的最后更新已刷，过程文档补不上（文件不可写）；已写的分片照常提交，文档那行要手动补。"}
	}
	return result, nil
}
