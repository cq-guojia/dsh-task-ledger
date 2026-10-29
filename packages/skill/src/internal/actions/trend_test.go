package actions

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// 趋势统计：桶边界 / 倒推未结 / 按月缓存。
// 断言一律用「相对今天」的日期，不写死年月 —— 跨月、跨年跑测试才不会红。

func trendToday() string { return time.Now().Format(trendDayLayout) }

func ptr(text string) *string { return &text }

// trendCacheDirFor 测试用缓存目录（拿不到就直接失败，别静默跳过断言）。
func trendCacheDirFor(t *testing.T, repo string) string {
	t.Helper()
	dir, ok := trendCacheDir(repo)
	if !ok {
		t.Fatal("拿不到趋势缓存目录")
	}
	return dir
}

// writeHistoryRow 往 finished 所属月份的历史文件追加一行（两个时间都是存盘的 UTC 串）。
func writeHistoryRow(t *testing.T, repo, finished, created, title, owner string) {
	t.Helper()
	dir := filepath.Join(repo, core.LedgerDir, core.HistoryDir)
	if err := os.MkdirAll(dir, 0o777); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, core.MonthOf(finished, "")+".md")
	text := core.HistoryTitle + "\n\n" + core.HistoryHeader + "\n" + core.HistorySep + "\n"
	if raw, err := os.ReadFile(path); err == nil {
		text = string(raw)
	}
	text += core.HistoryLine(finished, created, title, owner, "做完了", core.ResultDone, "", "建设", nil, owner, "", "")
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

// localStamp 本机时区的某个时刻 → 存盘用的 UTC 串。
func localStamp(at time.Time) string { return at.UTC().Format("2006-01-02 15:04:05") }

func trendBucketsByDay(res *TrendResult) map[string]TrendBucket {
	out := map[string]TrendBucket{}
	for _, bucket := range res.Buckets {
		out[bucket.From] = bucket
	}
	return out
}

func TestTrendBucketsClipAndAlign(t *testing.T) {
	// 2026-10-28 是周三（周一是 10-26）：首桶不补周一周二，只从区间起点开始
	weeks := trendBuckets("week", "2026-10-28", "2026-11-10")
	want := [][2]string{{"2026-10-28", "2026-11-01"}, {"2026-11-02", "2026-11-08"}, {"2026-11-09", "2026-11-10"}}
	if len(weeks) != len(want) {
		t.Fatalf("应切出 %d 个周桶，实际 %d 个：%+v", len(want), len(weeks), weeks)
	}
	for i, pair := range want {
		if weeks[i].From != pair[0] || weeks[i].To != pair[1] {
			t.Errorf("第 %d 个周桶应是 %s..%s，实际 %s..%s", i+1, pair[0], pair[1], weeks[i].From, weeks[i].To)
		}
	}

	months := trendBuckets("month", "2026-10-15", "2026-12-31")
	if len(months) != 3 || months[0].From != "2026-10-15" || months[0].To != "2026-10-31" ||
		months[2].From != "2026-12-01" || months[2].To != "2026-12-31" {
		t.Errorf("月桶应按自然月切、首尾裁到区间：%+v", months)
	}

	quarters := trendBuckets("quarter", "2026-08-15", "2026-10-05")
	if len(quarters) != 2 || quarters[0].From != "2026-08-15" || quarters[0].To != "2026-09-30" ||
		quarters[1].From != "2026-10-01" || quarters[1].To != "2026-10-05" {
		t.Errorf("季桶应按自然季（7~9 / 10~12）切：%+v", quarters)
	}
}

