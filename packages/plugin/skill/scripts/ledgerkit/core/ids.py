"""任务号：生成、形态校验。只做字符串换算。"""

from __future__ import annotations

import re
import secrets
from typing import Mapping

from ..errors import Fail
from .time import now

ID_RE = re.compile(r"[a-z0-9\u4e00-\u9fff][a-z0-9\u4e00-\u9fff-]*\Z")


def slugify(title: str) -> str:
    """任务号用：保留 ASCII 字母数字与汉字，其余转连字符，截到 40 字。"""
    s = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "-", title.strip().lower())
    return s.strip("-")[:40].strip("-")


def id_stamp(created: str) -> str:
    """`created`（YYYY-MM-DD HH:MM:SS）→ 任务号前缀 `YYYYMMDD-HHMM`（任务号只到分）。"""
    return (
        f"{created[0:4]}{created[5:7]}{created[8:10]}-{created[11:13]}{created[14:16]}"
    )


def make_id(
    title: str, tasks: Mapping[str, object], created: str | None = None
) -> str:
    """按标题生成一个不撞号的任务号。

    随机码不能省：`make_id` 只在**在办**任务里去重，而结案的过程文档长期留在磁盘上，
    去掉随机码会让新任务撞上已结案文档的名字。
    """
    slug = slugify(title)
    if not slug:
        raise Fail(
            "标题里没有可用字符（字母、数字或汉字），无法自动生成任务号。"
            f'用 --id 指定一个，例如 --id "task-{secrets.token_hex(2)}"。'
        )
    stamp = id_stamp(created or now())
    for _ in range(20):
        tid = f"{stamp}-{slug}-{secrets.token_hex(2)}"
        if tid not in tasks:
            return tid
    raise Fail("任务号连续冲突 20 次，请检查台账是否异常。")


def require_task_id(tid: str) -> str:
    """任务号形态校验（全仓唯一入口）。不合法直接抛 Fail。"""
    value = (tid or "").strip()
    if not value:
        raise Fail("任务号不能为空。")
    if not ID_RE.fullmatch(value.lower()):
        raise Fail(
            f"任务号 {tid!r} 不合法：只能用小写字母、数字、汉字和连字符，"
            "且不能以连字符开头或结尾。"
        )
    return value
