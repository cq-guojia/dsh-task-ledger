package store

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
)

// 不做老格式兼容：旧文件照样追加 15 列行、不报错不提示；读回时列数不符的行静默跳过、不告警。
func TestAppendRowIgnoresOldFormat(t *testing.T) {
	repo := t.TempDir()
	path := filepath.Join(repo, "history", "202610.md")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	old := "# 已结案\n\n" +
		"| 完成 | 创建 | 标题 | 分类 | 标签 | 负责人 | 负责人名 | 创建者 | 创建者名 | 摘要 | 执行记录 |\n" +
		"|---|---|---|---|---|---|---|---|---|---|---|\n" +
		"| 2026-10-01 10:00 | 2026-10-01 09:00 | 老任务 | 建设 | 甲 | u1 | @甲 | u1 | @甲 | 做完了 | [a.md](a.md) |\n"
	if err := os.WriteFile(path, []byte(old), 0o644); err != nil {
		t.Fatal(err)
	}

	out, err := NewHistoryStore(repo).AppendRow(path, map[string]any{
		"finished": "2026-10-02 10:00",
		"created":  "2026-10-01 09:00",
		"title":    "新任务",
	})
	if err != nil {
		t.Fatalf("不兼容老格式 ⇒ 不该报错，实际：%v", err)
	}
	text, _ := out["text"].(string)
	records, warnings := core.ParseHistory(text)
	if len(warnings) != 0 {
		t.Fatalf("不该产生任何告警：%v", warnings)
	}
	if len(records) != 1 {
		t.Fatalf("旧行静默跳过，只应读回新增的 15 列行，实际 %d 行：\n%s", len(records), text)
	}
	if records[0].Title != "新任务" {
		t.Fatalf("读回的应当是新增行，实际 %q", records[0].Title)
	}
}

// 新格式（15 列）文件照常追加。
func TestAppendRowAcceptsNewFormat(t *testing.T) {
	repo := t.TempDir()
	path := filepath.Join(repo, "history", "202610.md")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	head := core.HistoryTitle + "\n\n" + core.HistoryHeader + "\n" + core.HistorySep + "\n"
	head += core.HistoryLine("2026-10-01 10:00", "2026-10-01 09:00", "老任务", "u1", "做完了",
		core.ResultDone, "", "建设", []string{"甲"}, "u1", "@甲", "@甲", "", "", "")
	if err := os.WriteFile(path, []byte(head), 0o644); err != nil {
		t.Fatal(err)
	}

	out, err := NewHistoryStore(repo).AppendRow(path, map[string]any{
		"finished": "2026-10-02 10:00",
		"created":  "2026-10-01 09:00",
		"title":    "新任务",
	})
	if err != nil {
		t.Fatalf("新格式文件不该报错：%v", err)
	}
	text, _ := out["text"].(string)
	records, warnings := core.ParseHistory(text)
	if len(warnings) != 0 {
		t.Fatalf("写出的表不该有告警：%v", warnings)
	}
	if len(records) != 2 {
		t.Fatalf("应当读回 2 行，实际 %d 行：\n%s", len(records), text)
	}
	if records[1].Title != "新任务" {
		t.Fatalf("最后一行标题应当是「新任务」，实际 %q", records[1].Title)
	}
}
