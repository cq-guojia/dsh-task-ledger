// Package core 只做字符串与时间的换算：不读文件、不写文件、不打印。
package core

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// 台账内的固定名字。磁盘与 JSON 里存的路径一律相对 ledger/。
const (
	LedgerDir  = "ledger"
	PoolRel    = "pool.json"
	OwnersRel  = "owners.json"
	OwnersDir  = "owners"
	HistoryDir = "history"
	WorklogDir = "worklog"
	ShaLen     = 12
)

// ToRepoRel：相对 ledger/ 的路径 → 相对 repo 的路径。
func ToRepoRel(ledgerRel string) string {
	return filepath.Join(LedgerDir, filepath.FromSlash(ledgerRel))
}

// ToLedgerRel：相对 repo 的路径 → 相对 ledger/ 的路径（已在 ledger/ 内的原样返回）。
func ToLedgerRel(repoRel string) string {
	parts := strings.Split(filepath.ToSlash(repoRel), "/")
	if len(parts) > 0 && parts[0] == LedgerDir {
		return strings.Join(parts[1:], "/")
	}
	return filepath.ToSlash(repoRel)
}

// ToHistoryRel：ledger/ 内的路径 → 从 ledger/history/<ym>.md 出发的链接串（"../" 只在此处拼）。
func ToHistoryRel(ledgerRel string) string {
	return "../" + filepath.ToSlash(ledgerRel)
}

// ShardRel：某人分片相对 ledger/ 的路径：sha256(归一化身份)[:12] + .json。
func ShardRel(identity string) string {
	sum := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(identity))))
	return OwnersDir + "/" + hex.EncodeToString(sum[:])[:ShaLen] + ".json"
}

var nonDigit = regexp.MustCompile(`[^0-9]`)

func monthOfStamp(stamp string) string {
	head := stamp
	if len(head) > 7 {
		head = head[:7]
	}
	m := nonDigit.ReplaceAllString(head, "")
	if len(m) > 6 {
		m = m[:6]
	}
	return m
}

// MonthOf：存盘时间 → YYYYMM；取不到时用 fallback，再没有就返回空串。
func MonthOf(stamp, fallbackNow string) string {
	if m := monthOfStamp(stamp); len(m) == 6 {
		return m
	}
	if fallbackNow != "" {
		return monthOfStamp(fallbackNow)
	}
	return ""
}

// WorklogDirFor：过程文档的按月目录（相对 ledger/）。
func WorklogDirFor(created string) string {
	return WorklogDir + "/" + MonthOf(created, "")
}

func isDigits(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return s != ""
}

// WorklogName：过程文档文件名：任务号剥掉前缀年月日，随机码保留。
func WorklogName(tid string) string {
	r := []rune(tid)
	if len(r) > 9 && isDigits(string(r[:8])) && r[8] == '-' {
		return string(r[6:]) + ".md"
	}
	return tid + ".md"
}

// WorklogRel：过程文档相对 ledger/ 的路径。
func WorklogRel(tid, created string) string {
	return WorklogDirFor(created) + "/" + WorklogName(tid)
}

// HistoryPathFor：结案时间 → 历史文件相对 ledger/ 的路径。
func HistoryPathFor(finished string) string {
	return HistoryDir + "/" + MonthOf(finished, "") + ".md"
}

// SkillDir：skill 包的根目录（模板与资产的唯一定位基准，按可执行文件位置算，不依赖 cwd）。
// 可执行文件在 <skill>/scripts/bin/ 下 ⇒ 上两级。
func SkillDir() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	return filepath.Clean(filepath.Join(filepath.Dir(exe), "..", ".."))
}

// WorklogTemplate：六节模板的绝对路径。
func WorklogTemplate() string {
	dir := SkillDir()
	if dir == "" {
		return ""
	}
	return filepath.Join(dir, "assets", "worklog.md")
}
