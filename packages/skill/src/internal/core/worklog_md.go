package core

import (
	"regexp"
	"strings"
)

// 过程文档的文本操作：给一段文字，返回新文字。不读文件、不写文件。

// 文档格式（2026-10-29 起写英文；老中文标记只读不写，见各 legacy 常量）。
const (
	// ExecHead 「执行记录」节的标题。
	ExecHead = "## Execution Log"
	// execLegacyHead 老文档的「执行记录」节名。
	execLegacyHead = "## 执行记录"
	// FrozenMark 封卷标记。
	FrozenMark = "Sealed"
)

// ExecHint 该节在模板里的固定注释。
const ExecHint = "<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.\n" +
	"     Backfill with: progress log --id <id> --note \"...\". -->"

// HeadKeyOrder 头部四行的规范顺序：标签 → 状态 → 创建 → 封卷。
var HeadKeyOrder = []string{"meta", "status", "created", "frozen"}

// headBullet 头部行前缀：新格式是无序列表 `- `，老文档是引用块 `> ` —— 读的时候两种都认。
const headBullet = `^(?:\s*>\s?|\s*[-*]\s+)`

var (
	frozenRe    = regexp.MustCompile(`(?m)` + headBullet + `(?:\*\*(?:` + FrozenMark + `|封卷)\*\*|✅ 完成封卷)`)
	frozenAtRe  = regexp.MustCompile(`(?m)` + headBullet + `(?:\*\*(?:` + FrozenMark + `|封卷)\*\*|✅ 完成封卷)[^：:]*[：:]\s*(\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?)`)
	createdRe   = regexp.MustCompile(headBullet + `\*\*(?:Created|创建)\*\*`)
	createdAtRe = regexp.MustCompile(headBullet + `\*\*(?:Created|创建)\*\*\s*[：:]\s*(\d{4}-\d{2}-\d{2}(?:[ T]+\d{1,2}:\d{1,2}(?::\d{1,2})?)?)`)
	creatorRe   = regexp.MustCompile(headBullet + `\*\*(?:Created|创建)\*\*\s*[：:].*?@(.+?)\s*[）)]?\s*$`)

	statusLineRe = regexp.MustCompile(headBullet + `\*\*(?:Status|状态)\*\*`)
	statusRe     = regexp.MustCompile(headBullet + `\*\*(?:Status|状态)\*\*\s*[：:]\s*([A-Za-z_]+)`)

	statusUUIDRe = regexp.MustCompile(`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`)
	statusNameRe = regexp.MustCompile(`@([^（(·]+)`)
	statusWhenRe = regexp.MustCompile(`(\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?)`)

	titleRe    = regexp.MustCompile(`^#\s*(.+?)\s*[：:]\s*(.*)$`)
	metaLineRe = regexp.MustCompile(headBullet + `\*\*(?:Tags|分类|标签)\*\*`)
)

// StatusValues 状态取值（与 Statuses + 结案后的 done / cancelled 同口径）。
var StatusValues = []string{"open", "doing", "done", "cancelled"}

// legacyStatus 老文档里的状态值 → 现值（只读兼容，例如 closed 一律按 done）。
var legacyStatus = map[string]string{"closed": "done"}

func canonicalStatus(value string) string {
	if v, ok := legacyStatus[value]; ok {
		return v
	}
	return value
}

// WorklogSections 过程文档应有的六节，顺序即模板顺序（真源是 assets/worklog.md）。
var WorklogSections = []string{"Background", "To Do", "Next", "Process", "Conclusion", "Execution Log"}

// RequiredSections 判「格式坏」只要求前五节。
var RequiredSections = WorklogSections[:5]

// legacySection 老中文节名 → 新英文节名（只读兼容；写盘一律英文）。
var legacySection = map[string]string{
	"背景": "Background", "待办": "To Do", "下一步": "Next",
	"过程": "Process", "结论": "Conclusion", "执行记录": "Execution Log",
}

func canonicalSection(name string) string {
	if v, ok := legacySection[name]; ok {
		return v
	}
	return name
}

// stripBOM 去掉 UTF-8 BOM。
func stripBOM(s string) string { return strings.TrimPrefix(s, "\ufeff") }

// splitLines 按行切分（本仓文件一律 LF）。
func splitLines(text string) []string {
	if text == "" {
		return nil
	}
	lines := strings.Split(text, "\n")
	for i, ln := range lines {
		lines[i] = strings.TrimSuffix(ln, "\r")
	}
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines
}

