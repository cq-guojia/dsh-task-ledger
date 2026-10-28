// Package store 是台账的读改写底座：JSON、文本、锁、记账本。
package store

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/notices"
)

// QuoteJSON JSON 字符串字面量：只转义引号、反斜杠与控制字符，中文原样。
func QuoteJSON(s string) string {
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

// DumpJSON 紧凑 JSON：键按字典序、中文原样。
func DumpJSON(v any) string {
	switch value := v.(type) {
	case nil:
		return "null"
	case bool:
		if value {
			return "true"
		}
		return "false"
	case string:
		return QuoteJSON(value)
	case json.Number:
		return value.String()
	case float64:
		return trimFloat(value)
	case int:
		return fmt.Sprintf("%d", value)
	case int64:
		return fmt.Sprintf("%d", value)
	case []string:
		items := make([]string, len(value))
		for i, s := range value {
			items[i] = QuoteJSON(s)
		}
		return "[" + strings.Join(items, ", ") + "]"
	case []any:
		items := make([]string, len(value))
		for i, item := range value {
			items[i] = DumpJSON(item)
		}
		return "[" + strings.Join(items, ", ") + "]"
	case map[string]any:
		keys := make([]string, 0, len(value))
		for k := range value {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		items := make([]string, len(keys))
		for i, k := range keys {
			items[i] = QuoteJSON(k) + ": " + DumpJSON(value[k])
		}
		return "{" + strings.Join(items, ", ") + "}"
	default:
		return QuoteJSON(fmt.Sprint(value))
	}
}

func trimFloat(f float64) string {
	if f == float64(int64(f)) {
		return fmt.Sprintf("%d", int64(f))
	}
	return fmt.Sprintf("%v", f)
}

// DumpLedgerJSON 「一条一行」的台账文本（expand 指定的那个字典一条一行，其余字段各占一行）。
func DumpLedgerJSON(data map[string]any, expand string) string {
	body := map[string]any{}
	for k, v := range data {
		body[k] = v
	}
	body["version"] = core.FormatVersion
	keys := make([]string, 0, len(body))
	for k := range body {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	rows := make([]string, 0, len(keys))
	for _, key := range keys {
		value := body[key]
		if key == expand {
			if inner, ok := value.(map[string]any); ok {
				innerKeys := make([]string, 0, len(inner))
				for k := range inner {
					innerKeys = append(innerKeys, k)
				}
				sort.Strings(innerKeys)
				lines := make([]string, 0, len(innerKeys))
				for _, k := range innerKeys {
					lines = append(lines, "    "+QuoteJSON(k)+": "+DumpJSON(inner[k]))
				}
				block := ""
				if len(lines) > 0 {
					block = strings.Join(lines, ",\n") + "\n"
				}
				rows = append(rows, "  "+QuoteJSON(key)+": {\n"+block+"  }")
				continue
			}
		}
		rows = append(rows, "  "+QuoteJSON(key)+": "+DumpJSON(value))
	}
	return "{\n" + strings.Join(rows, ",\n") + "\n}\n"
}

// ReadJSONFile 读一份台账 JSON（去 BOM、保数字原文）；文件不存在返回 (nil,false,nil)。
func ReadJSONFile(path string) (map[string]any, bool, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, false, nil
		}
		return nil, false, fmt.Errorf("读 %s 失败：%v", path, err)
	}
	text := bytes.TrimPrefix(raw, []byte{0xEF, 0xBB, 0xBF})
	if strings.TrimSpace(string(text)) == "" {
		return nil, false, nil
	}
	dec := json.NewDecoder(bytes.NewReader(text))
	dec.UseNumber()
	var data map[string]any
	if err := dec.Decode(&data); err != nil {
		return nil, false, fmt.Errorf("%s 不是合法 JSON：%v", path, err)
	}
	return data, true, nil
}

// JSONStore 一份 JSON 台账的读改写。首次读盘后缓存在实例里。
type JSONStore struct {
	Path    string
	Expand  string
	Default map[string]any
	// Prepare 写盘前最后一次加工（分片顶部要带 identity 之类）。
	Prepare func(map[string]any)
	data    map[string]any
	loaded  bool
}

// NewJSONStore 造一个台账读写口。
func NewJSONStore(path, expand string, def map[string]any) *JSONStore {
	return &JSONStore{Path: path, Expand: expand, Default: def}
}

func (s *JSONStore) load() (map[string]any, error) {
	if s.loaded {
		return s.data, nil
	}
	data, ok, err := ReadJSONFile(s.Path)
	if err != nil {
		return nil, err
	}
	if !ok {
		fresh := map[string]any{}
		for k, v := range s.Default {
			fresh[k] = v
		}
		fresh["version"] = core.FormatVersion
		s.data, s.loaded = fresh, true
		return s.data, nil
	}
	s.checkVersion(data)
	if rows, present := data[s.Expand]; present && rows != nil {
		if _, isObj := rows.(map[string]any); !isObj {
			return nil, core.Failf("%s 的 %s 不是对象（是 %s），这份台账读不了。\n  处理：用 git 恢复它（git checkout -- <文件>），或手工改成对象。", filepath.Base(s.Path), s.Expand, typeName(rows))
		}
	}
	s.data, s.loaded = data, true
	return s.data, nil
}

func typeName(v any) string {
	switch v.(type) {
	case []any:
		return "list"
	case string:
		return "str"
	case json.Number, float64:
		return "int"
	case bool:
		return "bool"
	case nil:
		return "NoneType"
	}
	return "dict"
}

func (s *JSONStore) checkVersion(data map[string]any) {
	version, _ := data["version"].(string)
	if version == core.FormatVersion {
		return
	}
	shown := version
	if shown == "" {
		shown = "未知"
	}
	notices.Note(fmt.Sprintf("提示：%s 的格式版本是 %s，当前是 %s；不拦，但字段可能有出入。", filepath.Base(s.Path), shown, core.FormatVersion))
}

// Data 整份只读视图（升级 / 体检用）。
func (s *JSONStore) Data() (map[string]any, error) {
	data, err := s.load()
	if err != nil {
		return nil, err
	}
	out := map[string]any{}
	for k, v := range data {
		out[k] = v
	}
	return out, nil
}

// Get 按条取一份任务；没有返回 (nil,false,nil)。
func (s *JSONStore) Get(key string) (map[string]any, bool, error) {
	data, err := s.load()
	if err != nil {
		return nil, false, err
	}
	rows, _ := data[s.Expand].(map[string]any)
	if rows == nil {
		return nil, false, nil
	}
	value, ok := rows[key].(map[string]any)
	if !ok {
		return nil, false, nil
	}
	out := map[string]any{}
	for k, v := range value {
		out[k] = v
	}
	return out, true, nil
}

// All 全部任务（键 → 任务对象）。
func (s *JSONStore) All() (map[string]map[string]any, error) {
	data, err := s.load()
	if err != nil {
		return nil, err
	}
	out := map[string]map[string]any{}
	rows, _ := data[s.Expand].(map[string]any)
	for k, v := range rows {
		if row, ok := v.(map[string]any); ok {
			copied := map[string]any{}
			for kk, vv := range row {
				copied[kk] = vv
			}
			out[k] = copied
		}
	}
	return out, nil
}

// Put 改一条，其余原样保留。
func (s *JSONStore) Put(key string, value map[string]any) error {
	data, err := s.load()
	if err != nil {
		return err
	}
	rows, ok := data[s.Expand].(map[string]any)
	if !ok {
		rows = map[string]any{}
		data[s.Expand] = rows
	}
	copied := map[string]any{}
	for k, v := range value {
		copied[k] = v
	}
	rows[key] = copied
	return s.flush(data)
}

// Drop 删一条；本来就没有就什么都不做（不改变文件）。
func (s *JSONStore) Drop(key string) error {
	data, err := s.load()
	if err != nil {
		return err
	}
	rows, _ := data[s.Expand].(map[string]any)
	if rows == nil {
		return nil
	}
	if _, present := rows[key]; !present {
		return nil
	}
	delete(rows, key)
	return s.flush(data)
}

// Flush 把当前数据写回（顺序与格式由 DumpLedgerJSON 定）。
func (s *JSONStore) Flush(data map[string]any) error { return s.flush(data) }

func (s *JSONStore) flush(data map[string]any) error {
	if s.Prepare != nil {
		s.Prepare(data)
	}
	if err := WriteTextAtomic(s.Path, DumpLedgerJSON(data, s.Expand), true); err != nil {
		return err
	}
	s.data, s.loaded = data, true
	return nil
}

// EnsureFile 文件不存在就按 default 写一份；存在就一个字节都不动。返回「这次建了没有」。
func (s *JSONStore) EnsureFile() (bool, error) {
	if _, err := os.Stat(s.Path); err == nil {
		return false, nil
	}
	data := map[string]any{}
	for k, v := range s.Default {
		data[k] = v
	}
	if _, present := data["version"]; !present {
		data["version"] = core.FormatVersion
	}
	if err := WriteTextAtomic(s.Path, DumpLedgerJSON(data, s.Expand), true); err != nil {
		return false, err
	}
	s.data, s.loaded = data, true
	return true, nil
}
