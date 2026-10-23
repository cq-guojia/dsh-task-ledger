"""路径与文件名怎么拼：只做换算，一个文件都不碰。

**基准只有两个**：
- 磁盘与 JSON 里存的（`task["worklog"]` 等）一律**相对 `ledger/`**；
- 输出给人或给界面的（`Result.where`、`payload` 里的 `*_path`）一律**相对 repo**。

换算只在这两个函数里做，任何层都不许自己拼 `..`。
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

LEDGER_DIR = Path("ledger")

POOL_REL = Path("pool.json")
OWNERS_REL = Path("owners.json")
OWNERS_DIR = Path("owners")
HISTORY_DIR = Path("history")
WORKLOG_DIR = Path("worklog")
LEGACY_HISTORY_REL = Path("PROGRESS-HISTORY.md")   # 存量平铺文件：只读不写

SHA_LEN = 12

# 模板与资产的唯一定位基准：按自身位置算绝对路径，不依赖调用方 cwd。
# ledgerkit/core/paths.py → parents: [core, ledgerkit, scripts, skill]
SKILL_DIR = Path(__file__).resolve().parents[3]
WORKLOG_TEMPLATE = SKILL_DIR / "assets" / "worklog.md"


def to_repo_rel(ledger_rel: str | Path) -> Path:
    """相对 `ledger/` 的路径 → 相对 repo 的路径。"""
    return LEDGER_DIR / Path(ledger_rel)


def to_ledger_rel(repo_rel: str | Path) -> str:
    """相对 repo 的路径 → 相对 `ledger/` 的路径（已经是 `ledger/` 内的原样返回）。"""
    p = Path(repo_rel)
    if p.parts and p.parts[0] == LEDGER_DIR.name:
        return Path(*p.parts[1:]).as_posix()
    return p.as_posix()


def to_history_rel(ledger_rel: str | Path) -> str:
    """`ledger/` 内的路径 → 从 `ledger/history/<ym>.md` 出发的链接串。

    深度固定（`history/` 与 `worklog/` 都在 `ledger/` 下），拼 `..` 只许在这一处。
    """
    return ("../" / Path(ledger_rel)).as_posix()


def shard_rel(identity: str) -> Path:
    """某人分片相对 `ledger/` 的路径：sha256(归一化身份)[:12] + .json。"""
    digest = hashlib.sha256(identity.strip().lower().encode("utf-8")).hexdigest()
    return OWNERS_DIR / f"{digest[:SHA_LEN]}.json"


def month_of(stamp: str, *, fallback_now: str | None = None) -> str:
    """存盘时间 → `YYYYMM`；取不到时用 `fallback_now`，再没有就抛错由调用方定夺。"""
    month = re.sub(r"[^0-9]", "", (stamp or "")[:7])[:6]
    if len(month) == 6:
        return month
    if fallback_now:
        return re.sub(r"[^0-9]", "", fallback_now[:7])[:6]
    return ""


def worklog_dir_for(created: str) -> Path:
    """过程文档的按月目录（相对 `ledger/`）：`worklog/<YYYYMM>/`。"""
    return WORKLOG_DIR / month_of(created)


def worklog_name(tid: str) -> str:
    """过程文档的文件名：任务号剥掉前缀年月日，随机码保留。

    父目录 `worklog/<YYYYMM>/` 已带年月，文件名里再写一遍是冗余；
    自定义 `--id` 不以「8 位数字-」开头时，文件名就是任务号本身。
    """
    if len(tid) > 9 and tid[:8].isdigit() and tid[8] == "-":
        return f"{tid[6:]}.md"
    return f"{tid}.md"


def worklog_rel(tid: str, created: str) -> str:
    """过程文档相对 `ledger/` 的路径：任务对象与历史末列共用同一口径。"""
    return (worklog_dir_for(created) / worklog_name(tid)).as_posix()


def history_path_for(finished: str) -> Path:
    """结案时间 → 历史文件相对 `ledger/` 的路径：`history/<YYYYMM>.md`。"""
    return HISTORY_DIR / f"{month_of(finished)}.md"
