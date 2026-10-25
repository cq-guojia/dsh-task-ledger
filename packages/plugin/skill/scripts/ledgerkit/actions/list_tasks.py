"""只读：查在办任务（池 + 分片，后读到的为准）。不拿锁、不跑自举、不做取最新。"""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import Any

from ..core.identity import Identity
from ..core.paths import POOL_REL
from ..errors import Fail
from ..store.owners_index import OwnersIndex
from ..store.task_store import TaskStore
from .guard import in_scope, owner_of, require_uuid, status_of
from .query import ListQuery
from .result import ListResult, TaskRow, rel


def list_tasks(repo: Path, me: Identity, q: ListQuery) -> ListResult:
    """合并顺序定死：先池、再按索引键排序的各分片，同一任务号由分片那份胜出。"""
    # `--owner` 只认 uuid，且**给了就必须生效**：和 --mine / --pool 同传直接报错，
    # 不许出现「传了 uuid 却被范围参数静默吃掉」（--owner "" 也算给了，同样报错）。
    if q.owner is not None:
        if q.scope in ("mine", "pool"):
            raise Fail("--owner 不能和 --mine / --pool 一起用：一次只按一种范围筛。")
        q = replace(q, owner=require_uuid(q.owner, field="--owner"))
    rows: dict[str, dict[str, Any]] = {}
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

    name_keys = index.keys_of_name(q.owner_name) if q.owner_name else set()
    kept = {
        tid: t for tid, t in rows.items() if in_scope(t, q, me=me, name_keys=name_keys)
    }
    table = tuple(
        TaskRow(
            tid=tid,
            title=str(task.get("title") or ""),
            status=status_of(task),
            owner=task.get("owner_name") or owner_of(task),
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
