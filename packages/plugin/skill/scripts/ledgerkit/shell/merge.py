"""合并语义：push 被拒后 rebase 撞上的**台账冲突**怎么解。

只认台账自己的文件：`pool.json` / 分片 / `owners.json` 按**任务号**三路合并，
`worklog/` 与 `history/` 是追加式正文，两边各加的内容并在一起。业务代码一个字都不碰。

rebase 的 stage 语义与字面直觉相反（实测确认）：`:1` 共同祖先、`:2` 上游（别人的）、
`:3` 本机正在重放的那个提交。本文档的 `ours` 一律指 `:2`、`theirs` 指 `:3`，与 git
自己在 rebase 里的叫法一致 —— 标反了会让人照着冲突标记把别人的版本留下来。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from ..core.paths import (
    HISTORY_DIR,
    OWNERS_DIR,
    OWNERS_REL,
    POOL_REL,
    WORKLOG_DIR,
    to_ledger_rel,
)
from ..store.atomic import write_text_atomic
from ..store.json_store import dump_ledger_json

EXPAND_KEYS = ("tasks", "workers")


def _load(text: str) -> dict | None:
    if not text.strip():
        return {}
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def _coerce(value: str | dict | None) -> dict | None:
    """三方内容：git 给的是文本（`git show :N:rel`），测试与调用方也可以直接给 dict。"""
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    return _load(str(value))


def _rows_of(data: dict | None, key: str) -> dict:
    rows = (data or {}).get(key)
    return rows if isinstance(rows, dict) else {}


def is_ledger_json(rel: str) -> bool:
    """是不是按条目合并的 JSON 台账（`pool.json` / 分片 / `owners.json`）。"""
    r = to_ledger_rel(rel)
    return (
        r == POOL_REL.as_posix()
        or r == OWNERS_REL.as_posix()
        or (r.startswith(OWNERS_DIR.as_posix() + "/") and r.endswith(".json"))
    )


def is_append_only(rel: str) -> bool:
    """是不是追加式正文（过程文档 / 历史）：只加行，不改写别人的行。"""
    r = to_ledger_rel(rel)
    return r.startswith((WORKLOG_DIR.as_posix() + "/", HISTORY_DIR.as_posix() + "/"))


def owns(rel: str) -> bool:
    """这份冲突文件归不归脚本管（业务文件一个字都不碰）。"""
    return is_ledger_json(rel) or is_append_only(rel)


def expand_key_of(rel: str) -> str:
    """这份 JSON 台账按哪个字段做条目级合并。"""
    return "workers" if to_ledger_rel(rel) == OWNERS_REL.as_posix() else "tasks"


def merge_task_dicts(
    base: str | dict | None,
    ours: str | dict | None,
    theirs: str | dict | None,
) -> tuple[dict, list[str]]:
    """按任务号做三方合并；返回 (合并结果, 两边都改过的任务号)。

    合并单位是「任务」不是文本行 —— 行级合并只认相邻上下文：不同任务各自新增 /
    结案挤在文件末尾就会撞，而同一任务两边都改时它也判不出该留谁。按 id 对账后，
    只有一边动过的直接采纳，两边都动过的列进冲突，一个都不静默丢。
    """
    b, o, t = (_coerce(x) for x in (base, ours, theirs))
    if b is None or o is None or t is None:
        return {}, ["台账冲突无法自动合并：有一方不是合法 JSON，需要人工处理。"]
    merged: dict[str, Any] = dict(o)
    for key, value in t.items():
        if key not in o:
            merged[key] = value
        elif o[key] != value and key not in EXPAND_KEYS:
            merged[key] = value  # 非任务区（version / identity）以本机那份为准
    conflicts: list[str] = []
    for expand in EXPAND_KEYS:
        if not any(expand in x for x in (b, o, t)):
            continue  # 这份文件没有这个区（pool.json 没有 workers、分片没有 tasks）
        base_rows, our_rows, their_rows = (
            _rows_of(b, expand),
            _rows_of(o, expand),
            _rows_of(t, expand),
        )
        rows: dict[str, Any] = {}
        for tid in sorted(set(base_rows) | set(our_rows) | set(their_rows)):
            was, up, loc = base_rows.get(tid), our_rows.get(tid), their_rows.get(tid)
            if up == loc:
                if up is not None:
                    rows[tid] = up
            elif up == was:
                if loc is not None:
                    rows[tid] = loc
            elif loc == was:
                # 只有上游动过：上游删了就真删掉。写成 rows[tid] = up 会在文件里
                # 留一行 "<tid>": null 永久累积，读侧还会因 null 崩掉或整区降级。
                if up is not None:
                    rows[tid] = up
            else:
                conflicts.append(tid)
                rows[tid] = up if up is not None else loc
        merged[expand] = rows
    return merged, conflicts


def union_merge(base: str, ours: str, theirs: str) -> str:
    """追加式正文的三路合并：两边各自新增的行都要在，不凭行号猜。

    过程文档 / 历史只追加不改写，所以"合并"= 本机那份 + 上游相对共同祖先新增的行
    （本机已有同样的行就不再重复）。任一侧为空也照常合。
    """
    base_lines = set(base.splitlines())
    have = set(theirs.splitlines())
    added = [
        line for line in ours.splitlines() if line not in base_lines and line not in have
    ]
    if not added:
        return theirs
    head = theirs if theirs.endswith("\n") or not theirs else theirs + "\n"
    return head + "\n".join(added) + "\n"


def conflict_marked(
    rel: str, base: str, ours: str, theirs: str
) -> tuple[str, list[str]] | None:
    """接管一份 JSON 台账冲突：算出「一条一行 + 冲突标记」的新全文。

    返回 (文件新文本, 两边都改过的任务号)；不是台账 JSON 或有一方解析不了 ⇒ None。
    """
    if not is_ledger_json(rel):
        return None
    data, conflicts = merge_task_dicts(base, ours, theirs)
    if not data:
        return None
    key = expand_key_of(rel)
    if not conflicts:
        return dump_ledger_json(data, expand=key), []
    return (
        _marked_text(
            _load(theirs) or {}, key, data, conflicts, _load(ours) or {}, _load(theirs) or {}
        ),
        conflicts,
    )


def _marked_text(
    full: dict,
    key: str,
    merged: dict,
    conflicts: list[str],
    upstream: dict,
    local: dict,
) -> str:
    """按「一条一行」渲染整份台账；两边都改过的条目用冲突标记包起来。

    `full` 是本机那一侧的整份结构（version / identity / tasks），除 `key` 之外
    原样保留 —— 分片里的 identity 丢了就没法自证。
    """
    rows: list[str] = []
    for field in sorted(full):
        if field != key:
            rows.append(
                f"  {json.dumps(field, ensure_ascii=False)}: "
                f"{json.dumps(full[field], ensure_ascii=False, sort_keys=True)}"
            )
            continue
        inner: list[str] = []
        merged_rows = merged.get(key) or {}
        for ident in sorted(merged_rows):
            label = json.dumps(ident, ensure_ascii=False)
            if ident not in conflicts:
                inner.append(
                    f"    {label}: "
                    f"{json.dumps(merged_rows[ident], ensure_ascii=False, sort_keys=True)}"
                )
                continue
            left = (
                "(远端已删除)"
                if _rows_of(upstream, key).get(ident) is None
                else json.dumps(_rows_of(upstream, key)[ident], ensure_ascii=False, sort_keys=True)
            )
            right = (
                "(本地已删除)"
                if _rows_of(local, key).get(ident) is None
                else json.dumps(_rows_of(local, key)[ident], ensure_ascii=False, sort_keys=True)
            )
            inner.append(
                f"<<<<<<< 远端\n    {label}: {left}\n=======\n"
                f"    {label}: {right}\n>>>>>>> 本地"
            )
        rows.append(
            f'  "{key}": {{\n' + (",\n".join(inner) + "\n" if inner else "") + "  }"
        )
    return "{\n" + ",\n".join(rows) + "\n}\n"


def resolve_ledger_conflict(path: Path, text: str) -> str | None:
    """把合并结果写回冲突文件（`track=False`、不进记账本），写完由 `git rebase --continue` 提交。

    返回写回的文本；`text` 为空（说明没算出合并结果）返回 None。
    """
    if not text:
        return None
    write_text_atomic(Path(path), text, track=False)
    return text


def render_conflict_text(rel: str, base: str, ours: str, theirs: str) -> str:
    """人话冲突说明：**返回文本，不打印**（打印归 render.py）。"""
    if not owns(rel):
        return f"{rel}：不是台账文件，脚本不代劳，请人工处理。"
    if is_append_only(rel):
        return f"{rel}：两边都追加过，已并成一份（追加式正文，一行没丢）。"
    data, conflicts = merge_task_dicts(base, ours, theirs)
    if not data:
        return f"{rel}：有一方不是合法 JSON，无法自动合并，请人工处理。"
    if not conflicts:
        return f"{rel}：冲突已按任务号自动合并，无需人工处理。"
    lines = [
        (
            f"{rel}：这些任务被两边同时改过，已按任务逐个标出冲突"
            "（标记里左边是远端、右边是本机），没有替你选任何一个："
        ),
    ]
    lines.extend(f"  - {tid}" for tid in conflicts)
    lines.append("  处理：编辑该文件保留你要的版本 → git add → git rebase --continue；")
    lines.append("  不想合就 git rebase --abort 回到写之前。你的台账改动已提交在本地，不会丢。")
    return "\n".join(lines)
