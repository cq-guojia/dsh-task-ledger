"""业务校验的共用件：任务号形态、任务存不存在、「这条是不是你的」。

**`owner` / `status` 的读取只走这里的四个谓词**：`store/` 里不许出现 `get("owner")`，
`actions/` 里除本文件外也不许裸写字段名比较。
"""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import Any

from ..core.identity import Identity, is_me, normalize
from ..core.labels import LEGACY_STATUSES
from ..core.paths import POOL_REL
from ..errors import Fail
from ..store.owners_index import OwnersIndex
from ..store.task_store import TaskStore
from .query import ListQuery


def current_identity(repo: Path) -> Identity:
    """env 的本机身份 + `owners.json` 里这个身份的 `aliases`（不写盘、不登记）。"""
    from .. import env
    from ..core.identity import with_aliases

    me = env.current(repo)
    record = OwnersIndex(repo).get(me.email) or {}
    aliases = tuple(record.get("aliases") or ())
    return with_aliases(me, aliases) if aliases else me


def require_task(tasks: Mapping[str, Any], tid: str, *, where: Path) -> dict[str, Any]:
    """取一条任务；缺失时给可读原因（带所在文件）。"""
    task = tasks.get(tid)
    if task is None:
        raise Fail(f"任务 {tid} 不在 {_show(where)} 里。")
    if not isinstance(task, dict):
        raise Fail(f"任务 {tid} 在 {_show(where)} 里不是一条对象，台账可能坏了。")
    return dict(task)


def require_owner(task: Mapping[str, Any], tid: str, me: Identity) -> None:
    """只有当前 owner 能改。"""
    owner = owner_of(task)
    if not owner:
        raise Fail(f"任务 {tid} 还没有人认领（在公共池里），先 claim 再改。")
    if not is_me(me, owner):
        raise Fail(f"任务 {tid} 的负责人是 {owner}，不是你（{me.label()}）。")


def same_task_ignoring_stamp(a: Mapping[str, Any], b: Mapping[str, Any]) -> bool:
    """两份内容是不是只差 `updated`（交接重跑时以对方那份为准的判据）。"""
    left = {k: v for k, v in a.items() if k not in ("updated", "updated_by")}
    right = {k: v for k, v in b.items() if k not in ("updated", "updated_by")}
    return left == right


def owner_of(task: Mapping[str, Any]) -> str | None:
    """读 `owner` 的唯一入口。"""
    value = task.get("owner")
    return normalize(value) if isinstance(value, str) and value.strip() else None


def status_of(task: Mapping[str, Any]) -> str:
    """读 `status` 的唯一入口；老数据 `blocked` 当进行中。"""
    value = task.get("status")
    if not isinstance(value, str) or not value.strip():
        return "open"
    value = value.strip().lower()
    return "doing" if value in LEGACY_STATUSES else value


def is_mine(task: Mapping[str, Any], me: Identity) -> bool:
    """这条任务是不是我的（含 aliases）。"""
    return is_me(me, owner_of(task) or "")


def in_scope(task: Mapping[str, Any], q: ListQuery, *, me: Identity) -> bool:
    """`list` 的过滤谓词：范围、状态、分类、标签、创建时间闭区间。"""
    if q.scope == "mine" and not is_mine(task, me):
        return False
    if q.scope == "pool" and owner_of(task):
        return False
    if q.scope == "owner" and q.owner and normalize(q.owner) != owner_of(task):
        return False
    if q.statuses:
        status = status_of(task)
        wanted = {s for s in q.statuses}
        if status not in wanted and not (
            "doing" in wanted and status in LEGACY_STATUSES
        ):
            return False
    if q.category and (task.get("category") or "") != q.category:
        return False
    if q.tag and q.tag not in (task.get("tags") or ()):
        return False
    created = task.get("created")
    if q.since and isinstance(created, str) and created[:19] < q.since[:19]:
        return False
    return not (q.until and isinstance(created, str) and created[:19] > q.until[:19])


def _show(path: Path) -> str:
    try:
        return str(Path(path).name)
    except Exception:  # noqa: BLE001
        return str(path)


def load_task(repo: Path, tid: str) -> tuple[dict[str, Any], list[Path]]:
    """在池 + 索引登记的全部分片里找这条任务（只读），返回 (任务, 出现过的文件)。"""
    index = OwnersIndex(repo)
    index.assert_present()
    found: dict[str, Any] | None = None
    where: list[Path] = []
    pool = TaskStore(repo, POOL_REL)
    if pool.get(tid):
        found = pool.get(tid)
        where.append(pool.path)
    for rel in _shard_rels(repo, index):
        store = TaskStore(repo, rel)
        task = store.get(tid)
        if task:
            where.append(store.path)
            if found is None:
                found = task
    if found is None:
        raise Fail(f"找不到任务 {tid}（池与已登记的分片里都没有）。")
    return found, where


def _shard_rels(repo: Path, index: OwnersIndex) -> list[Path]:
    out: list[Path] = []
    for path in index.shards().values():
        try:
            out.append(path.relative_to(repo / "ledger"))
        except ValueError:  # pragma: no cover
            continue
    return out
