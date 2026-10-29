package actions

import (
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
const TrendAlgo = 1

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
	firstMonth, lastMonth := trendMonthKey(lo), trendMonthKey(today)

	series, currentByOwner, roster, warnings, err := trendLoad(repo, firstMonth, lastMonth, today)
	if err != nil {
		return nil, err
	}
	filler := trendFiller{series: series, ownerOpen: currentByOwner, roster: roster, today: today}
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

// trendSeries 待拼桶的逐日计数：日 → 数，外加按人的逐日计数。
type trendSeries struct {
	added    map[string]int
	done     map[string]int
	open     map[string]int // 该日结束时仍未结（缓存月直接用缓存值，缺月实时倒推）
	byOwner  map[string]*trendOwnerDays
	firstDay string // 第一条数据出现在哪天（coverage 用）
}

type trendOwnerDays struct {
	added map[string]int
	done  map[string]int
}

var trendNoOwner = &trendOwnerDays{added: map[string]int{}, done: map[string]int{}}

func newTrendSeries() *trendSeries {
	return &trendSeries{
		added:   map[string]int{},
		done:    map[string]int{},
		open:    map[string]int{},
		byOwner: map[string]*trendOwnerDays{},
	}
}

func (s *trendSeries) owner(uuid string) *trendOwnerDays {
	if uuid == "" {
		return trendNoOwner // 待认领 / 老数据缺 creator：只进全量，不算任何人
	}
	if days, ok := s.byOwner[uuid]; ok {
		return days
	}
	days := &trendOwnerDays{added: map[string]int{}, done: map[string]int{}}
	s.byOwner[uuid] = days
	return days
}

func (s *trendSeries) noteDay(day string) {
	if day != "" && (s.firstDay == "" || day < s.firstDay) {
		s.firstDay = day
	}
}

func (s *trendSeries) add(day, creator string) {
	s.added[day]++
	s.owner(creator).added[day]++
	s.noteDay(day)
}

func (s *trendSeries) finish(day, owner string) {
	s.done[day]++
	s.owner(owner).done[day]++
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
				s.add(day, core.Normalize(row.Creator))
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
	perOwner := map[string][]store.TrendOwnerDay{}
	for uuid, ownerDays := range s.byOwner {
		var list []store.TrendOwnerDay
		for _, day := range days {
			added, done := ownerDays.added[day], ownerDays.done[day]
			if added == 0 && done == 0 {
				continue
			}
			list = append(list, store.TrendOwnerDay{Day: day, Added: added, Done: done})
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

// trendLoad 把待拼桶的全部数据准备好：当前在办快照 + 缓存月 + 缺月实时算（顺手写回缓存）。
func trendLoad(repo, firstMonth, lastMonth, today string) (*trendSeries, map[string]int, map[string]string, []string, error) {
	rows, _, index, err := activeRows(repo)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	roster, err := index.All()
	if err != nil {
		return nil, nil, nil, nil, err
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
			series.add(day, core.Normalize(strOfAny(task["creator"])))
		}
		if owner := ownerOf(task); owner != "" {
			currentByOwner[owner]++
		}
	}

	dir, caching := trendCacheDir(repo)
	var missing []string
	for _, ym := range monthKeysBetween(firstMonth, lastMonth) {
		// 当月永远实时算：这个月还没过完，固化下来末尾就会缺（D12）
		if caching && ym != lastMonth {
			if m, ok := store.LoadTrendMonth(dir, ym, TrendAlgo); ok && store.TrendSourcesMatch(repo, m.Source) {
				series.absorb(m)
				continue
			}
		}
		missing = append(missing, ym)
	}
	if len(missing) == 0 {
		return series, currentByOwner, names, nil, nil
	}

	wanted := map[string]bool{}
	for _, ym := range missing {
		for _, day := range trendMonthDays(ym, today) {
			wanted[day] = true
		}
	}
	// 本地月的 row 可能落在前一个 UTC 月文件里（+8 的 1 号凌晨被记在上月），所以往前多读一个月
	warnings := series.loadSources(repo, shiftMonth(missing[0], -1), lastMonth, wanted)

	// 逐日倒推未结：从今天往回扫，tail 只累计「这一天之后」的新增 / 完成
	days := trendDayList(trendMonthFirstDay(missing[0]), today)
	tailDone, tailAdded := 0, 0
	for i := len(days) - 1; i >= 0; i-- {
		day := days[i]
		if wanted[day] {
			series.open[day] = len(rows) + tailDone - tailAdded
		}
		tailDone += series.done[day]
		tailAdded += series.added[day]
	}
	if caching {
		for _, ym := range missing {
			if ym == lastMonth {
				continue // 当月永远实时算（D12）：固化下来末尾几小时会缺
			}
			if m := series.month(ym, repo, today); m != nil {
				_ = store.SaveTrendMonth(dir, ym, m) // 写不进去就下次再算（Q7：静默降级）
			}
		}
	}
	return series, currentByOwner, names, warnings, nil
}

// trendFiller 把逐日计数摊到桶里。
type trendFiller struct {
	series    *trendSeries
	ownerOpen map[string]int // 每人当前在办
	roster    map[string]string
	today     string
}

func (f *trendFiller) fill(bucket *TrendBucket, filter []string, byOwner bool) {
	days := trendDayList(bucket.From, bucket.To)
	for _, day := range days {
		bucket.Added += f.series.added[day]
		bucket.Done += f.series.done[day]
	}
	if open, ok := f.series.open[bucket.To]; ok {
		bucket.Open = open
	}
	if filter == nil && !byOwner {
		return
	}
	tail := f.series.ownerTail(bucket.To, f.today)
	if filter != nil {
		// --mine / --owner：整桶只算选中的人（按人没有剩余，Open 由 owner + 是否结案倒推）
		bucket.Added, bucket.Done, bucket.Open = 0, 0, 0
		cells := make(map[string]*TrendOwnerCell, len(filter))
		for _, uuid := range filter {
			cell := f.ownerCell(uuid, days, tail)
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
		cell := f.ownerCell(uuid, days, tail)
		if cell.Added != 0 || cell.Done != 0 || cell.Open != 0 {
			cells[uuid] = cell
		}
	}
	bucket.Owners = cells
}

func (f *trendFiller) ownerCell(uuid string, days []string, tail map[string]int) *TrendOwnerCell {
	ownerDays := f.series.owner(uuid)
	cell := &TrendOwnerCell{Name: f.roster[uuid], Open: f.ownerOpen[uuid] + tail[uuid]}
	for _, day := range days {
		cell.Added += ownerDays.added[day]
		cell.Done += ownerDays.done[day]
	}
	return cell
}

// ownerTail 某天之后到今天，每个人完成了多少条（按人倒推未结用）。
func (s *trendSeries) ownerTail(after, today string) map[string]int {
	out := map[string]int{}
	for day := trendAddDay(after, 1); day <= today; day = trendAddDay(day, 1) {
		for uuid, ownerDays := range s.byOwner {
			if n := ownerDays.done[day]; n != 0 {
				out[uuid] += n
			}
		}
	}
	return out
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
