package actions

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// 删除：不是「把记录抹掉」，是给记录打上删除四列后整行退出所有读侧。
// 在办任务走结案写序移进历史；历史里的行原地改末尾四格。

// DeleteTaskParams 删除在办任务的入参。
type DeleteTaskParams struct {
	Summary  string // 删除留言：只进过程文档执行记录，不写历史摘要
	Finished string // 由外壳算好的 UTC 时刻
}

// DeleteTask 删除在办任务（公共池 / 自己名下分片）→ 追加一行 16 列历史。
// 与取消共用结案写序，保证并发、崩溃恢复、封卷、判重都走同一套。
func DeleteTask(repo string, me core.Identity, tid string, p DeleteTaskParams) (*Result, error) {
	return CloseTask(repo, me, tid, CloseTaskParams{
		Summary:  p.Summary,
		Finished: p.Finished,
		Delete:   true,
	})
}

// DeleteById 按任务号删除：在办 → DeleteTask（走结案写序移进历史）；
// 已结案 → DeleteHistoryRow（历史行原地打删除标记）。两种入口都只认任务号。
func DeleteById(repo string, me core.Identity, p DeleteParams) (*Result, error) {
	if p.TID == "" {
		return nil, core.Failf("delete 必须给任务号 --id。")
	}
	_, _, err := LoadTask(repo, p.TID)
	if err == nil {
		return DeleteTask(repo, me, p.TID, DeleteTaskParams{
			Summary: p.Summary, Finished: p.Finished,
		})
	}
	return DeleteHistoryRow(repo, me, DeleteHistoryParams{
		TID: p.TID, Note: p.Summary, When: p.Finished,
	})
}

// DeleteParams 按任务号删除的入参（在办 / 历史统一）。
type DeleteParams struct {
	TID      string
	Summary  string
	Finished string
}

// DeleteHistoryParams 删除历史行的入参。
//
// 定位口径（2026-11-25 定）：**只认任务号 TID**。历史行没有独立的任务号列，但每行都带
// 过程文档链接（worklog/YYYYMM/DD-HHMM-xxx.md），而过程文档名由任务号唯一推出
// （core.WorklogName）。删除时扫历史文件、按 TID 对应的过程文档路径匹配到那一行，
// src / line / 指纹全在 skill 内部算 —— 调用方不接触行号这类会漂移的坐标。
type DeleteHistoryParams struct {
	TID  string // 任务号；历史行按它对应的过程文档定位
	Note string // 删除留言
	When string // 由外壳算好的 UTC 时刻
}

