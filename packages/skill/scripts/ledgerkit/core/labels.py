"""分类与标签：校验、拼行、拆行。只做文本换算。"""

from __future__ import annotations

import re
from collections.abc import Iterable

from ..errors import Fail

STATUSES = ("open", "doing")
FORMAT_VERSION = "20261022000000"

LABEL_MAX_CHARS = 4  # 含 CJK 时按「字」算
LABEL_MAX_WORDS_EN = 3  # 纯 ASCII 时按「词」算
TAGS_MAX_COUNT = 5

CJK_RE = re.compile(r"[\u4e00-\u9fff]")
LABEL_CAT_RE = re.compile(r"分类\*\*\s*[：:]\s*([^｜|·]+)")
LABEL_TAG_RE = re.compile(r"标签\*\*\s*[：:]\s*(.+)$")
_SPLIT_RE = re.compile(r"[,，、]")


def normalize_label(value: str, *, field: str) -> str:
    """分类 / 单个标签的校验：去空白、限长。空串直接 Fail（给了就要有意义）。"""
    text = (value or "").strip()
    if not text:
        raise Fail(f"{field} 不能为空。")
    if CJK_RE.search(text):
        if len(text) > LABEL_MAX_CHARS:
            raise Fail(f"{field} {text!r} 太长：含中文时最多 {LABEL_MAX_CHARS} 个字。")
    elif len(text.split()) > LABEL_MAX_WORDS_EN:
        raise Fail(f"{field} {text!r} 太长：英文最多 {LABEL_MAX_WORDS_EN} 个词。")
    return text


def parse_tags(raw: str | Iterable[str] | None) -> tuple[str, ...]:
    """标签串（「、」「,」「，」分隔）→ 去重保序的元组；超上限报错。"""
    if raw is None:
        return ()
    items = list(raw) if not isinstance(raw, str) else _SPLIT_RE.split(raw)
    out: list[str] = []
    for item in items:
        text = normalize_label(str(item).strip(), field="标签")
        if text not in out:
            out.append(text)
    if len(out) > TAGS_MAX_COUNT:
        raise Fail(f"标签最多 {TAGS_MAX_COUNT} 个，收到 {len(out)} 个。")
    return tuple(out)


def label_line(tags: Iterable[str] | None) -> str:
    """过程文档头部的「标签」行；标签为空返回空串（此行不写）。

    分类**不进过程文档**（2026-10-27 用户拍板）：它只活在分片字段与历史表里，
    标签可涵盖分类（「建设」「修改」这类词直接当标签写）。
    """
    tag_list = [t for t in (tags or ()) if t]
    return f"- **标签**：{'、'.join(tag_list)}" if tag_list else ""


def parse_label_line(text: str) -> tuple[str | None, tuple[str, ...]]:
    """从过程文档头部（第一个 `## ` 小节之前）解析分类与标签。

    跳过 HTML 注释块：模板注释里的示例不是数据。老文档的分类段照样能解析出来。
    """
    in_comment = False
    for line in text.splitlines():
        if line.startswith("## "):
            break
        stripped = line.lstrip()
        if in_comment:
            if "-->" in stripped:
                in_comment = False
            continue
        if stripped.startswith("<!--"):
            in_comment = "-->" not in stripped
            continue
        mc = LABEL_CAT_RE.search(line)
        mt = LABEL_TAG_RE.search(line)
        if not (mc or mt):
            continue
        category = mc.group(1).strip() if mc else None
        tags = (
            tuple(t.strip() for t in _SPLIT_RE.split(mt.group(1).strip()) if t.strip())
            if mt
            else ()
        )
        return (category or None, tags)
    return (None, ())
