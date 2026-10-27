package actions

import (
	"github.com/cq-guojia/dsh-task-ledger/skill/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/internal/store"
)

// 改归属 / 改标签的入口：决定走哪个动作，自己不加锁、不改任何文件。
// 状态只随命令语义变（认领 → doing、释放 → open、结案 → 历史），没有单独的「改状态」入口；
// 也**没有改分类的入口**（分类在 new 时定死）。

const mixedHint = "--tags 与 --release / --owner 不能同给：一个改标签，一个改归属。"

// SetParams set 的入参。Owner / Release / Tags 三选一。
type SetParams struct {
	Owner   *string
	Release bool
	Tags    []string
}

// SetTask 路由：--release = 释放；别人的 uuid = 交接；自己的 uuid = 已认领则空转、没认领先认领；
// --tags = 改标签。
func SetTask(repo string, me core.Identity, tid string, p SetParams) (*Result, error) {
	hasTags := len(p.Tags) > 0
	if p.Release {
		if p.Owner != nil {
			return nil, core.Failf("--release 与 --owner 不能同时给：释放不带人，交接不带释放。")
		}
		if hasTags {
			return nil, core.Failf("%s", mixedHint)
		}
		return Release(repo, me, tid)
	}
	if p.Owner != nil {
		if hasTags {
			return nil, core.Failf("%s", mixedHint)
		}
	} else {
		if hasTags {
			return Relabel(repo, me, tid, p.Tags)
		}
		return nil, core.Failf("set 必须给一样：`--release`（释放回公共池）/ `--owner <对方 uuid>`（交接）/ `--tags <a、b>`（改标签）。")
	}
	// 交接目标只收 uuid
	target, err := RequireUUID(*p.Owner, "--owner")
	if err != nil {
		return nil, err
	}
	if !core.IsMe(me, target) {
		return Handoff(repo, me, tid, target)
	}
	mine := store.NewTaskStore(repo, core.ShardRel(me.UUID), &me)
	if task, ok, err := mine.Get(tid); err != nil {
		return nil, err
	} else if ok && task != nil {
		return &Result{
			AlreadyDone: true,
			Where:       StrOrNil(Rel(repo, mine.Path)),
			Notices:     []string{"任务 " + tid + " 已经在你名下，无需操作。"},
		}, nil
	}
	return Claim(repo, me, tid)
}
