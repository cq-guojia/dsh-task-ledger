"""认领：先写进我的分片，再删池里那行。**顺序反了任务会凭空消失**。"""

from __future__ import annotations

from pathlib import Path

from ..core.identity import Identity, normalize
from ..core.paths import POOL_REL, shard_rel
from ..core.time import now
from ..core.worklog_md import exec_line
from ..errors import Fail
from ..store.owners_index import OwnersIndex
from ..store.task_store import TaskStore
from ..store.worklog_store import WorklogStore
from .result import Result, rel


def claim(repo: Path, me: Identity, tid: str) -> Result:
    """写序：我的分片 → 删池里那行 → 过程文档记一笔。"""
    pool = TaskStore(repo, POOL_REL)
    mine = TaskStore(repo, shard_rel(me.email), identity=me)
    me_key = normalize(me.email)

    # 前置：别人正在改它（他的分片里已有这个号）⇒ 拒绝
    for key, path in OwnersIndex(repo).shards().items():
        if key == me_key:
            continue
        other = TaskStore(repo, Path(path).relative_to(repo / "ledger"))
        if other.get(tid) is not None:
            raise Fail(f"任务 {tid} 已在 {key} 的分片里（别人正在做），不能认领。")

    task = pool.get(tid)          # 锁内重读
    if task is None:
        if mine.get(tid) is not None:
            # 重跑：分片里已有这个号（上次崩了一半）⇒ 只补删池里那行
            pool.drop(tid)
            return Result(
                already_done=True,
                where=rel(repo, mine.path),
                message=f"认领 {tid}：补齐上次未完成的清理",
                notices=(f"任务 {tid} 已经在我的分片里，本次只补删公共池那行。",),
            )
        raise Fail(f"公共池里没有任务 {tid}（已经被人认领或不存在）。")

    moved = dict(task)
    moved["owner"] = me.email
    moved["started"] = moved.get("started") or now()
    moved["updated"] = now()
    mine.put(tid, moved)
    pool.drop(tid)

    note = f"任务 {tid} 已记到我的分片，过程文档没找到，跳过执行记录。"
    logs = WorklogStore(repo)
    path = logs.find(tid, moved.get("worklog"))
    if path is not None:
        logs.append_exec(path, exec_line(now(), me.email, "claim", "认领"))
        note = None
    return Result(
        changed=("owner", "started", "updated"),
        where=rel(repo, mine.path),
        message=f"认领 {tid}：{moved.get('title') or ''}".strip(),
        payload={},
        notices=(note,) if note else (),
    )