// DeleteHistoryRow 给历史行打删除四列：Result 与其余十二列原值一律不动。
// 过程文档只追加一条 delete 执行记录，不改状态行（状态行还留着原来的 done / cancelled）。
func DeleteHistoryRow(repo string, me core.Identity, p DeleteHistoryParams) (*Result, error) {
	if p.When == "" {
		return nil, core.Failf("删除必须由外壳先算好时间（内部错误：when 为空）。")
	}
	if p.TID == "" {
		return nil, core.Failf("删除历史行必须给任务号。")
	}

	history := store.NewHistoryStore(repo)
	logs := store.NewWorklogStore(repo)
	// 扫历史文件，用任务号对应的过程文档路径定位那一行；行号是这里算出来的。
	_, line, rel, histPath, err := findHistoryRowByTask(repo, p.TID)
	if err != nil {
		return nil, err
	}
	before, err := os.ReadFile(histPath)
	if err != nil {
		return nil, err
	}
	lines := strings.Split(string(before), "\n")
	if line > len(lines) {
		return nil, core.Failf("历史文件 %s 没有第 %d 行（任务 %s）。", rel, line, p.TID)
	}
	cells := core.SplitRow(lines[line-1])
	if len(cells) != 16 {
		return nil, core.Failf("任务 %s 对应的第 %d 行不是 16 列，已中止。", p.TID, line)
	}
	if cells[12] == core.DeletedYes {
		return &Result{
			AlreadyDone: true,
			Where:       StrOrNil(Rel(repo, histPath)),
			Notices:     []string{"这条历史记录已经删除过了。"},
		}, nil
	}

	docRel := historyDocRel(cells[11])
	ledgerRoot := filepath.Join(repo, core.LedgerDir)
	docPath := ""
	if docRel != "" {
		candidate := filepath.Clean(filepath.Join(repo, core.ToRepoRel(core.HistoryDir), docRel))
		if strings.HasPrefix(candidate, ledgerRoot+string(os.PathSeparator)) {
			if _, statErr := os.Stat(candidate); statErr == nil {
				docPath = candidate
			}
		}
	}

	paths := []string{histPath}
	if docPath != "" {
		paths = append(paths, docPath)
	}
	stamps := map[string]string{}
	backups := map[string][]byte{}
	backupHad := map[string]bool{}
	for _, path := range paths {
		stamps[path] = store.Fingerprint(path)
		if snap, had, snapErr := store.Snapshot(path); snapErr == nil {
			backups[path] = snap
			backupHad[path] = had
		}
	}
	restoreAll := func() {
		for _, path := range paths {
			if snap, ok := backups[path]; ok {
				_ = store.Restore(path, snap, backupHad[path])
			}
		}
	}

	// 写前核对：指纹与读到时不一致 ⇒ 有人在锁外动过，一个字节都不写
	for _, path := range paths {
		if store.Fingerprint(path) != stamps[path] {
			return nil, core.Failf("%s 在本命令执行期间被改动过，已中止、未写入任何内容；重跑一次即可。", Rel(repo, path))
		}
	}

	cells[12] = core.DeletedYes
	cells[13] = me.UUID
	cells[14] = core.NameCell(me.Name)
	cells[15] = p.When
	lines[line-1] = joinHistoryRow(cells)
	if err := history.Write(histPath, strings.Join(lines, "\n")); err != nil {
		restoreAll()
		return nil, err
	}

	if docPath != "" {
		text, readErr := os.ReadFile(docPath)
		if readErr != nil {
			restoreAll()
			return nil, readErr
		}
		note := "deleted"
		if trimmed := strings.Join(strings.Fields(p.Note), " "); trimmed != "" {
			note = "deleted: " + trimmed
		}
		updated := core.AppendExecLog(string(text), core.ExecLine(p.When, me.Stamp(), "delete", note))
		if err := logs.Write(docPath, updated); err != nil {
			restoreAll()
			return nil, err
		}
	}

	return &Result{
		Changed: []string{"deleted", "deleted_by", "deleted_by_name", "deleted_at"},
		Where:   StrOrNil(Rel(repo, histPath)),
		Message: StrOrNil("删除历史记录：" + cells[2]),
		Payload: map[string]any{
			"history_path": Rel(repo, histPath),
			"line":         line,
		},
	}, nil
}

// findHistoryRowByTask 按任务号定位历史行：扫 ledger/history/*.md，逐行用
// core.WorklogMatchesTask 比对过程文档路径。返回 (src 相对 ledger/, 行号, src 人话路径, 绝对路径)。
// 任务号必须唯一命中；命中 0 条 / 多条都拒绝，不猜哪一行。
func findHistoryRowByTask(repo, tid string) (string, int, string, string, error) {
	history := store.NewHistoryStore(repo)
	type hit struct {
		src, rel, path string
		line           int
	}
	var hits []hit
	for _, path := range history.Sources() {
		text, err := history.Read(path)
		if err != nil {
			return "", 0, "", "", err
		}
		rows, _ := core.ParseHistory(text)
		for _, row := range rows {
			if !core.WorklogMatchesTask(row.Worklog, tid) {
				continue
			}
			rel := filepath.ToSlash(Rel(repo, path))
			src := strings.TrimPrefix(rel, core.LedgerDir+"/")
			hits = append(hits, hit{src: src, rel: rel, path: path, line: row.Line})
		}
	}
	if len(hits) == 0 {
		return "", 0, "", "", core.Failf("历史里找不到任务 %s 的那条记录，未写入任何内容。", tid)
	}
	if len(hits) > 1 {
		return "", 0, "", "", core.Failf("任务 %s 在历史里匹配到 %d 行（应当只有一行），已中止、未写入任何内容。", tid, len(hits))
	}
	only := hits[0]
	return only.src, only.line, only.rel, only.path, nil
}

// historyDocRel 从历史行的 Worklog 单元格里取链接目标。
func historyDocRel(cell string) string {
	start := strings.Index(cell, "](")
	if start < 0 || !strings.HasSuffix(cell, ")") {
		return ""
	}
	return cell[start+2 : len(cell)-1]
}

// joinHistoryRow 按 HistoryLine 的同一格式拼回一行；EscCell 负责把单元格里的 | 重新转义。
func joinHistoryRow(cells []string) string {
	var b strings.Builder
	b.WriteString("|")
	for _, cell := range cells {
		b.WriteString(" ")
		b.WriteString(core.EscCell(strings.TrimSpace(cell)))
		b.WriteString(" |")
	}
	return b.String()
}
