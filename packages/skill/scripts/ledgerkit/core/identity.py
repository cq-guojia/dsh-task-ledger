"""身份这个值对象：uuid 是唯一键，name 只用于显示与查询筛选。

**只做字符串换算，不读文件**（读身份归 env.py）。名字永远不参与归属判定：
认领 / 释放 / 交接 / 查「我的」，一律只比 uuid。
"""

from __future__ import annotations

import re
from dataclasses import dataclass

#: 合法身份键的形态（8-4-4-4-12 的十六进制 UUID）。`--owner` 只收这种值。
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


@dataclass(frozen=True)
class Identity:
    """一个人的身份。`uuid` 是唯一键，`name` 只用于显示。"""

    uuid: str
    name: str = ""

    def label(self) -> str:
        """显示名：没名字就用 uuid 前 8 位。只给人看（报错文案、界面）。"""
        return self.name or self.uuid[:8]

    def stamp(self) -> str:
        """**落盘**用的身份串：`名字 · uuid` —— 名字在前给人读，uuid 在后给机器对。

        与 `label()` 一样**不带 `@`**（`@` 由各落点自己加：头部各行拼 ` · @{stamp}`、
        `exec_line` 拼 ` · @{who} · `）。

        过程文档（创建行 / 状态行 / 封卷行 / 执行记录）是这个串唯一的落点：文件是最终产物，
        创建人和封卷人可能不是同一个人、也可能中途改过名，所以**两个都要留**，不靠
        历史表回链。没名字就只写 uuid。
        """
        if not self.name:
            return self.uuid
        return f"{self.name} · {self.uuid}"


def normalize(who: str) -> str:
    """归一化：去首尾空白 + 转小写。全仓只此一处。"""
    return (who or "").strip().lower()


def looks_like_uuid(who: str | None) -> bool:
    """是不是一个 UUID 形态的身份键（名字、邮箱一律 False）。"""
    return bool(UUID_RE.match(normalize(who or "")))


def is_me(identity: Identity, who: str | None) -> bool:
    """`who`（uuid）是不是这个人。全站只认 uuid 这一个身份键。"""
    return normalize(who or "") == normalize(identity.uuid)