func TestTrendCountsAddedDoneOpen(t *testing.T) {
	t.Setenv("TASK_LEDGER_HOME", t.TempDir())
	repo, me := tempLedger(t,
		map[string]any{"tid": "20261029-0900-今天建的-aaaa", "status": "open", "title": "今天建的", "created": ago(0)},
	)
	now := time.Now()
	// 两条已结案：都是两天前建的，一条今天结、一条昨天结
	writeHistoryRow(t, repo, localStamp(now), localStamp(now.AddDate(0, 0, -2)), "今天结的", testUUID)
	writeHistoryRow(t, repo, localStamp(now.AddDate(0, 0, -1)), localStamp(now.AddDate(0, 0, -2)), "昨天结的", testUUID)

	res, err := TrendStats(repo, me, TrendQuery{Granularity: "day", Last: "4d"})
	if err != nil {
		t.Fatal(err)
	}
	today := trendToday()
	byDay := trendBucketsByDay(res)
	if got := byDay[today]; got.Added != 1 || got.Done != 1 || got.Open != 1 {
		t.Errorf("今天：新增 1（在办那条）、完成 1、未结 1，实际 added=%d done=%d open=%d", got.Added, got.Done, got.Open)
	}
	if got := byDay[trendAddDay(today, -1)]; got.Added != 0 || got.Done != 1 || got.Open != 1 {
		t.Errorf("昨天：完成 1、未结 1（当前在办 + 今天完成 − 今天新增），实际 added=%d done=%d open=%d", got.Added, got.Done, got.Open)
	}
	if got := byDay[trendAddDay(today, -2)]; got.Added != 2 || got.Done != 0 || got.Open != 2 {
		t.Errorf("两天前：新增 2、未结 2（这两条当时还没结），实际 added=%d done=%d open=%d", got.Added, got.Done, got.Open)
	}
}

func TestTrendMineAndByOwner(t *testing.T) {
	t.Setenv("TASK_LEDGER_HOME", t.TempDir())
	other := "11111111-2222-4333-8444-555555555555"
	repo, me := tempLedger(t,
		map[string]any{
			"tid": "20261029-0900-我提的-aaaa", "status": "doing", "owner": testUUID, "creator": testUUID,
			"title": "我提的我在做", "created": ago(0),
		},
		map[string]any{
			"tid": "20261029-0900-别人提的-bbbb", "status": "open", "creator": other,
			"title": "别人提的还没人接", "created": ago(0),
		},
	)
	query := TrendQuery{Granularity: "day", Last: "1d"}
	all, err := TrendStats(repo, me, query)
	if err != nil {
		t.Fatal(err)
	}
	if got := trendBucketsByDay(all)[trendToday()]; got.Added != 2 || got.Open != 2 || got.Owners != nil {
		t.Errorf("不筛人：新增 2、未结 2、不带按人明细，实际 added=%d open=%d owners=%v", got.Added, got.Open, got.Owners)
	}

	query.Mine = true
	mine, err := TrendStats(repo, me, query)
	if err != nil {
		t.Fatal(err)
	}
	if got := trendBucketsByDay(mine)[trendToday()]; got.Added != 1 || got.Open != 1 {
		t.Errorf("--mine：新增按 creator 只算我提的 1、未结按 owner 只算我负责的 1，实际 added=%d open=%d", got.Added, got.Open)
	}

	query.Mine, query.ByOwner = false, true
	byOwner, err := TrendStats(repo, me, query)
	if err != nil {
		t.Fatal(err)
	}
	cell, ok := trendBucketsByDay(byOwner)[trendToday()].Owners[testUUID]
	if !ok || cell.Name != "GuoJia-Agent" || cell.Added != 1 || cell.Open != 1 {
		t.Errorf("--by-owner 应带上我这条（人名取点名册）：%+v", cell)
	}
	if cell, ok := trendBucketsByDay(byOwner)[trendToday()].Owners[other]; !ok || cell.Added != 1 {
		t.Errorf("--by-owner 应带上别人提的那条：%+v", cell)
	}
}

