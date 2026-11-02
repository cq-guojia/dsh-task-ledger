package actions

import (
	"os"
	"path/filepath"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/env"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// ForgetOwnerParams 从这本台账的名册里摘掉一个人。
// 只删这个台账的名册行与分片：别人的台账、历史记录、其他机器上的同名身份一概不管。
// 分片里还有任务 ⇒ **整条不删**（删了名册行会让这些任务变成无主孤儿），返回 removed=false 与任务数。
// 删的是本机身份 ⇒ 同时清掉本机身份文件（这台机器回到「没有身份」）。
func ForgetOwner(repo string, me core.Identity, uuid string) (*Result, error) {
	key := core.Normalize(uuid)
	if key == "" {
		return nil, core.Failf("forget 缺少 --id（要摘掉的身份 uuid）")
	}
	index := store.NewOwnersIndex(repo)
	if err := index.AssertPresent(); err != nil {
		return nil, err
	}
	all, err := index.All()
	if err != nil {
		return nil, err
	}
	record, present := all[key]
	if !present {
		return nil, core.Failf("这本台账的名册里没有该身份：%s\n  处理：名册（owners.json）里没有就是没登记过，不用删。", key)
	}
	name, _ := record["name"].(string)
	// 分片路径以名册里的 file 为准，不拿 uuid 重算（否则删的是个不存在的路径）
	rel := ShardRelOf(repo, key)
	tasks, err := store.NewTaskStore(repo, rel, nil).All()
	if err != nil {
		return nil, err
	}
	if len(tasks) > 0 {
		return &Result{
			AlreadyDone: true,
			Payload: map[string]any{
				"removed": false,
				"name":    name,
				"tasks":   len(tasks),
				"reason":  "还有任务",
			},
		}, nil
	}
	if err := index.Remove(key); err != nil {
		return nil, err
	}
	if err := os.Remove(filepath.Join(repo, core.ToRepoRel(rel))); err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	cleared := false
	if core.Normalize(me.UUID) == key {
		path, err := env.IdentityFile()
		if err == nil {
			cleared = os.Remove(path) == nil
		}
	}
	message := "chore(ledger): 名册移除 @" + name
	where := rel
	return &Result{
		Changed: []string{"owners"},
		Where:   &where,
		Message: &message,
		Payload: map[string]any{
			"removed": true,
			"name":    name,
			"tasks":   0,
			"self":    cleared,
		},
	}, nil
}
