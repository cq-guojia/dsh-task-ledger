package actions

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
)

// --count-only 与列表共用 rowMatches：同一组条件下两边的数必须一样；
// 超过 CountCap 就停，对外仍是 10000 + capped。

const otherUUID = "11111111-2222-3333-4444-555555555555"

func writeHistory(t *testing.T, repo, ym string, lines []string) {
	t.Helper()
	dir := filepath.Join(repo, core.ToRepoRel(core.HistoryDir))
	if err := os.MkdirAll(dir, 0o777); err != nil {
		t.Fatal(err)
	}
	body := core.HistoryTitle + "\n\n" + core.HistoryHeader + "\n" + core.HistorySep + "\n" +
		strings.Join(lines, "")
	if err := os.WriteFile(filepath.Join(dir, ym+".md"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func historyLine(finished, title, owner, category string, tags []string) string {
	return core.HistoryLine(finished, "2026-01-01 00:00:00", title, owner, "摘要", "",
		category, tags, owner, "名字", "名字")
}

// currentMonth 本次测试用的月份（与 targetMonthKeys 的 now 同一时钟）。
func currentMonth() string {
	return core.MonthOf(core.Now(), "")
}

func TestCountOnlyMatchesList(t *testing.T) {
	repo, _ := tempLedger(t)
	ym := currentMonth()
	prev := shiftMonth(ym, -1)
	writeHistory(t, repo, ym, []string{
		historyLine(day(ym, "10")+" 10:00:00", "我的建设", testUUID, "建设", []string{"台账"}),
		historyLine(day(ym, "12")+" 10:00:00", "别人的修复", otherUUID, "缺陷修复", []string{"看板"}),
	})
	writeHistory(t, repo, prev, []string{
		historyLine(day(prev, "15")+" 10:00:00", "上月的", testUUID, "建设", []string{"台账"}),
	})

	since, until := day(ym, "01")+" 00:00:00", day(ym, "28")+" 23:59:59"
	cases := []struct {
		name string
		q    HistoryQuery
		want int
	}{
		{"全量", HistoryQuery{Since: &since, Until: &until}, 2},
		{"只要我的", HistoryQuery{Since: &since, Until: &until, Mine: true}, 1},
		{"按分类", HistoryQuery{Since: &since, Until: &until, Category: strPtr("建设")}, 1},
		{"按标签", HistoryQuery{Since: &since, Until: &until, Tag: strPtr("看板")}, 1},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			list := c.q
			listed, err := QueryHistory(repo, core.Identity{UUID: testUUID}, list)
			if err != nil {
				t.Fatal(err)
			}
			count := c.q
			count.CountOnly = true
			counted, err := QueryHistory(repo, core.Identity{UUID: testUUID}, count)
			if err != nil {
				t.Fatal(err)
			}
			if len(listed.Records) != c.want || counted.Count != c.want {
				t.Fatalf("列表 %d / 计数 %d，应都为 %d", len(listed.Records), counted.Count, c.want)
			}
			if counted.Capped {
				t.Error("只有两条，不该 capped")
			}
		})
	}
}

func TestCountOnlyStopsAtCap(t *testing.T) {
	repo, me := tempLedger(t)
	ym := currentMonth()
	lines := make([]string, 0, CountCap+1)
	for i := 0; i <= CountCap; i++ {
		lines = append(lines, historyLine(day(ym, "10")+" 10:00:00", "批量", testUUID, "", nil))
	}
	writeHistory(t, repo, ym, lines)

	since, until := day(ym, "01")+" 00:00:00", day(ym, "28")+" 23:59:59"
	res, err := QueryHistory(repo, me, HistoryQuery{Since: &since, Until: &until, CountOnly: true})
	if err != nil {
		t.Fatal(err)
	}
	if res.Count != CountCap || !res.Capped {
		t.Fatalf("应封顶 %d 且 capped，实际 count=%d capped=%v", CountCap, res.Count, res.Capped)
	}
}

func day(ym, d string) string {
	return ym[0:4] + "-" + ym[4:6] + "-" + d
}

func strPtr(v string) *string { return &v }