// SectionHeads 文档里的二级标题（`## Background` → `Background`），按出现顺序；老中文节名归一到英文。
func SectionHeads(text string) []string {
	var out []string
	for _, line := range splitLines(text) {
		if strings.HasPrefix(line, "## ") {
			out = append(out, canonicalSection(strings.TrimSpace(line[3:])))
		}
	}
	return out
}

func headLines(lines []string) []string {
	for i, line := range lines {
		if strings.HasPrefix(line, "## ") {
			return lines[:i]
		}
	}
	return lines
}

func contains(list []string, want string) bool {
	for _, v := range list {
		if v == want {
			return true
		}
	}
	return false
}

// FormatProblems 过程文档的**格式**问题：只看骨架结构，不看内容、不判业务。
func FormatProblems(text string) []string {
	var problems []string
	body := stripBOM(text)
	lines := splitLines(body)
	if len(lines) == 0 || !strings.HasPrefix(lines[0], "# ") {
		problems = append(problems, "第一行不是标题（应为 `# <任务号>：<标题>`）")
	}
	head := headLines(lines)
	anyCreated := false
	for _, line := range head {
		if createdAtRe.MatchString(line) {
			anyCreated = true
			break
		}
	}
	if !anyCreated {
		problems = append(problems, "头部缺「创建」时间行（应为 `- **创建**：YYYY-MM-DD HH:MM:SS · @某人 · uuid`）")
	} else {
		anyCreator := false
		for _, line := range head {
			if creatorRe.MatchString(line) {
				anyCreator = true
				break
			}
		}
		if !anyCreator {
			problems = append(problems, "头部「创建」行缺发起人（应为 `… · @某人 · uuid`）")
		}
	}
	for _, line := range head {
		if !statusLineRe.MatchString(line) {
			continue
		}
		m := statusRe.FindStringSubmatch(line)
		if m == nil || !contains(StatusValues, canonicalStatus(m[1])) {
			problems = append(problems, "头部「状态」行的值不合法（应为 "+strings.Join(StatusValues, " / ")+"）")
		}
		break
	}
	heads := SectionHeads(body)
	var missing []string
	for _, s := range RequiredSections {
		if !contains(heads, s) {
			missing = append(missing, "`## "+s+"`")
		}
	}
	if len(missing) > 0 {
		problems = append(problems, "缺节："+strings.Join(missing, "、"))
	} else {
		var order []string
		for _, head := range heads {
			if contains(RequiredSections, head) && !contains(order, head) {
				order = append(order, head)
			}
		}
		if len(order) != len(RequiredSections) {
			problems = append(problems, "节的顺序不对：应为 "+quotedJoin(RequiredSections))
		} else {
			for i := range order {
				if order[i] != RequiredSections[i] {
					problems = append(problems, "节的顺序不对：应为 "+quotedJoin(RequiredSections))
					break
				}
			}
		}
	}
	return problems
}

func quotedJoin(list []string) string {
	out := make([]string, len(list))
	for i, s := range list {
		out[i] = "`## " + s + "`"
	}
	return strings.Join(out, " → ")
}

// DuplicatedSections 重复出现的节标题（老文档编辑残留；只作提示）。
func DuplicatedSections(text string) []string {
	heads := SectionHeads(text)
	var out []string
	for _, s := range RequiredSections {
		n := 0
		for _, h := range heads {
			if h == s {
				n++
			}
		}
		if n > 1 {
			out = append(out, s)
		}
	}
	return out
}

// LacksExecSection 缺「执行记录」节（老文档没有；脚本写入时会自动补上这一节）。
func LacksExecSection(text string) bool {
	return !contains(SectionHeads(text), WorklogSections[len(WorklogSections)-1])
}

func sectionsBody(text string) string {
	for _, head := range []string{ExecHead, execLegacyHead} {
		if idx := strings.Index(text, "\n"+head); idx >= 0 {
			return text[:idx]
		}
	}
	return text
}

// IsSkeleton 是不是骨架（正文还没填）：前五节里没有任何实质内容。
func IsSkeleton(text string) bool {
	body := sectionsBody(text)
	if strings.TrimSpace(body) == "" {
		return true
	}
	for _, line := range splitLines(body) {
		stripped := strings.TrimSpace(line)
		if stripped == "" || strings.HasPrefix(stripped, "<!--") ||
			strings.HasPrefix(stripped, "-->") || strings.HasPrefix(stripped, ">") ||
			strings.HasPrefix(stripped, "#") || stripped == "-" || stripped == "—" {
			continue
		}
		return false
	}
	return true
}

