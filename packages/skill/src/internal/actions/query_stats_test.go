package actions

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// stats / owners 是从已有底层能力上长出来的薄动作：合并、筛选与 list 完全一致
// （共用 selectTasks），owners 则是索引里登记过的全量（含当前没任务的人）。

const testUUID = "8d557c6d-7c93-43ac-8c73-5d623e82e1c6"

// tempLedger 建一个最小台账：索引里已登记 me，任务按 owner 落进池 / 分片。
func tempLedger(t *testing.T, tasks ...map[string]any) (string, core.Identity) {
	t.Helper()
	repo := t.TempDir()
	if err := os.MkdirAll(filepath.Join(repo, core.LedgerDir, core.OwnersDir), 0o777); err != nil {
		t.Fatal(err)
	}
	me := core.Identity{UUID: testUUID, Name: "GuoJia-Agent"}
	index := store.NewOwnersIndex(repo)
	if _, _, err := index.Ensure(me); err != nil {
		t.Fatal(err)
	}
	pool := store.NewTaskStore(repo, core.PoolRel, nil)
	if _, err := pool.EnsureFile(); err != nil {
		t.Fatal(err)
	}
	shard := store.NewTaskStore(repo, core.ShardRel(me.UUID), &me)
	if _, err := shard.EnsureFile(); err != nil {
		t.Fatal(err)
	}
	for _, task := range tasks {
		tid, _ := task["tid"].(string)
		delete(task, "tid")
		target := pool
		if ownerOf(task) != "" {
			target = shard
		}
		if err := target.Put(tid, task); err != nil {
			t.Fatal(err)
		}
	}
	return repo, me
}

func TestListAppliesAgeFields(t *testing.T) {
	repo, me := tempLedger(t,
		map[string]any{
			"tid": "20260917-0900-一直没人接-aaaa", "status": "open",
			"title": "老待认领", "created": ago(40),
		},
		map[string]any{
			"tid": "20261007-0900-做太久-bbbb", "status": "doing", "owner": testUUID,
			"title": "我的老任务", "created": ago(60), "started": ago(20), "updated": ago(5),
		},
	)
	res, err := ListTasks(repo, me, ListQuery{Scope: "all"})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Rows) != 2 {
		t.Fatalf("应有 2 条在办，实际 %d", len(res.Rows))
	}
	pool, poolOK := res.Rows["20260917-0900-一直没人接-aaaa"]
	if !poolOK {
		t.Fatal("池里那条没查到")
	}
	if !boolOf(pool["backlog"]) || pool["waiting_days"] != 40 {
		t.Errorf("池里那条应积压且已等 40 天，实际 backlog=%v waiting=%v", pool["backlog"], pool["waiting_days"])
	}
	if boolOf(pool["mine"]) {
		t.Error("池里那条没有 owner，不该算我的")
	}
	mine, mineOK := res.Rows["20261007-0900-做太久-bbbb"]
	if !mineOK {
		t.Fatal("分片里那条没查到")
	}
	if !boolOf(mine["mine"]) || !boolOf(mine["overdue"]) || !boolOf(mine["stale"]) {
		t.Errorf("我那条应 mine + 逾期 + 停滞，实际 %v / %v / %v", mine["mine"], mine["overdue"], mine["stale"])
	}
	for _, row := range res.Table {
		if row.Tid == "20261007-0900-做太久-bbbb" && (!row.Stale || !row.Overdue) {
			t.Error("人话表格那一行应带上停滞 / 逾期标记")
		}
	}
}

func TestStatsCountsActiveTasks(t *testing.T) {
	repo, me := tempLedger(t,
		map[string]any{"tid": "20260917-0900-甲-aaaa", "status": "open", "title": "积压的老池任务", "created": ago(45)},
		map[string]any{"tid": "20261020-0900-乙-bbbb", "status": "open", "title": "新的池任务", "created": ago(2)},
		map[string]any{
			"tid": "20261007-0900-丙-cccc", "status": "doing", "owner": testUUID,
			"title": "我的老任务", "created": ago(60), "started": ago(20), "updated": ago(5),
		},
		map[string]any{
			"tid": "20261025-0900-丁-dddd", "status": "doing", "owner": testUUID,
			"title": "我的新任务", "created": ago(3), "started": ago(3), "updated": ago(1),
		},
	)
	res, err := StatsTasks(repo, me, ListQuery{Scope: "all"})
	if err != nil {
		t.Fatal(err)
	}
	if res.Total != 4 || res.Open != 2 || res.Doing != 2 {
		t.Errorf("在办 4 = 待认领 2 + 进行中 2，实际 total=%d open=%d doing=%d", res.Total, res.Open, res.Doing)
	}
	if res.Mine != 2 || res.MyDoing != 2 {
		t.Errorf("我有两条且都在做，实际 mine=%d my_doing=%d", res.Mine, res.MyDoing)
	}
	if res.Stale != 1 || res.MyStale != 1 {
		t.Errorf("停滞只我那条老任务，实际 stale=%d my_stale=%d", res.Stale, res.MyStale)
	}
	if res.Overdue != 1 || res.MyOverdue != 1 {
		t.Errorf("逾期只我那条老任务，实际 overdue=%d my_overdue=%d", res.Overdue, res.MyOverdue)
	}
	if res.Backlog != 1 {
		t.Errorf("积压只那条 45 天的池任务，实际 %d", res.Backlog)
	}
	if res.OldestOpenDays == nil || *res.OldestOpenDays != 45 {
		t.Errorf("最老待认领应等了 45 天，实际 %v", res.OldestOpenDays)
	}
	if res.Thresholds["stale_days"] != DefaultStaleDays ||
		res.Thresholds["overdue_days"] != DefaultOverdueDays ||
		res.Thresholds["backlog_days"] != DefaultBacklogDays {
		t.Errorf("不传阈值应回显内置默认，实际 %v", res.Thresholds)
	}
}

