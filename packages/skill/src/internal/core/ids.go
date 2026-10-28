package core

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"regexp"
	"strings"
)

// 任务号：生成、形态校验。只做字符串换算。

var (
	idRe   = regexp.MustCompile(`^[a-z0-9\p{Han}][a-z0-9\p{Han}-]*$`)
	slugRe = regexp.MustCompile(`[^a-z0-9\p{Han}]+`)
)

// Slugify 任务号用：保留 ASCII 字母数字与汉字，其余转连字符，截到 40 字。
func Slugify(title string) string {
	s := slugRe.ReplaceAllString(strings.ToLower(strings.TrimSpace(title)), "-")
	r := []rune(strings.Trim(s, "-"))
	if len(r) > 40 {
		r = r[:40]
	}
	return strings.Trim(string(r), "-")
}

// IDStamp `created`（YYYY-MM-DD HH:MM:SS）→ 任务号前缀 `YYYYMMDD-HHMM`。
func IDStamp(created string) string {
	if len(created) < 16 {
		return ""
	}
	return created[0:4] + created[5:7] + created[8:10] + "-" + created[11:13] + created[14:16]
}

func tokenHex(n int) string {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return strings.Repeat("0", n*2)
	}
	return hex.EncodeToString(buf)
}

// MakeID 按标题生成一个不撞号的任务号（tasks 是在办任务号集合）。
func MakeID(title string, tasks map[string]struct{}, created string) (string, error) {
	slug := Slugify(title)
	if slug == "" {
		return "", Failf("标题里没有可用字符（字母、数字或汉字），无法自动生成任务号。用 --id 指定一个，例如 --id \"task-%s\"。", tokenHex(2))
	}
	stamp := created
	if stamp == "" {
		stamp = Now()
	}
	stamp = IDStamp(stamp)
	for i := 0; i < 20; i++ {
		tid := fmt.Sprintf("%s-%s-%s", stamp, tokenHex(2), slug)
		if _, clash := tasks[tid]; !clash {
			return tid, nil
		}
	}
	return "", Failf("任务号连续冲突 20 次，请检查台账是否异常。")
}

// RequireTaskID 任务号形态校验（全仓唯一入口）。
func RequireTaskID(tid string) (string, error) {
	value := strings.TrimSpace(tid)
	if value == "" {
		return "", Failf("任务号不能为空。")
	}
	if !idRe.MatchString(strings.ToLower(value)) {
		return "", Failf("任务号 %q 不合法：只能用小写字母、数字、汉字和连字符，且不能以连字符开头或结尾。", tid)
	}
	return value, nil
}
