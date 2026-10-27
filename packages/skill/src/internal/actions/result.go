// Package actions 是业务动作层：只做判定与写序，不打印、不跑 git。
package actions

import (
	"path/filepath"
	"strings"
)

// Rel 绝对路径 → 相对 repo 的字符串（输出给人 / 给界面的一律这个基准）。
func Rel(repo, path string) string {
	absRepo, err := filepath.Abs(repo)
	if err != nil {
		return path
	}
	absPath, err := filepath.Abs(path)
	if err != nil {
		return path
	}
	if real, err := filepath.EvalSymlinks(absRepo); err == nil {
		absRepo = real
	}
	if real, err := filepath.EvalSymlinks(absPath); err == nil {
		absPath = real
	}
	rel, err := filepath.Rel(absRepo, absPath)
	if err != nil || strings.HasPrefix(rel, "..") {
		return path
	}
	return filepath.ToSlash(rel)
}

// WorklogView 「这条任务的过程文档要怎么显示」。
type WorklogView struct {
	Path  *string // 相对 repo
	Text  *string // 全文；读不到为 nil
	Error *string // 读不到的原因
}

// Result 写动作的返回。字段名是公开契约，外壳不许重新算。
type Result struct {
	Changed     []string // 改了哪些字段名（不是文件名、不是任务号）
	Where       *string  // 主要落在哪个文件（相对 repo）
	AlreadyDone bool     // 重跑发现已经做过 ⇒ 退出码仍是 0
	Message     *string  // git 提交说明；nil ⇒ 外壳用默认模板
	Worklog     *WorklogView
	Payload     map[string]any
	Notices     []string
}

// TaskRow 人话表格的一行（9 字段投影 + 三个年龄标记）。--json 吐的是 rows（原样任务对象），不是它。
type TaskRow struct {
	Tid      string
	Title    string
	Status   string
	Owner    *string
	Created  *string
	Started  *string
	Category *string
	Tags     []string
	Where    *string
	Stale    bool // 停滞：进行中、最后更新至今满阈值天数
	Overdue  bool // 逾期：进行中、接任务至今满阈值天数
	Backlog  bool // 积压：待认领、创建至今满阈值天数
}

// ListResult list 的返回。
type ListResult struct {
	Rows    map[string]map[string]any
	Table   []TaskRow
	Notices []string
}

// StatsResult stats 的返回：在办任务按状态 + 年龄阈值数出来的各面计数。
// thresholds 是这次实际生效的阈值（回显给调用方，界面文案不硬编码）。
type StatsResult struct {
	Total          int // 在办总数（= open + doing）
	Open           int
	Doing          int // 含旧数据的 blocked
	Stale          int
	Overdue        int
	Backlog        int
	Mine           int  // 归我的在办（任意状态）
	MyDoing        int  // 归我的进行中
	MyStale        int  // 归我的里停滞的
	MyOverdue      int  // 归我的里逾期的
	OldestOpenDays *int // 最老一条待认领躺了多少天；没有待认领为 nil
	Thresholds     map[string]any
	Notices        []string
}

// OwnersResult owners 的返回：该工作区花名册全量（含当前没任务的人）。
type OwnersResult struct {
	Count   int
	Owners  map[string]map[string]any
	Notices []string
}

// RootResult root 的返回：一个目录是不是已初始化的台账根。
// Repo 是定位到的工作区根（自己就是根时等于 Dir）；一个都没有为 nil。
type RootResult struct {
	Dir    string
	Root   bool
	Repo   *string
	Ledger *string
	Reason string
}

// ShowResult show 的返回。
type ShowResult struct {
	Task    map[string]any
	Worklog *WorklogView
	Others  []string
	Legacy  bool
	Notices []string
}

// HistoryResult history 的返回。
type HistoryResult struct {
	Count    int
	Filters  map[string]any
	Records  []map[string]any
	Warnings []string
	Capped   bool
}

// ValidationReport validate 的返回。problems 只有它影响退出码。
type ValidationReport struct {
	Problems     []string
	Notices      []string
	CheckedFiles int
	TotalTasks   int
	Deep         bool
}

// StrOrNil 有值才给指针（空串当没有）。
func StrOrNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
