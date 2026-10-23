"""只读：查已结案（按创建时间过滤，倒序取最近）。不写任何字节、不依赖格式升级。"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ..core import history_md
from ..core.identity import Identity, normalize
from ..core.time import time_key
from ..store.history_store import HistoryStore
from .query import COUNT_CAP, HistoryQuery
from .result import HistoryResult, rel


def query_history(repo: Path, me: Identity, q: HistoryQuery) -> HistoryResult:
    """`--owner` / `--mine` 一律**精确相等**（不做前缀 / 子串）；`--since` / `--until` 比 `created`。"""
    store = HistoryStore(repo)
    sources = store.sources()
    if q.months:
        sources = sources[-int(q.months) :]

    records: list[dict[str, Any]] = []
    warnings: list[str] = []
    for path in sources:
        rows, warns = history_md.parse_history(store.read(path))
        warnings.extend(f"{rel(repo, path)}：{w}" for w in warns)
        for row in rows:
            row = dict(row)
            row["src"] = rel(repo, path)
            row["created"] = time_key(row.get("created") or "") or row.get("created")
            records.append(row)

    if q.mine:
        wanted = {k for k in (me.email, *me.aliases) if k}
        wanted = {normalize(k) for k in wanted}
        records = [r for r in records if normalize(r.get("owner") or "") in wanted]
    elif q.owner:
        key = normalize(q.owner)
        records = [r for r in records if normalize(r.get("owner") or "") == key]
    if q.category:
        records = [r for r in records if (r.get("category") or "") == q.category]
    if q.tag:
        records = [r for r in records if q.tag in (r.get("tags") or ())]
    if q.since:
        records = [r for r in records if (r.get("created") or "") >= q.since]
    if q.until:
        records = [r for r in records if (r.get("created") or "") <= q.until]

    records.sort(key=lambda r: str(r.get("created") or ""), reverse=True)
    capped = False
    if q.count_only and len(records) > COUNT_CAP:
        capped = True
        records = records[:COUNT_CAP]
    elif q.limit:
        records = records[: int(q.limit)]

    filters = {
        "owner": q.owner,
        "mine": q.mine,
        "category": q.category,
        "tag": q.tag,
        "since": q.since,
        "until": q.until,
        "limit": q.limit,
        "months": q.months,
    }
    return HistoryResult(
        count=len(records),
        filters=filters,
        records=tuple(records),
        warnings=tuple(warnings),
        capped=capped,
    )
