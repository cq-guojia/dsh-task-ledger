"""查询条件长什么样。外壳把命令行装成它，界面直接构造它 —— **动作层不认识 argparse**。"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ListQuery:
    scope: str = "all"                    # "all" / "pool" / "mine" / "owner"
    owner: str | None = None              # scope="owner" 时生效
    statuses: tuple[str, ...] = ()
    category: str | None = None
    tag: str | None = None
    since: str | None = None              # UTC 串，闭区间
    until: str | None = None              # 同上
    # `since` / `until` **一律比 `created`**（含边界，只给其一也行），不比 started / updated。


@dataclass(frozen=True)
class HistoryQuery:
    owner: str | None = None
    mine: bool = False
    category: str | None = None
    tag: str | None = None
    since: str | None = None
    until: str | None = None
    limit: int | None = None
    months: int | None = None             # 只看最近 N 个月的文件
    count_only: bool = False              # 只要计数，不要 records


COUNT_CAP = 10_000                        # --count-only 的封顶：超过就 capped=True
