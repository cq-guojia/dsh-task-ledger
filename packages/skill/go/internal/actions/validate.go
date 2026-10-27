package actions

import (
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/cq-guojia/dsh-task-ledger/skill/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/internal/store"
)

// 只读：台账体检。两档：默认浅度只查格式，--deep 才读全部历史。
// **两档都不读过程文档正文**；只查格式，不查业务。

func readTaskFile(repo string, s *store.TaskStore, problems *[]string) map[string]map[string]any {
	all, err := s.All()
	if err == nil {
		return all
	}
	// 撞上程序自留的冲突标记（推送被拒后 rebase 没解完）⇒ 记一条 problem 继续
	raw, readErr := os.ReadFile(s.Path)
	if readErr == nil && strings.Contains(string(raw), "<<<<<<<") {
		*problems = append(*problems, Rel(repo, s.Path)+" 带着冲突标记（推送被拒后 rebase 没解完）：先解决冲突，再跑 validate。")
		return map[string]map[string]any{}
	}
	return map[string]map[string]any{}
}

func checkTaskFiles(repo string, index *store.OwnersIndex, problems *[]string) (int, int) {
	checked, total := 0, 0
	pool := store.NewTaskStore(repo, core.PoolRel, nil)
	if _, err := os.Stat(pool.Path); err == nil {
		checked++
		for tid, task := range readTaskFile(repo, pool, problems) {
			total++
			if ownerOf(task) != "" {
				*problems = append(*problems, "公共池里的 "+tid+" 带着 owner（池里的行必须无人认领）。")
			}
			if !isStatus(task["status"]) {
				*problems = append(*problems, "公共池里的 "+tid+" 状态 "+reprStr(strOfAny(task["status"]))+" 非法。")
			}
		}
	}
	shards, _ := index.Shards()
	keys := make([]string, 0, len(shards))
	for k := range shards {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, key := range keys {
		path := shards[key]
		if _, err := os.Stat(path); err != nil {
			*problems = append(*problems, "索引登记了 "+key+"，但分片文件 "+filepath.Base(path)+" 不存在。")
			continue
		}
		checked++
		rel, relErr := filepath.Rel(filepath.Join(repo, core.LedgerDir), path)
		if relErr != nil {
			continue
		}
		s := store.NewTaskStore(repo, filepath.ToSlash(rel), nil)
		for tid, task := range readTaskFile(repo, s, problems) {
			total++
			owner := ownerOf(task)
			if owner == "" {
				*problems = append(*problems, "分片 "+key+" 里的 "+tid+" 没有 owner。")
			} else if owner != key {
				*problems = append(*problems, "分片 "+key+" 里的 "+tid+" 的 owner 是 "+owner+"（分片主人与分区键不一致）。")
			}
			if !isStatus(task["status"]) {
				*problems = append(*problems, "分片 "+key+" 里的 "+tid+" 状态 "+reprStr(statusOf(task))+" 非法。")
			}
		}
	}
	return checked, total
}

func isStatus(v any) bool {
	s, ok := v.(string)
	if !ok {
		return false
	}
	for _, valid := range core.Statuses {
		if s == valid {
			return true
		}
	}
	return false
}

// reprStr 单引号字符串字面量。
func reprStr(s string) string { return "'" + s + "'" }

func checkOrphanShards(index *store.OwnersIndex, problems *[]string) {
	shards, _ := index.Shards()
	registered := map[string]bool{}
	for _, p := range shards {
		registered[filepath.Base(p)] = true
	}
	for _, path := range index.DiskShards() {
		if !registered[filepath.Base(path)] {
			*problems = append(*problems, "owners/ 里的 "+filepath.Base(path)+" 没有在索引里登记（对它人等于不存在）。")
		}
	}
}

func historyPaths(h *store.HistoryStore, deep bool) []string {
	sources := h.Sources()
	if deep {
		return sources
	}
	stamp := core.Now()
	month := stamp[0:4] + stamp[5:7]
	var out []string
	for _, p := range sources {
		if h.MonthKey(p) == month {
			out = append(out, p)
		}
	}
	return out
}

func openWorklogNames(repo string, index *store.OwnersIndex) map[string]bool {
	stores := []*store.TaskStore{store.NewTaskStore(repo, core.PoolRel, nil)}
	shards, _ := index.Shards()
	for _, path := range shards {
		if _, err := os.Stat(path); err != nil {
			continue
		}
		rel, relErr := filepath.Rel(filepath.Join(repo, core.LedgerDir), path)
		if relErr != nil {
			continue
		}
		stores = append(stores, store.NewTaskStore(repo, filepath.ToSlash(rel), nil))
	}
	out := map[string]bool{}
	for _, s := range stores {
		all, err := s.All()
		if err != nil {
			continue
		}
		for _, task := range all {
			worklog, _ := task["worklog"].(string)
			if name := filepath.Base(strings.TrimSpace(worklog)); name != "" && name != "." {
				out[name] = true
			}
		}
	}
	return out
}

// Validate 体检。
func Validate(repo string, deep bool) (*ValidationReport, error) {
	var problems, notices []string
	checked, total := 0, 0

	index := store.NewOwnersIndex(repo)
	history := store.NewHistoryStore(repo)

	files, tasks := checkTaskFiles(repo, index, &problems)
	checked += files
	total += tasks
	checkOrphanShards(index, &problems)

	openDocs := openWorklogNames(repo, index)
	for _, path := range historyPaths(history, deep) {
		checked++
		text, err := history.Read(path)
		if err != nil {
			return nil, err
		}
		rows, warns := core.ParseHistory(text)
		for _, w := range warns {
			notices = append(notices, Rel(repo, path)+"："+w)
		}
		for _, row := range rows {
			name := filepath.Base(row.Worklog)
			if name != "" && openDocs[name] {
				title := row.Title
				if title == "" {
					title = name
				}
				notices = append(notices, "历史里有「"+title+"」的结案行，但它还挂在在办台账里。")
			}
		}
	}

	if _, err := os.Stat(filepath.Join(repo, core.ToRepoRel(core.OwnersRel))); err != nil {
		notices = append(notices, "还没有 owners.json（索引）：跑一条写命令会自动建。")
	}
	stray := filepath.Join(repo, core.LedgerDir, core.LedgerDir)
	if fi, err := os.Stat(stray); err == nil && fi.IsDir() {
		problems = append(problems, Rel(repo, stray)+" 是错位的台账目录（根被当成 ledger/ 时写出来的幻影）；确认哪份是真台账后删掉多余的，命令一律带 --repo <工作区根>。")
	}

	return &ValidationReport{
		Problems:     problems,
		Notices:      notices,
		CheckedFiles: checked,
		TotalTasks:   total,
		Deep:         deep,
	}, nil
}
