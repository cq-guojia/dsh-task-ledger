package actions

import (
	"path/filepath"
	"strings"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// 结案：历史加一行 → 封卷过程文档 → 最后删分片那行。
// finished 必填、由外壳算好 —— 业务层不许再调时钟。

// CloseTaskParams 结案的入参。
type CloseTaskParams struct {
	Summary  string
	Finished string
	Tags     []string
	Cancel   bool // true ⇒ 取消：结果列 cancelled、状态行 cancelled、执行记录 cancel
}

// CloseTask 写序四步：改标签行 → 历史加一行 → 封卷 → 删来源那行（永远是最后一步）。
// 来源两种：公共池（只能取消）、我的分片（结案或取消）。
func CloseTask(repo string, me core.Identity, tid string, p CloseTaskParams) (*Result, error) {
	if p.Finished == "" {
		return nil, core.Failf("结案必须由外壳先算好时间（内部错误：finished 为空）。")
	}
	textSummary := strings.Join(strings.Fields(p.Summary), " ")
	if textSummary == "" && !p.Cancel {
		return nil, core.Failf("结案要写一句「完成了什么」（--summary 不能为空）。")
	}
	var newTags []string
	if len(p.Tags) > 0 {
		parsed, err := core.ParseTags(p.Tags)
		if err != nil {
			return nil, err
		}
		newTags = parsed
	}

	logs := store.NewWorklogStore(repo)
	history := store.NewHistoryStore(repo)
	histPath := history.PathFor(p.Finished)

	pool := store.NewTaskStore(repo, core.PoolRel, nil)
	mine := store.NewTaskStore(repo, core.ShardRel(me.UUID), &me)

	task, where, err := LoadTask(repo, tid)
	if err != nil {
		// 池与分片都没有：唯一合法的情况是已经结过案
		logName := core.WorklogName(tid)
		state, herr := history.HasLog(histPath, &logName, nil, nil)
		if herr != nil {
			return nil, herr
		}
		if state == store.Hit {
			return &Result{
				AlreadyDone: true,
				Where:       StrOrNil(Rel(repo, histPath)),
				Notices:     []string{"任务 " + tid + " 已经结过案，无需重复。"},
			}, nil
		}
		return nil, err
	}

	// 归属：池任务只能取消；我名下的结案/取消都行；别人的拒绝。
	switch owner := ownerOf(task); {
	case owner == "":
		if !p.Cancel {
			return nil, core.Failf("任务 %s 还没有人认领（在公共池里），先 claim 再结案；要直接关掉它用 close --cancel。", tid)
		}
	case core.IsMe(me, owner):
	default:
		return nil, core.Failf("任务 %s 的负责人是 %s，不是你（%s）。", tid, owner, me.Label())
	}

	// 删哪些行按任务**实际所在文件**算：崩在 claim 中间会同时留在池与我的分片，两处都要清。
	present := map[string]bool{}
	for _, path := range where {
		present[path] = true
	}
	var srcs []*store.TaskStore
	var paths []string
	for _, st := range []*store.TaskStore{pool, mine} {
		if present[st.Path] {
			srcs = append(srcs, st)
			paths = append(paths, st.Path)
		}
	}
	if len(srcs) == 0 {
		return nil, core.Failf("任务 %s 不在公共池、也不在我的分片里（别人的分片不能动）。", tid)
	}

	res, execKind, execNote := core.ResultDone, "close", "sealed"
	if p.Cancel {
		res, execKind, execNote = core.ResultCancelled, "cancel", "cancelled"
		if textSummary != "" {
			execNote = "cancelled: " + textSummary
		}
	}

	finalCategory := task["category"]
	finalTags := newTags
	if len(finalTags) == 0 {
		finalTags = store.StrSliceOf(task["tags"])
	}
	worklogRel, _ := task["worklog"].(string)
	docPath := logs.Find(tid, worklogRel)

	paths = append(paths, histPath)
	if docPath != "" {
		paths = append(paths, docPath)
	}
	stamps := map[string]string{}
	backups := map[string][]byte{}
	backupHad := map[string]bool{}
	for _, path := range paths {
		stamps[path] = store.Fingerprint(path)
		if before, had, err := store.Snapshot(path); err == nil {
			backups[path] = before
			backupHad[path] = had
		}
	}

	restoreAll := func() {
		for _, path := range paths {
			if before, ok := backups[path]; ok {
				_ = store.Restore(path, before, backupHad[path])
			}
		}
	}

	var logNamePtr *string
	if docPath != "" {
		base := filepath.Base(docPath)
		logNamePtr = &base
	}
	state, err := history.HasLog(histPath, logNamePtr, strPtrOf(task["created"]), strPtrOf(task["title"]))
	if err != nil {
		return nil, err
	}
	if state == store.Hit {
		// 崩在②之后、③/④之前：历史里已有，但分片行可能还在、文档可能没封卷 —— 补齐
		notes := []string{"任务 " + tid + " 已经结过案，无需重复。"}
		if docPath != "" {
			text, err := logs.Read(docPath)
			if err == nil && !core.HasFrozenLine(text) {
				frozen := core.StampFrozen(text, p.Finished, me.Stamp())
				frozen = core.AppendExecLog(frozen, core.ExecLine(p.Finished, me.Stamp(), execKind, execNote))
				frozen = core.RewriteStatusLine(frozen, core.StatusLine{Status: res, Name: me.Name, UUID: me.UUID, When: p.Finished})
				_ = logs.Write(docPath, frozen)
				notes = append(notes, "补齐上次未完成的封卷。")
			}
		}
		for _, st := range []*store.TaskStore{pool, mine} {
			if present, ok, _ := st.Get(tid); ok && present != nil {
				_ = st.Drop(tid)
				notes = append(notes, "补齐上次未完成的移出任务表。")
			}
		}
		return &Result{
			AlreadyDone: true,
			Where:       StrOrNil(Rel(repo, histPath)),
			Notices:     notes,
		}, nil
	}
	if state == store.Undecidable {
		return nil, core.Failf("历史里有一条没有过程文档链接的旧行，判不出是不是 %s ⇒ 已中止，请人工看一眼 %s 再重跑。", tid, Rel(repo, histPath))
	}

	// 写前核对：指纹与读到时不一致 ⇒ 有人在锁外动过，一个字节都不写
	for _, path := range paths {
		if store.Fingerprint(path) != stamps[path] {
			return nil, core.Failf("%s 在本命令执行期间被改动过（可能是编辑器或 git 操作），已中止、未写入任何内容；重跑一次即可。", Rel(repo, path))
		}
	}

	// ① 改标签行（给了 --tags 才做，且必须在封卷之前）
	if docPath != "" && len(newTags) > 0 {
		if text, err := logs.Read(docPath); err == nil {
			_ = logs.Write(docPath, core.RewriteLabelLine(text, finalTags))
		}
	}

	// ② 历史加一行
	row := map[string]any{
		"finished":     p.Finished,
		"created":      task["created"],
		"title":        task["title"],
		"category":     finalCategory,
		"tags":         finalTags,
		"owner":        me.UUID,
		"owner_name":   firstNonEmpty(strOfAny(task["owner_name"]), me.Name),
		"creator":      firstNonEmpty(strOfAny(task["creator"]), me.UUID),
		"creator_name": task["creator_name"],
		"summary":      textSummary,
		"result":       res,
		"worklog":      nil,
	}
	if docPath != "" {
		row["worklog"] = task["worklog"]
	}
	out, err := history.AppendRow(histPath, row)
	if err != nil {
		restoreAll()
		return nil, err
	}
	if err := history.Write(histPath, strOfAny(out["text"])); err != nil {
		restoreAll()
		return nil, err
	}

	// ③ 封卷（没有过程文档就跳过）
	if docPath != "" {
		text, err := logs.Read(docPath)
		if err != nil {
			restoreAll()
			return nil, err
		}
		if !core.HasFrozenLine(text) {
			frozen := core.StampFrozen(text, p.Finished, me.Stamp())
			frozen = core.AppendExecLog(frozen, core.ExecLine(p.Finished, me.Stamp(), execKind, execNote))
			frozen = core.RewriteStatusLine(frozen, core.StatusLine{Status: res, Name: me.Name, UUID: me.UUID, When: p.Finished})
			if err := logs.Write(docPath, frozen); err != nil {
				restoreAll()
				return nil, err
			}
		}
	}

	// ④ 删来源那些行（永远最后）：池 / 我的分片逐个清，两处都有就清两处
	for _, st := range srcs {
		if err := st.Drop(tid); err != nil {
			restoreAll()
			return nil, err
		}
	}

	var notices []string
	if docPath == "" {
		notices = append(notices, "提示：任务 "+tid+" 没有过程文档，已跳过封卷，历史末列留空。")
	}
	title, _ := task["title"].(string)
	payload := map[string]any{
		"history_path": Rel(repo, histPath),
		"worklog_path": nil,
	}
	if docPath != "" {
		payload["worklog_path"] = Rel(repo, docPath)
	}
	verb, changed := "结案 ", []string{"status", "finished"}
	if p.Cancel {
		verb, changed = "取消 ", []string{"status", "finished", "result"}
	}
	return &Result{
		Changed: changed,
		Where:   StrOrNil(Rel(repo, histPath)),
		Message: StrOrNil(verb + tid + "：" + title),
		Payload: payload,
		Notices: notices,
	}, nil
}

func strOfAny(v any) string {
	s, _ := v.(string)
	return s
}

func strPtrOf(v any) *string {
	if s, ok := v.(string); ok {
		return &s
	}
	return nil
}

func firstNonEmpty(values ...string) any {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return nil
}
