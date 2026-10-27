package store

import (
	"path/filepath"
	"sort"

	"github.com/cq-guojia/dsh-task-ledger/skill/internal/core"
)

// 文件锁：只负责定义，**调用权归 actions/atom**（数据层禁止调用）。
// 加锁机制本身按平台实现（unix flock / Windows LockFileEx），这里只放共用的路径换算与多文件串联。

func resolvePath(path string) string {
	abs, err := filepath.Abs(path)
	if err != nil {
		return path
	}
	if real, err := filepath.EvalSymlinks(abs); err == nil {
		return real
	}
	return abs
}

// LedgerLock 多个文件一起锁：去重 → 按路径排序 → 依次加（避免两人互相等死）。
func LedgerLock(repo string, rels ...string) (func(), error) {
	seen := map[string]bool{}
	paths := make([]string, 0, len(rels))
	for _, rel := range rels {
		p := filepath.Join(repo, core.ToRepoRel(rel))
		if !seen[p] {
			seen[p] = true
			paths = append(paths, p)
		}
	}
	sort.Strings(paths)
	unlocks := make([]func(), 0, len(paths))
	for _, p := range paths {
		unlock, err := ProgressLock(p)
		if err != nil {
			for i := len(unlocks) - 1; i >= 0; i-- {
				unlocks[i]()
			}
			return nil, err
		}
		unlocks = append(unlocks, unlock)
	}
	return func() {
		for i := len(unlocks) - 1; i >= 0; i-- {
			unlocks[i]()
		}
	}, nil
}
