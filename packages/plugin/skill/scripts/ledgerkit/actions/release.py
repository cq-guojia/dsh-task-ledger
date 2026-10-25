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
from .guard import owner_of, require_owner, status_of
from .result import Result, rel


def release(repo: Path, me: Identity, tid: str) -> Result:
    """写序：写回池（已有同号就不覆盖）→ 删我分片那行 → 过程文档记一笔。"""
    pool = TaskStore(repo, POOL_REL)
    mine = TaskStore(repo, shard_rel(me.uuid), identity=me)
    task = mine.get(tid)  # 锁内重读
    if task is None:
        in_pool = pool.get(tid)
        if in_pool is not None:
            # 幂等分支也要验「池里那条真的已经是没人要的开放任务」，
            # 否则池里混进带 owner 的脏行时，release 会报「无需重复释放」而任务实际仍被占
            if owner_of(in_pool) or status_of(in_pool) != "open":
                raise Fail(
                    f"任务 {tid} 在公共池里，但身上还挂着 owner / 不是 open —— 台账脏了。\n"
                    "  处理：跑 validate 看清单，别用 release 强行覆盖。"
                )
            return Result(
                already_done=True,
                where=rel(repo, pool.path),
                notices=(f"任务 {tid} 已经在公共池里，无需重复释放。",),
            )
        raise Fail(f"任务 {tid} 不在我的分片里，也没在公共池里。")

    # 分片里在、但行内 owner 不是我 ⇒ 台账脏了（validate ⑤）：不许把别人的行推进池
    require_owner(task, tid, me)

    back = dict(task)
    back["owner"] = None
    back["owner_name"] = None  # 冗余显示名跟着 owner 一起清，否则池里那条仍显示原负责人
    back["status"] = "open"
    back["updated"] = now()
    if pool.get(tid) is None:
        pool.put(tid, back)
    else:
        # 池里已有同号：那份必须是干净的空位，否则不写回（它的 owner/owner_name 会被旧值带脏）
        existing = pool.get(tid) or {}
        if owner_of(existing) or status_of(existing) != "open":
            raise Fail(
                f"公共池里已经有一条 {tid}，且它带着 owner / 不是 open —— 台账脏了。\n"
                "  处理：跑 validate 看清单，先确认哪条是真的。"
            )
    mine.drop(tid)

    logs = WorklogStore(repo)
    path = logs.find(tid, back.get("worklog"))
    note = None
    if path is None:
        note = f"任务 {tid} 已退回公共池，但过程文档没找到，跳过执行记录。"
    else:
        logs.append_exec(path, exec_line(now(), me.stamp(), "release", "释放回公共池"))
    return Result(
        changed=("owner", "owner_name", "status", "updated"),
        where=rel(repo, pool.path),
        message=f"释放 {tid}：{back.get('title') or ''}".strip(),
        notices=(note,) if note else (),
    )
