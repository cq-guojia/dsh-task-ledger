"""开工前的自举：台账文件不存在就建，没登记过就把自己登记进去、建自己的分片。

这三份由**外壳**单独一个 `atom` 包住，它自己不开事务、不拿锁。
不参与「提交说明 / where / 打印」。
"""

from __future__ import annotations

from pathlib import Path

from ..core.identity import Identity
from ..core.paths import LEDGER_DIR, OWNERS_DIR, POOL_REL, shard_rel, to_repo_rel
from ..core.roots import as_root
from ..store.atomic import ensure_dir
from ..store.owners_index import OwnersIndex
from ..store.task_store import TaskStore


def bootstrap(repo: Path, me: Identity) -> Identity:
    """写序：`owners/` 目录 → 池 → **我的分片 → 索引（登记自己）**。已登记 ⇒ 零写。

    分片必须排在登记之**前**：反过来的话，硬崩（SIGKILL / 断电）正好落在两步之间，
    会留下「索引里有我、磁盘上没有我的分片」——此后**所有人**的 list / show 都在
    `assert_present` 处报「登记的任务文件找不到了」，而 `ensure` 看到记录已存在就零写，
    这个坏状态永远不自愈。按现在的顺序崩，最多留一份孤儿分片（`validate` 会报出来），
    下一条写命令 bootstrap 时会把它登记回去。
    """
    repo = as_root(
        repo, source="工作区根"
    )  # 门 3：写前最后确认，绝不在 ledger/ 里再套一层
    ensure_dir(repo / LEDGER_DIR)  # 曾是 to_repo_rel(LEDGER_DIR) ⇒ 会拼出 ledger/ledger
    ensure_dir(repo / to_repo_rel(OWNERS_DIR))
    TaskStore(repo, POOL_REL).ensure_file()
    TaskStore(repo, shard_rel(me.uuid), identity=me).ensure_file()
    index = OwnersIndex(repo)
    _, _ = index.ensure(me)  # 登记自己（已登记则零写）
    return me
