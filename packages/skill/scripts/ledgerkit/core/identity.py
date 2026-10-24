"""身份这个值对象：归一化与比较规则。**只做字符串换算，不读 git**（读 git 归 env.py）。"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Identity:
    """一个人的身份。`email` 是分区键（归一化后的裸标识），`name` 只用于显示。"""

    email: str
    name: str = ""

    def label(self) -> str:
        """显示名：没名字就用邮箱。"""
        return self.name or self.email


def normalize(who: str) -> str:
    """归一化：去首尾空白 + 转小写。全仓只此一处。"""
    return (who or "").strip().lower()


def is_me(identity: Identity, who: str | None) -> bool:
    """`who`（邮箱）是不是这个人。全站只认邮箱这一个身份键。"""
    return normalize(who or "") == normalize(identity.email)
