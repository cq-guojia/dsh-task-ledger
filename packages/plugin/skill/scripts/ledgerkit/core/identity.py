"""身份这个值对象：uuid 是唯一键，name 只用于显示。**只做字符串换算，不读文件**（读身份归 env.py）。"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Identity:
    """一个人的身份。`uuid` 是分区键（UUID），`name` 只用于显示。"""

    uuid: str
    name: str = ""

    def label(self) -> str:
        """显示名：没名字就用 uuid 前 8 位。"""
        return self.name or self.uuid[:8]


def normalize(who: str) -> str:
    """归一化：去首尾空白 + 转小写。全仓只此一处。"""
    return (who or "").strip().lower()


def is_me(identity: Identity, who: str | None) -> bool:
    """`who`（uuid）是不是这个人。全站只认 uuid 这一个身份键。"""
    return normalize(who or "") == normalize(identity.uuid)
