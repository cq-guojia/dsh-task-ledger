package actions

import (
	"path/filepath"
	"strings"

	"github.com/cq-guojia/dsh-task-ledger/skill/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/internal/store"
)

// 业务校验的共用件。owner / status 的读取只走这里，别处不许裸写字段名比较。

// CurrentIdentity 本机身份（不写盘、不登记）。
func CurrentIdentity(repo string) (core.Identity, error) {
	return envCurrent(repo)
}

// RequireUUID 身份参数只收 UUID：名字 / 邮箱当场报错。
func RequireUUID(value, field string) (string, error) {
	text := core.Normalize(value)
	if !core.LooksLikeUUID(text) {
		return "", core.Failf("%s 只收身份 uuid（形如 00000000-0000-4000-8000-000000000000），不接受名字 / 邮箱：%s\n  按显示名模糊筛请用 --owner-name <片段>；不知道对方 uuid 就先跑 list --json 看，或让本人跑 list --mine。", field, strings.TrimSpace(value))
	}
	return text, nil
}

// RequireTask 取一条任务；缺失时给可读原因（带所在文件）。
func RequireTask(tasks map[string]map[string]any, tid, where string) (map[string]any, error) {
	task, ok := tasks[tid]
	if !ok {
		return nil, core.Failf("任务 %s 不在 %s 里。", tid, filepath.Base(where))
	}
	return task, nil
}

// RequireOwner 只有当前 owner 能改。
func RequireOwner(task map[string]any, tid string, me core.Identity) error {
	owner := ownerOf(task)
	if owner == "" {
		return core.Failf("任务 %s 还没有人认领（在公共池里），先 claim 再改。", tid)
	}
	if !core.IsMe(me, owner) {
		return core.Failf("任务 %s 的负责人是 %s，不是你（%s）。", tid, owner, me.Label())
	}
	return nil
}

// OwnerOf 读 owner 的唯一入口。
func ownerOf(task map[string]any) string {
	if value, ok := task["owner"].(string); ok && strings.TrimSpace(value) != "" {
		return core.Normalize(value)
	}
	return ""
}

// StatusOf 读 status 的唯一入口。
func statusOf(task map[string]any) string {
	value, ok := task["status"].(string)
	if !ok || strings.TrimSpace(value) == "" {
		return "open"
	}
	return strings.ToLower(strings.TrimSpace(value))
}

// IsMine 这条任务是不是我的（只比 uuid）。
func IsMine(task map[string]any, me core.Identity) bool {
	return core.IsMe(me, ownerOf(task))
}

// SameTaskIgnoringStamp 两份内容是不是只差 updated（交接重跑时以对方那份为准的判据）。
func SameTaskIgnoringStamp(a, b map[string]any) bool {
	left := without(a, "updated", "updated_by")
	right := without(b, "updated", "updated_by")
	if len(left) != len(right) {
		return false
	}
	for k, v := range left {
		if w, ok := right[k]; !ok || !looseEqual(v, w) {
			return false
		}
	}
	return true
}

func without(m map[string]any, keys ...string) map[string]any {
	out := make(map[string]any, len(m))
	for k, v := range m {
		skip := false
		for _, key := range keys {
			if k == key {
				skip = true
				break
			}
		}
		if !skip {
			out[k] = v
		}
	}
	return out
}

func looseEqual(a, b any) bool {
	return store.DumpJSON(a) == store.DumpJSON(b)
}

// InScope list 的过滤谓词：范围、状态、分类、标签、创建时间闭区间。
// nameKeys 是 --owner-name 先在名册里模糊匹配出来的 uuid 集合：名字只用来缩小集合，判定仍按 uuid。
func InScope(task map[string]any, q ListQuery, me core.Identity, nameKeys map[string]bool) bool {
	switch q.Scope {
	case "mine":
		if !IsMine(task, me) {
			return false
		}
	case "pool":
		if ownerOf(task) != "" {
			return false
		}
	case "owner":
		if q.Owner != nil && core.Normalize(*q.Owner) != ownerOf(task) {
			return false
		}
	}
	if q.OwnerName != nil && !nameKeys[ownerOf(task)] {
		return false
	}
	if len(q.Statuses) > 0 {
		ok := false
		for _, s := range q.Statuses {
			if statusOf(task) == s {
				ok = true
				break
			}
		}
		if !ok {
			return false
		}
	}
	if q.Category != nil {
		if value, _ := task["category"].(string); value != *q.Category {
			return false
		}
	}
	if q.Tag != nil {
		found := false
		for _, t := range store.StrSliceOf(task["tags"]) {
			if t == *q.Tag {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	created, isStr := task["created"].(string)
	if isStr && len(created) >= 19 {
		head := created[:19]
		if q.Since != nil && len(*q.Since) >= 19 && head < (*q.Since)[:19] {
			return false
		}
		if q.Until != nil && len(*q.Until) >= 19 && head > (*q.Until)[:19] {
			return false
		}
	}
	return true
}

// LoadTask 在池 + 索引登记的全部分片里找这条任务（只读），返回 (任务, 出现过的文件)。
func LoadTask(repo, tid string) (map[string]any, []string, error) {
	index := store.NewOwnersIndex(repo)
	if err := index.AssertPresent(); err != nil {
		return nil, nil, err
	}
	pool := store.NewTaskStore(repo, core.PoolRel, nil)
	var found map[string]any
	var where []string
	if task, ok, err := pool.Get(tid); err != nil {
		return nil, nil, err
	} else if ok && task != nil {
		found = task
		where = append(where, pool.Path)
	}
	shards, err := index.Shards()
	if err != nil {
		return nil, nil, err
	}
	for _, path := range shards {
		rel, relErr := filepath.Rel(filepath.Join(repo, core.LedgerDir), path)
		if relErr != nil {
			continue
		}
		s := store.NewTaskStore(repo, filepath.ToSlash(rel), nil)
		task, ok, err := s.Get(tid)
		if err != nil {
			return nil, nil, err
		}
		if ok && task != nil {
			where = append(where, s.Path)
			if found == nil {
				found = task
			}
		}
	}
	if found == nil {
		return nil, nil, core.Failf("找不到任务 %s（池与已登记的分片里都没有）。", tid)
	}
	return found, where, nil
}
