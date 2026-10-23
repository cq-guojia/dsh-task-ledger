"""事务的唯一入口，20 行：把这次要碰的文件按固定顺序一次锁住。

只加锁，不管写盘、不碰 git、不打印。

三条硬约束：
1. 锁集**只许宽不许窄**；锁集以外的文件一个字节都不许写。
2. **所有判定依据必须在锁内重读** —— 锁外读到的快照只能用来决定"锁多宽"。
3. **任何失败补偿都不许再开一个 `atom`**（文件锁不可重入），只能在同一事务内做完。
"""

from __future__ import annotations

import contextlib
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..core.identity import Identity, normalize
from ..core.paths import (
    HISTORY_DIR,
    OWNERS_REL,
    POOL_REL,
    WORKLOG_DIR,
    history_path_for,
    shard_rel,
    worklog_dir_for,
    worklog_rel,
)
from ..store.locks import ledger_lock
from ..store.owners_index import OwnersIndex
from ..store.task_store import TaskStore

ACTIONS = ("bootstrap", "new", "claim", "set", "log", "close", "tags")


@dataclass(frozen=True)
class Scope:
    """这次要碰哪些文件。`files` 加锁（也逐个刷），`dirs` 只刷盘（展开成已存在的文件）。"""

    files: tuple[Path, ...] = ()
    dirs: tuple[Path, ...] = ()

    def __or__(self, other: Scope) -> Scope:
        return Scope(
            files=_merge(self.files, other.files),
            dirs=_merge(self.dirs, other.dirs),
        )


def _merge(a: tuple[Path, ...], b: tuple[Path, ...]) -> tuple[Path, ...]:
    out: list[Path] = []
    for item in (*a, *b):
        if item not in out:
            out.append(item)
    return tuple(out)


def _pool(repo: Path) -> Path:
    return POOL_REL


def _shard(repo: Path, me: Identity) -> Path:
    return shard_rel(me.email)


def _other_shards(repo: Path, me: Identity) -> tuple[Path, ...]:
    """索引里除我之外的分片（宁宽：认领的前置要查、交接要写对方那份）。"""
    index = OwnersIndex(repo)
    me_key = normalize(me.email)
    out: list[Path] = []
    for key, record in index.all().items():
        if key == me_key:
            continue
        name = (record or {}).get("file")
        if name:
            out.append(Path("owners") / str(name))
    return tuple(out)


def _worklog_of(
    repo: Path, params: dict[str, Any]
) -> tuple[tuple[Path, ...], tuple[Path, ...]]:
    """这条任务的过程文档：查得到给文件，查不到退回整个 `worklog/` 目录（宁宽）。"""
    tid = params.get("tid")
    if not tid:
        return (), (WORKLOG_DIR,)
    pool = TaskStore(repo, POOL_REL)
    task = pool.get(str(tid))
    if task is None:
        index = OwnersIndex(repo)
        for path in index.shards().values():
            rel = Path(path).relative_to(repo / "ledger")
            task = TaskStore(repo, rel).get(str(tid))
            if task is not None:
                break
    worklog = (task or {}).get("worklog")
    if worklog:
        return (Path(worklog),), ()
    return (), (WORKLOG_DIR,)


def lock_scope(repo: Path, me: Identity, action: str, params: dict[str, Any]) -> Scope:
    """算出这次可能碰哪些文件（**在锁外跑**，宁可算宽）。七个分支与 §四 的表逐行对应。"""
    if action not in ACTIONS:
        raise ValueError(f"未知的 lock_scope action：{action!r}")
    mine = _shard(repo, me)
    pool = _pool(repo)
    index = OWNERS_REL
    others = _other_shards(repo, me)

    if action == "bootstrap":
        return Scope(files=(index, pool, mine))

    if action == "new":
        mine_flag = bool(params.get("mine"))
        target = mine if mine_flag else pool
        created = params.get("created") or ""
        tid = params.get("tid")
        # 本次要新建那篇文档：路径算得出来（锁集允许含不存在的路径），不放进去写集就超出锁集
        doc = (
            (Path(worklog_rel(str(tid), created)),) if tid and len(created) >= 7 else ()
        )
        month_dir = worklog_dir_for(created) if len(created) >= 7 else WORKLOG_DIR
        return Scope(files=(target, *doc), dirs=(month_dir,))

    if action == "claim":
        wfiles, wdirs = _worklog_of(repo, params)
        return Scope(files=(pool, mine, *others, *wfiles), dirs=wdirs)

    if action == "set":
        wfiles, wdirs = _worklog_of(repo, params)
        # 分支取并集：release 写池、handoff 写对方分片、指向自己且未认领先认领（写我的分片）；已在名下则空转不写盘
        return Scope(files=(mine, pool, *others, *wfiles), dirs=wdirs)

    if action == "log":
        wfiles, wdirs = _worklog_of(repo, params)
        return Scope(files=(mine, *wfiles), dirs=wdirs)

    if action == "close":
        wfiles, wdirs = _worklog_of(repo, params)
        finished = params.get("finished") or ""
        history = history_path_for(finished) if len(finished) >= 7 else HISTORY_DIR
        return Scope(files=(mine, history, *wfiles), dirs=wdirs)

    # tags：我的分片 + 全部在办文档
    return Scope(files=(mine,), dirs=(WORKLOG_DIR,))


@contextlib.contextmanager
def atom(repo: Path, *rels: Path) -> Iterator[None]:
    """按路径排序后依次加锁，退出即完成。不建记账本、不写盘、不提交、不打印。"""
    with ledger_lock(repo, *rels):
        yield
