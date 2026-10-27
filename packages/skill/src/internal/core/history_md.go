package core

import (
	"regexp"
	"strings"
)

// 历史表格的文本操作：拼十一列一行、解析十一列一行。只认十一列这一种格式。

// HistoryTitle 历史文件的一级标题。
const HistoryTitle = "# 进度历史（已结案）"

// HistoryHeader 十一列表头。
const HistoryHeader = "| 结案时间 | 创建时间 | 标题 | 分类 | 标签 " +
	"| owner | owner_name | creator | creator_name | 完成了什么 | 过程文档 |"

// HistorySep 表头分隔行。
const HistorySep = "|---|---|---|---|---|---|---|---|---|---|---|"

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
	return len(cells) > 0 && (cells[0] == "时间" || cells[0] == "结案时间")
}

// HistoryLine 十一列的一行。worklog 收**相对 ledger/** 的路径。
func HistoryLine(finished string, created, title, owner, summary, worklog string, category string, tags []string, creator, ownerName, creatorName string) string {
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
	b.WriteString("| " + finished + " | " + created + " | " + EscCell(title))
	b.WriteString(" | " + EscCell(category) + " | " + tagCell)
	b.WriteString(" | " + EscCell(OwnerCell(owner)) + " | " + EscCell(NameCell(ownerName)))
	b.WriteString(" | " + EscCell(CreatorCell(creator)) + " | " + EscCell(NameCell(creatorName)))
	b.WriteString(" | " + EscCell(summary) + " | " + link + " |\n")
	return b.String()
}

// ParseHistory 解析十一列历史表 → (records, warnings)。
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
		if len(cells) != 11 {
			warnings = append(warnings, "第 "+itoa(lineno)+" 行不是十一列（历史表只认十一列），已跳过")
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
		worklog := strings.TrimSpace(cells[10])
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
