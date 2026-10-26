"""确定「我是谁」的唯一地方：只读机器级身份文件，不读 git、不读环境变量。

身份文件：`$TASK_LEDGER_HOME/.taskledger/identity.json`（默认 `~/.taskledger/identity.json`），
内容是 `{"uuid": "...", "name": "..."}`。没有就报错，由 `init` 命令创建。
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from .core.identity import Identity, looks_like_uuid, normalize
from .errors import Fail

IDENTITY_HOME_ENV = "TASK_LEDGER_HOME"


def identity_file() -> Path:
    """机器级身份文件路径；`TASK_LEDGER_HOME` 可覆写主目录（容器/测试用）。"""
    base = os.environ.get(IDENTITY_HOME_ENV)
    if base:
        return Path(base) / ".taskledger" / "identity.json"
    try:
        home = Path.home()
    except RuntimeError as exc:
        raise Fail(
            "找不到用户主目录（HOME）。\n"
            "  处理：设置环境变量 TASK_LEDGER_HOME 指向一个可写目录，再重试。"
        ) from exc
    return home / ".taskledger" / "identity.json"


def read_identity() -> Identity | None:
    """读机器身份；文件不存在、空文件、坏 JSON、没 uuid 一律返回 None。

    uuid 先归一化（去空白 + 小写，与 `--owner` 入参同一口径）。**形态不对直接报错**：
    身份键只能是 uuid，手改进去一个邮箱 / 名字会让每条命令都写错 owner，
    与其静默用下去，不如当场停下让人改文件。
    """
    path = identity_file()
    try:
        raw = path.read_text(encoding="utf-8")
    except (OSError, ValueError):
        return None
    try:
        data = json.loads(raw)
    except ValueError:
        return None
    uuid = normalize(str((data or {}).get("uuid") or ""))
    if not uuid:
        return None
    if not looks_like_uuid(uuid):
        raise Fail(
            f"身份文件里的 uuid 不合法：{path}\n"
            f"  读到：{uuid}（身份键只能是 uuid，不能是邮箱 / 名字）\n"
            "  处理：把该文件的 uuid 改成 uuid（或删掉这个文件重跑 init）。"
        )
    name = str((data or {}).get("name") or "").strip()
    return Identity(uuid=uuid, name=name)


def current(repo: Path | None = None) -> Identity:
    """当前操作者；没初始化就报错，提示去 init。

    name 的取值规则：工作区 owners.json 里同 uuid 的 name 优先，没有就用总体的 name。
    """
    identity = read_identity()
    if identity is None:
        raise Fail(
            "这台机器还没有初始化身份。\n"
            "  处理：先运行 `progress.py init --repo <工作区根>`（交互式选择或新建身份），再执行本命令。"
        )
    name = identity.name
    if repo is not None:
        name = _workspace_name(repo, identity.uuid) or name
    return Identity(uuid=identity.uuid, name=name)


def _workspace_name(repo: Path, uuid: str) -> str:
    """当前工作区 owners.json 里这个 uuid 的 name；没有/读不到返回空串。"""
    from .core.paths import OWNERS_REL, to_repo_rel

    try:
        raw = (repo / to_repo_rel(OWNERS_REL)).read_text(encoding="utf-8")
        workers = (json.loads(raw) or {}).get("workers", {}) or {}
    except (OSError, ValueError):
        return ""
    record = workers.get(uuid) or workers.get(uuid.lower())
    if not isinstance(record, dict):
        return ""
    return str(record.get("name") or "").strip()
