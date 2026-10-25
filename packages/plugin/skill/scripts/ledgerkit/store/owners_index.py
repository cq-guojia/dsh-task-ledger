"""索引 `owners.json`：谁是登记过的人、各自的分片文件是哪个、新人的登记与改名。

**分片只认索引，不扫目录** —— 唯一例外是全仓仅此一处的 `disk_shards()`，它只给 `validate` 用。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Self

from ..core.identity import Identity, normalize
from ..core.paths import OWNERS_DIR, OWNERS_REL, shard_rel, to_repo_rel
from ..core.time import now
from ..errors import Fail
from .json_store import JSONStore

DEFAULT_DATA = {"version": "", "workers": {}}


class OwnersIndex:
    def __init__(self, repo: Path):
        self.repo = Path(repo)
        self._store = JSONStore(
            self.repo / to_repo_rel(OWNERS_REL), default=DEFAULT_DATA, expand="workers"
        )

    def get(self, who: str) -> dict[str, Any] | None:
        return self._store.get(normalize(who))

    def all(self) -> dict[str, dict[str, Any]]:
        return self._store.all()

    def ensure(self, me: Identity) -> tuple[bool, dict[str, Any]]:
        """登记 / 补 `joined`。`name` 只在首次登记时写入，之后不回写（名字是给你做对照的被动字段，不该被任何逻辑读）。返回 (这次写了没有, 记录)。"""
        key = normalize(me.uuid)
        with self._open() as session:
            data = session.data
            workers = data.setdefault("workers", {})
            record = workers.get(key)
            if record is None:
                record = {
                    "file": shard_rel(key).name,
                    "name": me.name,
                    "joined": now(),
                }
                workers[key] = record
                session.mark()
                return True, dict(record)
            return False, dict(record)

    def shards(self) -> dict[str, Path]:
        """身份 → 分片绝对路径（只信索引）。"""
        out: dict[str, Path] = {}
        for key, record in self.all().items():
            name = (record or {}).get("file")
            if not name:
                continue
            out[key] = self.repo / to_repo_rel(OWNERS_DIR) / str(name)
        return out

    def disk_shards(self) -> list[Path]:
        """扫 `owners/` 下的全部 `*.json`。**全仓唯一扫目录的地方**，只给 `validate`。"""
        base = self.repo / to_repo_rel(OWNERS_DIR)
        if not base.is_dir():
            return []
        return sorted(p for p in base.glob("*.json") if p.is_file())

    def assert_present(self) -> None:
        """登记过的分片（含池）文件必须都在；被人删了/改名了就报清楚，绝不悄悄当空、绝不修复。

        只校验「该在的文件在不在」，不碰内容、不重建。本方法只在校读路径
        （list / show / validate）调用；会新建分片的写动作（claim/set/…）里不调，
        否则全新仓库第一次写会被误报「分片文件缺失」。
        """
        missing = [str(p) for p in self.shards().values() if not p.exists()]
        if missing:
            raise Fail(
                "台账里登记的任务文件找不到了（可能被人手动删除或改名）：\n  "
                + "\n  ".join(missing)
                + "\n程序不自动修复——请用 git 恢复原文件（git checkout -- <文件>），"
                "或把原文件放回原处，再重试。"
            )
        # 索引本身没了、但盘上还有分片 ⇒ 分片变成无主孤儿，等同于被删
        if not (self.repo / to_repo_rel(OWNERS_REL)).exists() and self.disk_shards():
            raise Fail(
                "台账索引 owners.json 找不到了，但 owners/ 下还有任务文件"
                "（可能被人手动删除或改名）。\n程序不自动修复——请用 git 恢复 owners.json，再重试。"
            )

    def _open(self):
        """把 `ensure` 的读写收在一处：任何改动最终都按一条一行写回。"""
        return _IndexSession(self._store)


class _IndexSession:
    """索引的一次读写：**没改动就不写回**（自举要能零写，否则每次都撞「nothing to commit」）。"""

    def __init__(self, store: JSONStore):
        self.store = store
        self.data: dict[str, Any] = {}
        self.changed = False

    def mark(self) -> None:
        self.changed = True

    def __enter__(self) -> Self:
        self.data = self.store.data()
        return self

    def __exit__(self, *exc) -> None:
        if self.changed:
            self.store._flush(self.data)  # 同一个包内的受控写回口


