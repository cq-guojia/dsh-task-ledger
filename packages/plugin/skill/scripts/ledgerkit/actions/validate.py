"""只读：台账体检。`problems` 才影响退出码，`notices` 只提示。

四类问题（problems）：索引与文件对不上、池里有越权、字段非法、分片主人与分区键不一致。
提示（notices）：骨架文档、旧格式行、历史解析警告、历史已结案但分片还挂着。
"""

from __future__ import annotations

from pathlib import Path

from ..core import history_md
from ..core.identity import Identity
from ..core.labels import STATUSES
from ..core.paths import OWNERS_REL, POOL_REL, LEGACY_HISTORY_REL, to_repo_rel
from ..core.worklog_md import is_skeleton
from ..store.history_store import HistoryStore
from ..store.owners_index import OwnersIndex
from ..store.task_store import TaskStore
from ..store.worklog_store import WorklogStore
from .guard import owner_of, status_of
from .result import ValidationReport, rel


def validate(repo: Path, me: Identity) -> ValidationReport:
    problems: list[str] = []
    notices: list[str] = []
    checked = 0
    total = 0

    pool = TaskStore(repo, POOL_REL)
    index = OwnersIndex(repo)

    if pool.path.exists():
        checked += 1
        for tid, task in pool.all().items():
            total += 1
            if owner_of(task):
                problems.append(f"公共池里的 {tid} 带着 owner（池里的行必须无人认领）。")
            if task.get("status") not in STATUSES:
                problems.append(f"公共池里的 {tid} 状态 {task.get('status')!r} 非法。")

    for key, path in index.shards().items():
        if not path.exists():
            problems.append(f"索引登记了 {key}，但分片文件 {path.name} 不存在。")
            continue
        checked += 1
        store = TaskStore(repo, Path(path).relative_to(repo / "ledger"))
        for tid, task in store.all().items():
            total += 1
            owner = owner_of(task)
            if not owner:
                problems.append(f"分片 {key} 里的 {tid} 没有 owner。")
            elif owner != key:
                problems.append(
                    f"分片 {key} 里的 {tid} 的 owner 是 {owner}（分片主人与分区键不一致）。"
                )
            status = status_of(task)
            if status not in STATUSES:
                problems.append(f"分片 {key} 里的 {tid} 状态 {status!r} 非法。")

    # 目录里有、索引没登记的分片（全仓唯一扫目录的地方）
    registered = {p.name for p in index.shards().values()}
    for path in index.disk_shards():
        if path.name not in registered:
            problems.append(f"owners/ 里的 {path.name} 没有在索引里登记（对它人等于不存在）。")

    # 历史：解析警告 + 「已结案但分片里还挂着」（按过程文档文件名对账，
    # 不从文件名反推任务号 —— 任务号的年月日在父目录里，反推必错）
    open_docs = _open_worklog_names(repo, index)
    history = HistoryStore(repo)
    for path in history.sources():
        checked += 1
        rows, warns = history_md.parse_history(history.read(path))
        notices.extend(f"{rel(repo, path)}：{w}" for w in warns)
        for row in rows:
            name = Path(row.get("worklog") or "").name
            if name and name in open_docs:
                notices.append(
                    f"历史里有「{row.get('title') or name}」的结案行，"
                    "但它还挂在在办台账里。"
                )

    # 骨架文档只提示
    logs = WorklogStore(repo)
    for path in logs.all():
        checked += 1
        try:
            text = logs.read(path)
        except ValueError:
            continue
        if is_skeleton(text):
            notices.append(f"{rel(repo, path)} 还是骨架（正文没填）。")

    legacy = repo / to_repo_rel(LEGACY_HISTORY_REL)
    if legacy.exists():
        notices.append(f"存量平铺文件 {rel(repo, legacy)} 只读兼容，不会重写。")
    if not (repo / to_repo_rel(OWNERS_REL)).exists():
        notices.append("还没有 owners.json（索引）：跑一条写命令会自动建。")

    return ValidationReport(
        problems=tuple(problems),
        notices=tuple(notices),
        checked_files=checked,
        total_tasks=total,
    )


def _open_worklog_names(repo: Path, index: OwnersIndex) -> set[str]:
    """在办任务的过程文档**文件名**集合（池 + 全部分片）：历史行按它对账。"""
    stores = [TaskStore(repo, POOL_REL)]
    for path in index.shards().values():
        if path.exists():
            stores.append(TaskStore(repo, Path(path).relative_to(repo / "ledger")))
    out: set[str] = set()
    for store in stores:
        for task in store.all().values():
            name = Path((task.get("worklog") or "").strip()).name
            if name:
                out.add(name)
    return out
