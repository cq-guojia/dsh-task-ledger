"""记账本：这一轮到底动了哪些文件。**提交集合只看它**，不看 `Result.changed`。

三类记录各有各的用途：
- `changed`：业务改动，最后要提交；
- `created`：本次新建的文件，失败时要删掉（不能留下孤儿）；
- `presync`：取最新时刷过的文件（连"刷之前"的字节一起）——它们**反而必须**一起提交，
  否则拉下来的新内容留在工作树里，下一条写命令会被写前 guard 拦死。

只返回清单、不打印（打印归外壳，否则 dirty 要 import shell，依赖反向）。
"""

from __future__ import annotations

import contextlib
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class WriteLog:
    changed: list[Path] = field(default_factory=list)
    created: list[Path] = field(default_factory=list)
    presync: list[tuple[Path, bytes | None]] = field(default_factory=list)

    def record(self, path: Path, *, track: bool = True, created: bool = False) -> None:
        """记一次写。`track=False`（复原 / 外壳刷盘）不进改动集合。"""
        if created and path not in self.created:
            self.created.append(path)
        if track and path not in self.changed:
            self.changed.append(path)

    def record_presync(self, path: Path, before: bytes | None) -> None:
        """记「取最新刷过这个文件」+ 刷之前的字节（失败时按它恢复）。"""
        for i, (known, _) in enumerate(self.presync):
            if known == path:
                self.presync[i] = (path, before)
                return
        self.presync.append((path, before))

    def commit_set(self) -> list[Path]:
        """最后要提交的文件：本次改动 + 取最新刷过的（去重保序）。"""
        out: list[Path] = []
        for path in [*self.changed, *(p for p, _ in self.presync)]:
            if path not in out:
                out.append(path)
        return out

    def has_writes(self) -> bool:
        return bool(self.changed or self.presync)

    def rollback_presync(self) -> list[Path]:
        """按备份把「被取最新覆盖掉」的内容恢复回去（刷之前不存在 ⇒ 删掉）。"""
        from .atomic import write_text_atomic

        done: list[Path] = []
        for path, before in reversed(self.presync):
            if before is None:
                try:
                    path.unlink()
                except FileNotFoundError:
                    pass
            else:
                write_text_atomic(path, before.decode("utf-8"), track=False)
            done.append(path)
        self.presync = []
        return done

    def discard_created(self) -> list[Path]:
        """删掉本次新建的文件（失败收尾用）。"""
        done: list[Path] = []
        for path in self.created:
            try:
                path.unlink()
            except FileNotFoundError:
                pass
            done.append(path)
        self.created = []
        return done

    def clear(self) -> None:
        """成功路径收尾：全部清零。"""
        self.changed = []
        self.created = []
        self.presync = []


_CURRENT: WriteLog = WriteLog()


def current() -> WriteLog:
    """当前这一轮的记账本（没绑定时给一个空账本）。"""
    return _CURRENT


@contextlib.contextmanager
def bound(log: WriteLog) -> Iterator[None]:
    """绑定这一轮的记账本（生产只在 runner 里绑一次；测试用）。"""
    global _CURRENT
    saved = _CURRENT
    _CURRENT = log
    try:
        yield
    finally:
        _CURRENT = saved
