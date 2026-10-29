package actions

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/env"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// 只读：按周期分桶的趋势统计（新增 / 完成 / 该周期末仍未结）。
//
// 为什么不能靠现有方法拼出来：history 的 --since/--until 过滤的是**结案时间**、
// list 只有当前在办 ⇒ 「某周新增」取不到；拉全量明细再在插件侧聚合已被实测否决
// （20 万条 3s+、30MB 过进程边界）。所以整段桶序列在 skill 里一次算完再回。
//
// 三条口径（2026-10-29 定稿）：
//   - 新增按 created、完成按 finished；未结 = **该日结束时**仍未结案的条数；
//   - 未结靠倒推：open(d) = 当前在办 + (d, 今天] 的完成 − (d, 今天] 的新增
//     （只依赖 d 之后的数据 + 当前在办，天然含窗口前遗留的基线，不需要快照库）；
//   - 时间一律按**本机时区**分桶（日 00:00 / 周一 / 自然月 / 自然季 / 自然年）。
//
// 已过完的本地月落一份缓存（~/.taskledger/cache/trend/…，本机私有、不进 git），
// 当月永远实时算；缓存只加速，算错 / 写不进去都只是慢一点，不影响结果。

// TrendAlgo 口径版本：一变，全部缓存视为过期（不必依赖文件时间）。
const TrendAlgo = 3

const (
	defaultTrendLast = "8w"
	trendDayLayout   = "2006-01-02"
)

// 天花板按**时间跨度**定，不按读几个文件定（2026-10-29 用户拍板）：
// 一年固定 12 个文件，用文件数限制等于用「台账有多老」限制「你想看多久」，
// 两者本就不该绑在一起；而缓存文件不计入任何上限（命中的月份根本不读源文件）。
const (
	// TrendMaxDays 一次最多统计多少天（≈10 年；10 年含闰日最多 3653 天）。
	TrendMaxDays = 3660
	// TrendMaxDayBuckets day 粒度的桶数上限：一天一桶没人看十年。
	TrendMaxDayBuckets = 365
)

// trendGranularities 认的粒度（= trendBucketStart / trendBucketEnd 的分支全集）。
var trendGranularities = map[string]bool{"day": true, "week": true, "month": true, "quarter": true, "year": true}

// TrendQuery 趋势统计的查询条件。时间口径二选一：Since/Until，或 Last（默认 8w）。
type TrendQuery struct {
	Granularity string // day / week / month / quarter / year
	Since       *string
	Until       *string
	Last        string
	Mine        bool
	Owners      []string // uuid，可与 --mine 二选一
	ByOwner     bool
}

// TrendOwnerCell 一个桶里某个人的三个数：新增按 creator、完成与未结按 owner。
type TrendOwnerCell struct {
	Name  string
	Added int
	Done  int
	Open  int
}

// TrendBucket 一个周期桶；From/To 是**本地日期**（含边界），首尾桶按请求区间裁剪。
type TrendBucket struct {
	From   string
	To     string
	Added  int
	Done   int
	Open   int
	Owners map[string]*TrendOwnerCell // 只有 --by-owner 才填
}

// TrendResult 趋势统计的返回。CoverFrom 是实际有数据的第一天（前端据此显示「数据不足」）。
type TrendResult struct {
	Granularity string
	CoverFrom   string
	CoverTo     string
	Buckets     []TrendBucket
	Warnings    []string
}

// TrendStats 算趋势。
func TrendStats(repo string, me core.Identity, q TrendQuery) (*TrendResult, error) {
	if _, ok := trendGranularities[q.Granularity]; !ok {
		return nil, core.Failf("--trend 只认 day / week / month / quarter / year（收到 %q）。", q.Granularity)
	}
	filter, err := trendOwners(q, me)
	if err != nil {
		return nil, err
	}
	today := time.Now().Format(trendDayLayout)
	lo, hi, err := trendWindow(q, today)
	if err != nil {
		return nil, err
	}
	if span := trendDaySpan(lo, hi); span > TrendMaxDays {
		return nil, core.Failf("趋势一次最多统计 %d 天（约 10 年），本次跨度 %d 天 ⇒ 缩小 --since / --until 或 --last。", TrendMaxDays, span)
	}
	buckets := trendBuckets(q.Granularity, lo, hi)
	if q.Granularity == "day" && len(buckets) > TrendMaxDayBuckets {
		return nil, core.Failf("--trend day 一次最多 %d 天（本次 %d 天）⇒ 换 week / month 这类更粗的粒度。", TrendMaxDayBuckets, len(buckets))
	}
	firstMonth, lastMonth := trendMonthKey(lo), trendMonthKey(hi)

	series, roster, warnings, err := trendLoad(repo, firstMonth, lastMonth, today)
	if err != nil {
		return nil, err
	}
	filler := trendFiller{series: series, roster: roster}
	for i := range buckets {
		filler.fill(&buckets[i], filter, q.ByOwner)
	}
	coverFrom := lo
	if series.firstDay != "" && series.firstDay > coverFrom {
		coverFrom = series.firstDay
	}
	return &TrendResult{
		Granularity: q.Granularity,
		CoverFrom:   coverFrom,
		CoverTo:     hi,
		Buckets:     buckets,
		Warnings:    warnings,
	}, nil
}

