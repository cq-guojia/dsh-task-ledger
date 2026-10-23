"""所有 JSON 台账的共用底座：读、按条取、按条写、按条删、指纹、一条一行的写盘格式。

**版本字段的落点就在这里**：读盘发现与 `FORMAT_VERSION` 不符 ⇒ `notices.note` 一次（不拦）；
写盘一律带上当前 `FORMAT_VERSION`（缺就补）。业务层各自判断就是散落。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .. import notices
from ..core.labels import FORMAT_VERSION
from ..errors import Fail
from .atomic import fingerprint, write_text_atomic


def dump_ledger_json(data: dict[str, Any], *, expand: str = "tasks") -> str:
    """「一条一行」的台账文本（`expand` 指定的那个字典一条一行，其余字段各占一行）。

    键排序、值也 `sort_keys`：**同一份逻辑内容永远产出同一串字节** ——
    多人各写各的才能按行合并，重写也不会产出无意义 diff。这是**格式契约**，
    别改成缩进美化格式，也别按插入序输出（老文件会整篇翻面）。
    """
    body: dict[str, Any] = dict(data)
    body["version"] = FORMAT_VERSION  # 写盘一律带当前版本（缺就补、旧就更新）
    rows: list[str] = []
    for key in sorted(body):
        value = body[key]
        if key == expand and isinstance(value, dict):
            inner = [
                f"    {json.dumps(k, ensure_ascii=False)}: "
                f"{json.dumps(v, ensure_ascii=False, sort_keys=True)}"
                for k, v in sorted(value.items())
            ]
            block = (",\n".join(inner) + "\n") if inner else ""
            rows.append(f'  "{key}": {{\n{block}  }}')
            continue
        rows.append(
            f'  "{key}": {json.dumps(value, ensure_ascii=False, sort_keys=True)}'
        )
    return "{\n" + ",\n".join(rows) + "\n}\n"


def write_ledger_json(
    path: Path, data: dict[str, Any], *, expand: str = "tasks"
) -> None:
    """按「一条一行」写台账（格式文本由 `dump_ledger_json` 出）。"""
    write_text_atomic(path, dump_ledger_json(data, expand=expand))


class JSONStore:
    """一份 JSON 台账的读改写。首次读盘后缓存在实例里。"""

    def __init__(self, path: Path, *, default: dict[str, Any], expand: str = "tasks"):
        self.path = Path(path)
        self.expand = expand
        self._default = dict(default)
        self._data: dict[str, Any] | None = None

    # ---- 读 ----

    def _load(self) -> dict[str, Any]:
        if self._data is None:
            data = self._read_raw()
            if data is None:
                # 文件还没有：按默认起一份，**不算版本不符**（没文件就没版本可比）
                data = dict(self._default)
                data["version"] = FORMAT_VERSION
            else:
                self._check_version(data)
                rows = data.get(self.expand)
                if rows is not None and not isinstance(rows, dict):
                    # 版本不符只告警，但「tasks 不是对象」是读不了的真错（2026-10-22 数据契约）
                    raise Fail(
                        f"{self._rel()} 的 {self.expand} 不是对象"
                        f"（是{type(rows).__name__}），这份台账读不了。\n"
                        "  处理：用 git 恢复它（git checkout -- <文件>），或手工改成对象。"
                    )
            self._data = data
        return self._data

    def _read_raw(self) -> dict[str, Any] | None:
        try:
            text = self.path.read_text(encoding="utf-8-sig")
        except FileNotFoundError:
            return None
        except OSError as exc:
            raise ValueError(f"读 {self.path} 失败：{exc}") from exc
        if not text.strip():
            return None
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ValueError(
                f"{self.path} 不是合法 JSON（第 {exc.lineno} 行）：{exc.msg}"
            ) from exc
        if not isinstance(data, dict):
            raise ValueError(f"{self.path} 顶层不是对象。")
        return data

    def _check_version(self, data: dict[str, Any]) -> None:
        version = data.get("version")
        if isinstance(version, str) and version == FORMAT_VERSION:
            return
        notices.note(
            f"提示：{self._rel()} 的格式版本是 {version or '未知'}，"
            f"当前是 {FORMAT_VERSION}；不拦，但字段可能有出入。"
        )

    def _rel(self) -> str:
        try:
            return self.path.name
        except Exception:  # noqa: BLE001
            return str(self.path)

    def data(self) -> dict[str, Any]:
        """整份只读视图（升级 / 体检用）。"""
        return dict(self._load())

    def get(self, key: str) -> dict[str, Any] | None:
        value = self._load().get(self.expand, {}).get(key)
        return dict(value) if isinstance(value, dict) else None

    def all(self) -> dict[str, dict[str, Any]]:
        rows = self._load().get(self.expand, {}) or {}
        return {k: dict[str, Any](v) for k, v in rows.items() if isinstance(v, dict)}

    def fingerprint(self) -> str | None:
        return fingerprint(self.path)

    # ---- 写 ----

    def put(self, key: str, value: dict[str, Any]) -> None:
        """改一条，其余原样保留。"""
        data = self._load()
        rows = data.setdefault(self.expand, {})
        if not isinstance(rows, dict):
            rows = {}
            data[self.expand] = rows
        rows[key] = dict(value)
        self._flush(data)

    def drop(self, key: str) -> None:
        """删一条；本来就没有就什么都不做（不改变文件）。"""
        data = self._load()
        rows = data.get(self.expand, {})
        if not isinstance(rows, dict) or key not in rows:
            return
        del rows[key]
        self._flush(data)

    def _flush(self, data: dict[str, Any]) -> None:
        write_ledger_json(self.path, data, expand=self.expand)
        self._data = data

    def ensure_file(self) -> bool:
        """文件不存在就按 `default` 写一份；存在就一个字节都不动。返回「这次建了没有」。"""
        if self.path.exists():
            return False
        data = dict(self._default)
        data.setdefault("version", FORMAT_VERSION)
        write_ledger_json(self.path, data, expand=self.expand)
        self._data = data
        return True