// StatusLine 头部状态行的四样内容（when 传 UTC）。
type StatusLine struct {
	Status string
	Name   string
	UUID   string
	When   string
}

// RenderStatusBody 状态行的**内容**部分：`状态 · 时间 · @名字 · uuid`。
func RenderStatusBody(status, name, uuid, when string) string {
	parts := []string{status}
	if when != "" {
		parts = append(parts, when)
	}
	if name != "" {
		parts = append(parts, "@"+name)
	}
	if uuid != "" {
		parts = append(parts, uuid)
	}
	return strings.Join(parts, " · ")
}

// RenderStatusLine 完整的状态行。
func RenderStatusLine(status, name, uuid, when string) string {
	return "- **Status**: " + RenderStatusBody(status, name, uuid, when)
}

// RenderWorklog 把模板套成一篇过程文档。
func RenderWorklog(tid, title, created, creator string, tags []string, status *StatusLine, template string) string {
	text := strings.NewReplacer(
		"<id>", tid,
		"<title>", title,
		"<created>", created,
		"<creator>", creator,
	).Replace(template)
	if status == nil {
		var kept []string
		for _, ln := range splitLines(text) {
			if statusLineRe.MatchString(ln) && strings.Contains(ln, "<status>") {
				continue
			}
			kept = append(kept, ln)
		}
		text = strings.Join(kept, "\n") + "\n"
	} else {
		text = strings.ReplaceAll(text, "<status>", RenderStatusBody(status.Status, status.Name, status.UUID, status.When))
	}
	meta := LabelLine(tags)
	if meta == "" {
		return text
	}
	return strings.Join(insertHeadLine(splitLines(text), meta, "meta"), "\n") + "\n"
}

func headKey(line string) string {
	switch {
	case metaLineRe.MatchString(line):
		return "meta"
	case statusLineRe.MatchString(line):
		return "status"
	case createdRe.MatchString(line):
		return "created"
	case frozenRe.MatchString(line):
		return "frozen"
	}
	return ""
}

func rankOf(key string) int {
	for i, k := range HeadKeyOrder {
		if k == key {
			return i
		}
	}
	return len(HeadKeyOrder)
}

func insertHeadLine(lines []string, line, key string) []string {
	rank := rankOf(key)
	last := -1
	for i, ln := range lines {
		if strings.HasPrefix(ln, "## ") {
			break
		}
		found := headKey(ln)
		if found == "" {
			continue
		}
		if rankOf(found) > rank {
			out := make([]string, 0, len(lines)+1)
			out = append(out, lines[:i]...)
			out = append(out, line)
			out = append(out, lines[i:]...)
			return out
		}
		last = i
	}
	at := 0
	if len(lines) > 0 && strings.HasPrefix(lines[0], "# ") {
		at = 1
	}
	if last < 0 {
		for at+1 < len(lines) && strings.TrimSpace(lines[at+1]) == "" {
			at++
		}
	} else {
		at = last
	}
	out := make([]string, 0, len(lines)+1)
	out = append(out, lines[:at+1]...)
	out = append(out, line)
	out = append(out, lines[at+1:]...)
	return out
}

// RewriteStatusLine 把头部状态行改成 status：有就就地替换，没有就按头部顺序插进去。
func RewriteStatusLine(text string, status StatusLine) string {
	line := RenderStatusLine(status.Status, status.Name, status.UUID, status.When)
	lines := splitLines(text)
	for i, ln := range lines {
		if strings.HasPrefix(ln, "## ") {
			break
		}
		if statusLineRe.MatchString(ln) {
			lines[i] = line
			return strings.Join(lines, "\n") + "\n"
		}
	}
	return strings.Join(insertHeadLine(lines, line, "status"), "\n") + "\n"
}

// ReadStatus 头部状态行 → StatusLine；没有这行、或值不合法 ⇒ nil。
func ReadStatus(text string) *StatusLine {
	for _, line := range headLines(splitLines(stripBOM(text))) {
		m := statusRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		if value := canonicalStatus(m[1]); contains(StatusValues, value) {
			m[1] = value
		} else {
			continue
		}
		var name, uuid, when string
		if n := statusNameRe.FindStringSubmatch(line); n != nil {
			name = strings.TrimSpace(n[1])
		}
		if u := statusUUIDRe.FindString(line); u != "" {
			uuid = strings.ToLower(u)
		}
		if w := statusWhenRe.FindStringSubmatch(line); w != nil {
			when = w[1]
		}
		return &StatusLine{Status: m[1], Name: name, UUID: uuid, When: when}
	}
	return nil
}

