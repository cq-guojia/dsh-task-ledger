"""身份这个值对象：归一化与比较规则。**只做字符串换算，不读 git**（读 git 归 env.py）。"""

from __future__ import annotations

from dataclasses import dataclass, replace


@dataclass(frozen=True)
class Identity:
    """一个人的身份。`email` 是分区键（归一化后的裸标识），`name` 只用于显示。"""

    email: str
    name: str = ""
    aliases: tuple[str, ...] = ()

    def label(self) -> str:
        """显示名：没名字就用邮箱。"""
        return self.name or self.email


def normalize(who: str) -> str:
    """归一化：去首尾空白 + 转小写。全仓只此一处。"""
    return (who or "").strip().lower()


def keys(identity: Identity) -> tuple[str, ...]:
    """这个身份的全部可比标识：自己 + aliases（去重、保持顺序）。"""
    out: list[str] = []
    for value in (identity.email, *identity.aliases):
        key = normalize(value)
        if key and key not in out:
            out.append(key)
    return tuple(out)


def is_me(identity: Identity, who: str | None) -> bool:
    """`who`（可能是邮箱、名字或别名）是不是这个人。"""
    return normalize(who or "") in keys(identity)


def with_aliases(identity: Identity, aliases: tuple[str, ...]) -> Identity:
    """换一个带 aliases 的同身份对象（索引里读到别名后由外壳装配）。"""
    return replace(identity, aliases=tuple(aliases))
