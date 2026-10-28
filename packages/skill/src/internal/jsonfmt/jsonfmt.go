// Package jsonfmt 渲染 `--json` 输出：
// 两空格缩进、不转义 HTML、空容器写成 {} / []、末尾不带换行（调用方补）。
package jsonfmt

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// Quote JSON 字符串字面量：中文原样。
func Quote(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		default:
			if r < 0x20 {
				fmt.Fprintf(&b, `\u%04x`, r)
				continue
			}
			b.WriteRune(r)
		}
	}
	b.WriteByte('"')
	return b.String()
}

// Marshal 渲染成缩进 2 的 JSON 文本。
//
// 字典键按**字典序**输出（Go 的 map 没有插入序，
// 两边键集合一致、顺序可能不同 —— 下游都是按 JSON 解析，不影响语义）。
func Marshal(v any) string { return render(v, 1) }

func render(v any, level int) string {
	switch value := v.(type) {
	case nil:
		return "null"
	case bool:
		if value {
			return "true"
		}
		return "false"
	case string:
		return Quote(value)
	case json.Number:
		return value.String()
	case float64:
		if value == float64(int64(value)) {
			return fmt.Sprintf("%d", int64(value))
		}
		return fmt.Sprintf("%v", value)
	case int:
		return fmt.Sprintf("%d", value)
	case int64:
		return fmt.Sprintf("%d", value)
	case []string:
		items := make([]any, len(value))
		for i, s := range value {
			items[i] = s
		}
		return render(items, level)
	case []any:
		if len(value) == 0 {
			return "[]"
		}
		pad := strings.Repeat("  ", level)
		var b strings.Builder
		b.WriteString("[\n")
		for i, item := range value {
			b.WriteString(pad)
			b.WriteString(render(item, level+1))
			if i < len(value)-1 {
				b.WriteString(",")
			}
			b.WriteString("\n")
		}
		b.WriteString(strings.Repeat("  ", level-1))
		b.WriteString("]")
		return b.String()
	case map[string]any:
		if len(value) == 0 {
			return "{}"
		}
		keys := make([]string, 0, len(value))
		for k := range value {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		pad := strings.Repeat("  ", level)
		var b strings.Builder
		b.WriteString("{\n")
		for i, k := range keys {
			b.WriteString(pad)
			b.WriteString(Quote(k))
			b.WriteString(": ")
			b.WriteString(render(value[k], level+1))
			if i < len(keys)-1 {
				b.WriteString(",")
			}
			b.WriteString("\n")
		}
		b.WriteString(strings.Repeat("  ", level-1))
		b.WriteString("}")
		return b.String()
	case []map[string]any:
		items := make([]any, len(value))
		for i, item := range value {
			items[i] = item
		}
		return render(items, level)
	default:
		return Quote(fmt.Sprint(value))
	}
}
