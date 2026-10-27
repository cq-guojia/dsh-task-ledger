package actions

import (
	"path/filepath"
	"sort"
	"strings"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// 只读：查在办任务（池 + 分片，后读到的为准）。不拿锁、不跑自举、不做取最新。

// ListTasks 合并顺序定死：先池、再按索引键排序的各分片，同一任务号由分片那份胜出。
func ListTasks(repo string, me core.Identity, q ListQuery) (*ListResult, error) {
	if q.Owner != nil {
		if q.Scope == "mine" || q.Scope == "pool" {
			return nil, core.Failf("--owner 不能和 --mine / --pool 一起用：一次只按一种范围筛。")
		}
		owner, err := RequireUUID(*q.Owner, "--owner")
		if err != nil {
			return nil, err
		}
		q.Owner = &owner
	}
	var unknown []string
	for _, s := range q.Statuses {
		ok := false
		for _, valid := range core.Statuses {
			if s == valid {
				ok = true
				break
			}
		}
		if !ok {
			unknown = append(unknown, s)
		}
	}
	if len(unknown) > 0 {
		return nil, core.Failf("--status 只认 %s（收到 %s）。", strings.Join(core.Statuses, " / "), strings.Join(unknown, ", "))
	}

	rows := map[string]map[string]any{}
	where := map[string]string{}

	pool := store.NewTaskStore(repo, core.PoolRel, nil)
	poolAll, err := pool.All()
	if err != nil {
		return nil, err
	}
	for tid, task := range poolAll {
		rows[tid] = task
		where[tid] = pool.Path
	}

	index := store.NewOwnersIndex(repo)
	if err := index.AssertPresent(); err != nil {
		return nil, err
	}
	shards, err := index.Shards()
	if err != nil {
		return nil, err
	}
	keys := make([]string, 0, len(shards))
	for k := range shards {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, key := range keys {
		path := shards[key]
		rel, relErr := filepath.Rel(filepath.Join(repo, core.LedgerDir), path)
		if relErr != nil {
			continue
		}
		s := store.NewTaskStore(repo, filepath.ToSlash(rel), nil)
		all, err := s.All()
		if err != nil {
			return nil, err
		}
		for tid, task := range all {
			rows[tid] = task
			where[tid] = s.Path
		}
	}

	nameKeys := map[string]bool{}
	if q.OwnerName != nil {
		if nameKeys, err = index.KeysOfName(*q.OwnerName); err != nil {
			return nil, err
		}
	}

	kept := map[string]map[string]any{}
	for tid, task := range rows {
		if InScope(task, q, me, nameKeys) {
			task["mine"] = IsMine(task, me)
			kept[tid] = task
		}
	}

	tids := make([]string, 0, len(kept))
	for tid := range kept {
		tids = append(tids, tid)
	}
	sort.SliceStable(tids, func(i, j int) bool {
		a, _ := kept[tids[i]]["created"].(string)
		b, _ := kept[tids[j]]["created"].(string)
		return a < b
	})

	table := make([]TaskRow, 0, len(tids))
	for _, tid := range tids {
		task := kept[tid]
		title, _ := task["title"].(string)
		ownerName, _ := task["owner_name"].(string)
		owner := ownerName
		if owner == "" {
			owner = ownerOf(task)
		}
		table = append(table, TaskRow{
			Tid:      tid,
			Title:    title,
			Status:   statusOf(task),
			Owner:    StrOrNil(owner),
			Created:  strPtrOf(task["created"]),
			Started:  strPtrOf(task["started"]),
			Category: strPtrOf(task["category"]),
			Tags:     store.StrSliceOf(task["tags"]),
			Where:    StrOrNil(Rel(repo, where[tid])),
		})
	}
	return &ListResult{Rows: kept, Table: table}, nil
}
