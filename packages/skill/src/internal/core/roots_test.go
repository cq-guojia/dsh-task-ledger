package core

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// 显式 --repo 的收口判据（2026-11-04）：读命令绝不静默读空台账，
// 写命令只能在「自己和一级子目录都没有台账」的全新目录里建第一份。

func mkLedger(t *testing.T, dir string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(dir, LedgerDir), 0o777); err != nil {
		t.Fatal(err)
	}
}

func TestAsRootCheckedAcceptsRealRoot(t *testing.T) {
	root := t.TempDir()
	mkLedger(t, root)
	for _, strict := range []bool{true, false} {
		got, err := AsRootChecked(root, "--repo", strict)
		if err != nil {
			t.Fatalf("strict=%v 真台账根不该报错：%v", strict, err)
		}
		if got != AbsDir(root) {
			t.Errorf("strict=%v 返回 %s，期望 %s", strict, got, AbsDir(root))
		}
	}
}

func TestAsRootCheckedStrictRejectsEmptyDir(t *testing.T) {
	dir := t.TempDir()
	got, err := AsRootChecked(dir, "--repo", true)
	if err == nil {
		t.Fatalf("读档应拒绝空目录，实际返回 %s", got)
	}
	if !strings.Contains(err.Error(), "不是台账根") {
		t.Errorf("报错要直说不是台账根，实际：%s", err)
	}
	// 宽松档（首次建台账）仍放行，别把新工作区堵死
	if _, err := AsRootChecked(dir, "--repo", false); err != nil {
		t.Fatalf("写档应允许在全新空目录建台账：%v", err)
	}
}

func TestAsRootCheckedRejectsParentOfLedgers(t *testing.T) {
	parent := t.TempDir()
	for _, name := range []string{"alpha", "beta"} {
		mkLedger(t, filepath.Join(parent, name))
	}
	if got := CandidateRoots(parent, 5); len(got) != 2 {
		t.Fatalf("候选根应扫到 2 个，实际 %v", got)
	}
	for _, strict := range []bool{true, false} {
		got, err := AsRootChecked(parent, "--repo", strict)
		if err == nil {
			t.Fatalf("strict=%v 父目录不该被当根，实际返回 %s", strict, got)
		}
		if !strings.Contains(err.Error(), "alpha") || !strings.Contains(err.Error(), "beta") {
			t.Errorf("strict=%v 报错要列候选根，实际：%s", strict, err)
		}
	}
}

func TestAsRootCheckedRejectsLedgerDirItself(t *testing.T) {
	root := t.TempDir()
	ledger := filepath.Join(root, LedgerDir)
	mkLedger(t, root)
	for _, strict := range []bool{true, false} {
		if _, err := AsRootChecked(ledger, "--repo", strict); err == nil {
			t.Errorf("strict=%v ledger/ 本身不该被当根", strict)
		}
	}
}

func TestAsRootCheckedRejectsHomeAndAbove(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	for _, probe := range []string{home, filepath.Dir(home)} {
		if !IsHomeOrAbove(probe) {
			t.Errorf("%s 应算 home 或其上层", probe)
		}
		if _, err := AsRootChecked(probe, "--repo", false); err == nil {
			t.Errorf("%s 不该允许就地建台账", probe)
		}
	}
	// home 下的新项目是合法的新工作区
	project := filepath.Join(home, "new-project")
	if err := os.MkdirAll(project, 0o777); err != nil {
		t.Fatal(err)
	}
	if IsHomeOrAbove(project) {
		t.Error("home 下的子目录不该算 home 或其上层")
	}
	if _, err := AsRootChecked(project, "--repo", false); err != nil {
		t.Errorf("home 下的新项目应能建台账：%v", err)
	}
}

func TestCandidateRootsUnreadableDirIsNotAnError(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "不存在")
	if got := CandidateRoots(missing, 5); len(got) != 0 {
		t.Errorf("读不出来的目录应返回空候选，实际 %v", got)
	}
	if _, err := AsRootChecked(missing, "--repo", true); err == nil {
		t.Error("不存在的目录仍应报「不是目录/不是根」")
	}
}
