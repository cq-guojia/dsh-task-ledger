package core

import (
	"fmt"
	"regexp"
	"strings"
)

// 历史表格的文本操作：拼一行、解析一行。写盘用十二列，读兼容老十一列（无结果列 ⇒ done）。

// HistoryTitle 历史文件的一级标题。
const HistoryTitle = "# History (closed)"

// HistoryHeader 十二列表头。
const HistoryHeader = "| Finished | Created | Title | Category | Tags " +
	"| Owner | Owner Name | Creator | Creator Name | Summary | Result | Worklog |"

// HistorySep 表头分隔行。
const HistorySep = "|---|---|---|---|---|---|---|---|---|---|---|---|"

// 结果列取值：正常结案 / 取消（老文件没有这一列，按 done 读）。
const (
	ResultDone      = "done"
	ResultCancelled = "cancelled"
)

var (
	linkRe     = regexp.MustCompile(`^\[[^\]]*\]\(([^)]*)\)$`)
	tagSplitRe = regexp.MustCompile(`[,，、]`)
	sepCellRe  = regexp.MustCompile(`^:?-+:?$`)
)

// Row 一条历史行。
type Row struct {
	Finished    string
	Created     string
	Title       string
	Category    string
	Tags        []string
	Owner       string
	OwnerName   string
	Creator     string
	CreatorName string
	Summary     string
	Result      string
	Worklog     string
	Line        int
}

// EscCell 表格单元格：折叠空白并转义竖线。
func EscCell(text string) string {
	return strings.ReplaceAll(strings.Join(strings.Fields(text), " "), "|", `\|`)
}

// OwnerCell owner 列的值：裸 uuid，不加 `@`。
func OwnerCell(owner string) string { return owner }

// CreatorCell creator 列的值（与 OwnerCell 同一约定）。
func CreatorCell(creator string) string { return creator }

// NameCell 名字列的展示值：名字前加 `@`。
func NameCell(name string) string {
	if name == "" {
		return ""
	}
	return "@" + name
}

// SplitRow 按未转义的 `|` 切表格行，切完反转义、去首尾空单元。
func SplitRow(line string) []string {
	var cells []string
	var cur strings.Builder
	trimmed := strings.TrimSpace(line)
	for i := 0; i < len(trimmed); i++ {
		c := trimmed[i]
		if c == '\\' && i+1 < len(trimmed) && trimmed[i+1] == '|' {
			cur.WriteByte('|')
			i++
			continue
		}
		if c == '|' {
			cells = append(cells, cur.String())
			cur.Reset()
			continue
		}
		cur.WriteByte(c)
	}
	cells = append(cells, cur.String())
	if len(cells) > 0 && cells[0] == "" {
		cells = cells[1:]
	}
	if len(cells) > 0 && cells[len(cells)-1] == "" {
		cells = cells[:len(cells)-1]
	}
	for i := range cells {
		cells[i] = strings.TrimSpace(cells[i])
	}
	return cells
}

// IsSepRow 是不是表头分隔行。
func IsSepRow(cells []string) bool {
	if len(cells) == 0 {
		return false
	}
	for _, c := range cells {
		if !sepCellRe.MatchString(c) {
			return false
		}
	}
	return true
}

func looksLikeHeader(cells []string) bool {
	if len(cells) == 0 {
		return false
	}
	return cells[0] == "Finished" || cells[0] == "时间" || cells[0] == "结案时间"
}

// HistoryLine 十二列的一行。worklog 收**相对 ledger/** 的路径。
func HistoryLine(finished string, created, title, owner, summary, result, worklog string, category string, tags []string, creator, ownerName, creatorName string) string {
	logRel := ""
	if worklog != "" {
		logRel = ToHistoryRel(worklog)
	}
	tagCell := EscCell(strings.Join(tags, "、"))
	link := ""
	if logRel != "" {
		link = "[" + logRel + "](" + logRel + ")"
	}
	var b strings.Builder
	// 一次 Printf 写一行，省掉五次 WriteString 各自拼接的中间串
	fmt.Fprintf(&b, "| %s | %s | %s", finished, created, EscCell(title))
	fmt.Fprintf(&b, " | %s | %s", EscCell(category), tagCell)
	fmt.Fprintf(&b, " | %s | %s", EscCell(OwnerCell(owner)), EscCell(NameCell(ownerName)))
	fmt.Fprintf(&b, " | %s | %s", EscCell(CreatorCell(creator)), EscCell(NameCell(creatorName)))
	fmt.Fprintf(&b, " | %s | %s | %s |\n", EscCell(summary), result, link)
	return b.String()
}

// ParseHistory 解析历史表 → (records, warnings)。写盘十二列；老十一列按 done 读。
func ParseHistory(text string) ([]Row, []string) {
	var records []Row
	var warnings []string
	for i, raw := range splitLines(text) {
		if !strings.HasPrefix(strings.TrimSpace(raw), "|") {
			continue
		}
		lineno := i + 1
		cells := SplitRow(raw)
		if len(cells) == 0 || IsSepRow(cells) || looksLikeHeader(cells) {
			continue
		}
		if len(cells) != 11 && len(cells) != 12 {
			warnings = append(warnings, "第 "+itoa(lineno)+" 行不是 11/12 列（历史表只认这两种），已跳过")
			continue
		}
		finished := cells[0]
		if !timeRe.MatchString(finished) {
			warnings = append(warnings, "第 "+itoa(lineno)+" 行时间列 "+quote(finished)+" 不合法，已跳过")
			continue
		}
		var tags []string
		for _, t := range tagSplitRe.Split(cells[4], -1) {
			if t = strings.TrimSpace(t); t != "" {
				tags = append(tags, t)
			}
		}
		result, worklogCell := ResultDone, cells[10]
		if len(cells) == 12 {
			if v := strings.TrimSpace(cells[10]); v != "" {
				result = v
			}
			worklogCell = cells[11]
		}
		worklog := strings.TrimSpace(worklogCell)
		if m := linkRe.FindStringSubmatch(worklog); m != nil {
			worklog = m[1]
		}
		records = append(records, Row{
			Finished:    finished,
			Created:     TimeKey(strings.TrimSpace(cells[1])),
			Title:       cells[2],
			Category:    strings.TrimSpace(cells[3]),
			Tags:        tags,
			Owner:       strings.TrimPrefix(strings.TrimSpace(cells[5]), "@"),
			OwnerName:   strings.TrimPrefix(strings.TrimSpace(cells[6]), "@"),
			Creator:     strings.TrimPrefix(strings.TrimSpace(cells[7]), "@"),
			CreatorName: strings.TrimPrefix(strings.TrimSpace(cells[8]), "@"),
			Summary:     cells[9],
			Result:      result,
			Worklog:     worklog,
			Line:        lineno,
		})
	}
	return records, warnings
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}

func quote(s string) string { return "'" + s + "'" }
