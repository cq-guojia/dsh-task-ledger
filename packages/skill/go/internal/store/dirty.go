package store

import "sync"

// 记账本：这一轮到底动了哪些文件。**提交集合只看它**，不看 Result.Changed。

// PresyncRecord 取最新时刷过的文件 + 刷之前的字节。
type PresyncRecord struct {
	Path   string
	Before []byte
	Had    bool
}

// WriteLog 一轮的写记录。
type WriteLog struct {
	Changed       []string
	Created       []string
	Presync       []PresyncRecord
	mu            sync.Mutex
	CommitStarted bool
}

// Record 记一次写。track=false（复原 / 外壳刷盘）不进改动集合。
func (w *WriteLog) Record(path string, track, created bool) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if created && !containsStr(w.Created, path) {
		w.Created = append(w.Created, path)
	}
	if track && !containsStr(w.Changed, path) {
		w.Changed = append(w.Changed, path)
	}
}

// RecordPresync 记「取最新刷过这个文件」+ 刷之前的字节。
func (w *WriteLog) RecordPresync(path string, before []byte, had bool) {
	w.mu.Lock()
	defer w.mu.Unlock()
	for i, rec := range w.Presync {
		if rec.Path == path {
			w.Presync[i] = PresyncRecord{Path: path, Before: before, Had: had}
			return
		}
	}
	w.Presync = append(w.Presync, PresyncRecord{Path: path, Before: before, Had: had})
}

// CommitSet 最后要提交的文件：本次改动 + 取最新刷过的（去重保序）。
func (w *WriteLog) CommitSet() []string {
	w.mu.Lock()
	defer w.mu.Unlock()
	out := []string{}
	for _, p := range w.Changed {
		if !containsStr(out, p) {
			out = append(out, p)
		}
	}
	for _, rec := range w.Presync {
		if !containsStr(out, rec.Path) {
			out = append(out, rec.Path)
		}
	}
	return out
}

// HasWrites 这一轮有没有写过东西。
func (w *WriteLog) HasWrites() bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	return len(w.Changed) > 0 || len(w.Presync) > 0
}

// RollbackPresync 按备份把被覆盖的内容恢复回去。
func (w *WriteLog) RollbackPresync() []string {
	w.mu.Lock()
	records := w.Presync
	w.Presync = nil
	w.mu.Unlock()
	var done []string
	for i := len(records) - 1; i >= 0; i-- {
		rec := records[i]
		_ = Restore(rec.Path, rec.Before, rec.Had)
		done = append(done, rec.Path)
	}
	return done
}

// DiscardCreated 删掉本次新建的文件（失败收尾用）。
func (w *WriteLog) DiscardCreated() []string {
	w.mu.Lock()
	created := w.Created
	w.Created = nil
	w.mu.Unlock()
	for _, p := range created {
		_ = RemoveIfExists(p)
	}
	return created
}

// Clear 成功路径收尾：全部清零。
func (w *WriteLog) Clear() {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.Changed = nil
	w.Created = nil
	w.Presync = nil
}

var current = &WriteLog{}

// Current 当前这一轮的记账本。
func Current() *WriteLog { return current }

// Bound 绑定这一轮的记账本（生产只在 shell 里绑一次）。
func Bound(log *WriteLog) func() {
	saved := current
	current = log
	return func() { current = saved }
}

func containsStr(list []string, want string) bool {
	for _, v := range list {
		if v == want {
			return true
		}
	}
	return false
}

// RemoveIfExists 删文件，不存在不算错。
func RemoveIfExists(path string) error {
	if err := removeFile(path); err != nil && !isNotExist(err) {
		return err
	}
	return nil
}