// trendOwners --mine / --owner 归一成 uuid 列表；没筛就返回 nil。
func trendOwners(q TrendQuery, me core.Identity) ([]string, error) {
	if len(q.Owners) > 0 && q.Mine {
		return nil, core.Failf("--owner 不能和 --mine 一起用：一次只按一种范围筛。")
	}
	if q.Mine {
		if key := core.Normalize(me.UUID); key != "" {
			return []string{key}, nil
		}
		return nil, core.Failf("--mine 需要本机身份，但没拿到 uuid。")
	}
	var out []string // 空切片 ≠ nil：nil 才表示「没筛」，调用方按这个判
	for _, raw := range q.Owners {
		key, err := RequireUUID(raw, "--owner")
		if err != nil {
			return nil, err
		}
		out = append(out, key)
	}
	return out, nil
}

// trendWindow 生效的窗口 [lo, hi]（本地日期）。
func trendWindow(q TrendQuery, today string) (string, string, error) {
	if q.Last != "" && (q.Since != nil || q.Until != nil) {
		return "", "", core.Failf("--last 与 --since / --until 不能同时用（时间口径二选一）。")
	}
	if q.Until != nil && q.Since == nil {
		return "", "", core.Failf("只给 --until 算不出区间：配 --since，或用 --last <N><d|w|m|y>。")
	}
	hi := today
	if q.Until != nil {
		day, err := trendLocalDayOf(*q.Until, "--until", "23:59:59")
		if err != nil {
			return "", "", err
		}
		hi = day
	}
	var lo string
	if q.Since != nil {
		day, err := trendLocalDayOf(*q.Since, "--since", "00:00:00")
		if err != nil {
			return "", "", err
		}
		lo = day
	} else {
		day, err := trendLastStart(today, q.Last)
		if err != nil {
			return "", "", err
		}
		lo = day
	}
	if hi > today {
		hi = today // 未来没有数据，窗口收到今天
	}
	if lo > hi {
		return "", "", core.Failf("时间区间反了：--since（%s）晚于 --until（%s）。", lo, hi)
	}
	return lo, hi, nil
}

// trendLocalDayOf 用户按本地墙钟给的时间 → 本地日期。
func trendLocalDayOf(value, field, dateOnlyRef string) (string, error) {
	stamp, err := core.ToUTC(value, field, "", dateOnlyRef)
	if err != nil {
		return "", err
	}
	day := trendLocalDay(stamp)
	if day == "" {
		return "", core.Failf("%s 算不出日期：%q", field, value)
	}
	return day, nil
}

// trendLastStart --last 的起点：Nd 数天、Nw 数周（周一起算）、Nm 数月、Ny 数年。
func trendLastStart(today, spec string) (string, error) {
	text := strings.TrimSpace(spec)
	if text == "" {
		text = defaultTrendLast
	}
	unit := text[len(text)-1]
	n, err := strconv.Atoi(text[:len(text)-1])
	if err != nil || n < 1 {
		return "", core.Failf("--last 写法不对：%q（形如 8w / 1m / 14d / 1y）。", spec)
	}
	switch unit {
	case 'd':
		return trendAddDay(today, -(n - 1)), nil
	case 'w':
		return trendAddDay(trendBucketStart("week", today), -7*(n-1)), nil
	case 'm':
		return trendAddMonth(trendBucketStart("month", today), -(n - 1)), nil
	case 'y':
		return trendAddMonth(trendBucketStart("year", today), -12*(n-1)), nil
	}
	return "", core.Failf("--last 的单位只认 d / w / m / y（收到 %q）。", string(unit))
}

