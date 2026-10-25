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
    """写序：`owners/` 目录 → 池 → 索引（登记自己）→ 我的分片。已登记 ⇒ 零写。"""
    repo = as_root(
        repo, source="工作区根"
    )  # 门 3：写前最后确认，绝不在 ledger/ 里再套一层
    ensure_dir(repo / LEDGER_DIR)  # 曾是 to_repo_rel(LEDGER_DIR) ⇒ 会拼出 ledger/ledger
    ensure_dir(repo / to_repo_rel(OWNERS_DIR))
    TaskStore(repo, POOL_REL).ensure_file()
    index = OwnersIndex(repo)
    _, _ = index.ensure(me)  # 登记自己（已登记则零写）
    TaskStore(repo, shard_rel(me.uuid), identity=me).ensure_file()
    return me
