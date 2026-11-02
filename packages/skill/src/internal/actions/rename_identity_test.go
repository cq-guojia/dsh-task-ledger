package actions

import (
	"path/filepath"
	"testing"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/env"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

const renameUUID = "8d557c6d-7c93-43ac-8c73-5d623e82e1c6"

// seedOwner 往某本台账的名册里登记一个人（走真实索引格式：file / name / joined）。
func seedOwner(t *testing.T, repo, uuid, name string) {
	t.Helper()
	index := store.NewOwnersIndex(repo)
	data, err := index.Store.Data()
	if err != nil {
		t.Fatal(err)
	}
	workers, _ := data["workers"].(map[string]any)
	if workers == nil {
		workers = map[string]any{}
		data["workers"] = workers
	}
	workers[core.Normalize(uuid)] = map[string]any{
		"file":   filepath.Base(core.ShardRel(uuid)),
		"name":   name,
		"joined": "2026-01-01 00:00:00",
	}
	if err := index.Store.Flush(data); err != nil {
		t.Fatal(err)
	}
}

func TestRenameInOwnersOnlyTouchesName(t *testing.T) {
	root := ledgerRoot(t)
	seedOwner(t, root, renameUUID, "旧昵称")

	// uuid 大小写不同也要能对上（身份一律归一化后比较）
	changed, present, err := RenameInOwners(root, "8D557C6D-7C93-43AC-8C73-5D623E82E1C6", "新昵称")
	if err != nil {
		t.Fatal(err)
	}
	if !changed || !present {
		t.Fatalf("名册里有这个人，应该改成功（changed=%v present=%v）", changed, present)
	}

	record, present, err := store.NewOwnersIndex(root).Get(renameUUID)
	if err != nil || !present {
		t.Fatalf("改完应该还能读到这个人：%v", err)
	}
	if name, _ := record["name"].(string); name != "新昵称" {
		t.Fatalf("昵称没改成，实际 %q", name)
	}
	// file 是 uuid 的 hash、joined 是入册时间：改名绝不能让它们变，否则等于换了个人
	if file, _ := record["file"].(string); file != filepath.Base(core.ShardRel(renameUUID)) {
		t.Errorf("file 不该被改，实际 %q", file)
	}
	if joined, _ := record["joined"].(string); joined != "2026-01-01 00:00:00" {
		t.Errorf("joined 不该被改，实际 %q", joined)
	}
}

func TestRenameInOwnersSkipsUnknown(t *testing.T) {
	root := ledgerRoot(t)
	seedOwner(t, root, "11111111-1111-4111-8111-111111111111", "别人")

	changed, present, err := RenameInOwners(root, renameUUID, "新昵称")
	if err != nil {
		t.Fatal(err)
	}
	if changed || present {
		t.Fatalf("名册里没这个人，不该算改过（changed=%v present=%v）", changed, present)
	}
	if _, found, _ := store.NewOwnersIndex(root).Get(renameUUID); found {
		t.Fatal("不许凭空把人加进名册")
	}
}

func TestRenameInOwnersIsIdempotent(t *testing.T) {
	root := ledgerRoot(t)
	seedOwner(t, root, renameUUID, "同名字")
	changed, present, err := RenameInOwners(root, renameUUID, "同名字")
	if err != nil {
		t.Fatal(err)
	}
	if changed {
		t.Fatal("名字没变就不该写盘")
	}
	if !present {
		t.Fatal("人是在名册里的，只是名字相同 —— 要能和「没这个人」区分开")
	}
}

func TestRenameSelfWritesIdentityFile(t *testing.T) {
	withTempHome(t)
	if _, err := writeIdentity(core.Identity{UUID: renameUUID, Name: "旧昵称"}); err != nil {
		t.Fatal(err)
	}

	previous, uuid, err := RenameSelf("  新昵称  ")
	if err != nil {
		t.Fatal(err)
	}
	if previous != "旧昵称" {
		t.Fatalf("应该返回旧昵称，实际 %q", previous)
	}
	if uuid != renameUUID {
		t.Fatalf("uuid 不该变，实际 %q", uuid)
	}
	identity, ok, err := env.ReadIdentity()
	if err != nil || !ok {
		t.Fatalf("改名后应该还读得到身份：%v", err)
	}
	if identity.Name != "新昵称" {
		t.Fatalf("本机昵称没改（两端空格要 trim 掉），实际 %q", identity.Name)
	}
	if identity.UUID != renameUUID {
		t.Fatalf("uuid 被改坏了：%q", identity.UUID)
	}
}

func TestRenameSelfRejectsEmpty(t *testing.T) {
	withTempHome(t)
	if _, _, err := RenameSelf("   "); err == nil {
		t.Fatal("空昵称应该报错")
	}
}

func TestRenameSelfRejectsUninitialized(t *testing.T) {
	withTempHome(t)
	if _, _, err := RenameSelf("新昵称"); err == nil {
		t.Fatal("没身份时应报错，不能凭空建一个")
	}
}