// trendBuckets 按粒度切片：首尾桶按区间裁剪（区间从周三开始，第一桶就只有周三起的数据）。
func trendBuckets(granularity, lo, hi string) []TrendBucket {
	var out []TrendBucket
	for cur := lo; cur <= hi; {
		from := trendBucketStart(granularity, cur)
		if from < lo {
			from = lo
		}
		to := trendBucketEnd(granularity, cur)
		if to > hi {
			to = hi
		}
		out = append(out, TrendBucket{From: from, To: to})
		cur = trendAddDay(to, 1)
	}
	return out
}

// trendBucketStart 某个日期所在桶的第一天（全部按本机时区）。
func trendBucketStart(granularity, day string) string {
	stamp, ok := trendParseDay(day)
	if !ok {
		return day
	}
	switch granularity {
	case "week":
		weekday := int(stamp.Weekday())
		if weekday == 0 {
			weekday = 7 // 周日归前一个周一
		}
		return stamp.AddDate(0, 0, -(weekday - 1)).Format(trendDayLayout)
	case "month":
		return time.Date(stamp.Year(), stamp.Month(), 1, 0, 0, 0, 0, time.UTC).Format(trendDayLayout)
	case "quarter":
		month := time.Month((int(stamp.Month())-1)/3*3 + 1)
		return time.Date(stamp.Year(), month, 1, 0, 0, 0, 0, time.UTC).Format(trendDayLayout)
	case "year":
		return time.Date(stamp.Year(), 1, 1, 0, 0, 0, 0, time.UTC).Format(trendDayLayout)
	}
	return day
}

// trendBucketEnd 某个日期所在桶的最后一天。
func trendBucketEnd(granularity, day string) string {
	start := trendBucketStart(granularity, day)
	switch granularity {
	case "week":
		return trendAddDay(start, 6)
	case "month":
		return trendAddDay(trendAddMonth(start, 1), -1)
	case "quarter":
		return trendAddDay(trendAddMonth(start, 3), -1)
	case "year":
		return trendAddDay(trendAddMonth(start, 12), -1)
	}
	return start
}

// trendSeries 待拼桶的逐日计数：日 → 数，外加按人的逐日计数与逐日未结。
type trendSeries struct {
	added       map[string]int
	done        map[string]int
	open        map[string]int            // 该日结束时全局仍未结
	openByOwner map[string]map[string]int // 该日结束时每人仍未结（= 进行中）
	byOwner     map[string]*trendOwnerDays
	firstDay    string // 第一条数据出现在哪天（coverage 用）
}

type trendOwnerDays struct {
	added map[string]int // 按 creator（展示用 = 我提的）
	owned map[string]int // 按 owner 的新建（倒推未结用 = 我负责的，含窗口之后建的）
	done  map[string]int // 按 owner 的结案
}

func newTrendSeries() *trendSeries {
	return &trendSeries{
		added:       map[string]int{},
		done:        map[string]int{},
		open:        map[string]int{},
		openByOwner: map[string]map[string]int{},
		byOwner:     map[string]*trendOwnerDays{},
	}
}

// owner 某人的逐日计数桶。**空 uuid 必须由调用方挡掉**：待认领 / 老数据缺 creator
// 只进全量，不算任何人（早期版本用共享单例兜，跨次调用会串数据）。
func (s *trendSeries) owner(uuid string) *trendOwnerDays {
	if days, ok := s.byOwner[uuid]; ok {
		return days
	}
	days := &trendOwnerDays{added: map[string]int{}, owned: map[string]int{}, done: map[string]int{}}
	s.byOwner[uuid] = days
	return days
}

// walkForward 从某月末锚点往右逐日累计：open(d) = open(d-1) + 新增(d) − 结案(d)。
// 有了左锚就不必再从今天倒推 —— 读一段历史只需那一段的流水。
func (s *trendSeries) walkForward(seed store.TrendAnchor, from, to string) {
	open := seed.Open
	owners := make(map[string]int, len(seed.Owners))
	for uuid, n := range seed.Owners {
		owners[uuid] = n
	}
	for day := from; day <= to; day = trendAddDay(day, 1) {
		open += s.added[day] - s.done[day]
		for uuid, days := range s.byOwner {
			owners[uuid] += days.owned[day] - days.done[day]
		}
		s.open[day] = open
		s.openByOwner[day] = cloneCounts(owners)
	}
}

