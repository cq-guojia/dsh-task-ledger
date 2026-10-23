"""文件锁：只负责定义，**调用权归 actions/atom.py**（数据层禁止调用）。

锁的不是目标文件本身：按绝对路径 hash 在系统临时目录开 `<hash>.lock` 再 flock。
这样目标文件还不存在也能锁（锁集里本来就允许"还不存在"的路径），仓库里也不多出锁文件。
"""

from __future__ import annotations

import contextlib
import hashlib
import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

from ..core.paths import to_repo_rel

try:  # pragma: no cover —— 平台差异
    import fcntl
except ImportError:  # pragma: no cover
    fcntl = None  # type: ignore[assignment]
try:  # pragma: no cover
    import msvcrt
except ImportError:  # pragma: no cover
    msvcrt = None  # type: ignore[assignment]


@contextlib.contextmanager
def progress_lock(path: Path) -> Iterator[None]:
    """给一个台账文件加互斥锁：阻塞等待、没有超时、**不可重入**。"""
    if fcntl is None and msvcrt is None:
        yield
        return
    key = hashlib.sha256(str(path.resolve()).encode("utf-8")).hexdigest()[:16]
    lock_path = Path(tempfile.gettempdir()) / f"koc-progress-{key}.lock"
    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR)
    try:
        if fcntl is not None:
            fcntl.flock(fd, fcntl.LOCK_EX)
        elif msvcrt is not None:
            msvcrt.locking(fd, msvcrt.LK_LOCK, 1)  # type: ignore[attr-defined]
        yield
    finally:
        try:
            if fcntl is not None:
                fcntl.flock(fd, fcntl.LOCK_UN)
            elif msvcrt is not None:
                msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)  # type: ignore[attr-defined]
        finally:
            os.close(fd)


@contextlib.contextmanager
def ledger_lock(repo: Path, *rels: Path) -> Iterator[None]:
    """多个文件一起锁：去重 → 按路径排序 → 依次加（避免两人互相等死）。"""
    # rels 相对 `ledger/`（与磁盘 / JSON 同一基准），换算只走 to_repo_rel
    paths = sorted({(repo / to_repo_rel(rel)) for rel in rels}, key=lambda p: str(p))
    if not paths:
        yield
        return
    with contextlib.ExitStack() as stack:
        for path in paths:
            stack.enter_context(progress_lock(path))
        yield
