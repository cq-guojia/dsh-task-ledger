"""时间：本地墙钟 ↔ UTC 的换算、格式化、排序键。

进门规则：不读文件、不写文件、不打印；只依赖 errors。
所有**存盘**时间都是 UTC（`YYYY-MM-DD HH:MM:SS`，不带偏移量）；
所有**人话显示**都过 `fmt_local`；`--json` 原样吐 UTC。
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

from ..errors import Fail

_UTC = UTC

TIME_RE = re.compile(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?\Z")
_TIME_IN_RE = re.compile(
    r"(\d{4})-(\d{1,2})-(\d{1,2})(?: +(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?\Z"
)


def now() -> str:
    """当前时刻（UTC，到秒）。"""
    return datetime.now(_UTC).strftime("%Y-%m-%d %H:%M:%S")


def normalize_time(
    value: str | datetime,
    *,
    field: str = "时间",
    tid: str | None = None,
    date_only_ref: str | None = None,
) -> str:
    """把「正确但不完整」的写法归一化到 `YYYY-MM-DD HH:MM:SS`。

    接受 `YYYY-MM-DD`、`YYYY-MM-DD HH:MM`、`YYYY-MM-DD HH:MM:SS`，容忍 `/` 与 `T`。
    `date_only_ref`：只给了日期时用这个时刻顶替（`--until` 想含整天传 `23:59:59`）。
    """
    where = f"{tid}: " if tid else ""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    if not isinstance(value, str) or not value.strip():
        raise Fail(f"{where}{field} 要是一个时间字符串，收到 {value!r}")
    s = " ".join(
        value.strip().replace("/", "-").replace("T", " ").replace("t", " ").split()
    )
    m = _TIME_IN_RE.fullmatch(s)
    if not m:
        raise Fail(
            f"{where}{field} 时间格式不对：{value!r}"
            "（可用 YYYY-MM-DD、YYYY-MM-DD HH:MM、YYYY-MM-DD HH:MM:SS）"
        )
    y, mo, d, hh, mm, ss = m.groups()
    if date_only_ref is not None and hh is None:
        out = f"{int(y):04d}-{int(mo):02d}-{int(d):02d} {date_only_ref}"
    else:
        out = (
            f"{int(y):04d}-{int(mo):02d}-{int(d):02d} "
            f"{int(hh or 0):02d}:{int(mm or 0):02d}:{int(ss or 0):02d}"
        )
    try:
        datetime.strptime(out, "%Y-%m-%d %H:%M:%S")
    except ValueError as exc:
        raise Fail(f"{where}{field} 不是真实时间：{value!r}（{exc}）") from exc
    return out


def to_utc(
    value: str,
    *,
    field: str,
    tid: str | None = None,
    date_only_ref: str | None = None,
) -> str:
    """用户按本地墙钟给的时间 → 存盘用的 UTC 串。只由外壳调用。"""
    wall = normalize_time(value, field=field, tid=tid, date_only_ref=date_only_ref)
    naive = datetime.strptime(wall, "%Y-%m-%d %H:%M:%S")
    return naive.astimezone(_UTC).strftime("%Y-%m-%d %H:%M:%S")


def fmt_local(stamp: object) -> str:
    """存盘的 UTC → 查看者本地时间，只用于人看的输出。

    存量老数据（2026-10-22 前写的是写入者本地时间、无标记）无法区分，
    按 UTC 转会显示偏后若干小时 —— 这是已知例外，不在脚本里猜。
    """
    key = time_key(stamp)
    if key is None:
        return "" if stamp is None else str(stamp)
    try:
        dt = datetime.strptime(key, "%Y-%m-%d %H:%M:%S").replace(tzinfo=_UTC)
    except ValueError:
        return str(stamp)
    return dt.astimezone().strftime("%Y-%m-%d %H:%M:%S")


def time_key(value: object) -> str | None:
    """已存时间（可能只到分）→ 秒精度串，用于比较/排序；不合法返回 None。"""
    if not isinstance(value, str) or not TIME_RE.fullmatch(value):
        return None
    return value if len(value) == 19 else value + ":00"
