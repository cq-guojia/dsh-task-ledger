"""过程文档的文本操作：给一段文字，返回新文字。不读文件、不写文件。

模板的**读取**归 `store/WorklogStore.template()`，这里只做字符串替换。
"""

from __future__ import annotations

import re
from collections.abc import Iterable

from ..errors import Fail
from .labels import label_line, parse_label_line
from .time import fmt_local, normalize_time

EXEC_HEAD = "## 执行记录"
EXEC_HINT = (
    "<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。\n"
    '     补记用 progress.py log --id <任务号> --note "一句话"。 -->'
)
FROZEN_MARK = "✅ 完成封卷"
FROZEN_RE = re.compile(r"^>\s*" + FROZEN_MARK, re.MULTILINE)
CREATED_RE = re.compile(r"^\s*>\s*\*\*创建\*\*")
# 头部「创建」行：`> **创建**：2026-10-06 00:00（@某人）` —— 创建时间与发起人两个来源。
CREATED_AT_RE = re.compile(
    r"^\s*>\s*\*\*创建\*\*\s*[：:]\s*"
    r"(\d{4}-\d{2}-\d{2}(?: +\d{1,2}:\d{1,2}(?::\d{1,2})?)?)"
)
CREATOR_RE = re.compile(r"^\s*>\s*\*\*创建\*\*\s*[：:].*?（@(.+?)）")

_HEAD_RE = re.compile(r"\A(.*?)(?=^## |\Z)", re.DOTALL | re.MULTILINE)


def is_skeleton(text: str) -> bool:
    """是不是骨架（正文还没填）：前五节里没有任何实质内容。"""
    body = _sections_body(text)
    if not body.strip():
        return True
    for line in body.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith(("<!--", "-->", ">")):
            continue
        if stripped.startswith("#"):
            continue
        if stripped in {"-", "—"}:
            continue
        return False
    return True


def _sections_body(text: str) -> str:
    """去掉「执行记录」节之后剩下的正文。"""
    idx = text.find(f"\n{EXEC_HEAD}")
    return text[:idx] if idx >= 0 else text


def render_worklog(
    *,
    tid: str,
    title: str,
    created: str,
    creator: str,
    category: str | None = None,
    tags: Iterable[str] | None = None,
    template: str,
) -> str:
    """把模板套成一篇过程文档（`<id>` / `<title>` / `<created>` / `<creator>` 四个占位符）。"""
    text = (
        template.replace("<id>", tid)
        .replace("<title>", title or "")
        .replace("<created>", created or "")
        .replace("<creator>", creator or "")
    )
    meta = label_line(category, tags)
    if not meta:
        return text
    return "\n".join(_insert_after_head(text.splitlines(), meta)) + "\n"


def _insert_after_head(lines: list[str], line: str) -> list[str]:
    """把一行插到「创建」行之后（头部引用块内）；找不到创建行就插标题后。"""
    at = next((i for i, ln in enumerate(lines) if CREATED_RE.match(ln)), None)
    if at is None:
        at = 1 if lines and lines[0].startswith("# ") else 0
    lines.insert(at + 1, line)
    return lines


def exec_line(when: str, who: str | None, kind: str, note: str) -> str:
    """一条执行记录：`- 本地时刻 · 类型 · @某人 · 说明`。

    时刻是**给人读的日志行**，所以在这里转成查看者本地时间（调用方一律传 UTC，
    别在外面先转一遍）。类型取动作名（new / claim / set / release / log / close）。
    """
    head = f"- {fmt_local(when)} · {kind}"
    tail = f" · @{who} · {note}" if who else f" · {note}"
    return head + tail


def append_exec_log(text: str, line: str) -> str:
    """把一条记录追加到「执行记录」节末尾；老文档没有这一节就先补一节。"""
    if f"\n{EXEC_HEAD}" in text or text.startswith(EXEC_HEAD):
        return text.rstrip("\n") + "\n" + line + "\n"
    block = f"\n{EXEC_HEAD}\n\n{EXEC_HINT}\n{line}\n"
    return text.rstrip("\n") + "\n" + block


def has_frozen_line(text: str) -> bool:
    """这篇文档封卷了没有（认标记行）。"""
    return bool(FROZEN_RE.search(text or ""))


def stamp_frozen(text: str, finished: str, who: str | None = "") -> str:
    """封卷：在头部打标记行（`finished` 传 UTC，这里转本地给人看）。"""
    mark = f"> {FROZEN_MARK}：{fmt_local(finished)}"
    if who:
        mark += f"（@{who}）"
    if FROZEN_RE.search(text or ""):
        return text
    return "\n".join(_insert_after_head(text.splitlines(), mark)) + "\n"


def rewrite_label_line(
    text: str, category: str | None, tags: Iterable[str] | None
) -> str:
    """改写头部的分类 / 标签行：有就地替换，没有就插到创建行后。"""
    line = label_line(category, tags)
    lines = text.splitlines()
    for i, ln in enumerate(lines):
        if ln.startswith("## "):
            break
        if "**分类**" in ln or "**标签**" in ln:
            if line:
                lines[i] = line
            else:
                del lines[i]
            return "\n".join(lines) + "\n"
    if not line:
        return text
    return "\n".join(_insert_after_head(lines, line)) + "\n"


def head_meta(text: str) -> tuple[str | None, tuple[str, ...]]:
    """过程文档头部的分类与标签（供历史回链与标签统计共用）。"""
    return parse_label_line(text)


def head_created(text: str) -> str | None:
    """头部「创建」行的时间（原样返回，不转时区）；读不到返回 None。"""
    for line in text.splitlines():
        m = CREATED_AT_RE.match(line)
        if m:
            try:
                return normalize_time(m.group(1), field="创建")
            except Fail:
                return None
    return None


def head_creator(text: str) -> str | None:
    """头部「创建」行括号里的发起人（裸标识，不带 @）；读不到返回 None。"""
    for line in text.splitlines():
        m = CREATOR_RE.match(line)
        if m and m.group(1).strip():
            return m.group(1).strip()
    return None
