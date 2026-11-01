package actions

import (
	"path/filepath"
	"strings"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/env"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// 机器级台账目录清单的动作：登记 / 改名 / 隐藏 / 移除 / 列出。
//
// 与身份、与 git 全都无关 —— 它回答的是「我本机有哪些台账」，没 init 也要能读写。
// 四条硬规矩（2026-11-01 用户拍板）：
//   - 默认只给**可见**的；隐藏的要 --all 才列（长期处理的是可见的那些）。
//   - 界面只给隐藏不给删除，但**命令要能移除**：外部台账（不在任何宿主工作区里）删了不会自己回来。
//   - 读的时候逐条校验，目录没了 / 已经不是台账 ⇒ 直接删掉（清单本来就是程序生成的）。
//   - 并发写走文件锁；写失败不影响调用方的主任务。

// DirRow 清单条目对外形状。`Name` **永远非空**：清单里没写名字就用目录名 ——
// 「默认叫什么」只在 rowsOf 里算一次，外壳和插件都不许再算。
type DirRow struct {
	Path   string `json:"path"`
	Name   string `json:"name"`
	Hidden bool   `json:"hidden"`
}

// DirsResult 一次 dirs 调用的结果。
type DirsResult struct {
	Dirs     []DirRow
	Removed  int    // 这次读清单时清掉的失效条目数
	Added    bool   // --add：这条现在在清单里（已存在也算）
	Reason   string // --add 没加进去的人话原因（不是台账根 / 目录不存在）
	Warnings []string
}

// isLedgerRoot 目录还在 且 直接含 ledger/（与 root 命令同一个判据）。
func isLedgerRoot(path string) bool {
	return core.IsDir(path) && core.HasLedger(path)
}

// DirAt 把用户给的目录归一成清单里存的形式（绝对路径、`~` 展开、软链还原）。
func DirAt(dir string) string { return core.AbsDir(dir) }

// ListDirs 读清单：顺手清掉失效条目，再按 includeHidden 给出结果。
//
// 写回失败只记一条 warning：清单是辅助信息，不能因此让「看台账」这件事失败。
func ListDirs(includeHidden bool) (*DirsResult, error) {
	file, err := env.DirsFile()
	if err != nil {
		return nil, err
	}
	entries, broken, err := store.ReadDirs(file)
	if err != nil {
		return nil, err
	}
	res := &DirsResult{}
	if broken {
		res.Warnings = append(res.Warnings, "台账目录清单不是合法 JSON，已按空清单处理（原文件没动）。")
		entries = nil
	}
	kept := make([]store.DirEntry, 0, len(entries))
	for _, entry := range entries {
		if isLedgerRoot(entry.Path) {
			kept = append(kept, entry)
			continue
		}
		res.Removed++
	}
	if res.Removed > 0 {
		if err := writeLocked(file, kept, false); err != nil {
			res.Warnings = append(res.Warnings, "清理失效台账目录时写盘失败："+err.Error())
		}
	}
	res.Dirs = rowsOf(kept, includeHidden)
	return res, nil
}

// AddDir 登记一个台账目录。幂等：已在清单里就什么都不改（**不覆盖已有名字**，
// 否则每次进看板都会把用户改的名字冲掉）。名字只在新建这一条时落盘。
//
// 「不是台账根」「目录不存在」不当错误：清单是辅助信息，调用方（看板）会把宿主扫到的
// 所有工作区都送来，其中本来就有没台账的。真出错的只有读盘 / 写盘 / 上锁。
func AddDir(dir, name string) (*DirsResult, error) {
	path := DirAt(dir)
	if !core.IsDir(path) {
		return &DirsResult{Reason: path + " 不是一个存在的目录"}, nil
	}
	if !core.HasLedger(path) {
		return &DirsResult{Reason: path + " 不是台账根：这个目录没有 " + core.LedgerDir + "/"}, nil
	}
	res, _, err := updateDirsFound(func(entries []store.DirEntry) ([]store.DirEntry, bool) {
		for i := range entries {
			if entries[i].Path == path {
				return entries, true
			}
		}
		return append(entries, store.DirEntry{Path: path, Name: strings.TrimSpace(name)}), true
	})
	if err != nil {
		return nil, err
	}
	res.Added = true
	return res, nil
}

// RenameDir 改显示名。名字给空 ⇒ 清掉，回落到目录名。
func RenameDir(dir, name string) (*DirsResult, error) {
	path := DirAt(dir)
	res, found, err := updateDirsFound(func(entries []store.DirEntry) ([]store.DirEntry, bool) {
		for i := range entries {
			if entries[i].Path == path {
				entries[i].Name = strings.TrimSpace(name)
				return entries, true
			}
		}
		return entries, false
	})
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, notListed(path)
	}
	return res, nil
}

