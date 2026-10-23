"""释放：写回公共池，再删我分片那行，再记一笔。"""

from __future__ import annotations

from pathlib import Path

from ..core.identity import Identity
from ..core.paths import POOL_REL, shard_rel
from ..core.time import now
from ..core.worklog_md import exec_line
from ..errors import Fail
from ..store.task_store import TaskStore
from ..store.worklog_store import WorklogStore
from .result import Result, rel


def release(repo: Path, me: Identity, tid: str) -> Result:
    """写序：写回池（已有同号就不覆盖）→ 删我分片那行 → 过程文档记一笔。"""
    pool = TaskStore(repo, POOL_REL)
    mine = TaskStore(repo, shard_rel(me.email), identity=me)
    task = mine.get(tid)  # 锁内重读
    if task is None:
        if pool.get(tid) is not None:
            return Result(
                already_done=True,
                where=rel(repo, pool.path),
                notices=(f"任务 {tid} 已经在公共池里，无需重复释放。",),
            )
        raise Fail(f"任务 {tid} 不在我的分片里，也没在公共池里。")

    back = dict(task)
    back["owner"] = None
    back["status"] = "open"
    back["updated"] = now()
    if pool.get(tid) is None:
        pool.put(tid, back)
    mine.drop(tid)

    logs = WorklogStore(repo)
    path = logs.find(tid, back.get("worklog"))
    note = None
    if path is None:
        note = f"任务 {tid} 已退回公共池，但过程文档没找到，跳过执行记录。"
    else:
        logs.append_exec(path, exec_line(now(), me.email, "release", "释放回公共池"))
    return Result(
        changed=("owner", "status", "updated"),
        where=rel(repo, pool.path),
        message=f"释放 {tid}：{back.get('title') or ''}".strip(),
        notices=(note,) if note else (),
    )
