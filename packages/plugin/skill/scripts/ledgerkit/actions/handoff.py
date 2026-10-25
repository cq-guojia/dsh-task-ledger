"""交接：先写进对方分片，再删我分片那行，再记一笔。"""

from __future__ import annotations

from pathlib import Path

from ..core.identity import Identity, normalize
from ..core.paths import shard_rel
from ..core.time import now
from ..core.worklog_md import exec_line
from ..errors import Fail
from ..store.owners_index import OwnersIndex
from ..store.task_store import TaskStore
from ..store.worklog_store import WorklogStore
from .guard import owner_of, same_task_ignoring_stamp
from .result import Result, rel


def handoff(repo: Path, me: Identity, tid: str, *, to: str) -> Result:
    """写序：对方分片 → 删我分片那行 → 过程文档记一笔。"""
    index = OwnersIndex(repo)
    record = index.get(to)
    if record is None:
        raise Fail(
            f"{to} 还没在索引里登记过 ⇒ 不能交接给他（写出一份对别人不存在的分片，他自己也看不到）。"
        )
    mine = TaskStore(repo, shard_rel(me.uuid), identity=me)
    task = mine.get(tid)  # 锁内重读
    if task is None:
        raise Fail(f"任务 {tid} 不在我的分片里，交接不了。")

    to_key = normalize(to)
    # 行内 owner 只能是我（正常）或已经是对方（上次交接崩在半途，这次要补齐）：
    # 别的一律拒绝——分片里有、owner 却写着第三个人 ⇒ 台账脏了
    owner = owner_of(task)
    if owner not in (normalize(me.uuid), to_key):
        raise Fail(
            f"任务 {tid} 的负责人是 {owner}，不是你（{me.label()}），交接不了。\n"
            "  处理：跑 validate 看台账是不是脏了。"
        )
    to_name = str(record.get("name") or "") or None  # 只用于显示
    who = to_name or to_key
    to_store = TaskStore(repo, shard_rel(to_key))
    moved = dict(task)
    moved["owner"] = to_key
    moved["owner_name"] = to_name
    moved["updated"] = now()

    existing = to_store.get(tid)
    if existing is not None:
        if not same_task_ignoring_stamp(existing, moved):
            raise Fail(
                f"任务 {tid} 在 {to_key} 的分片里已经存在，且内容与本次不一致 ⇒ 拒绝交接。"
            )
        # 重跑：以对方那份为准，只补删我这边
        mine.drop(tid)
        logs = WorklogStore(repo)
        path = logs.find(tid, moved.get("worklog"))
        if path is not None:
            logs.append_exec(
                path, exec_line(now(), me.label(), "set", f"交接给 {who}（补齐）")
            )
        return Result(
            already_done=True,
            where=rel(repo, to_store.path),
            message=f"交接 {tid} → {who}：补齐上次未完成的清理",
            notices=(f"任务 {tid} 已在对方分片里（内容一致），本次只补删我分片那行。",),
        )

    to_store.put(tid, moved)
    mine.drop(tid)

    logs = WorklogStore(repo)
    path = logs.find(tid, moved.get("worklog"))
    note = None
    if path is None:
        note = f"任务 {tid} 已交给 {who}，但过程文档没找到，跳过执行记录。"
    else:
        logs.append_exec(path, exec_line(now(), me.label(), "set", f"交接给 {who}"))
    return Result(
        changed=("owner", "owner_name", "updated"),
        where=rel(repo, to_store.path),
        message=f"交接 {tid} → {who}",
        notices=(note,) if note else (),
    )
