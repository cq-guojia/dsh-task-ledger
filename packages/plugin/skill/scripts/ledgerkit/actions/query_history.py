"""只读：查已结案（按结案时间过滤，倒序取最近）。不写任何字节、不依赖格式升级。

时间区间一律落在**结案时间** `finished` 上 —— 历史文件本来就按结案月归档
（`history/<结案年月>.md`），按创建时间过滤会漏掉「上月建、本月结」的记录。
"""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from ..core import history_md
from ..core.identity import Identity, normalize
from ..core.paths import HISTORY_DIR, LEGACY_HISTORY_REL, month_of, to_repo_rel
from ..core.time import now, time_key
from ..errors import Fail
from ..store.history_store import HistoryStore
from ..store.owners_index import OwnersIndex
from .guard import require_uuid
from .query import COUNT_CAP, HistoryQuery
from .result import HistoryResult, rel

#: 一次最多读多少个历史文件（按月分文件；不区分连续 / 分散，只数总数）。
MAX_HISTORY_FILES = 13
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
    # 上限卡的是「要读的文件总数」，不是月跨度：按月分文件，一个键一个文件；
    # 连不连续、将来把多段时间拼在一起也都只数总数。
    files = sorted(set(keys))
    if len(files) > MAX_HISTORY_FILES:
        raise Fail(
            f"历史查询一次最多读 {MAX_HISTORY_FILES} 个历史文件（按月分文件，不区分连续/分散），"
            f"本次要读 {len(files)} 个 ⇒ 缩小 --since/--until 或 --months。"
        )
    return files


def _candidate_paths(repo: Path, keys: list[str]) -> list[Path]:
    """按月键【直接拼】`history/<年月>.md`（不扫磁盘）；存量平铺文件按固定路径顺带一看。"""
    paths = [repo / to_repo_rel(HISTORY_DIR / f"{ym}.md") for ym in keys]
    paths.append(repo / to_repo_rel(LEGACY_HISTORY_REL))
    return paths


def query_history(repo: Path, me: Identity, q: HistoryQuery) -> HistoryResult:
    """`--owner` / `--mine` 一律按 **uuid 精确相等**；名字只能走 `--owner-name` 模糊筛。

    `--since` / `--until` 比 `finished`（结案时间）。
    """
    if q.owner is not None:
        if q.mine:
            raise Fail("--owner 不能和 --mine 一起用：一次只按一种范围筛。")
        q = replace(q, owner=require_uuid(q.owner, field="--owner"))
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

    index = OwnersIndex(repo)
    roster = index.all()
    if q.mine:
        wanted = {normalize(me.uuid)}
        records = [r for r in records if normalize(r.get("owner") or "") in wanted]
    elif q.owner:
        key = normalize(q.owner)
        records = [r for r in records if normalize(r.get("owner") or "") == key]
    if q.owner_name:
        # 名字只在名册里模糊匹配出 uuid 集合，命中判定仍比 uuid
        keys_of_name = index.keys_of_name(q.owner_name)
        records = [
            r for r in records if normalize(r.get("owner") or "") in keys_of_name
        ]

    # 展示名（`owner_name` / `creator_name`）只在这层补上，不落盘：
    # 历史文件里 owner / creator 两列存的一律是 uuid，读出来给人看时才换成名字。
    for row in records:
        for field, target in (("owner", "owner_name"), ("creator", "creator_name")):
            key = normalize(row.get(field) or "")
            name = str((roster.get(key) or {}).get("name") or "")
            if name:
                row[target] = name
    if q.category:
        records = [r for r in records if (r.get("category") or "") == q.category]
    if q.tag:
        records = [r for r in records if q.tag in (r.get("tags") or ())]

    # 有效结案区间：显式 --since/--until 优先（精确到秒），缺的一端用月份窗口补，
    # 这样老平铺文件里的行也会被同一条规则框住，不会在月份查询里「漏网」。
    lo_key, hi_key = min(keys), max(keys)
    eff_since = q.since or f"{lo_key[0:4]}-{lo_key[4:6]}-01 00:00:00"
    eff_until = q.until or _month_end(hi_key)
    if eff_since > eff_until:
        raise Fail(
            f"时间区间反了：--since（{eff_since}）晚于 --until（{eff_until}）。\n"
            "  处理：把两端换过来；只给一端就只给一端。"
        )
    records = [r for r in records if (r.get("finished") or "") >= eff_since]
    records = [r for r in records if (r.get("finished") or "") <= eff_until]

    records.sort(key=lambda r: str(r.get("finished") or ""), reverse=True)
    if q.count_only and q.limit is not None:
        raise Fail("--count-only 与 --limit 不能同时用：计数不截断，列表才截断。")
    limit: int | None = None
    if q.limit is not None:
        limit = int(q.limit)
        if limit < 1:
            raise Fail(f"--limit 必须 ≥ 1（收到 {limit}）。")
    capped = False
    if q.count_only and len(records) > COUNT_CAP:
        capped = True
        records = records[:COUNT_CAP]
    elif limit is not None:
        capped = len(records) > limit  # 截断了要让调用方知道「还有更多」
        records = records[:limit]

    filters = {
        "owner": q.owner,
        "owner_name": q.owner_name,
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
