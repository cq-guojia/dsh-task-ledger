package actions

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// 只读：查已结案（按结案时间过滤，倒序取最近）。
// 时间区间一律落在**结案时间** finished 上 —— 历史文件本来就按结案月归档。

const (
	// MaxHistoryFiles 一次最多读多少个历史文件。
	MaxHistoryFiles = 13
	// DefaultHistoryMonths 没给任何时间参数时，默认只看最近几个自然月。
	DefaultHistoryMonths = 3
)

func recentMonthKeys(count int) []string {
	stamp := core.Now()
	year, month := atoiSafe(stamp[0:4]), atoiSafe(stamp[5:7])
	var keys []string
	for i := 0; i < count; i++ {
		keys = append(keys, fmt.Sprintf("%04d%02d", year, month))
		month--
		if month == 0 {
			year, month = year-1, 12
		}
	}
	return keys
}

func atoiSafe(s string) int {
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0
		}
		n = n*10 + int(r-'0')
	}
	return n
}

func shiftMonth(ym string, delta int) string {
	idx := atoiSafe(ym[0:4])*12 + (atoiSafe(ym[4:6]) - 1) + delta
	return fmt.Sprintf("%04d%02d", idx/12, idx%12+1)
}

func monthKeysBetween(lo, hi string) []string {
	if lo > hi {
		lo, hi = hi, lo
	}
	var keys []string
	for cur := lo; cur <= hi; cur = shiftMonth(cur, 1) {
		keys = append(keys, cur)
	}
	return keys
}

func monthEnd(ym string) string {
	year, month := atoiSafe(ym[0:4]), atoiSafe(ym[4:6])
	next := time.Date(year+(month/12), time.Month(month%12+1), 1, 0, 0, 0, 0, time.UTC)
	return next.Add(-time.Second).Format("2006-01-02 15:04:05")
}

func targetMonthKeys(q HistoryQuery) ([]string, error) {
	if q.Months != nil && (q.Since != nil || q.Until != nil) {
		return nil, core.Failf("--months 与 --since/--until 不能同时用（时间口径二选一）。")
	}
	var keys []string
	switch {
	case q.Months != nil:
		if *q.Months < 1 {
			return nil, core.Failf("--months 至少为 1。")
		}
		keys = recentMonthKeys(*q.Months)
	case q.Since != nil || q.Until != nil:
		var lo string
		if q.Since != nil {
			lo = core.MonthOf(*q.Since, "")
		} else {
			lo = shiftMonth(core.MonthOf(*q.Until, ""), -(DefaultHistoryMonths - 1))
		}
		hi := core.MonthOf(core.Now(), "")
		if q.Until != nil {
			hi = core.MonthOf(*q.Until, "")
		}
		if lo == "" || hi == "" {
			return nil, core.Failf("--since/--until 时间格式不对，算不出月份。")
		}
		keys = monthKeysBetween(lo, hi)
	default:
		keys = recentMonthKeys(DefaultHistoryMonths)
	}
	seen := map[string]bool{}
	var files []string
	for _, k := range keys {
		if !seen[k] {
			seen[k] = true
			files = append(files, k)
		}
	}
	sort.Strings(files)
	if len(files) > MaxHistoryFiles {
		return nil, core.Failf("历史查询一次最多读 %d 个历史文件（按月分文件，不区分连续/分散），本次要读 %d 个 ⇒ 缩小 --since/--until 或 --months。", MaxHistoryFiles, len(files))
	}
	return files, nil
}