// HeadTitle 第一行 `# <任务号>：<标题>` → (任务号, 标题)；读不出给 ("","")。
func HeadTitle(text string) (string, string) {
	for _, line := range splitLines(stripBOM(text)) {
		if !strings.HasPrefix(line, "# ") {
			continue
		}
		m := titleRe.FindStringSubmatch(line)
		if m != nil {
			return strings.TrimSpace(m[1]), strings.TrimSpace(m[2])
		}
		return "", ""
	}
	return "", ""
}

// ExecLine 一条执行记录：`- 时刻 · 类型 · @某人 · 说明`。
func ExecLine(when, who, kind, note string) string {
	head := "- " + when + " · " + kind
	if who != "" {
		return head + " · @" + who + " · " + note
	}
	return head + " · " + note
}

// AppendExecLog 把一条记录追加到「执行记录」节末尾；老文档没有这一节就先补一节（新节名英文）。
func AppendExecLog(text, line string) string {
	for _, head := range []string{ExecHead, execLegacyHead} {
		if strings.Contains(text, "\n"+head) || strings.HasPrefix(text, head) {
			return strings.TrimRight(text, "\n") + "\n" + line + "\n"
		}
	}
	block := "\n" + ExecHead + "\n\n" + ExecHint + "\n" + line + "\n"
	return strings.TrimRight(text, "\n") + "\n" + block
}

// HasFrozenLine 这篇文档封卷了没有。
func HasFrozenLine(text string) bool { return frozenRe.MatchString(text) }

// StampFrozen 封卷：在头部打「封卷」行。
func StampFrozen(text, finished, who string) string {
	mark := "- **" + FrozenMark + "**: " + finished
	if who != "" {
		mark += " · @" + who
	}
	if frozenRe.MatchString(text) {
		return text
	}
	return strings.Join(insertHeadLine(splitLines(text), mark, "frozen"), "\n") + "\n"
}

// RewriteLabelLine 改写头部的标签行（老文档的分类段一并清掉）。
func RewriteLabelLine(text string, tags []string) string {
	line := LabelLine(tags)
	lines := splitLines(text)
	for i, ln := range lines {
		if strings.HasPrefix(ln, "## ") {
			break
		}
		if metaLineRe.MatchString(ln) {
			if line != "" {
				lines[i] = line
			} else {
				lines = append(lines[:i], lines[i+1:]...)
			}
			return strings.Join(lines, "\n") + "\n"
		}
	}
	if line == "" {
		return text
	}
	return strings.Join(insertHeadLine(lines, line, "meta"), "\n") + "\n"
}

// HeadMeta 过程文档头部的分类与标签。
func HeadMeta(text string) (string, []string) { return ParseLabelLine(text) }

// HeadCreated 头部「创建」行的时间（原样返回，不转时区）。
func HeadCreated(text string) string {
	for _, line := range splitLines(text) {
		if m := createdAtRe.FindStringSubmatch(line); m != nil {
			if v, err := NormalizeTime(m[1], "创建", "", ""); err == nil {
				return v
			}
			return ""
		}
	}
	return ""
}

// HeadFrozen 头部「封卷」行的时间（原样返回，不转时区）。
func HeadFrozen(text string) string {
	for _, line := range splitLines(text) {
		if m := frozenAtRe.FindStringSubmatch(line); m != nil {
			if v, err := NormalizeTime(m[1], "封卷", "", ""); err == nil {
				return v
			}
			return ""
		}
	}
	return ""
}

// HeadCreator 头部「创建」行的发起人**名字**（不带 @、不带 uuid）。
func HeadCreator(text string) string {
	for _, line := range splitLines(text) {
		if m := creatorRe.FindStringSubmatch(line); m != nil {
			if v := strings.TrimSpace(m[1]); v != "" {
				return strings.TrimSpace(strings.Split(v, " · ")[0])
			}
		}
	}
	return ""
}

// HeadCreatorUUID 头部「创建」行的发起人 uuid；老文档没落 uuid 时返回空串。
func HeadCreatorUUID(text string) string {
	for _, line := range splitLines(text) {
		m := creatorRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		parts := strings.Split(m[1], " · ")
		if len(parts) > 1 {
			uuid := strings.TrimSpace(parts[len(parts)-1])
			if UUIDRe.MatchString(uuid) {
				return uuid
			}
		}
	}
	return ""
}
