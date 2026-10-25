"""任务表：公共池 `pool.json` 与某人的分片 `owners/<hash>.json` —— **同一个类，只是路径不同**。

`identity` 只用于**写盘格式**（分片顶部的可选 `identity` 字段），它不参与任何判断：
不判归属、不改 `updated`、不判状态 —— 那些归 `actions/guard.py`。构造**不写盘**。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ..core.identity import Identity
from ..core.paths import to_repo_rel
from .json_store import JSONStore

DEFAULT_DATA = {"version": "", "tasks": {}}


class TaskStore(JSONStore):
    def __init__(self, repo: Path, rel: Path, *, identity: Identity | None = None):
        super().__init__(Path(repo) / to_repo_rel(rel), default=DEFAULT_DATA)
        self.identity = identity

    def _flush(self, data: dict[str, Any]) -> None:
        """写盘时带上分片顶部的 `identity`（只存 uuid；显示名在索引里）。"""
        if self.identity is not None:
            data["identity"] = {"uuid": self.identity.uuid}
        super()._flush(data)
