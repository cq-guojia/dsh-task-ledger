"""只读：查在办任务（池 + 分片，后读到的为准）。不拿锁、不跑自举、不做取最新。"""

from __future__ import annotations

from pathlib import Path

from ..core.identity import Identity
from ..core.paths import POOL_REL
from ..store.owners_index import OwnersIndex
from ..store.task_store import TaskStore
from .guard import in_scope, owner_of, status_of
from .query import ListQuery
from .result import ListResult, TaskRow, rel


def list_tasks(repo: Path, me: Identity, q: ListQuery) -> ListResult:
    """合并顺序定死：先池、再按索引键排序的各分片，同一任务号由分片那份胜出。"""
    rows: dict[str, dict] = {}
    where: dict[str, Path] = {}

    pool = TaskStore(repo, POOL_REL)
    for tid, task in pool.all().items():
        rows[tid] = task
        where[tid] = pool.path

    index = OwnersIndex(repo)
    index.assert_present()
    for key in sorted(index.shards()):
        path = index.shards()[key]
        store = TaskStore(repo, Path(path).relative_to(repo / "ledger"))
        for tid, task in store.all().items():
            rows[tid] = task
            where[tid] = store.path

    kept = {tid: t for tid, t in rows.items() if in_scope(t, q, me=me)}
    table = tuple(
        TaskRow(
            tid=tid,
            title=str(task.get("title") or ""),
            status=status_of(task),
            owner=owner_of(task),
            created=task.get("created"),
            started=task.get("started"),
            category=task.get("category"),
            tags=tuple(task.get("tags") or ()),
            where=rel(repo, where[tid]),
        )
        for tid, task in sorted(
            kept.items(), key=lambda kv: str(kv[1].get("created") or "")
        )
    )
    return ListResult(rows=kept, table=table)
