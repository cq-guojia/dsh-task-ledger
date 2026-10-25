"""工作区根的判定：哪个目录才是「直接含有 `ledger/` 的那个根」。

全仓唯一实现 —— `shell/` 与 `actions/` 都调这里，不各写一份（否则口径会漂）。
判据用**内容指纹**而不是目录名：项目根真叫 `ledger` 也不能被误拒。
"""

from __future__ import annotations

from pathlib import Path

from ..errors import Fail
from .paths import (
    HISTORY_DIR,
    LEDGER_DIR,
    OWNERS_DIR,
    OWNERS_REL,
    POOL_REL,
    WORKLOG_DIR,
)


def is_ledger_dir(p: Path) -> bool:
    """`p` 下面**直接**就是台账内容吗（不看目录名，避免误伤名为 ledger 的项目根）。

    只用「足够独占」的组合，宁可漏判也不误伤：单看 `owners/` 太弱（很多仓库都有），
    所以要么见 `pool.json`，要么 `owners.json` + `owners/` 同时成立，要么 history/+worklog/。
    """
    if (p / POOL_REL).is_file():
        return True
    if (p / OWNERS_REL).is_file() and (p / OWNERS_DIR).is_dir():
        return True
    return (p / HISTORY_DIR).is_dir() and (p / WORKLOG_DIR).is_dir()


def as_root(repo: str | Path, *, source: str = "--repo") -> Path:
    """校验「工作区根」：必须是目录，且**不能是台账目录本身**（那是 `ledger/`，不是根）。"""
    p = Path(repo).expanduser()
    if not p.is_dir():
        raise Fail(
            f"{source} 指向的不是一个目录：{p}\n"
            f"  处理：指向工作区根（直接含有 ledger/ 的那个目录，不是 ledger/ 本身）。"
        )
    if is_ledger_dir(p):
        raise Fail(
            f"{source} 指到了台账目录本身：{p}\n"
            f"  它的上一级 {p.parent} 才是工作区根 —— 在它下面跑会再建出 {p / LEDGER_DIR}。\n"
            f"  处理：把 {source} 指到 {p.parent}\n"
            f"      例：progress.py list --repo {p.parent}"
        )
    return p.resolve()


def root_of(start: str | Path) -> Path | None:
    """从 `start` 往上定位工作区根；找不到返回 None。

    ① 优先：「我在某个台账目录里」⇒ 根是它的上一级。按内容判，**与 stray 的
       `ledger/ledger` 是否存在无关**，所以不会被空目录带偏。
    ② 兜底：最近的、直接含 `ledger/` 且自身不是台账目录的祖先。
    """
    here = Path(start).resolve()
    for anc in (here, *here.parents):
        if is_ledger_dir(anc):
            root = anc.parent
            return root if (root / LEDGER_DIR).is_dir() else None
    for cand in (*here.parents, here):
        if (cand / LEDGER_DIR).is_dir() and not is_ledger_dir(cand):
            return cand
    return None
