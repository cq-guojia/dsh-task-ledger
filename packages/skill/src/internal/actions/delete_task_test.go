package actions

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

const (
	delTid      = "20261104-1300-建错的-aaaa"
	delCreated  = "2026-11-01 09:00:00"
	delFinished = "2026-11-01 10:00:00"
	delWhen     = "2026-11-04 13:00:00"
)

// 在办任务删除：结果列留空、删除三列落值、来源行移走、读侧不再出现。
func TestDeleteTaskMarksHistoryRow(t *testing.T) {
	repo, me := tempLedger(t, map[string]any{
		"tid": delTid, "status": "open", "title": "建错的", "created": delCreated,
	})
	res, err := DeleteTask(repo, me, delTid, DeleteTaskParams{Finished: delFinished})
	if err != nil {
		t.Fatalf("删除池任务应成功：%v", err)
	}
	if res.AlreadyDone {
		t.Error("第一次删除不该是 AlreadyDone")
	}
	if _, ok, _ := store.NewTaskStore(repo, core.PoolRel, nil).Get(delTid); ok {
		t.Error("删除后公共池里不该还有这条")
	}
	raw, err := os.ReadFile(store.NewHistoryStore(repo).PathFor(delFinished))
	if err != nil {
		t.Fatal(err)
	}
	rows, _ := core.ParseHistory(string(raw))
	if len(rows) != 1 {
		t.Fatalf("应读回一行 15 列，实际 %d 行：\n%s", len(rows), raw)
	}
	row := rows[0]
	if row.Result != "" {
		t.Errorf("在办直接删 ⇒ 结果列留空，实际 %q", row.Result)
	}
	if row.Deleted != core.DeletedYes || row.DeletedBy != me.UUID || row.DeletedAt != delFinished {
		t.Errorf("删除三列没落值：deleted=%q by=%q at=%q", row.Deleted, row.DeletedBy, row.DeletedAt)
	}
	if rowMatches(row, HistoryQuery{}, me, "", "") {
		t.Error("已删除行不该出现在 history 明细里")
	}
}

// 历史行删除：Result 与摘要原值不动，只改末尾三格；过程文档追加一条 delete 执行记录。
func TestDeleteHistoryRowKeepsResult(t *testing.T) {
	repo, me := tempLedger(t)
	const tid = "20261101-0900-做完的-bbbb"
	logs := store.NewWorklogStore(repo)
	doc, err := logs.Create(tid, "做完的", delCreated, me.UUID, nil, nil, "")
	if err != nil {
		t.Fatal(err)
	}

	line := core.HistoryLine(delFinished, delCreated, "做完的", me.UUID, "原摘要", core.ResultDone,
		core.WorklogRel(tid, delCreated), "建设", nil, me.UUID, "@甲", "@甲", "", "", "")
	histPath := store.NewHistoryStore(repo).PathFor(delFinished)
	if err := os.MkdirAll(filepath.Dir(histPath), 0o755); err != nil {
		t.Fatal(err)
	}
	content := core.HistoryTitle + "\n\n" + core.HistoryHeader + "\n" + core.HistorySep + "\n" + line
	if err := os.WriteFile(histPath, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := DeleteHistoryRow(repo, me, DeleteHistoryParams{
		Src: "history/202611.md", Line: 5, Note: "建错了", When: delWhen,
	}); err != nil {
		t.Fatalf("删除历史行应成功：%v", err)
	}

	after, err := os.ReadFile(histPath)
	if err != nil {
		t.Fatal(err)
	}
	rows, _ := core.ParseHistory(string(after))
	if len(rows) != 1 {
		t.Fatalf("改完仍应读回一行 15 列，实际 %d 行：\n%s", len(rows), after)
	}
	row := rows[0]
	if row.Result != core.ResultDone || row.Summary != "原摘要" {
		t.Errorf("原结果与原摘要不许被盖：result=%q summary=%q", row.Result, row.Summary)
	}
	if row.Deleted != core.DeletedYes || row.DeletedBy != me.UUID || row.DeletedAt != delWhen {
		t.Errorf("删除三列没落值：deleted=%q by=%q at=%q", row.Deleted, row.DeletedBy, row.DeletedAt)
	}
	if rowMatches(row, HistoryQuery{}, me, "", "") {
		t.Error("已删除行不该出现在 history 明细里")
	}
	text, err := logs.Read(doc)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(text, " · delete · ") || !strings.Contains(text, "deleted: 建错了") {
		t.Errorf("过程文档应追加一条 delete 执行记录并带上留言：\n%s", text)
	}
}
