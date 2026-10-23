"""取最新要刷哪些文件：**全仓唯一算锁集的地方**。

返回两份 `Scope`（自举那份、动作那份）。runner 拿它做三件事：
`sync_down(boot | act)` / `atom(*boot.files)` 包自举 / `atom(*act.files)` 包动作。
它本来就不碰 git —— `--no-sync` 也照调。
"""

from __future__ import annotations

from pathlib import Path

from ..actions.atom import Scope, lock_scope
from ..core.identity import Identity


def presync_scope(
    repo: Path, me: Identity, action: str, params: dict
) -> tuple[Scope, Scope]:
    """(自举那份, 动作那份)。只读动作由 runner 直接拿空的两份，不进这里。"""
    boot = lock_scope(repo, me, "bootstrap", params)
    act = Scope() if action == "bootstrap" else lock_scope(repo, me, action, params)
    return boot, act