// 按人未结的回归：**桶之后才建、早已结案**的任务不能算进更早的日子。
// 老公式只加「之后完成」不减「之后新建」，越靠前的桶虚高得越离谱（真机 257 就是这么来的）。
func TestTrendOwnerOpenSubtractsTasksCreatedAfterBucket(t *testing.T) {
	t.Setenv("TASK_LEDGER_HOME", t.TempDir())
	repo, me := tempLedger(t)
	now := time.Now()
	// 两条都是「两天前建、今天结」：三天前它们根本还不存在
	writeHistoryRow(t, repo, localStamp(now), localStamp(now.AddDate(0, 0, -2)), "今天结的", testUUID)
	writeHistoryRow(t, repo, localStamp(now), localStamp(now.AddDate(0, 0, -2)), "今天结的乙", testUUID)

	res, err := TrendStats(repo, me, TrendQuery{Granularity: "day", Last: "4d", ByOwner: true})
	if err != nil {
		t.Fatal(err)
	}
	today := trendToday()
	byDay := trendBucketsByDay(res)
	if cell := byDay[today].Owners[testUUID]; cell != nil && cell.Open != 0 {
		t.Errorf("今天两条都结了 ⇒ 我的未结 0，实际 %d", cell.Open)
	}
	if cell := byDay[trendAddDay(today, -3)].Owners[testUUID]; cell != nil && cell.Open != 0 {
		t.Errorf("三天前这两条还没建 ⇒ 我的未结 0，实际 %d", cell.Open)
	}
	if cell := byDay[trendAddDay(today, -2)].Owners[testUUID]; cell == nil || cell.Open != 2 {
		t.Errorf("两天前两条已建未结 ⇒ 我的未结 2，实际 %+v", cell)
	}
}

func TestTrendCacheBadJSONAndSourceChange(t *testing.T) {
	home := t.TempDir()
	t.Setenv("TASK_LEDGER_HOME", home)
	repo, me := tempLedger(t)
	query := TrendQuery{Granularity: "month", Last: "3m"}

	first, err := TrendStats(repo, me, query)
	if err != nil {
		t.Fatal(err)
	}
	files := trendCacheFiles(t, home)
	if len(files) < 2 {
		t.Fatalf("窗口里已过完的两个月都该落缓存，实际 %d 个文件：%v", len(files), files)
	}

	// 坏 JSON 当成没有：结果不变，文件被重算覆盖
	broken := files[0]
	if err := os.WriteFile(broken, []byte("{坏掉的 JSON"), 0o644); err != nil {
		t.Fatal(err)
	}
	second, err := TrendStats(repo, me, query)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(first.Buckets, second.Buckets) {
		t.Error("坏缓存必须等于「没有缓存」：两次结果应完全一致")
	}
	if raw, err := os.ReadFile(broken); err == nil && strings.Contains(string(raw), "坏掉的") {
		t.Error("坏缓存应被重算结果覆盖")
	}

	// 源文件变了 ⇒ 该月缓存失效并重算（补一条上月结案）
	lastMonth := shiftMonth(trendMonthKey(trendToday()), -1)
	finished := time.Date(
		atoiSafe(lastMonth[0:4]), time.Month(atoiSafe(lastMonth[4:6])), 15, 12, 0, 0, 0, time.Local)
	writeHistoryRow(t, repo, localStamp(finished), localStamp(finished), "补录一条上月结的", testUUID)
	third, err := TrendStats(repo, me, query)
	if err != nil {
		t.Fatal(err)
	}
	want := 0
	for _, bucket := range first.Buckets {
		if bucket.From == trendMonthFirstDay(lastMonth) {
			want = bucket.Done + 1
		}
	}
	if got := trendBucketsByDay(third)[trendMonthFirstDay(lastMonth)]; got.Done != want {
		t.Errorf("上月历史文件变了，该月桶的完成数应从 %d 变到 %d，实际 %d", want-1, want, got.Done)
	}
}

func TestTrendWideWindowIsCappedByTimeNotFiles(t *testing.T) {
	t.Setenv("TASK_LEDGER_HOME", t.TempDir())
	repo, me := tempLedger(t)
	// 上限按时间定（10 年），不再按「读几个历史文件」定：10 年 = 121 个月文件也要放得开
	years, err := TrendStats(repo, me, TrendQuery{Granularity: "year", Last: "10y"})
	if err != nil {
		t.Fatalf("year 粒度 10 年应可跑（按时间封顶，不按文件数）：%v", err)
	}
	if len(years.Buckets) != 10 {
		t.Errorf("--last 10y 应切出 10 个年桶，实际 %d 个", len(years.Buckets))
	}
	if _, err := TrendStats(repo, me, TrendQuery{Granularity: "month", Last: "120m"}); err != nil {
		t.Errorf("120 个月（约 10 年）应可跑：%v", err)
	}
	if _, err := TrendStats(repo, me, TrendQuery{Granularity: "year", Last: "12y"}); err == nil {
		t.Error("超过 10 年应报错，不能静默截断")
	}
	// day 粒度另有自己的上限：一天一桶没人看十年
	if _, err := TrendStats(repo, me, TrendQuery{Granularity: "day", Last: "400d"}); err == nil {
		t.Error("day 粒度超过 365 天应报错，并提示换更粗的粒度")
	}
}

