package core

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// 所有存盘时间都是 UTC（`YYYY-MM-DD HH:MM:SS`，不带偏移量）；
// 所有对外输出的时间字段都过 FmtLocal 转本机时区。

const stampLayout = "2006-01-02 15:04:05"

var timeRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$`)

var timeInRe = regexp.MustCompile(`^(\d{4})-(\d{1,2})-(\d{1,2})(?: +(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$`)

// Fail 是业务错误：抛出即中止，由外壳转成「错误：…」并给退出码 1。
type Fail struct{ Msg string }

func (f *Fail) Error() string { return f.Msg }

// Failf 造一个业务错误。
func Failf(format string, a ...any) error { return &Fail{Msg: fmt.Sprintf(format, a...)} }

// Now 当前时刻（UTC，到秒）。
func Now() string { return time.Now().UTC().Format(stampLayout) }

// NormalizeTime 把「正确但不完整」的写法归一化到 `YYYY-MM-DD HH:MM:SS`。
// dateOnlyRef 非空时，只给了日期就用它顶替时刻（`--until` 想含整天传 23:59:59）。
func NormalizeTime(value, field, tid, dateOnlyRef string) (string, error) {
	where := ""
	if tid != "" {
		where = tid + ": "
	}
	s := strings.Join(strings.Fields(strings.NewReplacer("/", "-", "T", " ", "t", " ").Replace(value)), " ")
	m := timeInRe.FindStringSubmatch(s)
	if m == nil {
		return "", Failf("%s%s 时间格式不对：%q（可用 YYYY-MM-DD、YYYY-MM-DD HH:MM、YYYY-MM-DD HH:MM:SS）", where, field, value)
	}
	atoi := func(s string) int { n, _ := strconv.Atoi(s); return n }
	y, mo, d := atoi(m[1]), atoi(m[2]), atoi(m[3])
	if m[4] == "" && dateOnlyRef != "" {
		return fmt.Sprintf("%04d-%02d-%02d %s", y, mo, d, dateOnlyRef), nil
	}
	out := fmt.Sprintf("%04d-%02d-%02d %02d:%02d:%02d", y, mo, d, atoi(m[4]), atoi(m[5]), atoi(m[6]))
	if _, err := time.Parse(stampLayout, out); err != nil {
		return "", Failf("%s%s 不是真实时间：%q（%v）", where, field, value, err)
	}
	return out, nil
}

// ToUTC：用户按本地墙钟给的时间 → 存盘用的 UTC 串。
func ToUTC(value, field, tid, dateOnlyRef string) (string, error) {
	wall, err := NormalizeTime(value, field, tid, dateOnlyRef)
	if err != nil {
		return "", err
	}
	naive, _ := time.ParseInLocation(stampLayout, wall, time.Local)
	return naive.UTC().Format(stampLayout), nil
}

// TimeKey：已存时间（可能只到分）→ 秒精度串，用于比较排序；不合法返回空串。
func TimeKey(value string) string {
	if !timeRe.MatchString(value) {
		return ""
	}
	if len(value) == 19 {
		return value
	}
	return value + ":00"
}

// DaysSince 存盘时间 → 距 now 多少整天（向下取整；未来记 0）；任一不可解析返回 nil。
//
// 只看「过去了几个自然日」，不掺时区：两侧都是存盘的 UTC 串，差值是绝对时长。
// 调用方（停滞 / 逾期 / 积压判定）要的是「满没满 N 天」，不是「跨了几个日历日」。
func DaysSince(stamp, now string) *int {
	from, to := TimeKey(stamp), TimeKey(now)
	if from == "" || to == "" {
		return nil
	}
	a, err := time.ParseInLocation(stampLayout, from, time.UTC)
	if err != nil {
		return nil
	}
	b, err := time.ParseInLocation(stampLayout, to, time.UTC)
	if err != nil {
		return nil
	}
	days := int(b.Sub(a) / (24 * time.Hour))
	if days < 0 {
		days = 0
	}
	return &days
}

// FmtLocal：存盘的 UTC → 查看者本地时间，只用于人看的输出。
func FmtLocal(stamp string) string {
	key := TimeKey(stamp)
	if key == "" {
		return stamp
	}
	dt, err := time.ParseInLocation(stampLayout, key, time.UTC)
	if err != nil {
		return stamp
	}
	return dt.Local().Format(stampLayout)
}
