package core

import (
	"os"
	"path/filepath"
	"strings"
)

// 工作区根的判定：哪个目录才是「直接含有 ledger/ 的那个根」。
// 全仓唯一实现 —— shell 与 actions 都调这里。判据是结构，不看目录里有哪些文件。

func underLedger(p string) bool {
	if filepath.Base(p) == LedgerDir {
		return true
	}
	for dir := filepath.Dir(p); dir != p && dir != "." && dir != string(filepath.Separator); dir = filepath.Dir(dir) {
		if filepath.Base(dir) == LedgerDir {
			return true
		}
	}
	return false
}

func isDir(path string) bool {
	fi, err := os.Stat(path)
	return err == nil && fi.IsDir()
}

// AsRoot 校验「工作区根」，只看结构：
//   - 直接含 ledger/ ⇒ 就是根；
//   - 不含 ledger/、但自己叫 ledger 或落在某个 ledger/ 下 ⇒ 是台账目录，拒；
//   - 其余（含全新空目录）⇒ 收，第一条写命令会在它下面建 ledger/。
func AsRoot(repo, source string) (string, error) {
	if source == "" {
		source = "--repo"
	}
	p := expandUser(repo)
	if !isDir(p) {
		return "", Failf("%s 指向的不是一个目录：%s\n  处理：指向工作区根（直接含有 ledger/ 的那个目录，不是 ledger/ 本身）。", source, p)
	}
	if isDir(filepath.Join(p, LedgerDir)) {
		return resolvePath(p), nil
	}
	if underLedger(p) {
		anc := p
		if filepath.Base(p) != LedgerDir {
			for dir := filepath.Dir(p); dir != p && dir != "." && dir != string(filepath.Separator); dir = filepath.Dir(dir) {
				if filepath.Base(dir) == LedgerDir {
					anc = dir
					break
				}
			}
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

// RootOf 从 start 往上定位工作区根；找不到返回空串。
func RootOf(start string) string {
	here := resolvePath(expandUser(start))
	for dir := here; ; dir = filepath.Dir(dir) {
		if filepath.Base(dir) == LedgerDir && !isDir(filepath.Join(dir, LedgerDir)) {
			root := filepath.Dir(dir)
			if isDir(filepath.Join(root, LedgerDir)) {
				return root
			}
		}
		if parent := filepath.Dir(dir); parent == dir {
			break
		}
	}
	for dir := here; ; dir = filepath.Dir(dir) {
		if isDir(filepath.Join(dir, LedgerDir)) {
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
