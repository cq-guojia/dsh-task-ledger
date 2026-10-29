package store

import (
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
)

// 已结案 history/<年月>.md：列全部文件、读一篇、算「追加一行后的新全文」、判重、落盘。
// 「算」和「落」分开 —— 结案要控顺序（历史 → 封卷 → 删分片），落盘时机由业务层定。

// 判重三态。
const (
	Hit         = "hit"
	Miss        = "miss"
	Undecidable = "undecidable"
)

// HistoryStore 一个工作区的已结案历史。
type HistoryStore struct{ Repo string }

// NewHistoryStore 造一个历史表读写口。
func NewHistoryStore(repo string) *HistoryStore { return &HistoryStore{Repo: repo} }

func (h *HistoryStore) base() string { return filepath.Join(h.Repo, core.ToRepoRel(core.HistoryDir)) }

// Sources 按月的 history/*.md（按文件名排序）。
func (h *HistoryStore) Sources() []string {
	entries, err := os.ReadDir(h.base())
	if err != nil {
		return nil
	}
	var out []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".md") {
			out = append(out, filepath.Join(h.base(), e.Name()))
		}
	}
	sort.Strings(out)
	return out
}

// MonthKey 按月文件的 YYYYMM；文件名不是六位数字返回空串。
func (h *HistoryStore) MonthKey(path string) string {
	stem := strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	if len(stem) == 6 && isAllDigits(stem) {
		return stem
	}
	return ""
}

func isAllDigits(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return s != ""
}

// PathFor 结案时间 → 当月历史文件绝对路径。
func (h *HistoryStore) PathFor(finished string) string {
	return filepath.Join(h.base(), core.MonthOf(finished, "")+".md")
}

// Read 读一篇历史；不存在返回空串。
func (h *HistoryStore) Read(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", core.Failf("读 %s 失败：%v", path, err)
	}
	return strings.TrimPrefix(string(data), "\ufeff"), nil
}

// HasLog 这个月的历史里已经有这条了吗？三态：hit / miss / undecidable。
// 有末列就比文件名；末列为空的行改按「创建时间 + 标题」比，给不出就明说 undecidable。
func (h *HistoryStore) HasLog(path string, logName, created, title *string) (string, error) {
	text, err := h.Read(path)
	if err != nil {
		return "", err
	}
	records, _ := core.ParseHistory(text)
	undecidable := false
	for _, row := range records {
		worklog := strings.TrimSpace(row.Worklog)
		if logName != nil && worklog != "" {
			if filepath.Base(worklog) == filepath.Base(*logName) {
				return Hit, nil
			}
			continue
		}
		if logName == nil && worklog != "" {
			undecidable = true
			continue
		}
		if worklog == "" {
			if created != nil && title != nil {
				if row.Created == *created && row.Title == *title {
					return Hit, nil
				}
			} else {
				undecidable = true
			}
		}
	}
	if undecidable {
		return Undecidable, nil
	}
	return Miss, nil
}

// AppendRow 算出「追加这一行后的新全文」，不落盘。返回 text / duplicate。
func (h *HistoryStore) AppendRow(path string, row map[string]any) (map[string]any, error) {
	original, err := h.Read(path)
	if err != nil {
		return nil, err
	}
	var logName *string
	if value := strOf(row["worklog"]); value != "" {
		base := filepath.Base(value)
		logName = &base
	}
	state, err := h.HasLog(path, logName, strPtr(row["created"]), strPtr(row["title"]))
	if err != nil {
		return nil, err
	}
	text := original
	if strings.TrimSpace(text) == "" {
		text = freshTable()
	}
	result := strOf(row["result"])
	if result == "" {
		result = core.ResultDone
	}
	line := core.HistoryLine(
		strOf(row["finished"]),
		strOf(row["created"]),
		strOf(row["title"]),
		strOf(row["owner"]),
		strOf(row["summary"]),
		result,
		strOf(row["worklog"]),
		strOf(row["category"]),
		StrSliceOf(row["tags"]),
		strOf(row["creator"]),
		strOf(row["owner_name"]),
		strOf(row["creator_name"]),
	)
	return map[string]any{"text": appendHistoryLine(text, line), "duplicate": state == Hit}, nil
}

// Write 历史表唯一的写回口。
func (h *HistoryStore) Write(path, text string) error {
	if err := EnsureDir(filepath.Dir(path)); err != nil {
		return err
	}
	return WriteTextAtomic(path, text, true)
}

func freshTable() string {
	return core.HistoryTitle + "\n\n" + core.HistoryHeader + "\n" + core.HistorySep + "\n"
}

func appendHistoryLine(text, line string) string {
	body := strings.TrimRight(text, "\n")
	if body != "" {
		lines := strings.Split(body, "\n")
		if !strings.HasPrefix(strings.TrimSpace(lines[len(lines)-1]), "|") {
			return body + "\n\n" + line
		}
	}
	return body + "\n" + line
}

func strOf(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func strPtr(v any) *string {
	if s, ok := v.(string); ok {
		return &s
	}
	return nil
}

// StrSliceOf 把 JSON 里的数组取成 []string。
func StrSliceOf(v any) []string {
	switch value := v.(type) {
	case []string:
		return value
	case []any:
		out := make([]string, 0, len(value))
		for _, item := range value {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	}
	return nil
}
