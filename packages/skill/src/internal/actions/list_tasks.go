package actions

import (
	"path/filepath"
	"sort"
	"strings"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// 只读：查在办任务（池 + 分片，后读到的为准）。不拿锁、不跑自举、不做取最新。
//
// 加载 + 筛选 + 派生值这一套口径 list 与 stats 共用（selectTasks），两边不许各写一份。

// checkQuery 校验查询条件并就地归一化：--owner 只收 uuid、--status 只认白名单。
func checkQuery(q *ListQuery) error {
	if q.Owner != nil {
		if q.Scope == "mine" || q.Scope == "pool" {
			return core.Failf("--owner 不能和 --mine / --pool 一起用：一次只按一种范围筛。")
		}
		owner, err := RequireUUID(*q.Owner, "--owner")
		if err != nil {
			return err
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
		return core.Failf("--status 只认 %s（收到 %s）。", strings.Join(core.Statuses, " / "), strings.Join(unknown, ", "))
	}
	return nil
}

// activeRows 池 + 分片合并后的全部在办任务，外加每条落在哪个文件、花名册（已读过盘）。
// 合并顺序定死：先池、再按索引键排序的各分片，同一任务号由分片那份胜出。
func activeRows(repo string) (map[string]map[string]any, map[string]string, *store.OwnersIndex, error) {
	rows := map[string]map[string]any{}
	where := map[string]string{}

	pool := store.NewTaskStore(repo, core.PoolRel, nil)
	poolAll, err := pool.All()
	if err != nil {
		return nil, nil, nil, err
	}
	for tid, task := range poolAll {
		rows[tid] = task
		where[tid] = pool.Path
	}

	index := store.NewOwnersIndex(repo)
	if err := index.AssertPresent(); err != nil {
		return nil, nil, nil, err
	}
	shards, err := index.Shards()
	if err != nil {
		return nil, nil, nil, err
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
			return nil, nil, nil, err
		}
		for tid, task := range all {
			rows[tid] = task
			where[tid] = s.Path
		}
	}
	return rows, where, index, nil
}

// selectTasks 合并 → 校验 → 筛选 → 打派生值。list / stats 共用的唯一一份口径。
// now 由调用方给一次：同一条命令里的每一行必须按同一个「现在」算年龄。
func selectTasks(repo string, me core.Identity, q ListQuery, now string) (map[string]map[string]any, map[string]string, error) {
	if err := checkQuery(&q); err != nil {
		return nil, nil, err
	}
	rows, where, index, err := activeRows(repo)
	if err != nil {
		return nil, nil, err
	}
	nameKeys := map[string]bool{}
	if q.OwnerName != nil {
		if nameKeys, err = index.KeysOfName(*q.OwnerName); err != nil {
			return nil, nil, err
		}
	}
	kept := map[string]map[string]any{}
	keptWhere := map[string]string{}
	for tid, task := range rows {
		if !InScope(task, q, me, nameKeys) {
			continue
		}
		task["mine"] = IsMine(task, me)
		ApplyAge(task, now, q)
		kept[tid] = task
		keptWhere[tid] = where[tid]
	}
	return kept, keptWhere, nil
}

// ListTasks 查在办任务：JSON 吐 rows（原样任务对象 + mine / 年龄派生值），人话吐表格。
func ListTasks(repo string, me core.Identity, q ListQuery) (*ListResult, error) {
	kept, where, err := selectTasks(repo, me, q, core.Now())
	if err != nil {
		return nil, err
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
			Stale:    boolOf(task["stale"]),
			Overdue:  boolOf(task["overdue"]),
			Backlog:  boolOf(task["backlog"]),
		})
	}
	return &ListResult{Rows: kept, Table: table}, nil
}
