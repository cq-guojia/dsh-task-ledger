package core

import (
	"fmt"
	"regexp"
	"strings"
)

// 历史表格的文本操作：拼一行、解析一行。只认十六列；列数不符的行静默跳过。

// HistoryTitle 历史文件的一级标题。
const HistoryTitle = "# History (closed)"

// HistoryHeader 十六列表头。
const HistoryHeader = "| Finished | Created | Title | Category | Tags " +
	"| Owner | Owner Name | Creator | Creator Name | Summary | Result | Worklog " +
	"| Deleted | Deleted By | Deleted By Name | Deleted At |"

// HistorySep 表头分隔行。
const HistorySep = "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"

// 结果列取值：正常结案 / 取消。
const (
	ResultDone      = "done"
	ResultCancelled = "cancelled"
)

// DeletedYes 删除标记列的唯一有效值；空 = 未删除。
const DeletedYes = "yes"

var (
	linkRe     = regexp.MustCompile(`^\[[^\]]*\]\(([^)]*)\)$`)
	tagSplitRe = regexp.MustCompile(`[,，、]`)
	sepCellRe  = regexp.MustCompile(`^:?-+:?$`)
)

// Row 一条历史行。
type Row struct {
	Finished      string
	Created       string
	Title         string
	Category      string
	Tags          []string
	Owner         string
	OwnerName     string
	Creator       string
	CreatorName   string
	Summary       string
	Result        string
	Worklog       string
	Deleted       string
	DeletedBy     string
	DeletedByName string
	DeletedAt     string
	Line          int
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
	return len(cells) > 0 && cells[0] == "Finished"
}

// HistoryLine 十六列的一行。worklog 收**相对 ledger/** 的路径；
// 末尾四格是删除标记 / 删除人 uuid / 删除人显示名 / 删除时间。
func HistoryLine(finished string, created, title, owner, summary, result, worklog string, category string, tags []string, creator, ownerName, creatorName, deleted, deletedBy, deletedByName, deletedAt string) string {
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
	fmt.Fprintf(&b, " | %s | %s | %s | %s | %s | %s | %s |\n", EscCell(summary), result, link, EscCell(deleted), EscCell(deletedBy), EscCell(NameCell(deletedByName)), EscCell(deletedAt))
	return b.String()
}

// ParseHistory 解析历史表 → (records, warnings)。只认十六列；列数不符 / 时间不合法的行静默跳过。
func ParseHistory(text string) ([]Row, []string) {
	var records []Row
	for i, raw := range splitLines(text) {
		if !strings.HasPrefix(strings.TrimSpace(raw), "|") {
			continue
		}
		lineno := i + 1
		cells := SplitRow(raw)
		if len(cells) == 0 || IsSepRow(cells) || looksLikeHeader(cells) {
			continue
		}
		if len(cells) != 16 {
			continue
		}
		finished := cells[0]
		if !timeRe.MatchString(finished) {
			continue
		}
		var tags []string
		for _, t := range tagSplitRe.Split(cells[4], -1) {
			if t = strings.TrimSpace(t); t != "" {
				tags = append(tags, t)
			}
		}
		result := strings.TrimSpace(cells[10])
		worklog := strings.TrimSpace(cells[11])
		if m := linkRe.FindStringSubmatch(worklog); m != nil {
			worklog = m[1]
		}
		records = append(records, Row{
			Finished:      finished,
			Created:       TimeKey(strings.TrimSpace(cells[1])),
			Title:         cells[2],
			Category:      strings.TrimSpace(cells[3]),
			Tags:          tags,
			Owner:         strings.TrimPrefix(strings.TrimSpace(cells[5]), "@"),
			OwnerName:     strings.TrimPrefix(strings.TrimSpace(cells[6]), "@"),
			Creator:       strings.TrimPrefix(strings.TrimSpace(cells[7]), "@"),
			CreatorName:   strings.TrimPrefix(strings.TrimSpace(cells[8]), "@"),
			Summary:       cells[9],
			Result:        result,
			Worklog:       worklog,
			Deleted:       strings.TrimSpace(cells[12]),
			DeletedBy:     strings.TrimSpace(cells[13]),
			DeletedByName: strings.TrimPrefix(strings.TrimSpace(cells[14]), "@"),
			DeletedAt:     strings.TrimSpace(cells[15]),
			Line:          lineno,
		})
	}
	return records, nil
}
