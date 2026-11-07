package core

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// 工作区根的判定：哪个目录才是「直接含有 ledger/ 的那个根」。
// 全仓唯一实现 —— shell 与 actions 都调这里。判据是结构，不看目录里有哪些文件。

// forEachAncestor 从 p 的上一级开始逐级上溯，visitor 返回 true 时提前结束。
//
// 终点判定必须是「父目录 == 自身」：Windows 的盘符根（C:\）与 UNC 根（\\host\share）
// 的 filepath.Dir 都指向自己；只判 "." 和 Separator 不够——Windows 上 Separator 是 "\"，
// 而盘符根是 "C:\"，永远不会命中，循环就在盘符根原地打转（100% CPU 挂死，见 issue #1）。
func forEachAncestor(p string, visitor func(dir string) bool) {
	for dir := filepath.Dir(p); ; dir = filepath.Dir(dir) {
		if dir == p || dir == "." || dir == string(filepath.Separator) {
			return
		}
		if visitor(dir) {
			return
		}
		if filepath.Dir(dir) == dir {
			return
		}
	}
}

func underLedger(p string) bool {
	if filepath.Base(p) == LedgerDir {
		return true
	}
	found := false
	forEachAncestor(p, func(dir string) bool {
		if filepath.Base(dir) == LedgerDir {
			found = true
			return true
		}
		return false
	})
	return found
}

// IsDir 这个路径是不是一个已存在的目录（不存在 / 不是目录都算否）。
func IsDir(path string) bool {
	fi, err := os.Stat(path)
	return err == nil && fi.IsDir()
}

// AbsDir 用户给的目录 → 绝对路径：`~` 展开、符号链接还原。
func AbsDir(path string) string { return resolvePath(expandUser(path)) }

// HasLedger 这个目录是不是直接含有 ledger/ —— 判据只看结构，不看里面有哪些文件。
// 「直接含有」就是已初始化的台账根；再往上一级就不是它了。
func HasLedger(path string) bool { return IsDir(filepath.Join(path, LedgerDir)) }

// UnderLedger 这个目录是不是 ledger 本身、或落在某个 ledger 底下。
// 这类目录永远不是工作区根，指过去会被 AsRoot 拒，检测命令要据此给不一样的理由。
func UnderLedger(path string) bool { return underLedger(path) }

// AsRoot 校验「工作区根」，只看结构：
//   - 直接含 ledger/ ⇒ 就是根；
//   - 不含 ledger/、但自己叫 ledger 或落在某个 ledger/ 下 ⇒ 是台账目录，拒；
//   - 其余（含全新空目录）⇒ 收，第一条写命令会在它下面建 ledger/。
func AsRoot(repo, source string) (string, error) {
	if source == "" {
		source = "--repo"
	}
	p := expandUser(repo)
	if !IsDir(p) {
		return "", Failf("%s 指向的不是一个目录：%s\n  处理：指向工作区根（直接含有 ledger/ 的那个目录，不是 ledger/ 本身）。", source, p)
	}
	if IsDir(filepath.Join(p, LedgerDir)) {
		return resolvePath(p), nil
	}
	if underLedger(p) {
		anc := p
		if filepath.Base(p) != LedgerDir {
			forEachAncestor(p, func(dir string) bool {
				if filepath.Base(dir) == LedgerDir {
					anc = dir
					return true
				}
				return false
			})
		}
		root := filepath.Dir(anc)
		var what, why string
		if anc == p {
			what = "指到了台账目录本身：" + p
			why = "它的上一级 " + root + " 才是工作区根 —— 在它下面跑会再建出 " + filepath.Join(p, LedgerDir) + "。"
		} else {
			what = "指到了台账目录里面：" + p
			why = "它已经在 " + anc + " 这个台账目录底下 —— 工作区根是 " + root + "。"
		}
		return "", Failf("%s %s\n  %s\n  处理：把 %s 指到 %s\n      例：progress list --repo %s", source, what, why, source, root, root)
	}
	return resolvePath(p), nil
}