// walkBackward 没有左锚时的兜底：从今天的在办快照往回推
// open(d) = open(d+1) + 结案(d+1) − 新增(d+1)。代价是要读到今天。
func (s *trendSeries) walkBackward(seedOpen int, seedOwners map[string]int, from, to string) {
	open := seedOpen
	owners := make(map[string]int, len(seedOwners))
	for uuid, n := range seedOwners {
		owners[uuid] = n
	}
	for day := to; ; day = trendAddDay(day, -1) {
		if day != to {
			next := trendAddDay(day, 1)
			open += s.done[next] - s.added[next]
			for uuid, days := range s.byOwner {
				owners[uuid] += days.done[next] - days.owned[next]
			}
		}
		s.open[day] = open
		s.openByOwner[day] = cloneCounts(owners)
		if day <= from {
			return
		}
	}
}

func cloneCounts(source map[string]int) map[string]int {
	out := make(map[string]int, len(source))
	for key, value := range source {
		out[key] = value
	}
	return out
}

func (s *trendSeries) noteDay(day string) {
	if day != "" && (s.firstDay == "" || day < s.firstDay) {
		s.firstDay = day
	}
}

// add 记一天的新建：全量一份 + creator（展示）+ owner（倒推未结）。
// 两份额度不同 —— 「我提的」用于柱状图，「我负责的」只用于把未结倒推准。
func (s *trendSeries) add(day, creator, owner string) {
	s.added[day]++
	if creator != "" {
		s.owner(creator).added[day]++
	}
	if owner != "" {
		s.owner(owner).owned[day]++
	}
	s.noteDay(day)
}

func (s *trendSeries) finish(day, owner string) {
	s.done[day]++
	if owner != "" {
		s.owner(owner).done[day]++
	}
	s.noteDay(day)
}

// absorb 把一个月缓存并进逐日计数。
func (s *trendSeries) absorb(m *store.TrendMonth) {
	for _, day := range m.Days {
		s.added[day.Day] += day.Added
		s.done[day.Day] += day.Done
		s.open[day.Day] = day.Open
		if day.Added != 0 || day.Done != 0 {
			s.noteDay(day.Day)
		}
	}
	for uuid, list := range m.PerOwner {
		days := s.owner(uuid)
		for _, day := range list {
			days.added[day.Day] += day.Added
			days.owned[day.Day] += day.Owned
			days.done[day.Day] += day.Done
		}
	}
}

// loadSources 读 [fromMonth, toMonth] 的历史文件，只记 wanted 里的日子
// （已缓存月的数据来自缓存，不能再从源文件记一遍）。
func (s *trendSeries) loadSources(repo, fromMonth, toMonth string, wanted map[string]bool) []string {
	history := store.NewHistoryStore(repo)
	var warnings []string
	for _, ym := range monthKeysBetween(fromMonth, toMonth) {
		path := filepath.Join(repo, core.ToRepoRel(core.HistoryDir), ym+".md")
		text, err := history.Read(path)
		if err != nil {
			warnings = append(warnings, err.Error())
			continue
		}
		if text == "" {
			continue // 该月无记录 ⇒ 跳过，不报错
		}
		rows, warns := core.ParseHistory(text)
		for _, w := range warns {
			warnings = append(warnings, Rel(repo, path)+"："+w)
		}
		for _, row := range rows {
			if day := trendLocalDay(row.Finished); wanted[day] {
				s.finish(day, core.Normalize(row.Owner))
			}
			if day := trendLocalDay(row.Created); wanted[day] {
				s.add(day, core.Normalize(row.Creator), core.Normalize(row.Owner))
			}
		}
	}
	return warnings
}

