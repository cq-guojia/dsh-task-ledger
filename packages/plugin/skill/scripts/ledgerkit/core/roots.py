"""工作区根的判定：哪个目录才是「直接含有 `ledger/` 的那个根」。

全仓唯一实现 —— `shell/` 与 `actions/` 都调这里，不各写一份（否则口径会漂）。
判据是**结构**（含不含 `ledger/`、自己在不在 `ledger/` 里），不看目录里有哪些文件：
项目根自带 `pool.json`、`history/` + `worklog/`、`owners.json` + `owners/` 这类同名文件
或目录都很常见，按「里面有什么」判会把正常项目根误当成台账目录（2026-10-25 改）。
"""

from __future__ import annotations

from pathlib import Path

from ..errors import Fail
from .paths import LEDGER_DIR


def _under_ledger(p: Path) -> bool:
    """`p` 自己叫 `ledger`，或它落在某个 `ledger/` 目录里面。"""
    if p.name == LEDGER_DIR.name:
        return True
    return any(anc.name == LEDGER_DIR.name for anc in p.parents)


def as_root(repo: str | Path, *, source: str = "--repo") -> Path:
    """校验「工作区根」，只看结构：

    - 直接含 `ledger/` ⇒ 就是根。哪怕项目根自己叫 `ledger`、哪怕它自己也有 `pool.json`；
    - 不含 `ledger/`、但自己叫 `ledger` 或落在某个 `ledger/` 下 ⇒ 是台账目录 / 台账里面，拒；
    - 其余（含全新空目录）⇒ 收，第一条写命令会在它下面建 `ledger/`。
    """
    p = Path(repo).expanduser()
    if not p.is_dir():
        raise Fail(
            f"{source} 指向的不是一个目录：{p}\n"
            f"  处理：指向工作区根（直接含有 ledger/ 的那个目录，不是 ledger/ 本身）。"
        )
    if (p / LEDGER_DIR).is_dir():
        return p.resolve()
    if _under_ledger(p):
        anc = next(a for a in (p, *p.parents) if a.name == LEDGER_DIR.name)
        root = anc.parent
        if anc is p:
            what = f"指到了台账目录本身：{p}"
            why = f"它的上一级 {root} 才是工作区根 —— 在它下面跑会再建出 {p / LEDGER_DIR}。"
        else:
            what = f"指到了台账目录里面：{p}"
            why = f"它已经在 {anc} 这个台账目录底下 —— 工作区根是 {anc.parent}。"
        raise Fail(
            f"{source} {what}\n"
            f"  {why}\n"
            f"  处理：把 {source} 指到 {root}\n"
            f"      例：progress.py list --repo {root}"
        )
    return p.resolve()


def root_of(start: str | Path) -> Path | None:
    """从 `start` 往上定位工作区根；找不到返回 None。

    ① 自己在台账目录里（名字叫 `ledger`、且里面没有再套一层 `ledger/`）⇒ 根是它的上一级。
       按位置判，不看里面有什么：项目根自带 `history/` + `worklog/` 不会被误当成台账目录。
    ② 兜底：从**自己**开始往上，取最近的、直接含 `ledger/` 的目录。`start` 必须优先于
       祖先，否则工作区根恰好叫 `ledger` 时会被父目录抢走（2026-10-25 改）。
    """
    here = Path(start).resolve()
    for anc in (here, *here.parents):
        if anc.name == LEDGER_DIR.name and not (anc / LEDGER_DIR).is_dir():
            root = anc.parent
            if (root / LEDGER_DIR).is_dir():
                return root
    for cand in (here, *here.parents):
        if (cand / LEDGER_DIR).is_dir():
            return cand
    return None