// CandidateRoots 只扫一层子目录，列出「直接含 ledger/ 的」候选根。
// 不递归：权限与耗时都不可控，而且父目录误指要找的就是最近一层。读不出来就返回空。
func CandidateRoots(dir string, limit int) []string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var out []string
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		child := filepath.Join(dir, entry.Name())
		if HasLedger(child) {
			out = append(out, child)
			if len(out) >= limit {
				break
			}
		}
	}
	return out
}

// IsHomeOrAbove path 是不是 $HOME 或它的祖先（含文件系统根）。
// 防止 `--repo ~` 在家目录就地建出 ~/ledger 这类幻影台账。
func IsHomeOrAbove(path string) bool {
	home, err := os.UserHomeDir()
	if err != nil {
		return false
	}
	p := resolvePath(path)
	for dir := resolvePath(home); ; dir = filepath.Dir(dir) {
		if dir == p {
			return true
		}
		if parent := filepath.Dir(dir); parent == dir {
			break
		}
	}
	return false
}

// AsRootChecked 显式 --repo 的收口判据（2026-11-04）：AsRoot 之外再加一道防线。
//
//	strict=true  读任务数据的命令：必须已经是台账根，绝不静默读空台账；
//	strict=false 写命令：允许首次创建，但拒绝「下面已有子台账的父目录」和 home 及其上层。
//
// 只影响显式给了 --repo 的路径；没给 --repo 时由 RootOf 上溯，命中即真根。
func AsRootChecked(repo, source string, strict bool) (string, error) {
	root, err := AsRoot(repo, source)
	if err != nil {
		return "", err
	}
	if HasLedger(root) {
		return root, nil
	}
	candidates := CandidateRoots(root, 5)
	if !strict && len(candidates) == 0 && !IsHomeOrAbove(root) {
		return root, nil // 全新工作区：第一条写命令在这里建台账
	}
	reason := "只读命令不能在不是台账根的目录上跑（不会读出一本空台账）。"
	if !strict {
		reason = "不能在这里建台账：下面已经有别的台账，或这是家目录 / 它的上层。"
	}
	lines := []string{
		fmt.Sprintf("%s %s 不是台账根：这个目录里没有 %s/ —— %s", source, root, LedgerDir, reason),
	}
	if len(candidates) > 0 {
		lines = append(lines, "  它下面有台账的是：")
		for _, candidate := range candidates {
			lines = append(lines, "    "+candidate)
		}
		lines = append(lines, fmt.Sprintf("  处理：把 %s 指到上面其中一个工作区根。", source))
	} else {
		lines = append(lines, fmt.Sprintf("  处理：把 %s 指到工作区根（直接含 %s/ 的那个目录）。", source, LedgerDir))
	}
	return "", Failf("%s", strings.Join(lines, "\n"))
}

// RootOf 从 start 往上定位工作区根；找不到返回空串。
func RootOf(start string) string {
	here := resolvePath(expandUser(start))
	for dir := here; ; dir = filepath.Dir(dir) {
		if filepath.Base(dir) == LedgerDir && !IsDir(filepath.Join(dir, LedgerDir)) {
			root := filepath.Dir(dir)
			if IsDir(filepath.Join(root, LedgerDir)) {
				return root
			}
		}
		if parent := filepath.Dir(dir); parent == dir {
			break
		}
	}
	for dir := here; ; dir = filepath.Dir(dir) {
		if IsDir(filepath.Join(dir, LedgerDir)) {
			return dir
		}
		if parent := filepath.Dir(dir); parent == dir {
			break
		}
	}
	return ""
}

func expandUser(path string) string {
	if path == "~" || strings.HasPrefix(path, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, strings.TrimPrefix(path, "~"))
		}
	}
	return path
}

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
