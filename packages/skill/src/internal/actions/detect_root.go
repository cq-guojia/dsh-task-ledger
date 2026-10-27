package actions

import (
	"path/filepath"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
)

// 只读：台账根检测 —— 给一个目录，回答「它是不是已初始化的台账根」。
//
// 判据只看**结构**（这个目录直接含不含 ledger/），与 core.AsRoot 同一个口径：
// 不看目录里有哪些文件（有没有 pool.json / owners.json 都不影响），
// 因为脚本定位工作区根就是这么判的；`ledger/` 本身与它下面的目录永远不是根。
//
// 它**不进 runner**：这个问题恰恰是在「还没有定位到仓库」时要问的，
// 与 whoami / init 一样由外壳在定位之前旁路调用（见 shell.Main）。

func DetectRoot(dir string) (*RootResult, error) {
	p := core.AbsDir(dir)
	res := &RootResult{Dir: p}
	if !core.IsDir(p) {
		res.Reason = "不是一个目录（不存在，或不是目录）。"
		return res, nil
	}
	if core.HasLedger(p) {
		ledger := filepath.Join(p, core.LedgerDir)
		res.Root = true
		res.Repo = StrOrNil(p)
		res.Ledger = StrOrNil(ledger)
		res.Reason = "是工作区根：这个目录直接含有 " + core.LedgerDir + "/。"
		return res, nil
	}
	// 不是根 ⇒ 顺手把往上能找到的根也给出来，调用方不必再找一遍
	root := core.RootOf(p)
	if core.UnderLedger(p) {
		res.Repo = StrOrNil(root)
		res.Reason = "不是工作区根：指到了台账目录里面（" + core.LedgerDir + "/ 本身或它的子目录）"
		if root != "" {
			res.Reason += " —— 工作区根是 " + root
		}
		res.Reason += "。"
		return res, nil
	}
	if root != "" {
		res.Repo = StrOrNil(root)
		res.Reason = "不是工作区根：这个目录没有 " + core.LedgerDir + "/，往上找到的根是 " + root + "。"
		return res, nil
	}
	res.Reason = "不是工作区根：这个目录和它的上层都没有 " + core.LedgerDir + "/ —— " +
		"第一条写命令会在这里把台账建出来（不用先初始化）。"
	return res, nil
}
