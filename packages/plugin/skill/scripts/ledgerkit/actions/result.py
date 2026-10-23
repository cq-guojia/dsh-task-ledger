"""动作的返回值长什么样。字段名是**公开契约**，插件看板直接读，外壳不许重新算。

写动作返回 `Result`，只读动作返回各自的视图对象（不再套一层统一的壳）。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


def rel(repo: Path, path: Path) -> str:
    """绝对路径 → 相对 repo 的字符串（输出给人 / 给界面的一律这个基准）。"""
    try:
        return str(Path(path).resolve().relative_to(Path(repo).resolve()))
    except ValueError:
        return str(path)


@dataclass(frozen=True)
class WorklogView:
    """「这条任务的过程文档要怎么显示」。"""

    path: str | None = None  # 相对 repo
    text: str | None = None  # 全文；读不到时为 None
    error: str | None = None  # 读不到的原因（缺失 / 读不了），给人看


@dataclass(frozen=True)
class Result:
    """写动作的返回。"""

    changed: tuple[str, ...] = ()  # 改了哪些**字段名**（不是文件名、不是任务号）
    where: str | None = None  # 主要落在哪个文件（**相对 repo**）
    already_done: bool = False  # 重跑发现已经做过 ⇒ 退出码仍是 0
    dry_run: bool = False  # 只预览没写盘 ⇒ 外壳跳过提交与推送
    message: str | None = None  # git 提交说明；None ⇒ 外壳用默认模板
    worklog: WorklogView | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    notices: tuple[str, ...] = ()


@dataclass(frozen=True)
class TaskRow:
    """人话表格的一行（9 字段投影）。`--json` 吐的是 `rows`（原样任务对象），不是它。"""

    tid: str
    title: str
    status: str
    owner: str | None = None  # 显示名
    created: str | None = None
    started: str | None = None
    category: str | None = None
    tags: tuple[str, ...] = ()
    where: str | None = None  # 所在文件（相对 repo）


@dataclass(frozen=True)
class ListResult:
    rows: dict[str, dict[str, Any]] = field(default_factory=dict)  # tid → 原样任务对象
    table: tuple[TaskRow, ...] = ()
    notices: tuple[str, ...] = ()


@dataclass(frozen=True)
class ShowResult:
    task: dict[str, Any] = field(default_factory=dict)
    worklog: WorklogView | None = None
    others: tuple[str, ...] = ()  # 同一个任务号还出现在哪些文件里
    notices: tuple[str, ...] = ()


@dataclass(frozen=True)
class HistoryResult:
    count: int = 0
    filters: dict[str, Any] = field(default_factory=dict)  # 回显生效的筛选
    records: tuple[dict[str, Any], ...] = ()
    warnings: tuple[str, ...] = ()
    capped: bool = False


@dataclass(frozen=True)
class ValidationReport:
    problems: tuple[str, ...] = ()  # 只有它影响退出码
    notices: tuple[str, ...] = ()  # 只提示，不改退出码
    checked_files: int = 0
    total_tasks: int = 0


@dataclass(frozen=True)
class Census:
    tasks: int = 0
    categories: dict[str, int] = field(default_factory=dict)
    tags: dict[str, int] = field(default_factory=dict)
    owners: dict[str, int] = field(default_factory=dict)
    months: dict[str, int] = field(default_factory=dict)
    notices: tuple[str, ...] = ()
