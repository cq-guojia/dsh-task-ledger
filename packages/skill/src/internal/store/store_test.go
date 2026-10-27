package store

import (
	"os"
	"path/filepath"
	"testing"
)

// 数据层是安全网：原子写、快照回滚、记账本。这些错了的表现是「命令失败后台账被吃掉」，
// 界面上完全看不出来，所以逐条钉住。

func TestSnapshotRestore(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "a.txt")

	before, had, err := Snapshot(path)
	if err != nil {
		t.Fatal(err)
	}
	if had || before != nil {
		t.Fatalf("不存在的文件快照应是 (nil,false)，实际 (%v,%v)", before, had)
	}

	if err := WriteTextAtomic(path, "新内容\n", true); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.ReadFile(path); string(got) != "新内容\n" {
		t.Fatalf("写入后内容不对：%q", got)
	}

	// 回滚「原本不存在」⇒ 文件应被删掉
	if err := Restore(path, before, had); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("回滚后新建的文件应该消失")
	}
}

func TestRestoreOverwritesContent(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "b.txt")
	if err := WriteTextAtomic(path, "旧\n", true); err != nil {
		t.Fatal(err)
	}
	before, had, err := Snapshot(path)
	if err != nil || !had {
		t.Fatalf("快照失败：%v had=%v", err, had)
	}
	if err := WriteTextAtomic(path, "被覆盖\n", true); err != nil {
		t.Fatal(err)
	}
	if err := Restore(path, before, had); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.ReadFile(path); string(got) != "旧\n" {
		t.Fatalf("回滚后应是旧内容，实际 %q", got)
	}
}

func TestWriteTextAtomicSkipsUntracked(t *testing.T) {
	dir := t.TempDir()
	log := &WriteLog{}
	unbind := Bound(log)
	defer unbind()

	tracked := filepath.Join(dir, "tracked.txt")
	untracked := filepath.Join(dir, "untracked.txt")
	if err := WriteTextAtomic(tracked, "x\n", true); err != nil {
		t.Fatal(err)
	}
	if err := WriteTextAtomic(untracked, "y\n", false); err != nil {
		t.Fatal(err)
	}

	set := log.CommitSet()
	if len(set) != 1 || set[0] != tracked {
		t.Fatalf("提交集合应只含 tracked，实际 %v", set)
	}
}

func TestWriteLogPresyncRollback(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "pool.json")
	if err := WriteTextAtomic(path, "原来\n", true); err != nil {
		t.Fatal(err)
	}
	before, had, err := Snapshot(path)
	if err != nil {
		t.Fatal(err)
	}

	log := &WriteLog{}
	log.RecordPresync(path, before, had)
	if !log.HasWrites() {
		t.Fatal("记了取最新就该算写过")
	}
	if set := log.CommitSet(); len(set) != 1 || set[0] != path {
		t.Fatalf("取最新刷的文件必须进提交集合，实际 %v", set)
	}

	if err := WriteTextAtomic(path, "被远端覆盖\n", false); err != nil {
		t.Fatal(err)
	}
	log.RollbackPresync()
	if got, _ := os.ReadFile(path); string(got) != "原来\n" {
		t.Fatalf("回滚后应是原来的内容，实际 %q", got)
	}
	if log.HasWrites() {
		t.Fatal("回滚后记账本应清空")
	}
}

func TestWriteLogDiscardCreated(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "new.md")
	if err := WriteTextAtomic(path, "新文件\n", true); err != nil {
		t.Fatal(err)
	}
	log := &WriteLog{}
	log.Record(path, true, true) // 改动 + 新建
	log.DiscardCreated()
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("本次新建的文件应该被删掉")
	}
}

func TestFingerprint(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "c.txt")
	if got := Fingerprint(path); got != "" {
		t.Fatalf("不存在的文件指纹应为空，实际 %q", got)
	}
	if err := WriteTextAtomic(path, "一\n", true); err != nil {
		t.Fatal(err)
	}
	first := Fingerprint(path)
	if first == "" {
		t.Fatal("写过的文件应有指纹")
	}
	if err := WriteTextAtomic(path, "二\n", true); err != nil {
		t.Fatal(err)
	}
	if Fingerprint(path) == first {
		t.Fatal("内容变了指纹必须变")
	}
}
