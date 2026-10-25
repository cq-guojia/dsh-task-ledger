"""历史表格的文本操作：拼九列一行、解析九列一行。

**只认九列这一种格式**（开发期没发布，不做任何旧列数 / 旧列语义的迁移）。
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Any

from .paths import to_history_rel
from .time import TIME_RE, time_key

HISTORY_TITLE = "# 进度历史（已结案）"
HISTORY_HEADER = "| 结案时间 | 创建时间 | 工作包 | 分类 | 标签 | owner | creator | 完成了什么 | 过程文档 |"
HISTORY_SEP = "|---|---|---|---|---|---|---|---|---|"

_LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]*)\)")
_TAG_SPLIT_RE = re.compile(r"[,，、]")

Row = dict[str, Any]  # 一条历史行：见 parse_history 的返回


def esc_cell(text: str) -> str:
    """表格单元格：折叠空白并转义竖线，避免把历史表格写坏。"""
    return " ".join((text or "").split()).replace("|", "\\|")


def owner_cell(owner: str | None) -> str:
    """owner 列的展示值：人名前加 @（`@` 只是展示约定，匹配一律用裸 uuid）。"""
    return f"@{owner}" if owner else ""


def creator_cell(creator: str | None) -> str:
    """creator 列展示值（与 owner_cell 同一 `@` 约定）。"""
    return f"@{creator}" if creator else ""


def split_row(line: str) -> list[str]:
    """按 `|` 切表格行：转义竖线 `\\|` 不当分隔符，切完反转义、去首尾空单元。"""
    cells = re.split(r"(?<!\\)\|", line.strip())
    if cells and cells[0] == "":
        cells = cells[1:]
    if cells and cells[-1] == "":
        cells = cells[:-1]
    return [c.strip().replace("\\|", "|") for c in cells]


def is_sep_row(cells: list[str]) -> bool:
    return bool(cells) and all(re.fullmatch(r":?-+:?", c) for c in cells)


def _looks_like_header(cells: list[str]) -> bool:
    return bool(cells) and cells[0] in ("时间", "结案时间")


def history_line(
    finished: str,
    created: str | None,
    title: str,
    owner: str | None,
    summary: str,
    worklog: str | None,
    category: str | None = None,
    tags: Iterable[str] | None = None,
    creator: str | None = None,
) -> str:
    """九列的一行。`worklog` 收**相对 `ledger/`** 的路径，这里负责换成相对 `history/` 的链接。

    owner / creator 传**裸 uuid**（`@` 由 owner_cell / creator_cell 加），外面别先加。
    """
    log_rel = to_history_rel(worklog) if worklog else ""
    tag_cell = esc_cell("、".join(tags) if tags else "")
    link = f"[{log_rel}]({log_rel})" if log_rel else ""
    return (
        f"| {finished} | {created or ''} | {esc_cell(title)} "
        f"| {esc_cell(category or '')} | {tag_cell} "
        f"| {esc_cell(owner_cell(owner))} | {esc_cell(creator_cell(creator))} "
        f"| {esc_cell(summary)} | {link} |\n"
    )


def parse_history(text: str) -> tuple[list[Row], list[str]]:
    """解析九列历史表 → (records, warnings)。坏行（列数不对 / 时间列不合法）跳过并警告。

    返回的键：finished / created / title / category / tags / owner / creator / summary /
    worklog / fmt / line。owner 与 creator 一律**剥掉 `@`**（存储值是裸 uuid）。
    """
    records: list[Row] = []
    warnings: list[str] = []
    for lineno, raw in enumerate(text.splitlines(), 1):
        if not raw.strip().startswith("|"):
            continue
        cells = split_row(raw)
        if not cells or is_sep_row(cells) or _looks_like_header(cells):
            continue
        if len(cells) != 9:
            warnings.append(f"第 {lineno} 行不是九列（历史表只认九列），已跳过")
            continue
        finished, created, title, category, tag_cell, owner, creator, summary, doc = (
            cells
        )
        if not TIME_RE.fullmatch(finished):
            warnings.append(f"第 {lineno} 行时间列 {finished!r} 不合法，已跳过")
            continue
        m = _LINK_RE.fullmatch(doc.strip())
        records.append(
            {
                "finished": finished,
                "created": time_key(created) if created else None,
                "title": title,
                "category": category.strip() or None,
                "tags": tuple(
                    t.strip() for t in _TAG_SPLIT_RE.split(tag_cell) if t.strip()
                ),
                "owner": owner.strip().removeprefix("@") or None,
                "creator": creator.strip().removeprefix("@") or None,
                "summary": summary,
                "worklog": (m.group(1) if m else doc.strip()) or None,
                "fmt": "v9",
                "line": lineno,
            }
        )
    return records, warnings
