package store

import (
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/cq-guojia/dsh-task-ledger/skill/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/internal/notices"
)

// 过程文档 worklog/<年月>/*.md：找一篇、读、列全部、建新篇、写回、追加执行记录。

// FallbackTemplate 读不到 assets/worklog.md 时的内置骨架。
const FallbackTemplate = `# <id>：<title>

- **状态**：<status>
- **创建**：<created> · @<creator>

## 背景

## 待办

## 下一步

## 过程

## 结论

## 执行记录

<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。 -->
`

// WorklogStore 一个工作区的过程文档集合。
type WorklogStore struct{ Repo string }

// NewWorklogStore 造一个过程文档读写口。
func NewWorklogStore(repo string) *WorklogStore { return &WorklogStore{Repo: repo} }

// Template 六节模板：读不到 assets/worklog.md → 内置骨架 + 一条提示。
func (w *WorklogStore) Template() string {
	path := core.WorklogTemplate()
	if path != "" {
		if data, err := os.ReadFile(path); err == nil {
			return string(data)
		}
	}
	notices.Note("提示：读不到模板 assets/worklog.md，本次用内置骨架建篇（六节齐全，正文仍是空的）。")
	return FallbackTemplate
}

// Find 定位一篇过程文档：先信任务对象里记的路径，再按命名推算，最后扫目录。
func (w *WorklogStore) Find(tid, worklogRel string) string {
	if worklogRel != "" {
		cand := filepath.Join(w.Repo, core.ToRepoRel(worklogRel))
		if isFile(cand) {
			return cand
		}
	}
	base := filepath.Join(w.Repo, core.ToRepoRel(core.WorklogDir))
	names := []string{core.WorklogName(tid), tid + ".md"}
	dirs := []string{base}
	if entries, err := os.ReadDir(base); err == nil {
		var subs []string
		for _, e := range entries {
			if e.IsDir() {
				subs = append(subs, filepath.Join(base, e.Name()))
			}
		}
		sort.Strings(subs)
		dirs = append(dirs, subs...)
	}
	for _, dir := range dirs {
		for _, name := range names {
			cand := filepath.Join(dir, name)
			if isFile(cand) {
				return cand
			}
		}
	}
	return ""
}

// ByName 按文件名找（历史末列回链用）。
func (w *WorklogStore) ByName(logName string) string {
	base := filepath.Join(w.Repo, core.ToRepoRel(core.WorklogDir))
	if !isDir(base) {
		return ""
	}
	if direct := filepath.Join(base, logName); isFile(direct) {
		return direct
	}
	var found []string
	filepath.Walk(base, func(p string, info os.FileInfo, err error) error {
		if err != nil || info == nil || info.IsDir() {
			return nil
		}
		if info.Name() == logName {
			found = append(found, p)
		}
		return nil
	})
	sort.Strings(found)
	if len(found) > 0 {
		return found[0]
	}
	return ""
}

// All 递归列出全部过程文档。
func (w *WorklogStore) All() []string {
	base := filepath.Join(w.Repo, core.ToRepoRel(core.WorklogDir))
	var out []string
	filepath.Walk(base, func(p string, info os.FileInfo, err error) error {
		if err != nil || info == nil || info.IsDir() {
			return nil
		}
		if strings.HasSuffix(info.Name(), ".md") {
			out = append(out, p)
		}
		return nil
	})
	sort.Strings(out)
	return out
}

// Read 读一篇（去 BOM）；文件不存在返回空串。
func (w *WorklogStore) Read(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", core.Failf("读 %s 失败：%v", path, err)
	}
	return strings.TrimPrefix(string(data), "\ufeff"), nil
}

// HeadMeta 头部四样：created / creator / category / tags；读不出给空值。
func (w *WorklogStore) HeadMeta(path string) (map[string]any, error) {
	text, err := w.Read(path)
	if err != nil {
		return nil, err
	}
	category, tags := core.HeadMeta(text)
	if tags == nil {
		tags = []string{}
	}
	return map[string]any{
		"created":  nilIfEmpty(core.HeadCreated(text)),
		"creator":  nilIfEmpty(core.HeadCreator(text)),
		"category": nilIfEmpty(category),
		"tags":     tags,
	}, nil
}

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// Create 一次写完整篇（含状态行与首条执行记录）。返回绝对路径。
func (w *WorklogStore) Create(tid, title, created, creator string, tags []string, status *core.StatusLine, firstExec string) (string, error) {
	rel := core.WorklogRel(tid, created)
	path := filepath.Join(w.Repo, core.ToRepoRel(rel))
	if err := EnsureDir(filepath.Dir(path)); err != nil {
		return "", err
	}
	text := core.RenderWorklog(tid, title, created, creator, tags, status, w.Template())
	if firstExec != "" {
		text = core.AppendExecLog(text, firstExec)
	}
	if err := WriteTextAtomic(path, text, true); err != nil {
		return "", err
	}
	return path, nil
}

// Write 写回「锚点编辑后的新全文」。
func (w *WorklogStore) Write(path, text string) error { return WriteTextAtomic(path, text, true) }

// AppendExec 追加一条执行记录，并在同一次写盘里顺带刷新头部状态行（status 给了才刷）。
// 写不进返回 false，**不抛**。
func (w *WorklogStore) AppendExec(path, line string, status *core.StatusLine) bool {
	text, err := w.Read(path)
	if err != nil {
		return false
	}
	next := core.AppendExecLog(text, line)
	if status != nil {
		next = core.RewriteStatusLine(next, *status)
	}
	if err := WriteTextAtomic(path, next, true); err != nil {
		return false
	}
	return true
}

func isFile(path string) bool {
	fi, err := os.Stat(path)
	return err == nil && fi.Mode().IsRegular()
}

func isDir(path string) bool {
	fi, err := os.Stat(path)
	return err == nil && fi.IsDir()
}