// 命中缓存与实时算必须**逐字节相同**（用户 2026-10-29 明确要求）。
// 第一次跑：无缓存，全部实时算并写缓存；第二次跑：过去月走缓存，当月照旧实时。
func TestTrendCachedResultEqualsLive(t *testing.T) {
	home := t.TempDir()
	t.Setenv("TASK_LEDGER_HOME", home)
	now := time.Now()
	repo, me := tempLedger(t,
		map[string]any{"tid": "20261029-0900-在办的-aaaa", "status": "doing", "owner": testUUID, "creator": testUUID,
			"title": "还在办", "created": ago(0)},
	)
	// 上月的一条：建与结都在过去月 ⇒ 该月会被固化进缓存
	writeHistoryRow(t, repo, localStamp(now.AddDate(0, 0, -35)), localStamp(now.AddDate(0, 0, -40)), "上月结的", testUUID)

	q := TrendQuery{Granularity: "week", Last: "8w", ByOwner: true}
	live, err := TrendStats(repo, me, q)
	if err != nil {
		t.Fatal(err)
	}
	// 确认缓存真的落盘（否则这个测试什么也没证明）
	var files []string
	_ = filepath.Walk(home, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() && strings.HasSuffix(path, ".json") {
			files = append(files, path)
		}
		return nil
	})
	if len(files) == 0 {
		t.Fatal("过去月应写出一份趋势缓存，实际一个文件都没有")
	}

	cached, err := TrendStats(repo, me, q)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(live, cached) {
		for i := range live.Buckets {
			if i >= len(cached.Buckets) || !reflect.DeepEqual(live.Buckets[i], cached.Buckets[i]) {
				t.Errorf("第 %d 桶不一致：实时 %+v / 缓存 %+v", i+1, live.Buckets[i], cached.Buckets[i])
			}
		}
		t.Fatalf("命中缓存与实时算的结果必须完全一致（coverage %s..%s vs %s..%s）",
			live.CoverFrom, live.CoverTo, cached.CoverFrom, cached.CoverTo)
	}

	// 反向证明缓存**确实被读**：把缓存里窗口内某天的完成数改大，结果必须跟着变。
	// 用字符串替换而不是 JSON 反序列化再序列化 —— 后者会把 mtime 的 int64 过一遍 float64，
	// 指纹对不上就整月重算，等于没测到缓存路径。
	raw, err := os.ReadFile(files[0])
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Days []struct {
			Day   string `json:"day"`
			Added int    `json:"added"`
			Done  int    `json:"done"`
			Open  int    `json:"open"`
		} `json:"days"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	if len(doc.Days) == 0 {
		t.Fatal("缓存里没有 days，测试前提不成立")
	}
	// 挑窗口内的一天（缓存文件含整月，月初那几天可能落在 8 周窗口之外）
	from, to := live.Buckets[0].From, live.Buckets[len(live.Buckets)-1].To
	target := doc.Days[len(doc.Days)-1]
	for _, day := range doc.Days {
		if day.Day >= from && day.Day <= to {
			target = day
			break
		}
	}
	tampered := strings.Replace(string(raw),
		fmt.Sprintf(`{"day":%q,"added":%d,"done":%d,"open":%d}`, target.Day, target.Added, target.Done, target.Open),
		fmt.Sprintf(`{"day":%q,"added":%d,"done":%d,"open":%d}`, target.Day, target.Added, target.Done+999, target.Open),
		1,
	)
	if tampered == string(raw) {
		t.Fatal("没改到缓存（字段格式与预期不符），这个反向证明无效")
	}
	if err := os.WriteFile(files[0], []byte(tampered), 0o644); err != nil {
		t.Fatal(err)
	}
	again, err := TrendStats(repo, me, q)
	if err != nil {
		t.Fatal(err)
	}
	if reflect.DeepEqual(again, cached) {
		t.Errorf("改了缓存里的 %s 却没影响结果 ⇒ 说明读的是源文件、缓存根本没被用上", target.Day)
	}
}

// 左锚：查过一段历史之后，再查它右边那一段**不该再读更晚的月份**。
// 造法：一条 2025-12-10 建、2026-03-10 结的任务 ⇒ 2025-12 那次冷查询把锚写下来；
// 之后删掉 2026-03 的历史文件 —— 若查 2026-01 仍然算得出「未结 1」，说明用的是
// 「2025-12 月末锚 + 2026-01 流水」正向推，而不是从今天往回倒（倒推会得 0）。
func TestTrendUsesLeftAnchorAndSkipsLaterMonths(t *testing.T) {
	home := t.TempDir()
	t.Setenv("TASK_LEDGER_HOME", home)
	repo, me := tempLedger(t)
	mk := func(month string, day int) time.Time {
		at, err := time.ParseInLocation("2006-01-02", fmt.Sprintf("%s-%02d", month, day), time.Local)
		if err != nil {
			t.Fatal(err)
		}
		return at
	}
	created, finished := mk("2025-12", 10), mk("2026-03", 10)
	writeHistoryRow(t, repo, localStamp(finished), localStamp(created), "跨季的任务", testUUID)

	dec, err := TrendStats(repo, me, TrendQuery{Granularity: "month", Since: ptr("2025-12-01"), Until: ptr("2025-12-31")})
	if err != nil {
		t.Fatal(err)
	}
	if got := dec.Buckets[0].Open; got != 1 {
		t.Fatalf("2025-12 月末未结应为 1，实际 %d", got)
	}
	if _, ok := store.LoadTrendAnchors(trendCacheDirFor(t, repo), TrendAlgo).Months["202512"]; !ok {
		t.Fatal("冷查询之后应留下 202512 的锚")
	}

	// 正向（吃锚）与倒推必须给出同一个答案
	janQuery := TrendQuery{Granularity: "month", Since: ptr("2026-01-01"), Until: ptr("2026-01-31")}
	if err := os.Remove(filepath.Join(trendCacheDirFor(t, repo), "anchors.json")); err != nil {
		t.Fatal(err)
	}
	janBackward, err := TrendStats(repo, me, janQuery)
	if err != nil {
		t.Fatal(err)
	}
	janForward, err := TrendStats(repo, me, janQuery) // 上一次倒推已把锚补回来
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(janBackward.Buckets, janForward.Buckets) {
		t.Errorf("正向累计与倒推结果不一致：倒推 %+v / 正向 %+v", janBackward.Buckets, janForward.Buckets)
	}

	// 删掉更晚的月份：倒推路径已经不可能成立
	historyDir := filepath.Join(repo, core.LedgerDir, core.HistoryDir)
	if err := os.Remove(filepath.Join(historyDir, "202603.md")); err != nil {
		t.Fatal(err)
	}
	jan, err := TrendStats(repo, me, janQuery)
	if err != nil {
		t.Fatal(err)
	}
	if got := jan.Buckets[0].Open; got != 1 {
		t.Errorf("有左锚时应正向推出 2026-01 月末未结 1（删掉了 3 月文件也能算），实际 %d", got)
	}
}

func TestTrendEmptyLedgerHasNoBucketsData(t *testing.T) {
	t.Setenv("TASK_LEDGER_HOME", t.TempDir())
	repo, me := tempLedger(t)
	res, err := TrendStats(repo, me, TrendQuery{Granularity: "week", Last: "2w"})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Buckets) == 0 {
		t.Fatal("空台账也要给出桶（全 0），不能什么都不返回")
	}
	for _, bucket := range res.Buckets {
		if bucket.Added != 0 || bucket.Done != 0 || bucket.Open != 0 {
			t.Errorf("空台账应全是 0，实际 %+v", bucket)
		}
	}
}

// trendCacheFiles 本机缓存目录下的全部月文件。
func trendCacheFiles(t *testing.T, home string) []string {
	t.Helper()
	var out []string
	_ = filepath.Walk(filepath.Join(home, ".taskledger", "cache"), func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() && strings.HasSuffix(path, ".json") {
			out = append(out, path)
		}
		return nil
	})
	return out
}
