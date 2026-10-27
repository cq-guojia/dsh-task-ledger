package shell

import (
	"encoding/json"
	"io"
	"reflect"
	"sort"
	"strings"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// 合并语义：push 被拒后 rebase 撞上的**台账冲突**怎么解。
//
// 只认台账自己的文件：pool.json / 分片 / owners.json 按**任务号**三路合并，
// worklog/ 与 history/ 是追加式正文，两边各加的内容并在一起。业务代码一个字都不碰。
//
// rebase 的 stage 语义与字面直觉相反（实测确认）：:1 共同祖先、:2 上游（别人的）、
// :3 本机正在重放的那个提交。本文档的 ours 一律指 :2、theirs 指 :3，与 git
// 自己在 rebase 里的叫法一致 —— 标反了会让人照着冲突标记把别人的版本留下来。

var expandKeys = []string{"tasks", "workers"}

// loadLedgerJSON 空文本算空表；不是合法 JSON 对象算读不了（ok=false）。
func loadLedgerJSON(text string) (map[string]any, bool) {
	if strings.TrimSpace(text) == "" {
		return map[string]any{}, true
	}
	dec := json.NewDecoder(strings.NewReader(text))
	dec.UseNumber()
	var data any
	if err := dec.Decode(&data); err != nil {
		return nil, false
	}
	var tail any
	if err := dec.Decode(&tail); err != io.EOF {
		return nil, false
	}
	obj, isObj := data.(map[string]any)
	return obj, isObj
}

func rowsOf(data map[string]any, key string) map[string]any {
	if data == nil {
		return map[string]any{}
	}
	rows, ok := data[key].(map[string]any)
	if !ok {
		return map[string]any{}
	}
	return rows
}

// IsLedgerJSON 是不是按条目合并的 JSON 台账（pool.json / 分片 / owners.json）。
func IsLedgerJSON(rel string) bool {
	r := core.ToLedgerRel(rel)
	if r == core.PoolRel || r == core.OwnersRel {
		return true
	}
	return strings.HasPrefix(r, core.OwnersDir+"/") && strings.HasSuffix(r, ".json")
}

// IsAppendOnly 是不是追加式正文（过程文档 / 历史）：只加行，不改写别人的行。
func IsAppendOnly(rel string) bool {
	r := core.ToLedgerRel(rel)
	return strings.HasPrefix(r, core.WorklogDir+"/") || strings.HasPrefix(r, core.HistoryDir+"/")
}

// Owns 这份冲突文件归不归脚本管（业务文件一个字都不碰）。
func Owns(rel string) bool { return IsLedgerJSON(rel) || IsAppendOnly(rel) }

// expandKeyOf 这份 JSON 台账按哪个字段做条目级合并。
func expandKeyOf(rel string) string {
	if core.ToLedgerRel(rel) == core.OwnersRel {
		return "workers"
	}
	return "tasks"
}

// sameValue 两个 JSON 值是否相等（None 与「不存在」由调用方 deal）。
func sameValue(a, b any) bool { return reflect.DeepEqual(a, b) }

// MergeTaskDicts 按任务号做三方合并；返回 (合并结果, 两边都改过的任务号)。
//
// 合并单位是「任务」不是文本行 —— 行级合并只认相邻上下文：不同任务各自新增 /
// 结案挤在文件末尾就会撞，而同一任务两边都改时它也判不出该留谁。按 id 对账后，
// 只有一边动过的直接采纳，两边都动过的列进冲突，一个都不静默丢。
func MergeTaskDicts(base, ours, theirs string) (map[string]any, []string) {
	b, okb := loadLedgerJSON(base)
	o, oko := loadLedgerJSON(ours)
	t, okt := loadLedgerJSON(theirs)
	if !okb || !oko || !okt {
		return map[string]any{}, []string{"台账冲突无法自动合并：有一方不是合法 JSON，需要人工处理。"}
	}
	merged := make(map[string]any, len(o))
	for k, v := range o {
		merged[k] = v
	}
	for key, value := range t {
		cur, present := o[key]
		if !present {
			merged[key] = value
		} else if !sameValue(cur, value) && !hasStr(expandKeys, key) {
			merged[key] = value // 非任务区（version / identity）以本机那份为准
		}
	}
	conflicts := []string{}
	for _, expand := range expandKeys {
		if _, inB := b[expand]; !inB {
			if _, inO := o[expand]; !inO {
				if _, inT := t[expand]; !inT {
					continue // 这份文件没有这个区（pool.json 没有 workers、分片没有 tasks）
				}
			}
		}
		baseRows, ourRows, theirRows := rowsOf(b, expand), rowsOf(o, expand), rowsOf(t, expand)
		rows := map[string]any{}
		for _, tid := range unionKeys(baseRows, ourRows, theirRows) {
			was, wasHas := baseRows[tid]
			up, upHas := ourRows[tid]
			loc, locHas := theirRows[tid]
			switch {
			case pairEqual(up, upHas, loc, locHas):
				if upHas {
					rows[tid] = up
				}
			case pairEqual(up, upHas, was, wasHas):
				if locHas {
					rows[tid] = loc
				}
			case pairEqual(loc, locHas, was, wasHas):
				// 只有上游动过：上游删了就真删掉。留一行 "<tid>": null 会永久累积，
				// 读侧还会因 null 崩掉或整区降级。
				if upHas {
					rows[tid] = up
				}
			default:
				conflicts = append(conflicts, tid)
				if upHas {
					rows[tid] = up
				} else {
					rows[tid] = loc
				}
			}
		}
		merged[expand] = rows
	}
	return merged, conflicts
}

func pairEqual(a any, aHas bool, b any, bHas bool) bool {
	if aHas != bHas {
		return false
	}
	if !aHas {
		return true
	}
	return sameValue(a, b)
}

func unionKeys(maps ...map[string]any) []string {
	seen := map[string]bool{}
	var out []string
	for _, m := range maps {
		for k := range m {
			if !seen[k] {
				seen[k] = true
				out = append(out, k)
			}
		}
	}
	sort.Strings(out)
	return out
}

func hasStr(list []string, want string) bool {
	for _, item := range list {
		if item == want {
			return true
		}
	}
	return false
}

// splitAnyLines 按行切分：\r\n 归并、末尾空行不计。
func splitAnyLines(text string) []string {
	if text == "" {
		return nil
	}
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines
}

// UnionMerge 追加式正文的三路合并：两边各自新增的行都要在，不凭行号猜。
//
// 过程文档 / 历史只追加不改写，所以「合并」= 本机那份 + 上游相对共同祖先新增的行
// （本机已有同样的行就不再重复）。任一侧为空也照常合。
func UnionMerge(base, ours, theirs string) string {
	baseLines := map[string]bool{}
	for _, line := range splitAnyLines(base) {
		baseLines[line] = true
	}
	have := map[string]bool{}
	for _, line := range splitAnyLines(theirs) {
		have[line] = true
	}
	var added []string
	for _, line := range splitAnyLines(ours) {
		if !baseLines[line] && !have[line] {
			added = append(added, line)
		}
	}
	if len(added) == 0 {
		return theirs
	}
	head := theirs
	if !strings.HasSuffix(theirs, "\n") && theirs != "" {
		head = theirs + "\n"
	}
	return head + strings.Join(added, "\n") + "\n"
}

// ConflictMarked 接管一份 JSON 台账冲突：算出「一条一行 + 冲突标记」的新全文。
// 返回 (文件新文本, 两边都改过的任务号, 认不认这份文件)。
func ConflictMarked(rel, base, ours, theirs string) (string, []string, bool) {
	if !IsLedgerJSON(rel) {
		return "", nil, false
	}
	data, conflicts := MergeTaskDicts(base, ours, theirs)
	if len(data) == 0 {
		return "", nil, false
	}
	key := expandKeyOf(rel)
	if len(conflicts) == 0 {
		return store.DumpLedgerJSON(data, key), []string{}, true
	}
	theirsObj, okT := loadLedgerJSON(theirs)
	if !okT {
		theirsObj = map[string]any{}
	}
	oursObj, okO := loadLedgerJSON(ours)
	if !okO {
		oursObj = map[string]any{}
	}
	return markedText(theirsObj, key, data, conflicts, oursObj, theirsObj), conflicts, true
}

// markedText 按「一条一行」渲染整份台账；两边都改过的条目用冲突标记包起来。
//
// full 是本机那一侧的整份结构（version / identity / tasks），除 key 之外
// 原样保留 —— 分片里的 identity 丢了就没法自证。
func markedText(full map[string]any, key string, merged map[string]any, conflicts []string, upstream, local map[string]any) string {
	var rows []string
	fields := make([]string, 0, len(full))
	for field := range full {
		fields = append(fields, field)
	}
	sort.Strings(fields)
	for _, field := range fields {
		if field != key {
			rows = append(rows, "  "+store.QuoteJSON(field)+": "+store.DumpJSON(full[field]))
			continue
		}
		var inner []string
		mergedRows := rowsOf(merged, key)
		identities := make([]string, 0, len(mergedRows))
		for ident := range mergedRows {
			identities = append(identities, ident)
		}
		sort.Strings(identities)
		for _, ident := range identities {
			label := store.QuoteJSON(ident)
			if !hasStr(conflicts, ident) {
				inner = append(inner, "    "+label+": "+store.DumpJSON(mergedRows[ident]))
				continue
			}
			leftRow, leftHas := rowsOf(upstream, key)[ident]
			left := "(远端已删除)"
			if leftHas {
				left = store.DumpJSON(leftRow)
			}
			rightRow, rightHas := rowsOf(local, key)[ident]
			right := "(本地已删除)"
			if rightHas {
				right = store.DumpJSON(rightRow)
			}
			inner = append(inner,
				"<<<<<<< 远端\n    "+label+": "+left+"\n=======\n"+
					"    "+label+": "+right+"\n>>>>>>> 本地")
		}
		block := ""
		if len(inner) > 0 {
			block = strings.Join(inner, ",\n") + "\n"
		}
		rows = append(rows, `  "`+key+`": {`+"\n"+block+"  }")
	}
	return "{\n" + strings.Join(rows, ",\n") + "\n}\n"
}

// ResolveLedgerConflict 把合并结果写回冲突文件（不进记账本），写完由 git rebase --continue 提交。
func ResolveLedgerConflict(path, text string) bool {
	if text == "" {
		return false
	}
	return store.WriteTextAtomic(path, text, false) == nil
}

// RenderConflictText 人话冲突说明：**返回文本，不打印**（打印归 render.go）。
func RenderConflictText(rel, base, ours, theirs string) string {
	if !Owns(rel) {
		return rel + "：不是台账文件，脚本不代劳，请人工处理。"
	}
	if IsAppendOnly(rel) {
		return rel + "：两边都追加过，已并成一份（追加式正文，一行没丢）。"
	}
	data, conflicts := MergeTaskDicts(base, ours, theirs)
	if len(data) == 0 {
		return rel + "：有一方不是合法 JSON，无法自动合并，请人工处理。"
	}
	if len(conflicts) == 0 {
		return rel + "：冲突已按任务号自动合并，无需人工处理。"
	}
	lines := []string{
		rel + "：这些任务被两边同时改过，已按任务逐个标出冲突" +
			"（标记里左边是远端、右边是本机），没有替你选任何一个：",
	}
	for _, tid := range conflicts {
		lines = append(lines, "  - "+tid)
	}
	lines = append(lines,
		"  处理：编辑该文件保留你要的版本 → git add → git rebase --continue；",
		"  不想合就 git rebase --abort 回到写之前。你的台账改动已提交在本地，不会丢。")
	return strings.Join(lines, "\n")
}