// month 把逐日计数裁成某个月的缓存内容。
func (s *trendSeries) month(ym, repo, today string) *store.TrendMonth {
	days := trendMonthDays(ym, today)
	if len(days) == 0 {
		return nil
	}
	m := &store.TrendMonth{
		Algo:      TrendAlgo,
		WeekStart: trendBucketStart("week", trendMonthFirstDay(ym)),
		Source:    trendSourcePrints(repo, ym),
		Days:      make([]store.TrendDay, 0, len(days)),
	}
	for _, day := range days {
		m.Days = append(m.Days, store.TrendDay{Day: day, Added: s.added[day], Done: s.done[day], Open: s.open[day]})
	}
	m.MonthEndOpen = s.open[days[len(days)-1]]
	m.PerOwnerEndOpen = s.openByOwner[days[len(days)-1]]
	perOwner := map[string][]store.TrendOwnerDay{}
	for uuid, ownerDays := range s.byOwner {
		var list []store.TrendOwnerDay
		for _, day := range days {
			added, owned, done := ownerDays.added[day], ownerDays.owned[day], ownerDays.done[day]
			if added == 0 && owned == 0 && done == 0 {
				continue
			}
			list = append(list, store.TrendOwnerDay{Day: day, Added: added, Owned: owned, Done: done})
		}
		if len(list) > 0 {
			perOwner[uuid] = list
		}
	}
	if len(perOwner) > 0 {
		m.PerOwner = perOwner
	}
	return m
}

// trendLoad 把待拼桶的数据准备好：当前在办快照 + 缓存月 + 缺月实时算。
//
// 未结有两条算路（2026-10-29 用户拍板）：
//   - **有左锚**（上个月末各人挂着几条，见 store.TrendAnchor）⇒ 从锚往右累计，
//     只读「那一段」的月份 ⇒ 查很久以前的一段也只要那几个月；
//   - **没有左锚**（这个仓库第一次查旧段）⇒ 从今天的在办快照往回推到窗口起点，
//     代价是读到今天；沿途每个月的月末未结顺手写成锚，下次就只需读那一段。
//
// 整月缓存只写**用户查的那几个月**（不再全跨度预热），路过的月份只留几十字节的锚。
func trendLoad(repo, firstMonth, lastMonth, today string) (*trendSeries, map[string]string, []string, error) {
	rows, _, index, err := activeRows(repo)
	if err != nil {
		return nil, nil, nil, err
	}
	roster, err := index.All()
	if err != nil {
		return nil, nil, nil, err
	}
	names := make(map[string]string, len(roster))
	for uuid, record := range roster {
		if name, ok := record["name"].(string); ok && name != "" {
			names[uuid] = name
		}
	}

	series := newTrendSeries()
	currentByOwner := map[string]int{}
	for _, task := range rows {
		if day := trendLocalDay(strOfAny(task["created"])); day != "" {
			series.add(day, core.Normalize(strOfAny(task["creator"])), ownerOf(task))
		}
		if owner := ownerOf(task); owner != "" {
			currentByOwner[owner]++
		}
	}

	dir, caching := trendCacheDir(repo)
	anchors := store.LoadTrendAnchors(dir, TrendAlgo)

	// 上个月末的锚决定走哪条路
	prevMonth := shiftMonth(firstMonth, -1)
	seed, hasSeed := anchors.Months[prevMonth]
	todayMonth := trendMonthKey(today)
	rangeLast := lastMonth // 正向：只需要窗口结束月
	if !hasSeed {
		rangeLast = todayMonth // 反向：必须读到今天
	}

	var warnings []string
	var missing []string
	for _, ym := range monthKeysBetween(firstMonth, rangeLast) {
		// 当月永远实时算：这个月还没过完，固化下来末尾就会缺（D12）
		if caching && ym != todayMonth {
			if m, ok := store.LoadTrendMonth(dir, ym, TrendAlgo); ok && store.TrendSourcesMatch(repo, m.Source) {
				series.absorb(m)
				// 顺手把缓存里的月末未结收进锚（老缓存也能补锚）
				if anchor, ok := anchorOfMonth(m); ok {
					anchors.Months[ym] = anchor
				}
				continue
			}
		}
		missing = append(missing, ym)
	}
	if len(missing) > 0 {
		wanted := map[string]bool{}
		for _, ym := range missing {
			for _, day := range trendMonthDays(ym, today) {
				wanted[day] = true
			}
		}
		// 本地月的 row 可能落在前一个 UTC 月文件里（+8 的 1 号凌晨被记在上月），所以往前多读一个月
		warnings = series.loadSources(repo, shiftMonth(missing[0], -1), rangeLast, wanted)
		if len(missing) > 3 && !hasSeed {
			warnings = append(warnings, trendColdStartNote(len(missing)))
		}
	}

	end := trendMonthLastDay(rangeLast)
	if end > today {
		end = today
	}
	if hasSeed {
		series.walkForward(seed, trendAddDay(trendMonthLastDay(prevMonth), 1), end)
	} else {
		// 多走一天到上月月末：顺手把上月的锚也留下（下次查这一段就有左锚）
		series.walkBackward(len(rows), currentByOwner, trendMonthLastDay(prevMonth), today)
	}

	if caching {
		// 整月缓存：只写用户查的那几个月（当月不写）
		window := map[string]bool{}
		for _, ym := range monthKeysBetween(firstMonth, lastMonth) {
			window[ym] = true
		}
		for _, ym := range missing {
			if !window[ym] || ym == todayMonth {
				continue
			}
			if m := series.month(ym, repo, today); m != nil {
				_ = store.SaveTrendMonth(dir, ym, m) // 写不进去就下次再算（Q7：静默降级）
			}
		}
		// 锚：凡是算过月末的月份都留一个（几十字节）
		for _, ym := range monthKeysBetween(prevMonth, rangeLast) {
			if ym == todayMonth {
				continue
			}
			if anchor, ok := series.monthAnchor(ym); ok {
				anchors.Months[ym] = anchor
			}
		}
		if err := store.SaveTrendAnchors(dir, anchors); err != nil {
			warnings = append(warnings, Rel(repo, dir)+"：趋势锚点写不进去，下次会重算")
		}
	}

	return series, names, warnings, nil
}

