"""历史表格的文本操作：拼行、解析、旧列数升级。

**自己不开文件**：升级要回链 worklog 读头部，那件事由调用方传 `read_worklog`
回调进来（`str -> str | None`），core 只做文本换算。
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Callable, Iterable

from .paths import to_history_rel
from .time import TIME_RE, time_key

HISTORY_TITLE = "# 进度历史（已结案）"
HISTORY_HEADER = (
    "| 结案时间 | 创建时间 | 工作包 | 分类 | 标签 | owner | creator | 完成了什么 | 过程文档 |"
)
HISTORY_SEP = "|---|---|---|---|---|---|---|---|---|"

# 最旧格式把 owner 缝在工作包末尾：最右一个「空格 + @」之后整段是 owner。
OLD_OWNER_RE = re.compile(r"^(?P<title>.*\S)\s+@(?P<owner>\S.*)$")
_LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]*)\)")
_TAG_SPLIT_RE = re.compile(r"[,，、]")

Row = dict  # 一条历史行：见 parse_history 的返回


def esc_cell(text: str) -> str:
    """表格单元格：折叠空白并转义竖线，避免把历史表格写坏。"""
    return " ".join((text or "").split()).replace("|", "\\|")


def owner_cell(owner: str | None) -> str:
    """owner 列的展示值：人名前加 @（`@` 只是展示约定，匹配一律用裸标识）。"""
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
    # 按内容判、不按位置判：无表头的老文件首行就是数据，按位置判会把第一条记录当表头删掉。
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

    owner / creator 传**裸标识**（`@` 由 owner_cell / creator_cell 加），外面别先加。
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


def history_line_for_cols(
    cols: int,
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
    """「历史层有无法解析的行、不敢整体升级」时按现有列数追加一行，避免列错位。

    GFM 按首行列数渲染，列数写错会被静默丢弃 / 错位。少列的文件硬塞 9 列会把整行挤歪。
    """
    log_rel = to_history_rel(worklog) if worklog else ""
    link = f"[{log_rel}]({log_rel})" if log_rel else ""
    if cols <= 4:
        who = f" @{owner}" if owner else ""
        return f"| {finished} | {esc_cell(title + who)} | {esc_cell(summary)} | {link} |\n"
    if cols == 5:
        return (
            f"| {finished} | {esc_cell(title)} | {esc_cell(owner_cell(owner))} "
            f"| {esc_cell(summary)} | {link} |\n"
        )
    if cols == 6:
        return (
            f"| {finished} | {created or ''} | {esc_cell(title)} "
            f"| {esc_cell(owner_cell(owner))} | {esc_cell(summary)} | {link} |\n"
        )
    return history_line(
        finished, created, title, owner, summary, worklog, category, tags, creator
    )


def history_cols(text: str) -> int:
    """现有历史表格数据行的列数（取众数、平局取较大）；无数据行时按 6。"""
    counts: dict[int, int] = {}
    for raw in text.splitlines():
        if not raw.strip().startswith("|"):
            continue
        cells = split_row(raw)
        if not cells or is_sep_row(cells) or _looks_like_header(cells):
            continue
        if len(cells) >= 4:
            counts[len(cells)] = counts.get(len(cells), 0) + 1
    if not counts:
        return 6
    return max(counts, key=lambda k: (counts[k], k))


def parse_history(text: str) -> tuple[list[Row], list[str]]:
    """解析历史表 → (records, warnings)。**逐行按自己的列数判别**，表头只用来跳过。

    兼容 9 / 8 / 6 / 5（两种）/ 4 列；坏行（列数不在列、时间列不合法）跳过并警告，不中断。
    返回的键：finished / created / title / category / tags / owner / creator / summary /
    worklog / fmt / line。owner 与 creator 一律**剥掉 `@`**（匹配用裸标识）。
    """
    records: list[Row] = []
    warnings: list[str] = []
    for lineno, raw in enumerate(text.splitlines(), 1):
        if not raw.strip().startswith("|"):
            continue
        cells = split_row(raw)
        if not cells or is_sep_row(cells) or _looks_like_header(cells):
            continue
        created = ""
        category: str | None = None
        tags: list[str] = []
        creator: str | None = None
        if len(cells) == 9:
            (
                finished,
                created,
                title,
                category,
                tag_cell,
                owner,
                creator,
                summary,
                doc,
            ) = cells
            fmt = "v9"
            category = category.strip() or None
            tags = [t.strip() for t in _TAG_SPLIT_RE.split(tag_cell) if t.strip()]
            creator = creator.strip().removeprefix("@") or None
        elif len(cells) == 8:
            finished, created, title, category, tag_cell, owner, summary, doc = cells
            fmt = "v8"
            category = category.strip() or None
            tags = [t.strip() for t in _TAG_SPLIT_RE.split(tag_cell) if t.strip()]
        elif len(cells) == 6:
            finished, created, title, owner, summary, doc = cells
            fmt = "v6"
        elif len(cells) == 5 and TIME_RE.fullmatch(cells[1]):
            # 旧 ledger 格式（结案 / 创建 / 工作包 / 摘要 / 文档）：行内自带创建时间。
            finished, created, title, summary, doc = cells
            owner = ""
            fmt = "v5ledger"
        elif len(cells) == 5:
            finished, title, owner, summary, doc = cells
            fmt = "v5"
        elif len(cells) == 4:
            finished, title, summary, doc = cells
            m = OLD_OWNER_RE.match(title)
            owner = m.group("owner") if m else ""
            if m:
                title = m.group("title")
            fmt = "v4"
        else:
            warnings.append(f"第 {lineno} 行列数不是 4 / 5 / 6 / 8 / 9，已跳过")
            continue
        if not TIME_RE.fullmatch(finished):
            warnings.append(f"第 {lineno} 行时间列 {finished!r} 不合法，已跳过")
            continue
        m = _LINK_RE.fullmatch(doc.strip())
        log = m.group(1) if m else doc.strip()
        records.append(
            {
                "finished": finished,
                "created": time_key(created) if created else None,
                "title": title,
                "category": category,
                "tags": tuple(tags),
                "owner": (owner or "").strip().removeprefix("@") or None,
                "creator": creator,
                "summary": summary,
                "worklog": log or None,
                "fmt": fmt,
                "line": lineno,
            }
        )
    return records, warnings


def _drop_trailing_blank(out: list[str]) -> None:
    """去掉已在结果里的尾部空行（丢弃重复表头时用）：中间的空行会把 GFM 表格截断。"""
    while out and not out[-1].strip():
        out.pop()


def upgrade_history(
    text: str,
    *,
    read_worklog: Callable[[str], dict | None],
    fallback_created: str,
) -> tuple[str, int] | None:
    """旧格式（4 / 5 / 6 / 8 列）→ v9。**全部数据行可解析才返回 (新文本, 转换行数)**，否则 None。

    `None` 的语义是「不敢动」：调用方必须退回 `history_line_for_cols` 按原列数追加并明示，
    绝不半升级、绝不猜。分类 / 标签 / creator / 缺的创建时间都靠 `read_worklog` 回链补，
    读不到就留空（创建时间除外：留空会让排序失效，所以退化到 `fallback_created`）。

    `read_worklog` 的契约：`(log_name: str) -> dict | None` —— 收**文件名**（历史末列的
    basename，不是路径），返回 `{"created", "creator", "category", "tags"}`。core 只消费
    返回值，自己不开文件。
    """
    out: list[str] = []
    converted = 0
    seen_header = False
    seen_sep = False
    for raw in text.splitlines():
        if not raw.strip().startswith("|"):
            out.append(raw)
            continue
        cells = split_row(raw)
        if not cells:
            out.append(raw)
            continue
        if is_sep_row(cells):
            if seen_sep:
                _drop_trailing_blank(out)
                continue
            seen_sep = True
            out.append(HISTORY_SEP)
            continue
        if _looks_like_header(cells):
            if seen_header:
                _drop_trailing_blank(out)
                continue
            seen_header = True
            out.append(HISTORY_HEADER)
            continue
        if len(cells) == 9:
            if time_key(cells[0]) is None:
                return None
            out.append("| " + " | ".join(cells) + " |")
            continue
        explicit_created: str | None = None
        creator: str | None = None
        if len(cells) == 8:
            finished, created, title, category, tag_cell, owner, summary, doc = cells
            if time_key(finished) is None:
                return None
            created_key = time_key(created.strip())
            tags = [t.strip() for t in _TAG_SPLIT_RE.split(tag_cell) if t.strip()]
            creator = (_meta_of(doc, read_worklog) or {}).get("creator")
            out.append(
                f"| {finished} | {created_key or ''} | {esc_cell(title)} "
                f"| {esc_cell(category.strip())} "
                f"| {esc_cell('、'.join(tags) if tags else '')} "
                f"| {esc_cell(owner_cell(owner.lstrip('@')))} "
                f"| {esc_cell(creator_cell(creator))} "
                f"| {esc_cell(summary)} | {doc} |"
            )
            converted += 1
            continue
        if len(cells) == 6:
            finished, created, title, owner, summary, doc = cells
            owner = owner.lstrip("@")
            explicit_created = time_key(created.strip())
        elif len(cells) == 5 and TIME_RE.fullmatch(cells[1]):
            finished, created_cell, title, summary, doc = cells
            owner = ""
            explicit_created = time_key(created_cell.strip())
        elif len(cells) == 5:
            finished, title, owner, summary, doc = cells
            owner = owner.lstrip("@")
        elif len(cells) == 4:
            finished, title, summary, doc = cells
            m = OLD_OWNER_RE.match(title)
            owner = m.group("owner") if m else ""
            if m:
                title = m.group("title")
        else:
            return None
        finished_key = time_key(finished)
        if finished_key is None:
            return None
        meta = _meta_of(doc, read_worklog)
        created = explicit_created or (meta or {}).get("created") or fallback_created
        category = (meta or {}).get("category")
        tags = tuple((meta or {}).get("tags") or ())
        creator = (meta or {}).get("creator")
        out.append(
            f"| {finished_key} | {created} | {esc_cell(title)} "
            f"| {esc_cell(category or '')} "
            f"| {esc_cell('、'.join(tags) if tags else '')} "
            f"| {esc_cell(owner_cell(owner))} "
            f"| {esc_cell(creator_cell(creator))} "
            f"| {esc_cell(summary)} | {doc} |"
        )
        converted += 1
    return "\n".join(out) + "\n", converted


def _link_target(cell: str) -> str:
    m = _LINK_RE.fullmatch((cell or "").strip())
    return (m.group(1) if m else (cell or "")).strip()


def _meta_of(doc: str, read_worklog: Callable[[str], dict | None]) -> dict | None:
    """顺着历史行的文档链接取回 worklog 头部四样（`read_worklog` 收文件名）。"""
    target = _link_target(doc)
    if not target:
        return None
    return read_worklog(Path(target).name)
