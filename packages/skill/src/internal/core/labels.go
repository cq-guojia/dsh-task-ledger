package core

import (
	"regexp"
	"strings"
)

// 分类与标签：校验、拼行、拆行。只做文本换算。

// Statuses 在办状态白名单。
var Statuses = []string{"open", "doing"}

// FormatVersion JSON 台账的格式版本（写盘一律带当前值）。
const FormatVersion = "20261022000000"

const (
	labelMaxChars   = 4 // 含 CJK 时按「字」算
	labelMaxWordsEn = 3 // 纯 ASCII 时按「词」算
	tagsMaxCount    = 5
)

var (
	cjkRe      = regexp.MustCompile(`[\p{Han}]`)
	labelCatRe = regexp.MustCompile(`(?:Category|分类)\*\*\s*[：:]\s*([^｜|·]+)`)
	labelTagRe = regexp.MustCompile(`(?:Tags|标签)\*\*\s*[：:]\s*(.+)$`)
	splitRe    = regexp.MustCompile(`[,，、]`)
)

// NormalizeLabel 分类 / 单个标签的校验：去空白、限长。空串直接 Fail。
func NormalizeLabel(value, field string) (string, error) {
	text := strings.TrimSpace(value)
	if text == "" {
		return "", Failf("%s 不能为空。", field)
	}
	if cjkRe.MatchString(text) {
		if len([]rune(text)) > labelMaxChars {
			return "", Failf("%s %q 太长：含中文时最多 %d 个字。", field, text, labelMaxChars)
		}
	} else if len(strings.Fields(text)) > labelMaxWordsEn {
		return "", Failf("%s %q 太长：英文最多 %d 个词。", field, text, labelMaxWordsEn)
	}
	return text, nil
}

// ParseTags 标签串（「、」「,」「，」分隔）→ 去重保序的切片；超上限报错。
func ParseTags(raw []string) ([]string, error) {
	out := []string{}
	for _, item := range raw {
		text, err := NormalizeLabel(strings.TrimSpace(item), "标签")
		if err != nil {
			return nil, err
		}
		seen := false
		for _, have := range out {
			if have == text {
				seen = true
				break
			}
		}
		if !seen {
			out = append(out, text)
		}
	}
	if len(out) > tagsMaxCount {
		return nil, Failf("标签最多 %d 个，收到 %d 个。", tagsMaxCount, len(out))
	}
	return out, nil
}

// SplitTags 把命令行给的一串标签切开（顿号 / 逗号 / 中文逗号）。
func SplitTags(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	return splitRe.Split(raw, -1)
}

// LabelLine 过程文档头部的标签行；标签为空返回空串（此行不写）。
func LabelLine(tags []string) string {
	kept := make([]string, 0, len(tags))
	for _, t := range tags {
		if t != "" {
			kept = append(kept, t)
		}
	}
	if len(kept) == 0 {
		return ""
	}
	return "- **Tags**: " + strings.Join(kept, ", ")
}

// ParseLabelLine 从过程文档头部（第一个 `## ` 小节之前）解析分类与标签；跳过 HTML 注释块。
func ParseLabelLine(text string) (string, []string) {
	inComment := false
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(line, "## ") {
			break
		}
		stripped := strings.TrimLeft(line, " \t")
		if inComment {
			if strings.Contains(stripped, "-->") {
				inComment = false
			}
			continue
		}
		if strings.HasPrefix(stripped, "<!--") {
			inComment = !strings.Contains(stripped, "-->")
			continue
		}
		mc := labelCatRe.FindStringSubmatch(line)
		mt := labelTagRe.FindStringSubmatch(line)
		if mc == nil && mt == nil {
			continue
		}
		category := ""
		if mc != nil {
			category = strings.TrimSpace(mc[1])
		}
		var tags []string
		if mt != nil {
			for _, t := range splitRe.Split(strings.TrimSpace(mt[1]), -1) {
				if t = strings.TrimSpace(t); t != "" {
					tags = append(tags, t)
				}
			}
		}
		return category, tags
	}
	return "", nil
}
