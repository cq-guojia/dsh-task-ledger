"""索引 `owners.json`：谁是登记过的人、各自的分片文件是哪个、新人的登记与改名。

**分片只认索引，不扫目录** —— 唯一例外是全仓仅此一处的 `disk_shards()`，它只给 `validate` 用。
`ensure` 是 `aliases` 的唯一写入点。
"""

from __future__ import annotations

from pathlib import Path

from ..core.identity import Identity, normalize
from ..core.paths import OWNERS_DIR, OWNERS_REL, shard_rel, to_repo_rel
from ..core.time import now
from .json_store import JSONStore

DEFAULT_DATA = {"version": "", "workers": {}}


class OwnersIndex:
    def __init__(self, repo: Path):
        self.repo = Path(repo)
        self._store = JSONStore(
            self.repo / to_repo_rel(OWNERS_REL), default=DEFAULT_DATA, expand="workers"
        )

    def get(self, who: str) -> dict | None:
        return self._store.get(normalize(who))

    def all(self) -> dict[str, dict]:
        return self._store.all()

    def ensure(self, me: Identity) -> tuple[bool, dict]:
        """登记 / 补 `joined` / 名字或 aliases 变了才写。返回 (这次写了没有, 记录)。"""
        key = normalize(me.email)
        with self._open() as session:
            data = session.data
            workers = data.setdefault("workers", {})
            record = workers.get(key)
            if record is None:
                record = {
                    "file": shard_rel(key).name,
                    "name": me.name,
                    "joined": now(),
                    "aliases": _merge_aliases([], me.aliases),
                }
                workers[key] = record
                session.mark()
                return True, dict(record)
            changed = False
            if me.name and record.get("name") != me.name:
                record["name"] = me.name
                changed = True
            known = list(record.get("aliases") or [])
            aliases = _merge_aliases(known, me.aliases)  # 只增不删
            if aliases != known:
                record["aliases"] = aliases
                changed = True
            if changed:
                session.mark()
            return changed, dict(record)

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

    def _open(self):
        """把 `ensure` 的读写收在一处：任何改动最终都按一条一行写回。"""
        return _IndexSession(self._store)


class _IndexSession:
    """索引的一次读写：**没改动就不写回**（自举要能零写，否则每次都撞「nothing to commit」）。"""

    def __init__(self, store: JSONStore):
        self.store = store
        self.data: dict = {}
        self.changed = False

    def mark(self) -> None:
        self.changed = True

    def __enter__(self) -> "_IndexSession":
        self.data = self.store.data()
        return self

    def __exit__(self, *exc) -> None:
        if self.changed:
            self.store._flush(self.data)  # noqa: SLF001 —— 同一个包内的受控写回口


def _merge_aliases(known: list, extra: tuple[str, ...] | list[str]) -> list[str]:
    """把新别名并进去，只增不删、去重保序。"""
    out = list(known)
    for alias in extra or ():
        key = normalize(alias)
        if key and key not in out:
            out.append(key)
    return out
