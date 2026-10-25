"""过程文档的文本操作：给一段文字，返回新文字。不读文件、不写文件。

模板的**读取**归 `store/WorklogStore.template()`，这里只做字符串替换。
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from itertools import takewhile

from ..errors import Fail
from .identity import UUID_RE
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
# 头部「创建」行：`> **创建**：2026-10-06 00:00（@某人 · uuid）` —— 创建时间与发起人两个来源。
# 括号里落 `Identity.stamp()`（`@名字 · uuid`）：名字在前给人读，uuid 在后给机器对。
# 老文档只有名字（没有 uuid）时，下面两个函数各自返回它能读到的那一段，不报错。
CREATED_AT_RE = re.compile(
    r"^\s*>\s*\*\*创建\*\*\s*[：:]\s*"
    r"(\d{4}-\d{2}-\d{2}(?: +\d{1,2}:\d{1,2}(?::\d{1,2})?)?)"
)
CREATOR_RE = re.compile(r"^\s*>\s*\*\*创建\*\*\s*[：:].*?（@(.+?)）")

_HEAD_RE = re.compile(r"\A(.*?)(?=^## |\Z)", re.DOTALL | re.MULTILINE)


#: 过程文档应有的六节，顺序即模板顺序（真源是 `assets/worklog.md`）。
WORKLOG_SECTIONS = ("背景", "待办", "下一步", "过程", "结论", "执行记录")
#: 判「格式坏」只要求前五节；「执行记录」由脚本维护，老文档没有、写入时会补，缺了只提示。
REQUIRED_SECTIONS = WORKLOG_SECTIONS[:5]


def section_heads(text: str) -> list[str]:
    """文档里的二级标题（`## 背景` → `背景`），按出现顺序。"""
    return [
        line[3:].strip() for line in (text or "").splitlines() if line.startswith("## ")
    ]


def _head_lines(lines: list[str]) -> list[str]:
    """第一个二级标题之前的行（头部引用块）。"""
    return list(takewhile(lambda line: not line.startswith("## "), lines))


def format_problems(text: str) -> list[str]:
    """过程文档的**格式**问题：只看骨架结构，不看内容、不判业务。空列表 = 没问题。

    五项：第一行是标题 / 头部「创建」行有时间 / 创建行有发起人 / 前五节齐全 / 前五节顺序对。
    结案封卷、分类标签、正文写得怎么样都不在这里判（那是内容与业务）。
    """
    problems: list[str] = []
    body = (text or "").lstrip("\ufeff")
    lines = body.splitlines()
    if not lines or not lines[0].startswith("# "):
        problems.append("第一行不是标题（应为 `# <任务号>：<标题>`）")
    head = _head_lines(lines)
    if not any(CREATED_AT_RE.match(line) for line in head):
        problems.append(
            "头部缺「创建」时间行（应为 `> **创建**：YYYY-MM-DD HH:MM（@某人）`）"
        )
    elif not any(CREATOR_RE.match(line) for line in head):
        problems.append("头部「创建」行缺发起人（应为 `…（@某人）`）")
    heads = section_heads(body)
    missing = [s for s in REQUIRED_SECTIONS if s not in heads]
    if missing:
        problems.append("缺节：" + "、".join(f"`## {s}`" for s in missing))
    else:
        # 按「首次出现」去重再比顺序：老文档里同一节重复出现很常见（编辑残留），
        # 那不影响读写（脚本按锚点定位），只作提示，不判错。
        order: list[str] = []
        for head in heads:
            if head in REQUIRED_SECTIONS and head not in order:
                order.append(head)
        if order != list(REQUIRED_SECTIONS):
            problems.append(
                "节的顺序不对：应为 "
                + " → ".join(f"`## {s}`" for s in REQUIRED_SECTIONS)
            )
    return problems


def duplicated_sections(text: str) -> list[str]:
    """重复出现的节标题（老文档编辑残留；不影响读写，只作提示）。"""
    heads = section_heads(text)
    return [s for s in REQUIRED_SECTIONS if heads.count(s) > 1]


def lacks_exec_section(text: str) -> bool:
    """缺「执行记录」节（老文档没有；只提示，脚本写入时会自动补上这一节）。"""
    return WORKLOG_SECTIONS[-1] not in section_heads(text)


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
    """头部「创建」行括号里的发起人**名字**（不带 @、不带 uuid）；读不到返回 None。"""
    for line in text.splitlines():
        m = CREATOR_RE.match(line)
        if m and m.group(1).strip():
            return m.group(1).split(" · ")[0].strip()
    return None


def head_creator_uuid(text: str) -> str | None:
    """头部「创建」行括号里的发起人 **uuid**；老文档没落 uuid 时返回 None。

    `UUID_RE` 带 `^$` 锚点，只能整串匹配 —— 所以先按 ` · ` 切出尾段再判，不能 search。
    """
    for line in text.splitlines():
        m = CREATOR_RE.match(line)
        if not m:
            continue
        parts = m.group(1).split(" · ")
        if len(parts) > 1:
            uuid = parts[-1].strip()
            if UUID_RE.fullmatch(uuid):
                return uuid
    return None