// anchorOfMonth 从月缓存里取月末未结（按人明细缺了就只取全局）。
func anchorOfMonth(m *store.TrendMonth) (store.TrendAnchor, bool) {
	if m.PerOwnerEndOpen != nil {
		return store.TrendAnchor{Open: m.MonthEndOpen, Owners: m.PerOwnerEndOpen}, true
	}
	if m.MonthEndOpen != 0 {
		return store.TrendAnchor{Open: m.MonthEndOpen}, true
	}
	return store.TrendAnchor{}, false
}

// monthAnchor 某月月末的未结快照（算过才有）。
func (s *trendSeries) monthAnchor(ym string) (store.TrendAnchor, bool) {
	end := trendMonthLastDay(ym)
	open, ok := s.open[end]
	if !ok {
		return store.TrendAnchor{}, false
	}
	return store.TrendAnchor{Open: open, Owners: s.openByOwner[end]}, true
}

func trendColdStartNote(months int) string {
	return fmt.Sprintf("这段历史没有锚，本次从今天往回推、读了 %d 个月的历史（之后同段会快很多）", months)
}

// trendFiller 把逐日计数摊到桶里。
type trendFiller struct {
	series *trendSeries
	roster map[string]string
}

func (f *trendFiller) fill(bucket *TrendBucket, filter []string, byOwner bool) {
	days := trendDayList(bucket.From, bucket.To)
	for _, day := range days {
		bucket.Added += f.series.added[day]
		bucket.Done += f.series.done[day]
	}
	bucket.Open = f.series.open[bucket.To]
	if filter == nil && !byOwner {
		return
	}
	if filter != nil {
		// --mine / --owner：整桶只算选中的人（按人没有剩余，Open 由 owner + 是否结案倒推）
		bucket.Added, bucket.Done, bucket.Open = 0, 0, 0
		cells := make(map[string]*TrendOwnerCell, len(filter))
		for _, uuid := range filter {
			cell := f.ownerCell(uuid, days, bucket.To)
			cells[uuid] = cell
			bucket.Added += cell.Added
			bucket.Done += cell.Done
			bucket.Open += cell.Open
		}
		if byOwner {
			bucket.Owners = cells
		}
		return
	}
	cells := map[string]*TrendOwnerCell{}
	for uuid := range f.series.byOwner {
		cell := f.ownerCell(uuid, days, bucket.To)
		if cell.Added != 0 || cell.Done != 0 || cell.Open != 0 {
			cells[uuid] = cell
		}
	}
	bucket.Owners = cells
}

// ownerCell 某人某桶的三数；未结直接取「那天结束时我名下还没结的」，
// 由 walkForward / walkBackward 统一算好（不再在桶里现场算尾巴）。
func (f *trendFiller) ownerCell(uuid string, days []string, end string) *TrendOwnerCell {
	ownerDays := f.series.owner(uuid)
	cell := &TrendOwnerCell{
		Name: f.roster[uuid],
		Open: f.series.openByOwner[end][uuid],
	}
	for _, day := range days {
		cell.Added += ownerDays.added[day]
		cell.Done += ownerDays.done[day]
	}
	return cell
}

