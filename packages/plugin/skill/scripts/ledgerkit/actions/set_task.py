"""改状态的入口：只看参数、决定走哪个动作，**自己不加锁、不改任何文件**。

它是全树唯一的跨动作引用点（import `release` / `handoff` / `claim`）。
"""

from __future__ import annotations

from pathlib import Path

from ..core.identity import Identity, is_me
from ..core.labels import STATUSES
from ..core.paths import shard_rel
from ..core.time import now
from ..core.worklog_md import exec_line
from ..errors import Fail
from ..store.task_store import TaskStore
from ..store.worklog_store import WorklogStore
from . import claim as claim_mod
from . import handoff as handoff_mod
from . import release as release_mod
from .guard import is_mine, status_of
from .result import Result, rel


def set_task(
    repo: Path, me: Identity, tid: str, *, status: str | None = None,
    owner: str | None = None,
) -> Result:
    """路由：先看 `--owner` 给没给 —— 没给就只处理 status，绝不拿现存 owner 反推。"""
    if status is not None and status not in STATUSES:
        raise Fail(
            f"状态 {status!r} 不在白名单里；只能是 {' / '.join(STATUSES)}"
            "（`done` 只能走 close，`blocked` 是旧数据、读侧当进行中）。"
        )
    if status == "open" and owner is not None:
        raise Fail("--status open 不能和 --owner 一起用（先 release 再改状态）。")

    if owner is None:
        return set_field(repo, me, tid, status=status)

    target = owner.strip()
    if not target:
        if status is not None:
            raise Fail("释放（--owner 为空）时不能再带 --status。")
        return release_mod.release(repo, me, tid)
    if _is_others(me, target):
        return handoff_mod.handoff(repo, me, tid, to=target, status=status)
    if _already_mine(repo, me, tid):
        return set_field(repo, me, tid, status=status)
    # 指向自己、但现在不在我名下 ⇒ 先认领，再按需要改状态
    claim_mod.claim(repo, me, tid)
    if status is None:
        return Result(
            changed=("owner",),
            where=rel(repo, (TaskStore(repo, shard_rel(me.email), identity=me)).path),
            message=f"认领 {tid}",
        )
    return set_field(repo, me, tid, status=status)


def set_field(
    repo: Path, me: Identity, tid: str, *, status: str | None = None
) -> Result:
    """改我名下这条任务的 `status`（`set_task` 的最后一个分支，不单独成文件）。"""
    if status is None:
        raise Fail("--status 和 --owner 至少要给一个。")
    mine = TaskStore(repo, shard_rel(me.email), identity=me)
    task = mine.get(tid)
    if task is None:
        raise Fail(f"任务 {tid} 不在我的分片里（不是我的，或还没认领）。")
    current = status_of(task)
    if current == status:
        return Result(
            already_done=True,
            where=rel(repo, mine.path),
            notices=(f"任务 {tid} 的状态已经是 {status}，没有改动。",),
        )
    updated = dict(task)
    updated["status"] = status
    if not updated.get("started") and status in ("doing", "blocked"):
        updated["started"] = now()
    updated["updated"] = now()
    mine.put(tid, updated)

    logs = WorklogStore(repo)
    path = logs.find(tid, updated.get("worklog"))
    note = None
    if path is None:
        note = f"任务 {tid} 状态已改为 {status}，但过程文档没找到，跳过执行记录。"
    else:
        logs.append_exec(path, exec_line(now(), me.email, "set", f"状态改为 {status}"))
    return Result(
        changed=("status", "updated"),
        where=rel(repo, mine.path),
        message=f"{tid}：状态 {current} → {status}",
        notices=(note,) if note else (),
    )


def _is_others(me: Identity, who: str) -> bool:
    return not is_me(me, who)


def _already_mine(repo: Path, me: Identity, tid: str) -> bool:
    mine = TaskStore(repo, shard_rel(me.email), identity=me)
    task = mine.get(tid)
    return task is not None and is_mine(task, me)
