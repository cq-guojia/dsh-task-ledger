"""只读：统计报表里「必须读过程文档正文才知道的」那几项（分类 / 标签 / 按人 / 按月）。

报表只有两个来源：这里（`Census`），以及从 `list_tasks` / `query_history` 的结果聚合（宿主侧算）。
"""

from __future__ import annotations

from pathlib import Path

from ..core.identity import Identity
from ..core.worklog_md import is_skeleton
from ..store.worklog_store import WorklogStore
from .result import Census


def scan_worklogs(repo: Path, me: Identity) -> Census:
    """逐个过程文档读头部（分类 / 标签 / 创建月 / 发起人），读不动的跳过并提示。"""
    logs = WorklogStore(repo)
    categories: dict[str, int] = {}
    tags: dict[str, int] = {}
    owners: dict[str, int] = {}
    months: dict[str, int] = {}
    notices: list[str] = []
    count = 0

    for path in logs.all():
        try:
            text = logs.read(path)
        except ValueError as exc:
            notices.append(f"跳过 {path.name}：{exc}")
            continue
        if is_skeleton(text):
            continue  # 骨架文档不算一条任务，也不提示（新建后还没填是常态）
        meta = logs.head_meta(path)
        count += 1
        if meta.get("category"):
            categories[meta["category"]] = categories.get(meta["category"], 0) + 1
        for tag in meta.get("tags") or ():
            tags[tag] = tags.get(tag, 0) + 1
        creator = meta.get("creator")
        if creator:
            owners[creator] = owners.get(creator, 0) + 1
        created = meta.get("created") or ""
        month = created[:7]
        if month:
            months[month] = months.get(month, 0) + 1

    return Census(
        tasks=count,
        categories=categories,
        tags=tags,
        owners=owners,
        months=months,
        notices=tuple(notices),
    )
