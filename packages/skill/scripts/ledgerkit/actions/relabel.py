"""改分类 / 标签：分片那两个字段 + 过程文档头部那行，一次改动两处同步。

只动「分类 / 标签」这一件事，不碰归属与状态 —— 归属走 `--owner` / `--release`，
状态只随命令语义变。已结案的任务不在任何分片里，改不了（历史行是快照）。
"""

from __future__ import annotations

from pathlib import Path

from ..core.identity import Identity
from ..core.labels import normalize_label, parse_tags
from ..core.paths import shard_rel
from ..core.time import now
from ..core.worklog_md import (
    StatusLine,
    append_exec_log,
    exec_line,
    rewrite_label_line,
    rewrite_status_line,
)
from ..errors import Fail
from ..store.task_store import TaskStore
from ..store.worklog_store import WorklogStore
from .guard import require_owner
from .result import Result, rel


def _describe(category: str | None, tags: list[str]) -> str:
    """执行记录里那一句说明：`建设 · DSH、台账`。"""
    parts = [category] if category else []
    if tags:
        parts.append("、".join(tags))
    return " · ".join(parts)


def relabel(
    repo: Path,
    me: Identity,
    tid: str,
    *,
    category: str | None = None,
    tags: str | tuple[str, ...] | None = None,
) -> Result:
    """写序：算最终值 → 过程文档（标签行 + 执行记录 + 状态行，一次写）→ 分片。

    `tags` 收字符串（顿号 / 逗号分隔）或已切好的元组 —— 外壳可能已经切过一遍。
    """
    new_category = normalize_label(category, field="分类") if category else None
    new_tags = parse_tags(tags) if tags else None
    if new_category is None and new_tags is None:
        raise Fail(
            "改分类 / 标签至少要给一个：`--category <分类>` 或 `--tags <a、b>`。"
        )

    mine = TaskStore(repo, shard_rel(me.uuid), identity=me)
    task = mine.get(tid)  # 锁内重读
    if task is None:
        raise Fail(
            f"任务 {tid} 不在我的分片里（只能改自己名下在办的任务；已结案的任务改不了）。"
        )
    require_owner(task, tid, me)

    # 没给的沿用原值：分类与标签是一行里的两段，写一次就得给全
    final_category = new_category if new_category else task.get("category")
    final_tags: list[str] = (
        [str(tag) for tag in new_tags]
        if new_tags is not None
        else [str(tag) for tag in (task.get("tags") or ())]
    )
    if not final_category and not final_tags:
        raise Fail("分类与标签都是空的，没有可写的值。")

    when = now()
    updated = dict(task)
    updated["category"] = final_category
    updated["tags"] = final_tags
    updated["updated"] = when

    logs = WorklogStore(repo)
    path = logs.find(tid, task.get("worklog"))
    if path is None:
        mine.put(tid, updated)
        return Result(
            changed=("category", "tags", "updated"),
            where=rel(repo, mine.path),
            message=f"{tid}：改分类 / 标签",
            notices=("提示：这条任务没有过程文档，只改了分片，文档与历史里看不到。",),
        )

    text = logs.read(path)
    note = "改分类 / 标签：" + _describe(final_category, final_tags)
    text = rewrite_label_line(text, final_category, final_tags)
    text = append_exec_log(text, exec_line(when, me.stamp(), "set", note))
    text = rewrite_status_line(
        text, StatusLine(task.get("status") or "doing", me.name, me.uuid, when)
    )
    logs.write(path, text)
    mine.put(tid, updated)

    return Result(
        changed=("category", "tags", "updated"),
        where=rel(repo, mine.path),
        message=f"{tid}：改分类 / 标签",
    )
