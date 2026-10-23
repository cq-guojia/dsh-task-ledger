"""唯一允许去问 git「我现在是谁」的地方。

只**读**配置（`GIT_COMMITTER_IDENT` / `config user.email` / `config user.name`），
不 pull、不 commit、不 push —— 那不算 git 操作，算环境。
兜底身份这件事本身只 `notices.note("提示：…")`，不打印。
"""

from __future__ import annotations

import getpass
import os
import re
import socket
import subprocess
from pathlib import Path

from . import notices
from .core.identity import Identity, normalize

_IDENT_RE = re.compile(r"<([^>]*)>")


def _git(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["git", *args], capture_output=True, text=True, check=False)


def git_value(repo: Path | None, *args: str) -> str | None:
    """读一个 git 配置值；cwd 给定时按那个仓库判（--repo 未必是当前目录）。"""
    base = ("git", "-C", str(repo)) if repo is not None else ("git",)
    proc = subprocess.run([*base, *args], capture_output=True, text=True, check=False)
    if proc.returncode == 0 and proc.stdout.strip():
        return proc.stdout.strip()
    return None


def git_email(repo: Path | None) -> str | None:
    """GIT_COMMITTER_IDENT 优先，退回 user.email。"""
    ident = git_value(repo, "var", "GIT_COMMITTER_IDENT")
    if ident:
        m = _IDENT_RE.search(ident)
        if m and m.group(1).strip():
            return m.group(1).strip()
    return git_value(repo, "config", "user.email")


def git_name(repo: Path | None) -> str | None:
    ident = git_value(repo, "var", "GIT_COMMITTER_IDENT")
    if ident:
        head = ident.split("<", 1)[0].strip()
        if head:
            return head
    return git_value(repo, "config", "user.name")


def fallback_identity() -> str:
    """不在 git 仓库里时的兜底链：系统用户名 → getpass → 主机名 → 字面 default。"""
    for key in ("USER", "LOGNAME"):
        value = os.environ.get(key, "").strip()
        if value:
            return value
    try:
        name = getpass.getuser().strip()
    except Exception:  # noqa: BLE001 —— 拿不到用户名是正常分支，不该炸
        name = ""
    if name:
        return name
    try:
        host = socket.gethostname().strip()
    except OSError:
        host = ""
    return host or "default"


def current(repo: Path | None = None) -> Identity:
    """当前操作者。邮箱与名字取不到都给兜底，并留一条提示（不打印）。"""
    email = git_email(repo)
    if not email:
        email = fallback_identity()
        notices.note(
            f"提示：读不到 git 身份（user.email），本次按兜底身份 {email!r} 记账；"
            "配好 git config user.email 再跑，任务才会记到正确的名下。"
        )
    name = git_name(repo) or email
    return Identity(email=normalize(email), name=name.strip(), aliases=())
