package actions

import (
	"path/filepath"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/env"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// 事务的唯一入口：把这次要碰的文件按固定顺序一次锁住。
// 只加锁，不管写盘、不碰 git、不打印。
//
// 三条硬约束：
// 1. 锁集只许宽不许窄；锁集以外的文件一个字节都不许写。
// 2. 所有判定依据必须在锁内重读 —— 锁外读到的快照只能用来决定「锁多宽」。
// 3. 任何失败补偿都不许再开一个 Atom（文件锁不可重入）。

func envCurrent(repo string) (core.Identity, error) { return env.Current(repo) }

// LockActions LockScope 认的动作名。
var LockActions = []string{"bootstrap", "new", "claim", "set", "log", "close", "tags"}

// Scope 这次要碰哪些文件。Files 加锁（也逐个刷），Dirs 只刷盘（展开成已存在的文件）。
// 路径一律**相对 ledger/**，落盘时再拼 repo。
type Scope struct {
	Files []string
	Dirs  []string
}

// Or 两批取并集（去重保序）。
func (s Scope) Or(other Scope) Scope {
	return Scope{Files: mergeRel(s.Files, other.Files), Dirs: mergeRel(s.Dirs, other.Dirs)}
}

func mergeRel(a, b []string) []string {
	out := make([]string, 0, len(a)+len(b))
	for _, item := range append(append([]string{}, a...), b...) {
		seen := false
		for _, have := range out {
			if have == item {
				seen = true
				break
			}
		}
		if !seen {
			out = append(out, item)
		}
	}
	return out
}

// otherShards 索引里除我之外的分片（宁宽：认领的前置要查、交接要写对方那份）。
func otherShards(repo string, me core.Identity) []string {
	index := store.NewOwnersIndex(repo)
	all, err := index.All()
	if err != nil {
		return nil
	}
	meKey := core.Normalize(me.UUID)
	var out []string
	for key, record := range all {
		if key == meKey {
			continue
		}
		if name, ok := record["file"].(string); ok && name != "" {
			out = append(out, core.OwnersDir+"/"+name)
		}
	}
	return out
}

// worklogOf 这条任务的过程文档：查得到给文件，查不到退回整个 worklog/ 目录（宁宽）。
func worklogOf(repo, tid string) ([]string, []string) {
	if tid == "" {
		return nil, []string{core.WorklogDir}
	}
	pool := store.NewTaskStore(repo, core.PoolRel, nil)
	if task, ok, _ := pool.Get(tid); ok && task != nil {
		if rel, ok := task["worklog"].(string); ok && rel != "" {
			return []string{rel}, nil
		}
		return nil, []string{core.WorklogDir}
	}
	index := store.NewOwnersIndex(repo)
	shards, err := index.Shards()
	if err == nil {
		for _, path := range shards {
			rel, relErr := filepath.Rel(filepath.Join(repo, core.LedgerDir), path)
			if relErr != nil {
				continue
			}
			s := store.NewTaskStore(repo, filepath.ToSlash(rel), nil)
			task, ok, err := s.Get(tid)
			if err != nil || !ok || task == nil {
				continue
			}
			if relPath, ok := task["worklog"].(string); ok && relPath != "" {
				return []string{relPath}, nil
			}
			break
		}
	}
	return nil, []string{core.WorklogDir}
}

// LockScope 算出这次可能碰哪些文件（在锁外跑，宁可算宽）。
func LockScope(repo string, me core.Identity, action string, params map[string]any) (Scope, error) {
	known := false
	for _, a := range LockActions {
		if a == action {
			known = true
			break
		}
	}
	if !known {
		return Scope{}, core.Failf("未知的 lock_scope action：%q", action)
	}
	mine := core.ShardRel(me.UUID)
	pool := core.PoolRel
	index := core.OwnersRel
	others := otherShards(repo, me)
	tid, _ := params["tid"].(string)

	switch action {
	case "bootstrap":
		return Scope{Files: []string{index, pool, mine}}, nil

	case "new":
		mineFlag, _ := params["mine"].(bool)
		target := pool
		if mineFlag {
			target = mine
		}
		created, _ := params["created"].(string)
		var doc []string
		monthDir := core.WorklogDir
		if tid != "" && len(created) >= 7 {
			doc = []string{core.WorklogRel(tid, created)}
			monthDir = core.WorklogDirFor(created)
		}
		return Scope{Files: mergeRel([]string{target}, doc), Dirs: []string{monthDir}}, nil

	case "claim":
		wfiles, wdirs := worklogOf(repo, tid)
		return Scope{Files: mergeRel(mergeRel([]string{pool, mine}, others), wfiles), Dirs: wdirs}, nil

	case "set":
		wfiles, wdirs := worklogOf(repo, tid)
		return Scope{Files: mergeRel(mergeRel([]string{mine, pool}, others), wfiles), Dirs: wdirs}, nil

	case "log":
		wfiles, wdirs := worklogOf(repo, tid)
		return Scope{Files: mergeRel([]string{mine}, wfiles), Dirs: wdirs}, nil

	case "close":
		wfiles, wdirs := worklogOf(repo, tid)
		finished, _ := params["finished"].(string)
		history := core.HistoryDir
		if len(finished) >= 7 {
			history = core.HistoryPathFor(finished)
		}
		return Scope{Files: mergeRel([]string{mine, pool, history}, wfiles), Dirs: wdirs}, nil
	}
	// 全部分支已覆盖 LockActions，走到这里说明表与分支不同步
	return Scope{}, core.Failf("lock_scope 没有处理 %q", action)
}

// Atom 按路径排序后依次加锁，退出即完成。不建记账本、不写盘、不提交、不打印。
func Atom(repo string, rels ...string) (func(), error) {
	return store.LedgerLock(repo, rels...)
}
