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

// TaskRow 人话表格的一行（9 字段投影）。--json 吐的是 rows（原样任务对象），不是它。
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
}

// ListResult list 的返回。
type ListResult struct {
	Rows    map[string]map[string]any
	Table   []TaskRow
	Notices []string
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
