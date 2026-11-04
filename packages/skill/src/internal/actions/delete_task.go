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

// DeleteHistoryParams 删除历史行的入参。
type DeleteHistoryParams struct {
	Src  string // 历史文件相对 ledger/ 的路径，如 history/202610.md
	Line int    // 原文行号（1 起，与 ParseHistory 的 Row.Line 同一个号）
	Note string // 删除留言
	When string // 由外壳算好的 UTC 时刻
}

// DeleteHistoryRow 给历史行打删除四列：Result 与其余十二列原值一律不动。
// 过程文档只追加一条 delete 执行记录，不改状态行（状态行还留着原来的 done / cancelled）。
func DeleteHistoryRow(repo string, me core.Identity, p DeleteHistoryParams) (*Result, error) {
	if p.When == "" {
		return nil, core.Failf("删除必须由外壳先算好时间（内部错误：when 为空）。")
	}
	if p.Line <= 0 {
		return nil, core.Failf("delete --line 要是正整数。")
	}
	rel := filepath.ToSlash(filepath.Clean(p.Src))
	if !strings.HasPrefix(rel, core.HistoryDir+"/") || strings.Contains(rel, "..") || !strings.HasSuffix(rel, ".md") {
		return nil, core.Failf("delete --src 只收 ledger/history/ 下的 .md 相对路径：%s", p.Src)
	}

	history := store.NewHistoryStore(repo)
	logs := store.NewWorklogStore(repo)
	histPath := filepath.Join(repo, core.ToRepoRel(rel))
	before, err := os.ReadFile(histPath)
	if err != nil {
		return nil, err
	}
	lines := strings.Split(string(before), "\n")
	if p.Line > len(lines) {
		return nil, core.Failf("历史文件 %s 没有第 %d 行。", rel, p.Line)
	}
	cells := core.SplitRow(lines[p.Line-1])
	if len(cells) != 16 {
		return nil, core.Failf("第 %d 行不是 16 列，已中止。", p.Line)
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
	lines[p.Line-1] = joinHistoryRow(cells)
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
			"line":         p.Line,
		},
	}, nil
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
