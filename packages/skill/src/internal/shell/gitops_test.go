package shell

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// isWorklogPath 的入参是相对 repo 的路径（ledger/worklog/…）。它曾直接拿这个路径
// 去比 "worklog/" 前缀，恒为 false ⇒ 「手写过程文档放行」的豁免成了死代码 ⇒
// 只要本月有一篇手写的过程文档，所有写命令都被写前 guard 硬拦。钉住两种口径。
func TestIsWorklogPath(t *testing.T) {
	cases := []struct {
		rel  string
		want bool
	}{
		{"ledger/worklog/202610/27-1330-x-8cd1.md", true}, // repo 相对：实际走这条
		{"worklog/202610/27-1330-x-8cd1.md", true},        // ledger 相对
		{"ledger/pool.json", false},
		{"ledger/owners.json", false},
		{"ledger/owners/abcdef123456.json", false},
		{"ledger/history/202610.md", false},
		{"ledger/worklog", false}, // 目录本身不算
	}
	for _, c := range cases {
		if got := isWorklogPath(c.rel); got != c.want {
			t.Errorf("isWorklogPath(%q) = %v，期望 %v", c.rel, got, c.want)
		}
	}
}

// 台账放在别人仓库的子目录里（/workspace/Explore 这种）：git 在子目录里跑，
// `git diff --cached --name-only` 的输出却带子目录前缀（Explore/ledger/…），
// 拿它当 commit 的 pathspec 会变成 Explore/Explore/… ⇒ "did not match any file(s) known to git"。
func TestCommitInsideSubdirOfWorktree(t *testing.T) {
	outer := t.TempDir()
	sub := filepath.Join(outer, "Explore")
	g := &GitRepo{Repo: outer}
	if init := g.run("init", "-q"); init.Code != 0 {
		t.Skip("本机没有 git，跳过")
	}
	g.run("config", "user.email", "test@example.com")
	g.run("config", "user.name", "test")

	keep := filepath.Join(sub, "ledger", "owners.json")
	drop := filepath.Join(sub, "ledger", "owners", "abc123456789.json")
	if err := os.MkdirAll(filepath.Dir(drop), 0o777); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{keep, drop} {
		if err := os.WriteFile(path, []byte("{}\n"), 0o666); err != nil {
			t.Fatal(err)
		}
	}
	if err := g.Commit([]string{keep, drop}, "chore: 初始"); err != nil {
		t.Fatalf("首次提交失败：%v", err)
	}
	if err := os.Remove(drop); err != nil {
		t.Fatal(err)
	}

	subRepo := &GitRepo{Repo: sub}
	if err := subRepo.Commit([]string{keep, drop}, "chore: 删人"); err != nil {
		t.Fatalf("子目录台账删文件应当提交成功：%v", err)
	}
	out := g.run("show", "--name-status", "--format=", "HEAD").Stdout
	if !strings.Contains(out, "D\tExplore/ledger/owners/abc123456789.json") {
		t.Errorf("提交里应记录删除：\n%s", out)
	}
}

// 删人时那本分片是被删掉的文件：git add 对不存在的路径会报 pathspec 不匹配，
// 而「从未跟踪 + 已不在磁盘上」的路径更是无事可做。两种都得能提交过去。
func TestCommitRecordsDeletionAndSkipsUntrackedGone(t *testing.T) {
	dir := t.TempDir()
	g := &GitRepo{Repo: dir}
	if init := g.run("init", "-q"); init.Code != 0 {
		t.Skip("本机没有 git，跳过")
	}
	g.run("config", "user.email", "test@example.com")
	g.run("config", "user.name", "test")
	keep := filepath.Join(dir, "ledger", "owners.json")
	drop := filepath.Join(dir, "ledger", "owners", "abc123456789.json")
	if err := os.MkdirAll(filepath.Dir(drop), 0o777); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{keep, drop} {
		if err := os.WriteFile(path, []byte("{}\n"), 0o666); err != nil {
			t.Fatal(err)
		}
	}
	if err := g.Commit([]string{keep, drop}, "chore: 初始"); err != nil {
		t.Fatalf("首次提交失败：%v", err)
	}
	if err := os.Remove(drop); err != nil {
		t.Fatal(err)
	}
	ghost := filepath.Join(dir, "ledger", "owners", "deadbeef00ff.json")
	if err := g.Commit([]string{keep, drop, ghost}, "chore: 删人"); err != nil {
		t.Fatalf("删掉已跟踪的文件应当提交成功：%v", err)
	}
	out := g.run("show", "--name-status", "--format=", "HEAD").Stdout
	if !strings.Contains(out, "D\tledger/owners/abc123456789.json") {
		t.Errorf("提交里应记录删除：\n%s", out)
	}
	// 改哪个提交哪个：没变的文件不该跟着进提交
	if strings.Contains(out, "owners.json") {
		t.Errorf("内容没变的文件不该进本次提交：\n%s", out)
	}
}
