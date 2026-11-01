package actions

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/env"
)

// 台账目录清单是机器级、跨看板共享的辅助数据：能自愈（失效就清）、能幂等（重复登记无副作用）、
// 坏文件不丢内容。

func withTempHome(t *testing.T) {
	t.Helper()
	t.Setenv(env.IdentityHomeEnv, t.TempDir())
}

func ledgerRoot(t *testing.T) string {
	t.Helper()
	root := filepath.Join(t.TempDir(), "proj")
	if err := os.MkdirAll(filepath.Join(root, core.LedgerDir), 0o777); err != nil {
		t.Fatal(err)
	}
	return core.AbsDir(root)
}

func TestAddDirRegistersOnlyOnce(t *testing.T) {
	withTempHome(t)
	root := ledgerRoot(t)
	if _, err := AddDir(root, "第一个名字"); err != nil {
		t.Fatal(err)
	}
	// 第二次带别的名字：已存在 ⇒ 计数不变、名字不被覆盖（否则每次进看板都会冲掉用户的取名）
	res, err := AddDir(root, "第二个名字")
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Dirs) != 1 {
		t.Fatalf("同一目录只该有一条，实际 %d 条", len(res.Dirs))
	}
	if res.Dirs[0].Name != "第一个名字" {
		t.Errorf("已存在条目不该被覆盖名字，实际 %q", res.Dirs[0].Name)
	}
	if !res.Added {
		t.Error("已在清单里也算登记成功（added=true）")
	}
}

func TestAddDirRejectsNonLedger(t *testing.T) {
	withTempHome(t)
	plain := t.TempDir()
	res, err := AddDir(plain, "")
	if err != nil {
		t.Fatalf("不是台账根不该是错误（看板会把宿主扫到的所有工作区都送来）：%v", err)
	}
	if res.Added || res.Reason == "" {
		t.Errorf("不是台账根应 added=false 且给人话原因，实际 added=%v reason=%q", res.Added, res.Reason)
	}
}

func TestListDirsRemovesVanished(t *testing.T) {
	withTempHome(t)
	keep := ledgerRoot(t)
	gone := ledgerRoot(t)
	if _, err := AddDir(keep, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := AddDir(gone, ""); err != nil {
		t.Fatal(err)
	}
	if err := os.RemoveAll(gone); err != nil {
		t.Fatal(err)
	}
	res, err := ListDirs()
	if err != nil {
		t.Fatal(err)
	}
	if res.Removed != 1 {
		t.Fatalf("应清掉 1 条失效记录，实际 %d", res.Removed)
	}
	if len(res.Dirs) != 1 || res.Dirs[0].Path != keep {
		t.Fatalf("只该剩 %s，实际 %+v", keep, res.Dirs)
	}
	// 清理要落盘：再读一次不该又冒出来
	again, err := ListDirs()
	if err != nil {
		t.Fatal(err)
	}
	if again.Removed != 0 || len(again.Dirs) != 1 {
		t.Errorf("清理应已写回，再读实际 removed=%d dirs=%d", again.Removed, len(again.Dirs))
	}
}

func TestSetHiddenTogglesAndPersists(t *testing.T) {
	withTempHome(t)
	root := ledgerRoot(t)
	if _, err := AddDir(root, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := SetHidden(root, true); err != nil {
		t.Fatal(err)
	}
	res, err := ListDirs()
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Dirs) != 1 || !res.Dirs[0].Hidden {
		t.Fatalf("隐藏应落盘，实际 %+v", res.Dirs)
	}
	if _, err := SetHidden(root, false); err != nil {
		t.Fatal(err)
	}
	res, err = ListDirs()
	if err != nil {
		t.Fatal(err)
	}
	if res.Dirs[0].Hidden {
		t.Error("取消隐藏后不该还是隐藏")
	}
}

func TestSetHiddenOnUnknownDirFails(t *testing.T) {
	withTempHome(t)
	if _, err := SetHidden(ledgerRoot(t), true); err == nil {
		t.Error("清单里没有的目录，hide 应该报错（不是静默加一条）")
	}
}

// 这个文件是**配置**（改名 / 临时隐藏目前只能手改它），必须缩进、一行一条；
// 台账那些 JSON 用紧凑格式，别把两者搞混。
func TestDirsFileIsIndented(t *testing.T) {
	withTempHome(t)
	if _, err := AddDir(ledgerRoot(t), "看格式"); err != nil {
		t.Fatal(err)
	}
	file, err := env.DirsFile()
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "\n  \"") {
		t.Errorf("清单应带缩进换行，实际：%s", raw)
	}
	if err := json.Unmarshal(raw, &map[string]any{}); err != nil {
		t.Errorf("缩进后仍必须是合法 JSON：%v", err)
	}
}

func TestBrokenFileIsKeptAsideNotOverwritten(t *testing.T) {
	withTempHome(t)
	file, err := env.DirsFile()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(file), 0o777); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte("{ 这不是 JSON"), 0o644); err != nil {
		t.Fatal(err)
	}
	res, err := ListDirs()
	if err != nil {
		t.Fatalf("坏清单不该让列出失败：%v", err)
	}
	if len(res.Warnings) == 0 {
		t.Error("坏清单要给人话提示")
	}
	// 写的时候先把坏文件改名保命，绝不静默覆盖
	if _, err := AddDir(ledgerRoot(t), ""); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(file + ".broken"); err != nil {
		t.Errorf("坏文件应被改名成 .broken 保留：%v", err)
	}
}