// QueryHistory 查已结案。--owner / --mine 一律按 uuid 精确相等；名字只能走 --owner-name。
func QueryHistory(repo string, me core.Identity, q HistoryQuery) (*HistoryResult, error) {
	if q.Owner != nil {
		if q.Mine {
			return nil, core.Failf("--owner 不能和 --mine 一起用：一次只按一种范围筛。")
		}
		owner, err := RequireUUID(*q.Owner, "--owner")
		if err != nil {
			return nil, err
		}
		q.Owner = &owner
	}
	keys, err := targetMonthKeys(q)
	if err != nil {
		return nil, err
	}
	effSince, effUntil, err := historyWindow(keys, q)
	if err != nil {
		return nil, err
	}
	history := store.NewHistoryStore(repo)
	var records []map[string]any
	var warnings []string
	// 历史表按结案顺序追加 ⇒ 月份从新到旧、月内从尾到首遍历，天然就是结案时间倒序，不再排序
	for i := len(keys) - 1; i >= 0; i-- {
		ym := keys[i]
		path := filepath.Join(repo, core.ToRepoRel(core.HistoryDir), ym+".md")
		if fi, err := os.Stat(path); err != nil || fi.IsDir() {
			continue // 该月无记录 ⇒ 跳过，不报错
		}
		text, err := history.Read(path)
		if err != nil {
			return nil, err
		}
		rows, warns := core.ParseHistory(text)
		for _, w := range warns {
			warnings = append(warnings, Rel(repo, path)+"："+w)
		}
		for j := len(rows) - 1; j >= 0; j-- {
			row := rows[j]
			if !rowMatches(row, q, me, effSince, effUntil) {
				continue
			}
			item := row.ToMap()
			item["src"] = Rel(repo, path)
			if key := core.TimeKey(row.Created); key != "" {
				item["created"] = key
			}
			if key := core.TimeKey(row.Finished); key != "" {
				item["finished"] = key
			}
			item["mine"] = core.IsMe(me, row.Owner)
			records = append(records, item)
		}
	}

	index := store.NewOwnersIndex(repo)
	roster, err := index.All()
	if err != nil {
		return nil, err
	}

	// 没名字的老行按名册兜底补一次（只补展示值，不回写文件）
	for _, row := range records {
		for _, pair := range [][2]string{{"owner", "owner_name"}, {"creator", "creator_name"}} {
			if strOfAny(row[pair[1]]) != "" {
				continue
			}
			key := core.Normalize(strOfAny(row[pair[0]]))
			if record, ok := roster[key]; ok {
				if name, ok := record["name"].(string); ok && name != "" {
					row[pair[1]] = name
				}
			}
		}
	}
	capped := false
	if q.Limit != nil {
		limit := *q.Limit
		if limit < 1 {
			return nil, core.Failf("--limit 必须 ≥ 1（收到 %d）。", limit)
		}
		capped = len(records) > limit
		if capped {
			records = records[:limit]
		}
	}

	filters := map[string]any{
		"owner":      ptrValue(q.Owner),
		"owner_name": ptrValue(q.OwnerName),
		"mine":       q.Mine,
		"category":   ptrValue(q.Category),
		"tag":        ptrValue(q.Tag),
		"since":      ptrValue(q.Since),
		"until":      ptrValue(q.Until),
		"limit":      intValue(q.Limit),
		"months":     intValue(q.Months),
	}
	return &HistoryResult{
		Count:    len(records),
		Filters:  filters,
		Records:  records,
		Warnings: warnings,
		Capped:   capped,
	}, nil
}

// historyWindow 生效的结案时间窗口：有 --since / --until 就用，否则按本次要读的月份文件两端兜。
func historyWindow(keys []string, q HistoryQuery) (string, string, error) {
	loKey, hiKey := keys[0], keys[len(keys)-1]
	for _, k := range keys {
		if k < loKey {
			loKey = k
		}
		if k > hiKey {
			hiKey = k
		}
	}
	effSince := fmt.Sprintf("%s-%s-01 00:00:00", loKey[0:4], loKey[4:6])
	if q.Since != nil {
		effSince = *q.Since
	}
	effUntil := monthEnd(hiKey)
	if q.Until != nil {
		effUntil = *q.Until
	}
	if effSince > effUntil {
		return "", "", core.Failf("时间区间反了：--since（%s）晚于 --until（%s）。\n  处理：把两端换过来；只给一端就只给一端。", effSince, effUntil)
	}
	return effSince, effUntil, nil
}

// rowMatches 一条历史行是否命中查询条件。`count` 与列表行数必须是同一套判据算出来的：
// 各写一份迟早对不上数。
func rowMatches(row core.Row, q HistoryQuery, me core.Identity, effSince, effUntil string) bool {
	owner := core.Normalize(row.Owner)
	if q.Mine {
		if owner != core.Normalize(me.UUID) {
			return false
		}
	} else if q.Owner != nil && owner != core.Normalize(*q.Owner) {
		return false
	}
	if q.OwnerName != nil {
		needle := strings.ToLower(strings.TrimSpace(*q.OwnerName))
		if !strings.Contains(strings.ToLower(row.OwnerName), needle) &&
			!strings.Contains(owner, needle) {
			return false
		}
	}
	if q.Category != nil && row.Category != *q.Category {
		return false
	}
	if q.Tag != nil {
		found := false
		for _, t := range row.Tags {
			if t == *q.Tag {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	finished := core.TimeKey(row.Finished)
	return finished >= effSince && finished <= effUntil
}

func ptrValue(p *string) any {
	if p == nil {
		return nil
	}
	return *p
}

func intValue(p *int) any {
	if p == nil {
		return nil
	}
	return *p
}
