"""归并标签：改我名下在办任务的标签行，再改分片里的 `category` / `tags`。

已封卷的文档不动。`dry_run=True` 时**整条命令零写**：只算出会改哪些任务号。
"""

from __future__ import annotations

from pathlib import Path

from ..core.identity import Identity
from ..core.labels import normalize_label
from ..core.paths import POOL_REL, shard_rel
from ..core.worklog_md import has_frozen_line, rewrite_label_line
from ..errors import Fail
from ..store.atomic import restore, snapshot
from ..store.task_store import TaskStore
from ..store.worklog_store import WorklogStore
from .result import Result, rel


def rename_label(
    repo: Path, me: Identity, old: str, new: str, *, dry_run: bool = False
) -> Result:
    """写序：先逐篇改头部标签行（逐篇 `snapshot`）→ 再改分片。

    `old` / `new` 落到标签行的顺序定死：先比分类，再比标签，都不命中就跳过；
    分类和标签同时等于 `old` 时**只改分类**。
    """
    old_label = normalize_label(old, field="标签")
    new_label = normalize_label(new, field="标签")

    mine = TaskStore(repo, shard_rel(me.email), identity=me)
    pool = TaskStore(repo, POOL_REL)
    if not (mine.path.exists() or pool.path.exists()):
        raise Fail("还没有台账，没有可预览的任务。")

    logs = WorklogStore(repo)
    tasks = mine.all()
    if dry_run:
        return Result(
            dry_run=True,
            payload={"tids": tuple(_hit_tids(tasks, old_label))},
            notices=(
                f"预览：有 {len(_hit_tids(tasks, old_label))} 条任务会改，没有写任何文件。",
            ),
        )

    changed_tids: list[str] = []
    backups: list[tuple[Path, bytes | None]] = [(mine.path, snapshot(mine.path))]
    try:
        for tid, task in tasks.items():
            category, tags = _apply(task, old_label, new_label)
            if category is None:
                continue
            doc_path = logs.find(tid, task.get("worklog"))
            if doc_path is not None:
                text = logs.read(doc_path)
                if not has_frozen_line(text):
                    # 逐篇留原文：半路写坏要能按字节退回（2026-10-23 补，设计文档 3.2 节）
                    backups.append((doc_path, snapshot(doc_path)))
                    logs.write(doc_path, rewrite_label_line(text, category, tags))
            updated = dict(task)
            updated["category"] = category
            updated["tags"] = list(tags)
            mine.put(tid, updated)
            changed_tids.append(tid)
    except Exception:
        _roll_back(repo, backups)
        raise

    return Result(
        changed=("category", "tags"),
        where=rel(repo, mine.path),
        message=f"归并标签：{old_label} → {new_label}（{len(changed_tids)} 条）",
        payload={"tids": tuple(changed_tids)},
    )


def _roll_back(repo: Path, backups: list[tuple[Path, bytes | None]]) -> None:
    """按字节退回本次改过的每一篇；哪一篇退不回去要照实说，不许谎称已恢复。"""
    unrecovered: list[str] = []
    for path, before in reversed(backups):
        try:
            restore(path, before)
        except Exception as exc:  # noqa: BLE001 —— 要把每一篇的失败原因都收齐
            unrecovered.append(f"{rel(repo, path)}（{exc}）")
    if unrecovered:
        raise Fail(
            "归并标签半路失败，且下面这些文件没能按字节恢复：\n  "
            + "\n  ".join(unrecovered)
            + "\n  处理：对照 git 手工还原（git checkout -- <文件>），不要直接重跑。"
        )


def _hit_tids(tasks: dict, old_label: str) -> list[str]:
    out: list[str] = []
    for tid, task in tasks.items():
        category, _ = _apply(task, old_label, "")
        if category is not None:
            out.append(tid)
    return out


def _apply(
    task: dict, old_label: str, new_label: str
) -> tuple[str | None, tuple[str, ...]]:
    """一条任务的新 (category, tags)；不在范围内返回 (None, ())。"""
    category = task.get("category")
    tags = tuple(task.get("tags") or ())
    if category == old_label:
        return (new_label, tags)
    if old_label in tags:
        merged: list[str] = []
        for tag in tags:
            value = new_label if tag == old_label else tag
            if value not in merged:
                merged.append(value)
        return (category, tuple(merged))
    return (None, ())