func TestStatsThresholdOverride(t *testing.T) {
	repo, me := tempLedger(t,
		map[string]any{
			"tid": "20261007-0900-丙-cccc", "status": "doing", "owner": testUUID,
			"title": "我的老任务", "created": ago(60), "started": ago(20), "updated": ago(5),
		},
	)
	got, err := StatsTasks(repo, me, ListQuery{Scope: "all", StaleDays: intPtr(10), OverdueDays: intPtr(30)})
	if err != nil {
		t.Fatal(err)
	}
	if got.Stale != 0 || got.Overdue != 0 {
		t.Errorf("阈值放宽到 10 / 30 天后不该再算停滞 / 逾期，实际 stale=%d overdue=%d", got.Stale, got.Overdue)
	}
	if got.Thresholds["stale_days"] != 10 || got.Thresholds["overdue_days"] != 30 {
		t.Errorf("回显的阈值应是调用方给的值，实际 %v", got.Thresholds)
	}
	if got.Doing != 1 {
		t.Errorf("放宽阈值不改 counts 的范围，doing 应是 1，实际 %d", got.Doing)
	}
}

func TestStatsScopeFiltersLikeList(t *testing.T) {
	repo, me := tempLedger(t,
		map[string]any{"tid": "20261020-0900-甲-aaaa", "status": "open", "title": "池任务", "created": ago(2)},
		map[string]any{
			"tid": "20261025-0900-丁-dddd", "status": "doing", "owner": testUUID,
			"title": "我的新任务", "created": ago(3), "started": ago(3), "updated": ago(1),
		},
	)
	poolRes, err := StatsTasks(repo, me, ListQuery{Scope: "pool"})
	if err != nil {
		t.Fatal(err)
	}
	if poolRes.Total != 1 || poolRes.Open != 1 || poolRes.Mine != 0 {
		t.Errorf("--pool 只数公共池：total=%d open=%d mine=%d", poolRes.Total, poolRes.Open, poolRes.Mine)
	}
	mineRes, err := StatsTasks(repo, me, ListQuery{Scope: "mine"})
	if err != nil {
		t.Fatal(err)
	}
	if mineRes.Total != 1 || mineRes.Doing != 1 || mineRes.Mine != 1 {
		t.Errorf("--mine 只数我的：total=%d doing=%d mine=%d", mineRes.Total, mineRes.Doing, mineRes.Mine)
	}
}

func TestStatsEmptyLedgerIsZero(t *testing.T) {
	repo, me := tempLedger(t)
	res, err := StatsTasks(repo, me, ListQuery{Scope: "all"})
	if err != nil {
		t.Fatal(err)
	}
	if res.Total != 0 || res.Open != 0 || res.Doing != 0 {
		t.Errorf("空台账应全是 0，实际 %+v", res)
	}
	if res.OldestOpenDays != nil {
		t.Error("没有待认领时 oldest_open_days 应是 nil")
	}
}

func TestListOwnersIncludesEveryoneWithMine(t *testing.T) {
	repo, me := tempLedger(t,
		map[string]any{
			"tid": "20261025-0900-丁-dddd", "status": "doing", "owner": testUUID,
			"title": "我的新任务", "created": ago(3), "started": ago(3), "updated": ago(1),
		},
	)
	// 名册里再加一个没有任务的人（分片文件仍要存在：登记了却没分片是坏台账，
	// owners 与 list 一样拒绝回答，不许悄悄当空）
	other := core.Identity{UUID: "11111111-2222-4333-8444-555555555555", Name: "闲人"}
	index := store.NewOwnersIndex(repo)
	if _, _, err := index.Ensure(other); err != nil {
		t.Fatal(err)
	}
	if _, err := store.NewTaskStore(repo, core.ShardRel(other.UUID), &other).EnsureFile(); err != nil {
		t.Fatal(err)
	}
	res, err := ListOwners(repo, me)
	if err != nil {
		t.Fatal(err)
	}
	if res.Count != 2 {
		t.Fatalf("花名册应有两人（含没任务的），实际 %d", res.Count)
	}
	if record, ok := res.Owners[core.Normalize(testUUID)]; !ok {
		t.Error("花名册里应有本机身份")
	} else if !boolOf(record["mine"]) {
		t.Error("本机那条 mine 应为 true")
	}
	if record, ok := res.Owners["11111111-2222-4333-8444-555555555555"]; !ok {
		t.Error("花名册里应有没任务的闲人")
	} else if boolOf(record["mine"]) {
		t.Error("别人那条 mine 应为 false")
	}
	if _, ok := res.Owners[core.Normalize(testUUID)]["name"]; !ok {
		t.Error("花名册一条应带上 name（界面下拉要显示）")
	}
}
