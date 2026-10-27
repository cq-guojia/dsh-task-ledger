package actions

import (
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// 只读：花名册全量（owners.json 索引里登记过的每一个人，**含当前没有任务的人**）。
// 底层 OwnersIndex.All() 本来就有，这里只是把它开成命令 —— 不重写、不加判定。
//
// 每条额外给一个 mine（是不是本机身份），与 list 的行同一个口径：归属只比 uuid。

func ListOwners(repo string, me core.Identity) (*OwnersResult, error) {
	index := store.NewOwnersIndex(repo)
	// 与 list 同一个前置判据：索引被人删了、owners/ 下却还有分片时，
	// 回答「花名册空的」会把「索引坏了」说成「没人」，两条命令给出互相矛盾的结论
	if err := index.AssertPresent(); err != nil {
		return nil, err
	}
	all, err := index.All()
	if err != nil {
		return nil, err
	}
	meKey := core.Normalize(me.UUID)
	for key, record := range all {
		record["mine"] = key == meKey
	}
	return &OwnersResult{Count: len(all), Owners: all}, nil
}
