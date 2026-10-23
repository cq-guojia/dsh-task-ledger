"""怎么安全地写一个文件：唯一写盘出口。

进门规则：不打印、不跑 git、不判断 owner/status、不自己加锁。
写完顺手通知 `dirty` 记一笔（那是记账本唯一被写的地方之一）。
"""

from __future__ import annotations

import hashlib
import os
import stat
import tempfile
from pathlib import Path

from ..errors import Fail
from . import dirty


def ensure_dir(path: Path) -> None:
    """建目录（`mkdir -p` 语义）。**全仓唯一建目录的地方**，写文件不替人建父目录。"""
    try:
        path.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise Fail(f"建目录 {path} 失败：{exc}") from exc


def write_text_atomic(path: Path, text: str, *, track: bool = True) -> None:
    """原子写文本：同目录临时文件 → 写 → fsync → 继承权限 → replace → fsync 父目录。

    `track=False` 只给 `restore`（复原世界）与外壳两条受控通道用 —— 那三处都不是业务改动。
    两个属性必须保住：mkstemp 建的是 0600，直接 replace 会把 644 降成 600；
    符号链接一律拒绝，否则 replace 会把链接替换成普通文件。
    """
    fd = None
    tmp: Path | None = None
    existed = False
    try:
        # 不替调用方建父目录：建目录只有 ensure_dir 一处，业务层要自己先 ensure_dir
        if not path.parent.exists():
            raise Fail(
                f"写 {path} 失败：父目录 {path.parent} 不存在（建目录要显式调 ensure_dir）。"
            )
        if path.is_symlink():
            raise Fail(f"拒绝写入 {path}：它是符号链接，写入会把它替换成普通文件")
        try:
            mode = stat.S_IMODE(path.stat().st_mode)
            existed = True
        except OSError:
            mode = 0o644  # 新文件：与 git 默认对齐
        fd, tmp_name = tempfile.mkstemp(
            dir=str(path.parent), prefix=path.name + ".", suffix=".tmp"
        )
        tmp = Path(tmp_name)
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as fh:
            fd = None  # 所有权已交给文件对象
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        os.chmod(tmp, mode)
        os.replace(tmp, path)
        _fsync_dir(path.parent)
        tmp = None
    except OSError as exc:
        raise Fail(
            f"写 {path} 失败：{exc}\n"
            "  处理：确认该路径可写、磁盘没满，然后重跑这条命令（文件是整份替换，不会写坏）。"
        ) from exc
    finally:
        if fd is not None:
            try:
                os.close(fd)
            except OSError:
                pass
        if tmp is not None and tmp.exists():
            try:
                tmp.unlink()
            except OSError:
                pass
    dirty.current().record(path, track=track, created=not existed)


def _fsync_dir(dirpath: Path) -> None:
    """刷父目录：掉电时 rename 的目录项可能丢，只刷文件是不够的。"""
    try:
        fd = os.open(str(dirpath), os.O_RDONLY)
    except OSError:
        return
    try:
        os.fsync(fd)
    except OSError:
        pass
    finally:
        os.close(fd)


def fingerprint(path: Path) -> str | None:
    """文件内容 sha256，用来判「我读完以后别人动过没有」。

    三种返回值互不相等：正常 → sha256 串；不存在 → None；读不了 → `"unreadable"`。
    """
    try:
        data = path.read_bytes()
    except FileNotFoundError:
        return None
    except OSError:
        return "unreadable"
    return hashlib.sha256(data).hexdigest()


def snapshot(path: Path) -> bytes | None:
    """写之前把原文留一份字节；原本不存在返回 None。"""
    try:
        return path.read_bytes()
    except FileNotFoundError:
        return None
    except OSError as exc:
        raise Fail(f"读 {path} 失败：{exc}") from exc


def restore(path: Path, before: bytes | None) -> None:
    """按字节还原：`None` 表示原本不存在 ⇒ 删掉。恢复本身不进记账本（`track=False`）。"""
    if before is None:
        try:
            path.unlink()
        except FileNotFoundError:
            return
        except OSError as exc:
            raise Fail(f"撤销 {path} 失败：{exc}") from exc
        return
    write_text_atomic(path, before.decode("utf-8"), track=False)
