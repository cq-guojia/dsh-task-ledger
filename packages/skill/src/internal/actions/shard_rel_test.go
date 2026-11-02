package actions

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// 名册里的 file 是分片的唯一入口（用户 2026-11-02）：
// 文件可以被手动改名，改完只要 file 跟着改，写入就该落进那一个文件 ——
// 拿 sha256(uuid) 重算会另建一份空分片，他自己那份记录永远写不进去。
func TestShardWriteFollowsIndexFileName(t *testing.T) {
	const tid = "20261102-1000-池里的活-cccc"
	repo, me := tempLedger(t, map[string]any{
		"tid": tid, "status": "open", "title": "池里的活", "created": "2026-11-02 10:00:00",
	})
	const oddName = "0000aaaabbbb.json"
	key := core.Normalize(me.UUID)

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
	record, ok := workers[key].(map[string]any)
	if !ok {
		t.Fatalf("名册里没有自己：%#v", workers)
	}
	record["file"] = oddName
	if err := jsonStore.Flush(data); err != nil {
		t.Fatal(err)
	}
	hashPath := filepath.Join(repo, core.ToRepoRel(core.ShardRel(me.UUID)))
	oddPath := filepath.Join(repo, core.ToRepoRel(core.OwnersDir+"/"+oddName))
	if err := os.Rename(hashPath, oddPath); err != nil {
		t.Fatal(err)
	}

	if _, err := Claim(repo, me, tid); err != nil {
		t.Fatalf("认领不该失败：%v", err)
	}
	if _, err := os.Stat(hashPath); !os.IsNotExist(err) {
		t.Errorf("不该按哈希另建分片：%s", hashPath)
	}
	task, ok, err := store.NewTaskStore(repo, core.OwnersDir+"/"+oddName, &me).Get(tid)
	if err != nil {
		t.Fatal(err)
	}
	if !ok || task == nil {
		t.Errorf("任务应该落进名册指向的那个分片：%s", oddName)
	}
}