// RemoveDir 把这条从清单里删掉。**不动磁盘上的目录**。
//
// 目录还在宿主工作区里的话，下次开看板会被自动登记回来 —— 那是预期行为（用户 2026-11-01），
// 想长期不看用 SetHidden。外部台账（不在任何工作区里）删了就是删了。
func RemoveDir(dir string) (*DirsResult, error) {
	path := DirAt(dir)
	res, found, err := updateDirsFound(func(entries []store.DirEntry) ([]store.DirEntry, bool) {
		kept := make([]store.DirEntry, 0, len(entries))
		for _, entry := range entries {
			if entry.Path != path {
				kept = append(kept, entry)
			}
		}
		if len(kept) == len(entries) {
			return entries, false
		}
		return kept, true
	})
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, notListed(path)
	}
	return res, nil
}

// SetHidden 开关隐藏。隐藏只是看板不显示，功能一切照常（台账照样读写）。
func SetHidden(dir string, hidden bool) (*DirsResult, error) {
	path := DirAt(dir)
	res, found, err := updateDirsFound(func(entries []store.DirEntry) ([]store.DirEntry, bool) {
		for i := range entries {
			if entries[i].Path == path {
				entries[i].Hidden = hidden
				return entries, true
			}
		}
		return entries, false
	})
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, notListed(path)
	}
	return res, nil
}

func notListed(path string) error {
	return core.Failf("%s 不在台账目录清单里。\n  处理：先 progress dirs --dir %s --add 登记它。", path, path)
}

// updateDirsFound 读改写一趟（加锁），第二返回值给调用方判「有没有找到那条」。
func updateDirsFound(
	fn func([]store.DirEntry) ([]store.DirEntry, bool),
) (*DirsResult, bool, error) {
	file, err := env.DirsFile()
	if err != nil {
		return nil, false, err
	}
	unlock, err := DirsLock(file)
	if err != nil {
		return nil, false, err
	}
	defer unlock()
	entries, broken, err := store.ReadDirs(file)
	if err != nil {
		return nil, false, err
	}
	next, found := fn(entries)
	if err := store.WriteDirs(file, next, broken); err != nil {
		return nil, found, err
	}
	// 写命令的回执给**全量**：调用方（看板）要靠它判断「哪些已登记」，
	// 少给隐藏的会让它每轮都把隐藏项当成没登记、反复补登记。
	return &DirsResult{Dirs: rowsOf(next, true)}, found, nil
}

// writeLocked 加锁整份写。
func writeLocked(file string, entries []store.DirEntry, broken bool) error {
	unlock, err := DirsLock(file)
	if err != nil {
		return err
	}
	defer unlock()
	return store.WriteDirs(file, entries, broken)
}

// rowsOf 转对外形状：默认名（目录名）在这里补，隐藏项按 includeHidden 过滤。
func rowsOf(entries []store.DirEntry, includeHidden bool) []DirRow {
	rows := make([]DirRow, 0, len(entries))
	for _, entry := range entries {
		if entry.Hidden && !includeHidden {
			continue
		}
		name := entry.Name
		if name == "" {
			name = filepath.Base(entry.Path)
		}
		rows = append(rows, DirRow{Path: entry.Path, Name: name, Hidden: entry.Hidden})
	}
	return rows
}
