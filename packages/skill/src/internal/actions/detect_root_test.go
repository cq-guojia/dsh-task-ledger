package actions

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
)

// 台账根检测是「定位之前」的问题：判据必须与 core.AsRoot 完全一致（只看位置），
// 否则插件会发现「脚本认这个根，检测命令说不是」。

func TestDetectRootOnInitializedRoot(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, core.LedgerDir), 0o777); err != nil {
		t.Fatal(err)
	}
	res, err := DetectRoot(root)
	if err != nil {
		t.Fatal(err)
	}
	if !res.Root {
		t.Fatalf("直接含 ledger/ 的目录应是台账根，实际不是（%s）", res.Reason)
	}
	if res.Repo == nil || filepath.Clean(*res.Repo) != core.AbsDir(res.Dir) {
		t.Errorf("自己就是根时 repo 应等于 dir，实际 %v / %s", res.Repo, res.Dir)
	}
	if res.Ledger == nil || filepath.Base(*res.Ledger) != core.LedgerDir {
		t.Errorf("ledger 应指向台账目录，实际 %v", res.Ledger)
	}
}

func TestDetectRootRejectsLedgerDirItself(t *testing.T) {
	root := t.TempDir()
	ledger := filepath.Join(root, core.LedgerDir)
	if err := os.MkdirAll(filepath.Join(ledger, "worklog"), 0o777); err != nil {
		t.Fatal(err)
	}
	for _, probe := range []string{ledger, filepath.Join(ledger, "worklog")} {
		res, err := DetectRoot(probe)
		if err != nil {
			t.Fatal(err)
		}
		if res.Root {
			t.Errorf("%s 不该算台账根", probe)
		}
		if res.Repo == nil || filepath.Clean(*res.Repo) != core.AbsDir(root) {
			t.Errorf("%s 应指回上层的工作区根 %s，实际 %v", probe, root, res.Repo)
		}
	}
}

func TestDetectRootOnEmptyDirReportsParent(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, core.LedgerDir), 0o777); err != nil {
		t.Fatal(err)
	}
	sub := filepath.Join(root, "packages", "skill")
	if err := os.MkdirAll(sub, 0o777); err != nil {
		t.Fatal(err)
	}
	res, err := DetectRoot(sub)
	if err != nil {
		t.Fatal(err)
	}
	if res.Root {
		t.Error("子目录不是根")
	}
	if res.Repo == nil || filepath.Clean(*res.Repo) != core.AbsDir(root) {
		t.Errorf("应往上找到 %s，实际 %v", root, res.Repo)
	}
}

func TestDetectRootWithNoLedgerAnywhere(t *testing.T) {
	base := t.TempDir()
	res, err := DetectRoot(base)
	if err != nil {
		t.Fatal(err)
	}
	if res.Root {
		t.Error("没有 ledger/ 的目录不是根")
	}
	if res.Repo != nil {
		t.Errorf("一个根都没有时 repo 应为 nil，实际 %v", *res.Repo)
	}
	if res.Reason == "" {
		t.Error("不是根时必须给一句人话理由（界面直接显示它）")
	}
}

func TestDetectRootMissingDirIsNotAnError(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "不存在")
	res, err := DetectRoot(missing)
	if err != nil {
		t.Fatalf("检测不存在的目录不该抛错（它是「不是根」，不是故障）：%v", err)
	}
	if res.Root {
		t.Error("不存在的目录不是根")
	}
}
