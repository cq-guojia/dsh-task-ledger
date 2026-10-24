"""只读：查已结案（按结案时间过滤，倒序取最近）。不写任何字节、不依赖格式升级。

时间区间一律落在**结案时间** `finished` 上 —— 历史文件本来就按结案月归档
（`history/<结案年月>.md`），按创建时间过滤会漏掉「上月建、本月结」的记录。
"""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from ..core import history_md
from ..core.identity import Identity, normalize
from ..core.paths import HISTORY_DIR, LEGACY_HISTORY_REL, month_of, to_repo_rel
from ..core.time import now, time_key
from ..errors import Fail
from ..store.history_store import HistoryStore
from .query import COUNT_CAP, HistoryQuery
from .result import HistoryResult, rel

#: 一次最多查多少个月（含当月）；超出直接 Fail，不去 stat 任何文件。
MAX_HISTORY_MONTHS = 13
#: 没给任何时间参数时，默认只看最近几个自然月。
DEFAULT_HISTORY_MONTHS = 3


def _recent_month_keys(count: int) -> list[str]:
    """最近 count 个自然月的月份键（含当月），按当前 UTC 推，从新到旧。"""
    stamp = now()
    year, month = int(stamp[0:4]), int(stamp[5:7])
    keys: list[str] = []
    for _ in range(max(count, 0)):
        keys.append(f"{year:04d}{month:02d}")
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return keys


def _shift_month(ym: str, delta: int) -> str:
    """`YYYYMM` 偏移 delta 个月；越过年份边界自动进位 / 借位。"""
    idx = int(ym[0:4]) * 12 + (int(ym[4:6]) - 1) + delta
    return f"{idx // 12:04d}{idx % 12 + 1:02d}"


def _month_keys_between(lo_ym: str, hi_ym: str) -> list[str]:
    """`[lo_ym, hi_ym]` 闭区间内的月份键（升序）；两端给反了也能兜住。"""
    if lo_ym > hi_ym:
        lo_ym, hi_ym = hi_ym, lo_ym
    keys: list[str] = []
    cur = lo_ym
    while cur <= hi_ym:
        keys.append(cur)
        cur = _shift_month(cur, 1)
    return keys


def _month_end(ym: str) -> str:
    """`YYYYMM` 所在月的最后一秒（`YYYY-MM-DD HH:MM:SS`），用于把老平铺文件也框进区间。"""
    year, month = int(ym[0:4]), int(ym[4:6])
    nxt = datetime(year + (1 if month == 12 else 0), (month % 12) + 1, 1)
    return (nxt - timedelta(seconds=1)).strftime("%Y-%m-%d %H:%M:%S")


def _target_month_keys(q: HistoryQuery) -> list[str]:
    """由时间参数算出「要读的月份键」；超过上限直接 Fail（不碰磁盘）。

    - 无任何时间参数 ⇒ 最近 `DEFAULT_HISTORY_MONTHS` 个自然月；
    - `--months N` ⇒ 最近 N 个自然月（与 `--since/--until` 互斥）；
    - `--since/--until` ⇒ 结案月区间（只给一端时，另一端按默认口径补齐）。
    """
    if q.months is not None and (q.since or q.until):
        raise Fail("--months 与 --since/--until 不能同时用（时间口径二选一）。")
    if q.months is not None:
        if q.months < 1:
            raise Fail("--months 至少为 1。")
        keys = _recent_month_keys(q.months)
    elif q.since or q.until:
        if q.since:
            lo = month_of(q.since)
        elif q.until:
            # 只给 --until：往前补到默认窗口（与「默认近 3 月」一致）
            lo = _shift_month(month_of(q.until), -(DEFAULT_HISTORY_MONTHS - 1))
        else:  # pragma: no cover - 上面已保证至少给了一个
            raise Fail("--since/--until 至少要给一个。")
        hi = month_of(q.until) if q.until else month_of(now())
        if not lo or not hi:
            raise Fail("--since/--until 时间格式不对，算不出月份。")
        keys = _month_keys_between(lo, hi)
    else:
        keys = _recent_month_keys(DEFAULT_HISTORY_MONTHS)
    if len(keys) > MAX_HISTORY_MONTHS:
        raise Fail(
            f"历史查询一次最多跨 {MAX_HISTORY_MONTHS} 个月（含当月），"
            f"本次要查 {len(keys)} 个月 ⇒ 缩小 --since/--until 或 --months。"
        )
    return keys


def _candidate_paths(repo: Path, keys: list[str]) -> list[Path]:
    """按月键【直接拼】`history/<年月>.md`（不扫磁盘）；存量平铺文件按固定路径顺带一看。"""
    paths = [repo / to_repo_rel(HISTORY_DIR / f"{ym}.md") for ym in keys]
    paths.append(repo / to_repo_rel(LEGACY_HISTORY_REL))
    return paths


def query_history(repo: Path, me: Identity, q: HistoryQuery) -> HistoryResult:
    """`--owner` / `--mine` 一律**精确相等**（不做前缀 / 子串）；`--since` / `--until` 比 `finished`（结案时间）。"""
    keys = _target_month_keys(q)
    store = HistoryStore(repo)
    records: list[dict[str, Any]] = []
    warnings: list[str] = []
    for path in _candidate_paths(repo, keys):
        if not path.is_file():
            continue  # 该月无记录 / 老平铺文件不存在 ⇒ 跳过，不报错
        rows, warns = history_md.parse_history(store.read(path))
        warnings.extend(f"{rel(repo, path)}：{w}" for w in warns)
        for row in rows:
            row = dict(row)
            row["src"] = rel(repo, path)
            row["created"] = time_key(row.get("created") or "") or row.get("created")
            row["finished"] = time_key(row.get("finished") or "") or row.get("finished")
            records.append(row)

    if q.mine:
        wanted = {k for k in (me.email, *me.aliases) if k}
        wanted = {normalize(k) for k in wanted}
        records = [r for r in records if normalize(r.get("owner") or "") in wanted]
    elif q.owner:
        key = normalize(q.owner)
        records = [r for r in records if normalize(r.get("owner") or "") == key]
    if q.category:
        records = [r for r in records if (r.get("category") or "") == q.category]
    if q.tag:
        records = [r for r in records if q.tag in (r.get("tags") or ())]

    # 有效结案区间：显式 --since/--until 优先（精确到秒），缺的一端用月份窗口补，
    # 这样老平铺文件里的行也会被同一条规则框住，不会在月份查询里「漏网」。
    lo_key, hi_key = min(keys), max(keys)
    eff_since = q.since or f"{lo_key[0:4]}-{lo_key[4:6]}-01 00:00:00"
    eff_until = q.until or _month_end(hi_key)
    records = [r for r in records if (r.get("finished") or "") >= eff_since]
    records = [r for r in records if (r.get("finished") or "") <= eff_until]

    records.sort(key=lambda r: str(r.get("finished") or ""), reverse=True)
    capped = False
    if q.count_only and len(records) > COUNT_CAP:
        capped = True
        records = records[:COUNT_CAP]
    elif q.limit:
        records = records[: int(q.limit)]

    filters = {
        "owner": q.owner,
        "mine": q.mine,
        "category": q.category,
        "tag": q.tag,
        "since": q.since,
        "until": q.until,
        "limit": q.limit,
        "months": q.months,
    }
    return HistoryResult(
        count=len(records),
        filters=filters,
        records=tuple(records),
        warnings=tuple(warnings),
        capped=capped,
    )
