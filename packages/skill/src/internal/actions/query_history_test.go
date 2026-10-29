package actions

// history 现在只负责**列表**（`--count-only` 于 1.3.44 删除，统计口径走 `stats --trend`）：
// 这里钉住筛选判据（`--since/--until`、`--mine/--owner`、`--owner-name`、`--category`、`--tag`）
// 与 `--limit` 的截断语义。日期一律相对今天算，跨月 / 跨年跑测试也不会红。
//
// 历史行的 finished / created 存的是**存盘串**，查询参数也用同一形状的串比较（见 rowMatches）。

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
)

const historyOtherUUID = "11111111-2222-3333-4444-555555555555"

// historyMonth 相对今天偏移 offset 个月的年月（YYYYMM）。
func historyMonth(offset int) string {
	return time.Now().AddDate(0, offset, 0).Format("200601")
}

// historyAt 某年月的第 d 天 + 时刻，拼成与存盘同形的串。
func historyAt(ym, d, clock string) string {
	return ym[0:4] + "-" + ym[4:6] + "-" + d + " " + clock
}

// seedHistoryRow 往指定月份的历史文件追加一行（同一文件多次调用会接着写）。
func seedHistoryRow(t *testing.T, repo, ym, finished, title, owner, ownerName, category string, tags []string) {
	t.Helper()
	dir := filepath.Join(repo, core.LedgerDir, core.HistoryDir)
	if err := os.MkdirAll(dir, 0o777); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, ym+".md")
	text := core.HistoryTitle + "\n\n" + core.HistoryHeader + "\n" + core.HistorySep + "\n"
	if raw, err := os.ReadFile(path); err == nil {
		text = string(raw)
	}
	text += core.HistoryLine(finished, finished, title, owner, "摘要", "", category, tags, owner, ownerName, ownerName)
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestHistoryFilters(t *testing.T) {
	repo, me := tempLedger(t)
	ym := historyMonth(0)
	prev := historyMonth(-1)

	// 本月两条：我的（建设 / 台账）、别人的（缺陷修复 / 看板）。
	seedHistoryRow(t, repo, ym, historyAt(ym, "10", "10:00:00"), "我的建设", testUUID, "甲", "建设", []string{"台账"})
	seedHistoryRow(t, repo, ym, historyAt(ym, "12", "10:00:00"), "别人的修复", historyOtherUUID, "乙", "缺陷修复", []string{"看板"})
	// 上个月一条：用来证明窗口外不混进来、跨月文件读得到。
	seedHistoryRow(t, repo, prev, historyAt(prev, "15", "10:00:00"), "上月的建设", testUUID, "甲", "建设", []string{"台账"})

	monthFrom := historyAt(ym, "01", "00:00:00")
	monthTo := historyAt(ym, "28", "23:59:59")
	other := historyOtherUUID

	cases := []struct {
		name string
		q    HistoryQuery
		want int
	}{
		{"本月全量", HistoryQuery{Since: &monthFrom, Until: &monthTo}, 2},
		{"只要我的", HistoryQuery{Since: &monthFrom, Until: &monthTo, Mine: true}, 1},
		{"按人", HistoryQuery{Since: &monthFrom, Until: &monthTo, Owner: &other}, 1},
		{"按显示名", HistoryQuery{Since: &monthFrom, Until: &monthTo, OwnerName: ptr("乙")}, 1},
		{"按分类", HistoryQuery{Since: &monthFrom, Until: &monthTo, Category: ptr("建设")}, 1},
		{"按标签", HistoryQuery{Since: &monthFrom, Until: &monthTo, Tag: ptr("看板")}, 1},
		{"跨月窗口", HistoryQuery{Since: ptr(historyAt(prev, "01", "00:00:00")), Until: &monthTo}, 3},
		{"无匹配", HistoryQuery{Since: &monthFrom, Until: &monthTo, Category: ptr("没有这个分类")}, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			res, err := QueryHistory(repo, me, c.q)
			if err != nil {
				t.Fatal(err)
			}
			if len(res.Records) != c.want || res.Count != c.want {
				t.Fatalf("列表 %d 条 / count %d，应都为 %d", len(res.Records), res.Count, c.want)
			}
			if res.Capped {
				t.Error("没给 --limit，不该 capped")
			}
		})
	}
}

// --limit 截断：count 是**返回条数**，capped 说明还有更多没返回（2026-10-29 口径）。
func TestHistoryLimitTruncates(t *testing.T) {
	repo, me := tempLedger(t)
	ym := historyMonth(0)
	for _, day := range []string{"10", "11", "12"} {
		seedHistoryRow(t, repo, ym, historyAt(ym, day, "10:00:00"), "批量"+day, testUUID, "甲", "建设", nil)
	}
	from := historyAt(ym, "01", "00:00:00")
	to := historyAt(ym, "28", "23:59:59")
	one := 1

	res, err := QueryHistory(repo, me, HistoryQuery{Since: &from, Until: &to, Limit: &one})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Records) != 1 || res.Count != 1 {
		t.Fatalf("应返回 1 条、count=1，实际 %d / %d", len(res.Records), res.Count)
	}
	if !res.Capped {
		t.Fatal("截断了却没标 capped")
	}

	// 不截断时 capped 为 false，count 就是总数。
	res, err = QueryHistory(repo, me, HistoryQuery{Since: &from, Until: &to})
	if err != nil {
		t.Fatal(err)
	}
	if res.Count != 3 || res.Capped {
		t.Fatalf("不截断应 3 条且不 capped，实际 count=%d capped=%v", res.Count, res.Capped)
	}
}
