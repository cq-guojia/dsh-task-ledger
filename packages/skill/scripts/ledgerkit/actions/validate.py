"""只读：台账体检。两档：默认浅度只查格式，`--deep` 才读全部历史与过程文档正文。

浅度（默认）：池 + 各分片的字段格式、索引与文件对不对得上、**当月**历史、每篇过程文档的模板格式。
深度（`--deep`）：历史不止当月（全部月份），过程文档再判骨架（正文填了没）。

只查格式，不查业务（该谁结案、逾期与否都不管）；也不查「同一任务号落在多个文件」——
读侧只显示一次（`show` 会点名）、写侧已有防护，撞上了不关体检的事（2026-10-24 用户拍板）。
"""

from __future__ import annotations

from pathlib import Path

from ..core import history_md
from ..core.identity import Identity
from ..core.labels import STATUSES
from ..core.paths import (
    LEDGER_DIR,
    OWNERS_REL,
    POOL_REL,
    to_repo_rel,
)
from ..core.time import now
from ..core.worklog_md import (
    duplicated_sections,
    format_problems,
    is_skeleton,
    lacks_exec_section,
)
from ..store.history_store import HistoryStore
from ..store.owners_index import OwnersIndex
from ..store.task_store import TaskStore
from ..store.worklog_store import WorklogStore
from .guard import owner_of, status_of
from .result import ValidationReport, rel


def _read_tasks(repo: Path, store: TaskStore, problems: list[str]) -> dict:
    """读一个任务文件；撞上**程序自留**的冲突标记 ⇒ 记一条 problem 继续。

    推送被拒后 rebase 给 JSON 留的 `<<<<<<<` 是程序自己产的坏数据，validate
    要能指出来（退 1 给清单），而不是整条命令退 3（2026-10-24 修）。
    其余读错误（用户手改坏）不在此列，照旧抛出。
    """
    try:
        return store.all()
    except ValueError:
        text = store.path.read_text(encoding="utf-8", errors="replace")
        if "<<<<<<<" in text:
            problems.append(
                f"{rel(repo, store.path)} 带着冲突标记"
                "（推送被拒后 rebase 没解完）：先解决冲突，再跑 validate。"
            )
            return {}
        raise


def _check_task_files(
    repo: Path, index: OwnersIndex, problems: list[str]
) -> tuple[int, int]:
    """池 + 各分片的字段格式（owner / status / 分片归属）；返回 (查了几个文件, 几条任务)。"""
    checked = 0
    total = 0

    pool = TaskStore(repo, POOL_REL)
    if pool.path.exists():
        checked += 1
        for tid, task in _read_tasks(repo, pool, problems).items():
            total += 1
            if owner_of(task):
                problems.append(
                    f"公共池里的 {tid} 带着 owner（池里的行必须无人认领）。"
                )
            if task.get("status") not in STATUSES:
                problems.append(f"公共池里的 {tid} 状态 {task.get('status')!r} 非法。")

    for key, path in index.shards().items():
        if not path.exists():
            problems.append(f"索引登记了 {key}，但分片文件 {path.name} 不存在。")
            continue
        checked += 1
        store = TaskStore(repo, Path(path).relative_to(repo / "ledger"))
        for tid, task in _read_tasks(repo, store, problems).items():
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

    return checked, total


def _check_orphan_shards(index: OwnersIndex, problems: list[str]) -> None:
    """目录里有、索引没登记的分片（全仓唯一扫目录的地方）。"""
    registered = {p.name for p in index.shards().values()}
    for path in index.disk_shards():
        if path.name not in registered:
            problems.append(
                f"owners/ 里的 {path.name} 没有在索引里登记（对它人等于不存在）。"
            )


def _history_paths(store: HistoryStore, *, deep: bool) -> list[Path]:
    """要读的历史文件：浅度只读当月那个月文件（存量平铺文件不读），深度读全部。"""
    sources = store.sources()
    if deep:
        return sources
    month = now()[0:4] + now()[5:7]
    return [p for p in sources if store.month_key(p) == month]


def _check_history(
    repo: Path,
    paths: list[Path],
    open_docs: set[str],
    store: HistoryStore,
    notices: list[str],
) -> int:
    """历史文件的格式与对账：解析警告、行尾文档链接对得上在办任务没。"""
    checked = 0
    for path in paths:
        checked += 1
        rows, warns = history_md.parse_history(store.read(path))
        notices.extend(f"{rel(repo, path)}：{w}" for w in warns)
        for row in rows:
            name = Path(row.get("worklog") or "").name
            if name and name in open_docs:
                notices.append(
                    f"历史里有「{row.get('title') or name}」的结案行，"
                    "但它还挂在在办台账里。"
                )
    return checked


def _check_worklog(
    repo: Path,
    logs: WorklogStore,
    problems: list[str],
    notices: list[str],
    *,
    deep: bool,
) -> int:
    """每篇过程文档：模板格式（浅度就查）+ 空骨架判定（只有 `--deep` 才判）。

    一趟读完两件事都做 —— 格式要看全文找节标题，骨架吃同一份文本，别为此读第二遍。
    """
    checked = 0
    for path in logs.all():
        checked += 1
        try:
            text = logs.read(path)
        except ValueError:
            continue
        if not text:
            continue
        where = rel(repo, path)
        problems.extend(f"{where} 格式：{line}" for line in format_problems(text))
        if lacks_exec_section(text):
            notices.append(
                f"{where} 没有「执行记录」节（老文档；写一条记录会自动补上）。"
            )
        dup = duplicated_sections(text)
        if dup:
            notices.append(
                f"{where} 有重复的节：{'、'.join(f'`## {s}`' for s in dup)}。"
            )
        if deep and is_skeleton(text):
            notices.append(f"{where} 还是骨架（正文没填）。")
    return checked


def validate(repo: Path, me: Identity, deep: bool = False) -> ValidationReport:
    problems: list[str] = []
    notices: list[str] = []
    checked = 0
    total = 0

    index = OwnersIndex(repo)
    history = HistoryStore(repo)
    logs = WorklogStore(repo)

    files, tasks = _check_task_files(repo, index, problems)
    checked += files
    total += tasks
    _check_orphan_shards(index, problems)

    checked += _check_history(
        repo,
        _history_paths(history, deep=deep),
        _open_worklog_names(repo, index),
        history,
        notices,
    )
    checked += _check_worklog(repo, logs, problems, notices, deep=deep)

    if not (repo / to_repo_rel(OWNERS_REL)).exists():
        notices.append("还没有 owners.json（索引）：跑一条写命令会自动建。")
    stray = repo / LEDGER_DIR / LEDGER_DIR
    if stray.is_dir():
        problems.append(
            f"{rel(repo, stray)} 是错位的台账目录（根被当成 ledger/ 时写出来的幻影）；"
            "确认哪份是真台账后删掉多余的，命令一律带 --repo <工作区根>。"
        )

    return ValidationReport(
        problems=tuple(problems),
        notices=tuple(notices),
        checked_files=checked,
        total_tasks=total,
        deep=deep,
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
