package actions

import (
	"path/filepath"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// 开工前的自举：台账文件不存在就建，没登记过就把自己登记进去、建自己的分片。
// 这三份由外壳单独一个 Atom 包住，它自己不开事务、不拿锁、也不参与「提交说明 / where / 打印」。
//
// 分片必须排在登记之**前**：反过来硬崩会留下「索引里有我、磁盘上没有我的分片」，
// 此后所有人都在 AssertPresent 处报错，而 Ensure 看到记录已存在就零写，永不自愈。

// Bootstrap 写序：owners/ 目录 → 池 → 我的分片 → 索引（登记自己）。已登记 ⇒ 零写。
func Bootstrap(repo string, me core.Identity) (core.Identity, error) {
	root, err := core.AsRoot(repo, "工作区根")
	if err != nil {
		return me, err
	}
	if err := store.EnsureDir(filepath.Join(root, core.LedgerDir)); err != nil {
		return me, err
	}
	if err := store.EnsureDir(filepath.Join(root, core.ToRepoRel(core.OwnersDir))); err != nil {
		return me, err
	}
	pool := store.NewTaskStore(root, core.PoolRel, nil)
	if _, err := pool.EnsureFile(); err != nil {
		return me, err
	}
	mine := store.NewTaskStore(root, core.ShardRel(me.UUID), &me)
	if _, err := mine.EnsureFile(); err != nil {
		return me, err
	}
	index := store.NewOwnersIndex(root)
	if _, _, err := index.Ensure(me); err != nil {
		return me, err
	}
	return me, nil
}
