package store

import (
	"path/filepath"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
)

// 任务表：公共池 pool.json 与某人的分片 owners/<hash>.json —— **同一个类，只是路径不同**。
// identity 只用于**写盘格式**（分片顶部的可选 identity 字段），不参与任何判断。

// TaskStore 一份任务表。
type TaskStore struct{ *JSONStore }

// NewTaskStore 造一个任务表；identity 非空时写盘带上分片顶部的 identity（只存 uuid）。
func NewTaskStore(repo, rel string, identity *core.Identity) *TaskStore {
	s := NewJSONStore(
		filepath.Join(repo, core.ToRepoRel(rel)),
		"tasks",
		map[string]any{"version": "", "tasks": map[string]any{}},
	)
	if identity != nil {
		uuid := identity.UUID
		s.Prepare = func(data map[string]any) {
			data["identity"] = map[string]any{"uuid": uuid}
		}
	}
	return &TaskStore{JSONStore: s}
}