// trendCacheDir 本机缓存目录；拿不到主目录就不缓存（不影响结果）。
func trendCacheDir(repo string) (string, bool) {
	home, err := env.HomeDir()
	if err != nil || home == "" {
		return "", false
	}
	abs, err := filepath.Abs(repo)
	if err != nil {
		abs = repo
	}
	_, offset := time.Now().Zone()
	return store.TrendCacheDir(home, filepath.ToSlash(abs), offset), true
}

// trendSourcePrints 该本地月自己的源文件指纹：本地月可能横跨两个 UTC 月文件
// （+8 的 1 月初住在 12 月文件、-5 的 1 月末住在 2 月文件），两个都要记。
func trendSourcePrints(repo, ym string) []store.TrendSource {
	var out []store.TrendSource
	for _, key := range trendMonthSources(ym) {
		rel := filepath.ToSlash(filepath.Join(core.LedgerDir, core.HistoryDir, key+".md"))
		print := store.TrendSource{Path: rel, Size: -1}
		if info, err := os.Stat(filepath.Join(repo, rel)); err == nil && !info.IsDir() {
			print.Size, print.MtimeNS = info.Size(), info.ModTime().UnixNano()
		}
		out = append(out, print)
	}
	return out
}

// trendMonthSources 一个本地月覆盖到的 UTC 月文件（1~2 个）。
func trendMonthSources(ym string) []string {
	first, err := time.ParseInLocation(trendDayLayout, trendMonthFirstDay(ym), time.Local)
	if err != nil {
		return []string{ym}
	}
	next := first.AddDate(0, 1, 0)
	lo := trendMonthKey(first.UTC().Format(trendDayLayout))
	hi := trendMonthKey(next.Add(-time.Second).UTC().Format(trendDayLayout))
	var out []string
	for key := lo; key <= hi; key = shiftMonth(key, 1) {
		out = append(out, key)
	}
	return out
}

// trendMonthDays 某个月的本地日期（当月裁到今天为止）。
func trendMonthDays(ym, today string) []string {
	first := trendMonthFirstDay(ym)
	if first > today {
		return nil
	}
	return trendDayList(first, trendAddDay(trendAddMonth(first, 1), -1))
}

func trendMonthFirstDay(ym string) string { return ym[0:4] + "-" + ym[4:6] + "-01" }

func trendMonthKey(day string) string { return strings.ReplaceAll(day[0:7], "-", "") }

// trendMonthLastDay 某个本地月的最后一天。
func trendMonthLastDay(ym string) string {
	return trendAddDay(trendAddMonth(trendMonthFirstDay(ym), 1), -1)
}

// trendDaySpan [lo, hi] 一共多少天（含两端）：按纯日期相减，不受夏令时影响。
func trendDaySpan(lo, hi string) int {
	from, okFrom := trendParseDay(lo)
	to, okTo := trendParseDay(hi)
	if !okFrom || !okTo {
		return 0
	}
	return int(to.Sub(from).Hours()/24) + 1
}

// trendLocalDay 存盘的 UTC 串 → 本机时区日期；不合法返回空串。
func trendLocalDay(stamp string) string {
	key := core.TimeKey(stamp)
	if key == "" {
		return ""
	}
	dt, err := time.ParseInLocation("2006-01-02 15:04:05", key, time.UTC)
	if err != nil {
		return ""
	}
	return dt.Local().Format(trendDayLayout)
}

func trendParseDay(day string) (time.Time, bool) {
	stamp, err := time.Parse(trendDayLayout, day)
	return stamp, err == nil
}

func trendAddDay(day string, n int) string {
	stamp, ok := trendParseDay(day)
	if !ok {
		return day
	}
	return stamp.AddDate(0, 0, n).Format(trendDayLayout)
}

func trendAddMonth(day string, n int) string {
	stamp, ok := trendParseDay(day)
	if !ok {
		return day
	}
	return stamp.AddDate(0, n, 0).Format(trendDayLayout)
}

// trendDayList [from, to] 的每一天；from 晚于 to 给空。
func trendDayList(from, to string) []string {
	if from > to {
		return nil
	}
	var out []string
	for day := from; day <= to; day = trendAddDay(day, 1) {
		out = append(out, day)
	}
	return out
}
