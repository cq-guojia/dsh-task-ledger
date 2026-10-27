package actions

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/cq-guojia/dsh-task-ledger/skill/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/internal/store"
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
	history := store.NewHistoryStore(repo)
	var records []map[string]any
	var warnings []string
	for _, ym := range keys {
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
		for _, row := range rows {
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
	if q.Mine {
		wanted := core.Normalize(me.UUID)
		records = filterRecords(records, func(r map[string]any) bool {
			return core.Normalize(strOfAny(r["owner"])) == wanted
		})
	} else if q.Owner != nil {
		key := core.Normalize(*q.Owner)
		records = filterRecords(records, func(r map[string]any) bool {
			return core.Normalize(strOfAny(r["owner"])) == key
		})
	}
	if q.OwnerName != nil {
		needle := strings.ToLower(strings.TrimSpace(*q.OwnerName))
		records = filterRecords(records, func(r map[string]any) bool {
			if strings.Contains(strings.ToLower(strOfAny(r["owner_name"])), needle) {
				return true
			}
			return strings.Contains(core.Normalize(strOfAny(r["owner"])), needle)
		})
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
	if q.Category != nil {
		records = filterRecords(records, func(r map[string]any) bool {
			return strOfAny(r["category"]) == *q.Category
		})
	}
	if q.Tag != nil {
		records = filterRecords(records, func(r map[string]any) bool {
			for _, t := range store.StrSliceOf(r["tags"]) {
				if t == *q.Tag {
					return true
				}
			}
			return false
		})
	}

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
		return nil, core.Failf("时间区间反了：--since（%s）晚于 --until（%s）。\n  处理：把两端换过来；只给一端就只给一端。", effSince, effUntil)
	}
	records = filterRecords(records, func(r map[string]any) bool {
		finished := strOfAny(r["finished"])
		return finished >= effSince && finished <= effUntil
	})

	sort.SliceStable(records, func(i, j int) bool {
		return strOfAny(records[i]["finished"]) > strOfAny(records[j]["finished"])
	})

	if q.CountOnly && q.Limit != nil {
		return nil, core.Failf("--count-only 与 --limit 不能同时用：计数不截断，列表才截断。")
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
	} else if q.CountOnly && len(records) > CountCap {
		capped = true
		records = records[:CountCap]
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

func filterRecords(rows []map[string]any, keep func(map[string]any) bool) []map[string]any {
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		if keep(row) {
			out = append(out, row)
		}
	}
	return out
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
