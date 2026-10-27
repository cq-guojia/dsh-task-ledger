"""改归属 / 改标签的入口：决定走哪个动作，**自己不加锁、不改任何文件**。

它是全树唯一的跨动作引用点（import `release` / `handoff` / `claim` / `relabel`）。

任务状态只随命令语义变（认领 → 进行中、释放 → 待认领、结案 → 历史），
**没有单独的「改状态」入口**：`--status` 于 2026-10-23 删除 —— 全仓没有任何
产品调用方（看板只有 claim / release / close 三个写路由），且它能制造
:「归我名下、状态却还是待认领」的坏状态（看板上显示成没人认领）。

**也没有改分类的入口**（2026-10-27 删除 `--category`）：分类在 `new` 时定死，
之后谁都改不了；标题与创建时间同理，建完即不可变。`--tags` 仍可随时改。
"""

from __future__ import annotations

from pathlib import Path

from ..core.identity import Identity, is_me
from ..core.paths import shard_rel
from ..errors import Fail
from ..store.task_store import TaskStore
from . import claim as claim_mod
from . import handoff as handoff_mod
from . import relabel as relabel_mod
from . import release as release_mod
from .guard import require_uuid
from .result import Result, rel

_MIXED = "--tags 与 --release / --owner 不能同给：一个改标签，一个改归属。"


def set_task(
    repo: Path,
    me: Identity,
    tid: str,
    *,
    owner: str | None = None,
    release: bool = False,
    tags: str | tuple[str, ...] | None = None,
) -> Result:
    """路由：`--release` = 释放；别人的 uuid = 交接；自己的 uuid = 已认领则空转、没认领先认领；
    `--tags` = 改标签（写分片 + 过程文档头部标签行）。
    """
    if release:
        if owner is not None:
            raise Fail("--release 与 --owner 不能同时给：释放不带人，交接不带释放。")
        if tags:
            raise Fail(_MIXED)
        return release_mod.release(repo, me, tid)
    if owner is not None:
        if tags:
            raise Fail(_MIXED)
    else:
        if tags:
            return relabel_mod.relabel(repo, me, tid, tags=tags)
        raise Fail(
            "set 必须给一样：`--release`（释放回公共池）/ `--owner <对方 uuid>`（交接）/ "
            "`--tags <a、b>`（改标签）。"
        )
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
