"""改归属的入口：只看 `--owner`，决定走哪个动作，**自己不加锁、不改任何文件**。

它是全树唯一的跨动作引用点（import `release` / `handoff` / `claim`）。

任务状态只随命令语义变（认领 → 进行中、释放 → 待认领、结案 → 历史），
**没有单独的「改状态」入口**：`--status` 于 2026-10-23 删除 —— 全仓没有任何
产品调用方（看板只有 claim / release / close 三个写路由），且它能制造
「归我名下、状态却还是待认领」的坏状态（看板上显示成没人认领）。
"""

from __future__ import annotations

from pathlib import Path

from ..core.identity import Identity, is_me
from ..core.paths import shard_rel
from ..errors import Fail
from ..store.task_store import TaskStore
from . import claim as claim_mod
from . import handoff as handoff_mod
from . import release as release_mod
from .guard import require_uuid
from .result import Result, rel


def set_task(repo: Path, me: Identity, tid: str, *, owner: str | None) -> Result:
    """路由：空串 = 释放；别人的 uuid = 交接；自己的 uuid = 已认领则空转、没认领先认领。"""
    if owner is None:
        raise Fail(
            "set 必须带 --owner：空串 = 释放回公共池；对方 uuid = 交接（预留通道，agent 不用）。"
        )
    # 只认**空串**为释放：`--owner "  "`（变量没展开）不许被当成释放，交给 require_uuid 拒掉
    if owner == "":
        return release_mod.release(repo, me, tid)
    # 交接目标只收 uuid：名字查不到就当场报错，绝不去猜「他大概是这个人」
    target = require_uuid(owner, field="--owner")
    if not is_me(me, target):
        return handoff_mod.handoff(repo, me, tid, to=target)
    mine = TaskStore(repo, shard_rel(me.uuid), identity=me)
    if mine.get(tid) is not None:
        return Result(
            already_done=True,
            where=rel(repo, mine.path),
            notices=(f"任务 {tid} 已经在你名下，无需操作。",),
        )
    return claim_mod.claim(repo, me, tid)
