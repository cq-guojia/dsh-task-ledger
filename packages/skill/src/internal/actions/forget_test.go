package actions

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// forget：空分片的人摘得掉（索引行 + 分片文件都消失）；还领着任务的人整条不删，只回 removed=false。

const forgetOther = "33333333-4444-5555-6666-777777777777"

func forgetFixture(t *testing.T) (string, core.Identity, core.Identity) {
	t.Helper()
	repo, me := tempLedger(t)
	index := store.NewOwnersIndex(repo)
	other := core.Identity{UUID: forgetOther, Name: "对方"}
	if _, _, err := index.Ensure(other); err != nil {
		t.Fatal(err)
	}
	shard := store.NewTaskStore(repo, core.ShardRel(other.UUID), &other)
	if _, err := shard.EnsureFile(); err != nil {
		t.Fatal(err)
	}
	return repo, me, other
}

func TestForgetOwnerRemovesEmptyShard(t *testing.T) {
	repo, me, other := forgetFixture(t)

	res, err := ForgetOwner(repo, me, other.UUID)
	if err != nil {
		t.Fatalf("摘掉空分片的人应成功：%v", err)
	}
	if res.Payload["removed"] != true {
		t.Errorf("应报告 removed=true：%#v", res.Payload)
	}
	all, err := store.NewOwnersIndex(repo).All()
	if err != nil {
		t.Fatal(err)
	}
	if _, present := all[core.Normalize(other.UUID)]; present {
		t.Error("名册里不该还有这个人")
	}
	path := filepath.Join(repo, core.ToRepoRel(core.ShardRel(other.UUID)))
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Errorf("分片文件应该被删掉：%s", path)
	}
}

// 名册里的 file 名与 sha256(uuid) 对不上的老台账：删的必须是索引登记的那个文件。
// 曾经拿 ShardRel 重算路径，os.Remove 报 ENOENT 被当成「本来就没有」放过 ⇒
// owners.json 里人没了、分片还躺在 owners/ 下（用户 2026-11-02 实测到的现象）。
func TestForgetOwnerFollowsIndexFileName(t *testing.T) {
	repo, me := tempLedger(t)
	uuid := "88888888-9999-aaaa-bbbb-cccccccccccc"
	key := core.Normalize(uuid)
	const oddFile = "0000aaaabbbb.json"
	jsonStore := store.NewJSONStore(
		filepath.Join(repo, core.ToRepoRel(core.OwnersRel)),
		"workers",
		map[string]any{"version": "", "workers": map[string]any{}},
	)
	data, err := jsonStore.Data()
	if err != nil {
		t.Fatal(err)
	}
	workers, ok := data["workers"].(map[string]any)
	if !ok {
		t.Fatalf("名册形状不对：%#v", data)
	}
	workers[key] = map[string]any{"file": oddFile, "name": "老台账", "joined": "2026-11-02 10:00:00"}
	if err := jsonStore.Flush(data); err != nil {
		t.Fatal(err)
	}
	rel := core.OwnersDir + "/" + oddFile
	if _, err := store.NewTaskStore(repo, rel, &core.Identity{UUID: uuid}).EnsureFile(); err != nil {
		t.Fatal(err)
	}

	res, err := ForgetOwner(repo, me, uuid)
	if err != nil {
		t.Fatalf("摘掉空分片的人应成功：%v", err)
	}
	if res.Payload["removed"] != true {
		t.Fatalf("应报告 removed=true：%#v", res.Payload)
	}
	if _, err := os.Stat(filepath.Join(repo, core.ToRepoRel(rel))); !os.IsNotExist(err) {
		t.Errorf("索引登记的分片应该被删掉：%s", rel)
	}
}

func TestForgetOwnerKeepsShardWithTasks(t *testing.T) {
	repo, me, other := forgetFixture(t)
	shard := store.NewTaskStore(repo, core.ShardRel(other.UUID), &other)
	if err := shard.Put("20261102-1000-还领着任务-aaaa", map[string]any{
		"status":  "doing",
		"owner":   other.UUID,
		"title":   "还领着任务",
		"created": "2026-11-02 10:00:00",
	}); err != nil {
		t.Fatal(err)
	}

	res, err := ForgetOwner(repo, me, other.UUID)
	if err != nil {
		t.Fatalf("有任务时不该报错（只是不删）：%v", err)
	}
	if res.Payload["removed"] != false {
		t.Errorf("应报告 removed=false：%#v", res.Payload)
	}
	if res.Payload["tasks"] != 1 {
		t.Errorf("应回任务数 1：%#v", res.Payload)
	}
	all, err := store.NewOwnersIndex(repo).All()
	if err != nil {
		t.Fatal(err)
	}
	if _, present := all[core.Normalize(other.UUID)]; !present {
		t.Error("还有任务的人不该从名册里摘掉")
	}
}
