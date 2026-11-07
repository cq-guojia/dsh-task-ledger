package core

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
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
	// Windows 的 os.UserHomeDir 读 USERPROFILE（不读 HOME），CI 只在 Linux 跑不会暴露这点。
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
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

// within 给 fn 套一个超时：上溯循环一旦漏掉终点判定，表现是「卡死」而不是「失败」，
// 直接跑会挂住整个 CI；套超时后表现为这条测试失败，并指出是哪个入口没返回。
func within(t *testing.T, d time.Duration, what string, fn func()) {
	t.Helper()
	done := make(chan struct{})
	go func() {
		defer close(done)
		fn()
	}()
	select {
	case <-done:
	case <-time.After(d):
		t.Fatalf("%s 在 %s 内没有返回（上溯循环没终止？）", what, d)
	}
}

// 回归 issue #1：Windows 盘符根（C:\）与 UNC 根上 filepath.Dir 指向自己，
// 只判 "." 和 Separator 会在盘符根死循环（100% CPU）。t.TempDir() 的父链必然经过盘符根。
func TestAncestorWalkTerminatesOutsideLedger(t *testing.T) {
	dir := t.TempDir()
	within(t, 5*time.Second, "UnderLedger", func() {
		if UnderLedger(dir) {
			t.Errorf("普通目录不该被算作在 ledger 下")
		}
	})
	within(t, 5*time.Second, "AsRoot", func() {
		if got, err := AsRoot(dir, "--repo"); err != nil {
			t.Errorf("全新目录应该收，实际报错：%v", err)
		} else if got == "" {
			t.Error("AsRoot 返回了空路径")
		}
	})
	within(t, 5*time.Second, "AsRootChecked", func() {
		if _, err := AsRootChecked(dir, "--repo", false); err != nil {
			t.Errorf("写档应允许在全新目录建台账，实际报错：%v", err)
		}
	})
}

// 修终点判定不能把「真的在 ledger 下」判丢：AsRoot 要靠它给「指到台账里面」的理由。
func TestAncestorWalkStillDetectsLedger(t *testing.T) {
	root := t.TempDir()
	mkLedger(t, root)
	nested := filepath.Join(root, LedgerDir, "worklog")
	if err := os.MkdirAll(nested, 0o777); err != nil {
		t.Fatal(err)
	}
	within(t, 5*time.Second, "UnderLedger(nested)", func() {
		if !UnderLedger(nested) {
			t.Errorf("%s 在 ledger/ 下，应被判为台账目录里面", nested)
		}
	})
	if _, err := AsRoot(nested, "--repo"); err == nil || !strings.Contains(err.Error(), "台账目录里面") {
		t.Errorf("--repo 指到 ledger/ 里面应报「指到了台账目录里面」，实际：%v", err)
	}
}
