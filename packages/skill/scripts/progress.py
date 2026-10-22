#!/usr/bin/env python3
# pyright: standard
"""task-ledger — 管理项目任务进度。

  ledger/pool.json                    公共池：只装还没人认领的任务
  ledger/owners.json                  索引：身份（邮箱）→ 分片文件
  ledger/owners/<sha256前12位>.json   每人一份分片：自己认领的任务
  ledger/worklog/<年月>/<日>-<时分>-<说明>-<随机码>.md
                                     单个任务的过程（路径另记在任务对象 worklog 字段）
  ledger/history/<年月>.md            已结案任务，一行一条（9 列：结案时间 / 创建时间 / 工作包 / 分类 / 标签 / owner / creator / 完成了什么 / 过程文档）；
                                     按结案时间分月归档。存量 ledger/PROGRESS-HISTORY.md 只读兼容、永不重写

没有 init 子命令：任何写命令开头都会幂等地把台账建好并登记当前用户。
只读命令（list / show / history / validate）不建台账、不写任何字节。

只用标准库，无第三方依赖。
"""

from __future__ import annotations

import argparse
import atexit
import contextlib
import hashlib
import json
import os
import re
import secrets
import stat
import subprocess
import sys
import tempfile
import time
from collections.abc import Iterator

# datetime.UTC（3.11+）在本仓不能用：skill 跟着插件跑在用户的 python3 上，
# macOS 自带的 /usr/bin/python3 仍是 3.9，换别名会直接 ImportError。
from datetime import datetime, timezone

_UTC = timezone.utc  # noqa: UP017 —— 见上：要兼容 3.9
from pathlib import Path
from typing import Any

try:
    import fcntl
except ImportError:  # Windows
    fcntl = None
try:
    import msvcrt
except ImportError:
    msvcrt = None

STATUSES = ("open", "doing")
# 旧数据只读兼容：早期版本有 blocked 状态（手动标「卡住」）。现在超期按时间判定
# （接任务满 14 天），不再允许新写入；list / validate / 看板仍能吃老文件。
LEGACY_STATUSES = ("blocked",)
# 文件格式版本号：打包时定死，改数据结构必须同一次改动里升它（否则版本检查静默失效）。
# 形态取「年月日时分秒」只为可读可比，语义是「第几版格式」，不是时间戳。
FORMAT_VERSION = "2026-10-22 00:00:00"

# 分片布局（2026-10-22 起）：
#   ledger/pool.json           公共池：只装未认领的任务      {version, tasks}
#   ledger/owners.json         索引：人 → 分片文件          {version, workers{email:{file,name,joined}}}
#   ledger/owners/<hash>.json  每人分片                    {version, identity{email,name,joined}, tasks}
POOL_REL = Path("ledger/pool.json")
OWNERS_REL = Path("ledger/owners.json")
OWNERS_DIR = Path("ledger/owners")
SHA_LEN = 12

# 存量：改造前的单文件历史层，只读兼容、永不重写
HISTORY_REL = Path("ledger/PROGRESS-HISTORY.md")
HISTORY_DIR = Path(
    "ledger/history"
)  # 新历史层：按结案时间分月，ledger/history/<YYYYMM>.md
WORKLOG_DIR = Path("ledger/worklog")
HISTORY_TITLE = "# 进度历史（已结案）"
# 9 列：结案时间 / 创建时间 / 工作包 / 分类 / 标签 / owner / creator / 完成了什么 / 过程文档。
# owner 独立成列 —— 按人检索是精确列比较，不靠文本切分。
# creator（2026-10-17 加）：任务的「发起人」——与 owner 区分（owner 可被 claim 改走，
# 但「谁建的」不变）。看板「新增（我的）= 我创建的」要它；旧 8 列无此列，
# upgrade_history / cmd_history 回链 worklog 头部「创建」行补（与 created 同一来源，不丢）。
HISTORY_HEADER = "| 结案时间 | 创建时间 | 工作包 | 分类 | 标签 | owner | creator | 完成了什么 | 过程文档 |"
HISTORY_SEP = "|---|---|---|---|---|---|---|---|---|"
FROZEN_MARK = "✅ 完成封卷"
ID_RE = re.compile(r"[a-z0-9\u4e00-\u9fff][a-z0-9\u4e00-\u9fff-]*\Z")
# 读侧兼容：秒可有可无（旧数据只到分）。写侧一律到秒，见 normalize_time。
TIME_RE = re.compile(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?\Z")
# 分类 / 标签口径：值由 Agent 在 new 时按 SKILL.md 规则自行总结（不设枚举），
# 脚本只硬校验形态 —— 含 CJK 按字符数 ≤4，纯 ASCII 按单词数 ≤3；标签数量只设上限，
# 设下限会逼 Agent 凑数，凑出来的正是噪声。
LABEL_MAX_CHARS = 4
LABEL_MAX_WORDS_EN = 3
TAGS_MAX_COUNT = 5
CJK_RE = re.compile(r"[\u4e00-\u9fff]")

# 执行记录：worklog 末尾由脚本维护的一节。老文档没有这一节就不动（不迁移）；
# 有这一节时脚本按节点自动追加，agent 改完正文跑 log 补一条。
EXEC_HEAD = "## 执行记录"
EXEC_HINT = (
    "<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。\n"
    '     要补一条就跑 progress.py log --id <任务号> --note "一句话说清做了什么"。 -->'
)

SKILL_DIR = Path(__file__).resolve().parent.parent
WORKLOG_TEMPLATE = SKILL_DIR / "assets" / "worklog.md"

FALLBACK_TEMPLATE = """# <id>：<title>

> **创建**：<created>（@<creator>）

## 背景

## 待办

## 下一步

## 过程

## 结论

## 执行记录
"""


class Fail(Exception):
    """业务错误：退出码非 0，只打印消息。"""


# ---------- 基础设施 ----------


def now() -> str:
    """当前时刻（**UTC**），精确到秒：YYYY-MM-DD HH:MM:SS。

    存盘一律 UTC、不带偏移量后缀；要看本地时间用 fmt_local() 转。
    """
    return datetime.now(_UTC).strftime("%Y-%m-%d %H:%M:%S")


def to_utc(
    value: str,
    *,
    field: str,
    tid: str | None = None,
    date_only_ref: str | None = None,
) -> str:
    """用户按**本地墙钟**给的时间 → 存盘用的 UTC 字符串。

    `--created` / `--finished` / `--since` / `--until` 都走这里：人只会按自己表上的时间写。
    """
    wall = normalize_time(value, field=field, tid=tid, date_only_ref=date_only_ref)
    naive = datetime.strptime(wall, "%Y-%m-%d %H:%M:%S")
    return naive.astimezone(_UTC).strftime("%Y-%m-%d %H:%M:%S")


def fmt_local(stamp: object) -> str:
    """存盘的 UTC 时间 → 查看者本地时间，**只用于人看的输出**（`--json` 原样给 UTC）。

    存量老数据（2026-10-22 前写的是写入者本地时间）没有时区标记，无法区分，
    按 UTC 转会把它们显示成偏后若干小时 —— 迁移手册里已记这条。
    """
    key = time_key(stamp)
    if key is None:
        return "" if stamp is None else str(stamp)
    try:
        dt = datetime.strptime(key, "%Y-%m-%d %H:%M:%S").replace(tzinfo=_UTC)
    except ValueError:
        return str(stamp)
    return dt.astimezone().strftime("%Y-%m-%d %H:%M:%S")


# 时间字面量：日期 + 可选「时:分[:秒]」。容忍 `/` 与 `T` 分隔（归一化后再匹配）。
_TIME_IN_RE = re.compile(
    r"(\d{4})-(\d{1,2})-(\d{1,2})(?: +(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?\Z"
)


def normalize_time(
    value: str | datetime,
    *,
    field: str = "时间",
    tid: str | None = None,
    date_only_ref: str | None = None,
) -> str:
    """把「正确但不完整」的时间写法归一化到 YYYY-MM-DD HH:MM:SS。

    接受 `YYYY-MM-DD`、`YYYY-MM-DD HH:MM`、`YYYY-MM-DD HH:MM:SS`，容忍 `/` 与 `T`。
    缺秒补 `:00`，缺分秒补 `00:00`（即 `00:00:00`）。非法值报错。
    date_only_ref：只给了日期（没给时分）时，用这个时刻顶替（如 `--until` 想「含当天整天」传 `23:59:59`）。
    """
    where = f"{tid}: " if tid else ""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    if not isinstance(value, str) or not value.strip():
        raise Fail(f"{where}{field} 要是一个时间字符串，收到 {value!r}")
    s = " ".join(
        value.strip().replace("/", "-").replace("T", " ").replace("t", " ").split()
    )
    m = _TIME_IN_RE.fullmatch(s)
    if not m:
        raise Fail(
            f"{where}{field} 时间格式不对：{value!r}"
            "（可用 YYYY-MM-DD、YYYY-MM-DD HH:MM、YYYY-MM-DD HH:MM:SS）"
        )
    y, mo, d, hh, mm, ss = m.groups()
    if date_only_ref is not None and hh is None:
        out = f"{int(y):04d}-{int(mo):02d}-{int(d):02d} {date_only_ref}"
    else:
        out = (
            f"{int(y):04d}-{int(mo):02d}-{int(d):02d} "
            f"{int(hh or 0):02d}:{int(mm or 0):02d}:{int(ss or 0):02d}"
        )
    try:
        datetime.strptime(out, "%Y-%m-%d %H:%M:%S")
    except ValueError as exc:
        raise Fail(f"{where}{field} 不是真实时间：{value!r}（{exc}）")
    return out


def time_key(value: object) -> str | None:
    """已存时间（可能只到分）→ 秒精度字符串，用于比较/排序；不合法返回 None。"""
    if not isinstance(value, str) or not TIME_RE.fullmatch(value):
        return None
    return value if len(value) == 19 else value + ":00"


def _has_ledger(root: Path) -> bool:
    """这个目录是不是台账根：pool.json 或 owners.json 在就算。"""
    return (root / POOL_REL).exists() or (root / OWNERS_REL).exists()


def find_repo(explicit: str | None) -> Path:
    """项目根：--repo > 向上找含 ledger/pool.json（或 owners.json）的目录 > 含 docs/ 的目录。

    git 根只作为一个候选，不无条件优先 —— 否则 monorepo 子目录会定位到整个仓库根。
    """
    if explicit:
        p = Path(explicit).expanduser().resolve()
        if not p.is_dir():
            raise Fail(f"--repo 不是目录：{p}")
        # 传进来的常是工作区子目录；向上找真正的台账根，否则写前同步会对着
        # 不存在的 <子目录>/ledger 空转。都找不到就仍用传入目录（首次写入要在这里建台账）。
        for cand in (p, *p.parents):
            if _has_ledger(cand):
                return cand
        return p

    bases: list[Path] = []
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        if out:
            bases.append(Path(out).resolve())
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        pass

    try:
        here = Path.cwd().resolve()
    except OSError as exc:
        raise Fail(f"拿不到当前目录：{exc}")
    if here not in bases:
        bases.append(here)

    ordered: list[Path] = []
    for base in bases:
        for p in (base, *base.parents):
            if p not in ordered:
                ordered.append(p)

    for p in ordered:
        if _has_ledger(p):
            return p
    for p in ordered:
        if (p / "docs").is_dir():
            return p
    raise Fail(
        "定位不到项目根：向上找不到 ledger/pool.json、ledger/owners.json 或 docs/。用 --repo 指定。"
    )


def norm_identity(raw: str) -> str:
    """身份归一化：去首尾空白 + 转小写。全仓只此一处。"""
    return raw.strip().lower()


def shard_rel(identity: str) -> Path:
    """某人分片的相对路径：sha256(归一化身份)[:12] + .json。"""
    digest = hashlib.sha256(norm_identity(identity).encode("utf-8")).hexdigest()
    return OWNERS_DIR / f"{digest[:SHA_LEN]}.json"


def _git_email(cwd: str | None = None) -> str | None:
    """git 身份里的 email：GIT_COMMITTER_IDENT 优先，退回 user.email。

    cwd 给定时按那个目录判身份 —— `--repo` 指向的仓库未必是当前目录所在的仓库，
    拿当前目录的身份顶上去就会把任务记到别人名下。
    """
    base = ("git", "-C", cwd) if cwd else ("git",)
    ident = _git(*base, "var", "GIT_COMMITTER_IDENT")
    if ident.returncode == 0:
        m = re.search(r"<([^>]*)>", ident.stdout)
        if m and m.group(1).strip():
            return m.group(1).strip()
    cfg = _git(*base, "config", "user.email")
    if cfg.returncode == 0 and cfg.stdout.strip():
        return cfg.stdout.strip()
    return None


def _fallback_identity() -> str:
    """不在 git 仓库里时的兜底链：系统用户名 → 主机名 → 字面 default。"""
    for key in ("USER", "LOGNAME"):
        value = os.environ.get(key, "").strip()
        if value:
            return value
    try:
        import getpass

        name = getpass.getuser().strip()
    except Exception:  # noqa: BLE001 —— 拿不到用户名是正常分支，不该炸
        name = ""
    if name:
        return name
    try:
        import socket

        host = socket.gethostname().strip()
    except OSError:
        host = ""
    return host or "default"


_FALLBACK_WARNED = False
_LEGACY_WARNED = False


def current_identity(repo: Path | None = None) -> dict[str, str]:
    """当前操作者 {email, name}。

    repo 给定时按那个仓库判（`--repo` 与当前目录经常不是同一个仓库）。在 git 仓库里
    必须拿到 email（拿不到就等于 git 自己也提交不了，报错与之对齐）；不在仓库里 /
    没装 git 才走兜底链，并只提示一次身份是猜的。
    """
    global _FALLBACK_WARNED
    cwd = str(repo) if repo is not None else None
    base = ("git", "-C", cwd) if cwd else ("git",)
    email = _git_email(cwd)
    if not email:
        if _git(*base, "rev-parse", "--show-toplevel").returncode == 0:
            raise Fail(
                "读不到 git 邮箱，无法确定身份。\n"
                '先配置：git config --global user.email "you@example.com"'
            )
        email = _fallback_identity()
        if not _FALLBACK_WARNED:
            _FALLBACK_WARNED = True
            print(
                f"提示：不在 git 仓库里，身份用 {norm_identity(email)}"
                "（猜的，仅本机有效）。",
                file=sys.stderr,
            )
    ident = norm_identity(email)
    name = _git(*base, "config", "user.name").stdout.strip() or ident
    return {"email": ident, "name": name}


def my_identity_keys(repo: Path | None = None) -> set[str]:
    """我在台账里可能出现的标识：邮箱（新数据）与 git user.name（旧数据）。

    只用于「我的」这类过滤；--owner 仍是针对单一标识的精确匹配。
    """
    me = current_identity(repo)
    keys = {me["email"]}
    if me.get("name"):
        keys.add(me["name"])  # 旧数据把 owner/creator 记成了 user.name
    return keys


# 本次进程内被台账写入的真实文件路径，供写成功后一次性自动同步（git commit/push）。
CHANGED_FILES: list[Path] = []

# 写前预同步从远端落盘的文件：不是本次命令的写入目标，但必须随本次提交入库
# （否则会一直以未跟踪状态留在工作树里，把自动 rebase 挡在门口）。
PRESYNC_FILES: list[Path] = []

# 写前预同步覆盖前的内容（None = 覆盖前不存在）。命令失败时整体回滚，
# 免得把「刚才从远端刷下来的版本」留在工作树里，下次又被 guard 当成用户未提交改动。
PRESYNC_BACKUPS: dict[Path, bytes | None] = {}


def presync_rollback() -> None:
    """把写前预同步覆盖过的文件恢复原样。只在命令失败的路径上调用。"""
    restored = 0
    while PRESYNC_BACKUPS:
        path, original = PRESYNC_BACKUPS.popitem()
        try:
            if original is None:
                path.unlink(missing_ok=True)
            else:
                path.write_bytes(original)
            restored += 1
        except OSError as exc:
            print(
                f"提示：写前刷新 {path} 的回滚未完成（{exc}），请手动检查该文件。",
                file=sys.stderr,
            )
    PRESYNC_FILES.clear()
    # 失败路径也要说清工作树被还原成了什么：否则用户分不清「没被碰过」与「已被回退」
    if restored:
        print(
            f"提示：已把写前刷新的 {restored} 个台账文件恢复成命令执行前的版本。",
            file=sys.stderr,
        )


CREATED_FILES: list[Path] = []


def discard_created_files() -> None:
    """命令失败时收尾：把这次**新建**的文件删掉，让工作树回到命令前的样子。

    失败路径不会走到写后同步，所以「回滚了内容、文件却留在原地」等于给下一次
    写埋一个「本地台账有未提交改动」的地雷（首次建台账时尤其明显：pool.json /
    owners.json / 分片都是这一条命令里新建的）。只删本进程写出来的新文件，
    已有文件的内容回滚由各命令自己负责。
    """
    for path in reversed(CREATED_FILES):
        try:
            if path.exists() and not path.is_symlink():
                path.unlink()
        except OSError:
            continue
    CREATED_FILES.clear()


def write_text_atomic(path: Path, text: str, *, track: bool = True) -> None:
    """原子写文本：同目录唯一临时名 + fsync + os.replace，写完清理临时文件。

    整段都在 try 内 —— mkdir / mkstemp 的 OSError 同样要转成 Fail，
    否则会漏成裸异常，上层的「失败就撤销」也就收不到。

    track=False 用于「从远端刷下来」的内容：那不是本次命令的改动，
    不能进 CHANGED_FILES，否则会被写后自动提交当成本次台账变更。

    两个属性都得保住：mkstemp 建的是 0600，直接 replace 会把文件权限从 644 降成
    600（组内用户与 CI 读不到），所以写前继承原文件的 mode；符号链接一律拒绝，
    否则 replace 会把链接本身换成普通文件。
    """
    fd = None
    tmp = None
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.is_symlink():
            raise Fail(f"拒绝写入 {path}：它是符号链接，写入会把它替换成普通文件")
        try:
            mode = stat.S_IMODE(path.stat().st_mode)
            existed = True
        except OSError:
            mode = 0o644  # 新文件：与 git 默认 644 对齐
            existed = False
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
        if not existed and path not in CREATED_FILES:
            CREATED_FILES.append(path)
        if track:
            CHANGED_FILES.append(path)  # 记下本次改动，供写后自动同步
        tmp = None
    except OSError as exc:
        raise Fail(f"写 {path} 失败：{exc}")
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


# ---- 分片存储层（pool / owners 索引 / 每人分片） ---------------------------

# 版本不一致的提示同一个进程只打一次（一条命令可能读到三个文件）
_VERSION_ISSUES: list[str] = []


def _version_problem(path: Path, data: dict[str, Any]) -> str | None:
    """版本不对就给一句人话；对就返回 None。"""
    version = data.get("version")
    if isinstance(version, str) and version == FORMAT_VERSION:
        return None
    rel = path.as_posix()
    if not isinstance(version, str) or not TIME_RE.fullmatch(version):
        return f"{rel} 的文件格式不对（version={version!r}）"
    return f"{rel} 版本 {version}，skill 期望 {FORMAT_VERSION}"


def _flush_version_issues() -> None:
    """进程退出前把收集到的版本问题打**一条**汇总。

    命令中途会陆陆续续读到几份台账文件（索引 / 池 / 分片），边读边打印会刷出
    好几段几乎一样的提示；攒到退出时一次说完，也顺手把「这是我读到的那几份」讲清。
    """
    if not _VERSION_ISSUES:
        return
    print(
        "提示：台账文件版本与本次安装的 skill 不一致（只提示，不改任何文件）：\n  "
        + "\n  ".join(_VERSION_ISSUES)
        + "\n  升级 skill 后第一次写常会看到；要看全仓情况跑 validate。",
        file=sys.stderr,
    )
    _VERSION_ISSUES.clear()


atexit.register(_flush_version_issues)


def note_version(path: Path, data: dict[str, Any]) -> None:
    """读到台账文件就顺手比一次格式版本；不一致攒进清单，退出时汇总提示、只报不改。

    一致时立刻返回 —— 对了就没有再去看别的文件的必要。
    """
    problem = _version_problem(path, data)
    if problem is None or problem in _VERSION_ISSUES:
        return
    _VERSION_ISSUES.append(problem)


def _load_shaped(path: Path, *, default: dict[str, Any]) -> dict[str, Any]:
    """读一个台账 JSON；不存在给默认结构，形状不对直接报。"""
    if not path.exists():
        return default
    try:
        text = path.read_text(encoding="utf-8-sig")
    except (OSError, UnicodeDecodeError) as exc:
        raise Fail(f"读不了 {path}：{exc}")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise Fail(f"{path} 不是合法 JSON：{exc}")
    if not isinstance(data, dict):
        raise Fail(f"{path} 结构不对：顶层应为对象")
    # version 缺失/不对**不拦**：文档口径是「只告警、能读的字段照读」。
    # 一份手改丢字段的文件不该让 list --all / validate 整体不可用；
    # 需要写回时由 read_ledger 补上当前格式版本。
    if not isinstance(data.get("tasks", {}), dict):
        raise Fail(f'{path} 结构不对：tasks 应为 {{"<任务号>": {{...}}}}')
    return data


def read_ledger(
    path: Path, *, identity: dict[str, str] | None = None
) -> dict[str, Any]:
    """读一个**要写回去**的台账文件（pool.json / 自己的分片）；不存在给空表。

    与 tasks_in 的区别只有一处：它返回整份结构（version、identity、tasks），
    缺文件时按 FORMAT_VERSION 现造一份 —— 写回时直接落盘就是合法台账。
    分片带上 identity 是为了索引丢了能自证；pool 没有这一层。
    """
    default: dict[str, Any] = {"version": FORMAT_VERSION, "tasks": {}}
    if identity is not None:
        default["identity"] = {
            "email": norm_identity(identity["email"]),
            "name": identity.get("name") or identity["email"],
            "joined": now(),
        }
    data = _load_shaped(path, default=default)
    if not isinstance(data.get("tasks", {}), dict):
        raise Fail(f'{path} 结构不对：tasks 应为 {{"<任务号>": {{...}}}}')
    note_version(path, data)
    # 要写回的文：version 缺了就补当前值（提示已由 note_version 打过），
    # 否则这一写就把「缺 version」固化进文件。
    data.setdefault("version", FORMAT_VERSION)
    return data


def _warn_unregistered_shard(repo: Path, email: str) -> None:
    """自己那份分片没在索引里：读侧仍能看到（就是自己），但别人看不到，得说一声。"""
    path = repo / shard_rel(email)
    if path.is_file() and email not in registered_shards(repo):
        print(
            f"提示：{path.relative_to(repo).as_posix()} 没在 owners.json 里登记，"
            "别人看不到你这份；跑一次任意写命令会自动补登记。",
            file=sys.stderr,
        )


def tasks_in(path: Path) -> dict[str, Any]:
    """读任意台账文件的 tasks 层（不存在给空）。只读用，不保证写回。"""
    if not path.exists():
        return {}
    data = _load_shaped(path, default={"version": FORMAT_VERSION, "tasks": {}})
    note_version(path, data)
    return data.get("tasks", {})


def load_pool(repo: Path) -> dict[str, Any]:
    """公共池：只装未认领的任务。"""
    return read_ledger(repo / POOL_REL)


def load_owners(repo: Path) -> dict[str, Any]:
    """索引：人 → 分片文件。"""
    path = repo / OWNERS_REL
    data = _load_shaped(path, default={"version": FORMAT_VERSION, "workers": {}})
    if not isinstance(data.get("workers", {}), dict):
        raise Fail(f"{path} 结构不对：workers 应为对象")
    note_version(path, data)
    return data


def load_shard(repo: Path, identity: str) -> dict[str, Any]:
    """某人分片：不存在给空表（第一次写时落盘）。"""
    return read_ledger(
        repo / shard_rel(identity),
        identity={"email": identity, "name": identity},
    )


def registered_shards(repo: Path) -> dict[str, Path]:
    """索引登记的全部分片：身份 → 绝对路径（以索引的 file 字段为准）。

    只信索引、不扫目录：目录里有而索引没登记的文件由 validate 报出来，
    读侧不替它兜底（否则「任务静默消失」这条风险就没人看得见了）。
    """
    workers = load_owners(repo).get("workers", {})
    out: dict[str, Path] = {}
    for ident, entry in workers.items():
        name = entry.get("file") if isinstance(entry, dict) else None
        out[norm_identity(ident)] = repo / OWNERS_DIR / (name or shard_rel(ident).name)
    return out


def write_ledger_json(
    path: Path, data: dict[str, Any], *, expand: str = "tasks"
) -> None:
    """台账 JSON 的统一写入口：`expand` 指定的那个字典一个 key 一行，其余字段压成一行。

    一行一条是多人合并的前提（改不同任务不动同一行），别在这里加缩进美化。
    """
    rows: list[str] = []
    for key in sorted(data):
        value = data[key]
        if key == expand and isinstance(value, dict):
            inner = [
                f"    {json.dumps(k, ensure_ascii=False)}: "
                f"{json.dumps(v, ensure_ascii=False, sort_keys=True)}"
                for k, v in sorted(value.items())
            ]
            body = (",\n".join(inner) + "\n") if inner else ""
            rows.append(f'  "{key}": {{\n{body}  }}')
            continue
        rows.append(
            f"  {json.dumps(key, ensure_ascii=False)}: "
            f"{json.dumps(value, ensure_ascii=False, sort_keys=True)}"
        )
    write_text_atomic(path, "{\n" + ",\n".join(rows) + "\n}\n")


@contextlib.contextmanager
def ledger_lock(repo: Path, *rels: Path) -> Iterator[None]:
    """按路径排序依次加锁，避免两处写互相等死。"""
    ordered = sorted({repo / rel for rel in rels})
    with contextlib.ExitStack() as stack:
        for path in ordered:
            stack.enter_context(progress_lock(path))
        yield


def ensure_ledger(repo: Path) -> dict[str, str]:
    """台账不在就建好，并确保「我」已登记；返回我的身份 {email, name}。

    判据极轻：只读一次 owners.json —— 它本来就非读不可（查我登记没有），
    存在性、workers、version 一次拿齐。已登记 ⇒ 零额外 IO 直接返回。
    """
    me = current_identity(repo)
    owners_path = repo / OWNERS_REL
    pool_path = repo / POOL_REL
    shard_path = repo / shard_rel(me["email"])

    global _LEGACY_WARNED
    legacy = repo / "ledger" / "progress.json"
    if not _LEGACY_WARNED and not pool_path.exists() and legacy.is_file():
        _LEGACY_WARNED = True
        print(
            "提示：这个工作区还是旧布局（ledger/progress.json），新台账会从空的开始建 ——\n"
            "  旧任务不会自动搬过来（本项目口径：不写迁移程序），"
            "在手工迁完之前它们对脚本等于不存在。",
            file=sys.stderr,
        )

    if not owners_path.exists() or not pool_path.exists():
        # 并发首次建台账：锁内再确认一次，先建成者胜
        with progress_lock(owners_path):
            if not pool_path.exists():
                write_ledger_json(pool_path, {"version": FORMAT_VERSION, "tasks": {}})
            if not owners_path.exists():
                write_ledger_json(
                    owners_path,
                    {"version": FORMAT_VERSION, "workers": {}},
                    expand="workers",
                )
    (repo / OWNERS_DIR).mkdir(parents=True, exist_ok=True)

    owners = load_owners(repo)
    workers = owners.setdefault("workers", {})
    entry = workers.get(me["email"]) or {}
    # 显示名改了才写索引（规格：name 自动检测，但只在真变了时才落盘）
    name_changed = bool(entry) and entry.get("name") != me["name"]
    if me["email"] not in workers or not shard_path.exists() or name_changed:
        with progress_lock(owners_path):
            owners = load_owners(repo)
            workers = owners.setdefault("workers", {})
            joined = (workers.get(me["email"]) or {}).get("joined") or now()
            workers[me["email"]] = {
                "file": shard_rel(me["email"]).name,
                "name": me["name"],
                "joined": joined,
            }
            owners["version"] = owners.get("version", FORMAT_VERSION)
            write_ledger_json(owners_path, owners, expand="workers")
            if not shard_path.exists():
                write_ledger_json(
                    shard_path,
                    {
                        "version": FORMAT_VERSION,
                        "identity": {
                            "email": me["email"],
                            "name": me["name"],
                            "joined": joined,
                        },
                        "tasks": {},
                    },
                )
            elif name_changed:
                # 分片里的 identity.name 也跟着走，免得两处显示名打架
                shard = read_ledger(shard_path, identity=me)
                shard["identity"] = {
                    **(shard.get("identity") or {}),
                    "email": me["email"],
                    "name": me["name"],
                    "joined": joined,
                }
                write_ledger_json(shard_path, shard)
    return me


def stat_key(path: Path) -> str | tuple[str, ...] | None:
    """文件内容的指纹；不存在返回 None。

    刻意不用 (mtime, size)：并发写入可能落在同一时间精度内、且字节数恰好相同，
    那样指纹不变、写前复查就形同虚设（实测踩过）。用内容哈希，代价是多读一次小文件。
    """
    try:
        raw = path.read_bytes()
    except FileNotFoundError:
        return None
    except OSError:
        return ("unreadable",)
    return hashlib.sha256(raw).hexdigest()


@contextlib.contextmanager
def progress_lock(path: Path) -> Iterator[None]:
    """把台账文件的「读-改-写」串行化，避免并发丢更新。

    锁文件放系统临时目录（按项目绝对路径取名），不污染项目；进程退出时内核自动释放。
    无 fcntl / msvcrt 的平台上退化为不加锁。
    """
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
            # typeshed 把 msvcrt.locking / LK_* 门控在 win32，非 Windows 平台跑 pyright
            # 会报「未知属性」；这段只有 Windows 真能执行到，故局部忽略（import 处是 try 容错）
            msvcrt.locking(fd, msvcrt.LK_LOCK, 1)  # pyright: ignore[reportAttributeAccessIssue]
        yield
    finally:
        try:
            if fcntl is not None:
                fcntl.flock(fd, fcntl.LOCK_UN)
            elif msvcrt is not None:
                msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)  # pyright: ignore[reportAttributeAccessIssue]
        finally:
            os.close(fd)


@contextlib.contextmanager
def repo_sync_lock(git_dir: Path, timeout: float = 60.0) -> Iterator[None]:
    """写命令的整段临界区：写前同步 → 命令写入 → 提交推送，同一 clone 只允许一个。

    为什么必须整段：写前同步是「检查本地干净 → 覆盖台账文件」两步，中间是敞开的。
    另一个 agent 恰好在这几毫秒里写完，覆盖就会把它的改动静默抹掉，随后的提交还会把
    错误内容推走 —— 事后只能靠人翻历史才发现。progress_lock 只管单文件的读改写，盖不住
    这两步之间的缝。

    锁文件放 git 目录里（不进仓库、不被 git 状态看见）；拿锁最多等 timeout 秒。
    """
    if fcntl is None and msvcrt is None:
        yield
        return
    lock_path = git_dir / "dsh-task-ledger.sync.lock"
    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o644)
    acquired = False
    try:
        deadline = time.monotonic() + timeout
        while True:
            try:
                if fcntl is not None:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                elif msvcrt is not None:
                    os.lseek(fd, 0, os.SEEK_SET)
                    msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)  # pyright: ignore[reportAttributeAccessIssue]
                acquired = True
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise Fail(
                        f"另一个会话正在同步同一份台账（已等 {int(timeout)} 秒），请稍后重试。"
                    )
                time.sleep(0.1)
        yield
    finally:
        if acquired:
            try:
                if fcntl is not None:
                    fcntl.flock(fd, fcntl.LOCK_UN)
                elif msvcrt is not None:
                    os.lseek(fd, 0, os.SEEK_SET)
                    msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)  # pyright: ignore[reportAttributeAccessIssue]
            except OSError:
                pass
        os.close(fd)


def _git(
    *args: str, timeout: int | None = None, check: bool = False
) -> subprocess.CompletedProcess:
    """跑一条 git 命令，吞掉输出（同步用，不污染 stdout）。

    check=True 让失败抛异常（推送要能被下面的兜底捕获）；提交则靠返回码分辨，
    因为不同仓库的提交检查（commitlint 等）会拒掉消息，需要看 stderr 原文。

    **没装 git 不当崩溃**：返回 127 的 CompletedProcess（与 shell 的约定一致），
    调用方照返回码处理 —— 身份走兜底链、同步静默跳过，而不是抛 FileNotFoundError。
    """
    try:
        return subprocess.run(
            list(args), capture_output=True, text=True, timeout=timeout, check=check
        )
    except FileNotFoundError:
        miss = subprocess.CompletedProcess(
            list(args), 127, stdout="", stderr="git: command not found"
        )
        if check:  # check=True 的调用方靠异常分支兜底，这里补一个同样的
            raise subprocess.CalledProcessError(127, list(args), "", miss.stderr)
        return miss


def _git_actor(repo_root: str) -> str:
    """提交者：复用 git 身份；取不到用占位，不阻断提交。"""
    out = _git("git", "-C", repo_root, "config", "user.name")
    return out.stdout.strip() or "ledger-script"


def _why(raw: str | None, fallback: str) -> str:
    """把 git 的 stderr / stdout 压成一行：取最后几行非空内容，够定位原因就行。"""
    lines = [ln.strip() for ln in (raw or "").splitlines() if ln.strip()]
    return " / ".join(lines[-3:]) if lines else fallback


def _ledger_rel(files: list[Path], root: str) -> str:
    """台账目录相对 git 根的路径：monorepo 子目录时是 `svc/api/ledger`，不是硬编码的 `ledger`。"""
    for f in files:
        for cand in (f.parent, *f.parents):
            if (cand / POOL_REL.name).is_file() or (cand / OWNERS_REL.name).is_file():
                try:
                    return cand.resolve().relative_to(Path(root).resolve()).as_posix()
                except ValueError:
                    break
    return POOL_REL.parent.as_posix()


def _push(
    g: tuple[str, ...], upstream: str, *, check: bool = False
) -> subprocess.CompletedProcess:
    """显式 refspec：本地分支与上游分支不同名（main ↔ master）时，裸 `git push` 直接 fatal。"""
    remote, _, branch = upstream.partition("/")
    refspec = f"HEAD:{branch}" if branch else "HEAD"
    return _git(*g, "push", remote, refspec, timeout=30, check=check)


def _foreign_commits(
    g: tuple[str, ...], upstream: str, ledger_rel: str
) -> tuple[int, list[str]]:
    """本地领先 upstream、但不在台账目录里的提交（用户自己的代码）：(数量, 前几条摘要)。

    数量 -1 = 数不出来，调用方必须按「可能有」处理 —— 当成 0 就等于放行推送 / rebase，
    那正是脚本声称绝不做的事（fail-closed）。
    """
    spec = f"{upstream}..HEAD"
    # :(literal) 不能省：台账路径若含 `( ) ,` 会让 pathspec magic 解析报错（→ 永久
    # 封锁自动 rebase），含 `* ? [` 会被当通配符，误把用户提交算成台账提交。
    exclude = f":(exclude,literal){ledger_rel}"
    raw = _git_bytes(*g, "rev-list", "--count", spec, "--", ".", exclude)
    try:
        count = int((raw or b"").decode("ascii", "replace").strip())
    except ValueError:
        return -1, []
    if count <= 0:
        return count, []
    listed = _git_bytes(
        *g,
        "log",
        "--format=%h %s",
        spec,
        "--",
        ".",
        exclude,
    )
    return count, (listed or b"").decode("utf-8", "replace").strip().splitlines()[:3]


def _merge_task_dicts(
    base: dict[str, Any], upstream: dict[str, Any], local: dict[str, Any]
) -> tuple[dict[str, Any], list[str]]:
    """按任务号做三方合并；返回 (合并结果, 两边都改过的任务号)。

    合并单位是「任务」，不是文本行 —— 行级合并只认相邻上下文：不同任务各自新增 /
    结案挤在文件末尾就会撞，而同一任务两边都改时它也判不出该留谁。这里按 id 对账：
    只有一边动过的直接采纳，两边都动过的列进冲突，一个都不静默丢。

    命名照抄 git 的 stage 语义，不用 ours / theirs —— rebase 时 git 把「上游」当
    作 ours、把「本机正在重放的提交」当作 theirs，跟字面直觉正好相反（实测：
    :1=共同祖先、:2=上游别人的、:3=本机自己的）。用 upstream / local 才不会写反。
    """
    merged: dict[str, Any] = {}
    conflicts: list[str] = []
    for tid in sorted(set(base) | set(upstream) | set(local)):
        b, up, loc = base.get(tid), upstream.get(tid), local.get(tid)
        if up == loc:
            if up is not None:
                merged[tid] = up
        elif up == b:
            if loc is not None:
                merged[tid] = loc
        elif loc == b:
            # 只有上游动过：上游删了就真删掉。这里若写成 merged[tid] = up，
            # up 为 None 时会在文件里留一行 "<tid>": null 永久累积，
            # 且读侧（cmd_list / parseTaskList）会因 null 崩掉或整区降级。
            if up is not None:
                merged[tid] = up
        else:
            conflicts.append(tid)
            merged[tid] = up if up is not None else loc
    return merged, conflicts


def _render_ledger_conflict(
    full: dict[str, Any],
    key: str,
    merged: dict[str, Any],
    conflicts: list[str],
    upstream: dict[str, Any],
    local: dict[str, Any],
) -> str:
    """按「一条一行」渲染整份台账；两边都改过的条目用冲突标记包起来。

    `full` 是本地那一侧的整份结构（version / identity / tasks），除 `key` 之外
    原样保留 —— 分片文件里的 identity 丢了就没法自证。左边给上游（别人的）、
    右边给本机（自己的），与 rebase 的 stage2 / stage3 对应；标反了会让人照着
    标记把别人的版本留下来。
    """
    rows: list[str] = []
    for field in sorted(full):
        if field != key:
            rows.append(
                f"  {json.dumps(field, ensure_ascii=False)}: "
                f"{json.dumps(full[field], ensure_ascii=False, sort_keys=True)}"
            )
            continue
        inner: list[str] = []
        for ident in sorted(merged):
            label = json.dumps(ident, ensure_ascii=False)
            if ident not in conflicts:
                inner.append(
                    f"    {label}: "
                    f"{json.dumps(merged[ident], ensure_ascii=False, sort_keys=True)}"
                )
                continue
            left = (
                "(远端已删除)"
                if upstream.get(ident) is None
                else json.dumps(upstream[ident], ensure_ascii=False, sort_keys=True)
            )
            right = (
                "(本地已删除)"
                if local.get(ident) is None
                else json.dumps(local[ident], ensure_ascii=False, sort_keys=True)
            )
            inner.append(
                f"<<<<<<< 远端\n    {label}: {left}\n=======\n"
                f"    {label}: {right}\n>>>>>>> 本地"
            )
        rows.append(
            f'  "{key}": {{\n' + (",\n".join(inner) + "\n" if inner else "") + "  }"
        )
    return "{\n" + ",\n".join(rows) + "\n}\n"


def _render_progress_conflict(
    merged: dict[str, Any],
    conflicts: list[str],
    upstream: dict[str, Any],
    local: dict[str, Any],
) -> str:
    """单个 `tasks` 文件的冲突渲染（保留给测试与旧路径用）。"""
    return _render_ledger_conflict(
        {"tasks": merged}, "tasks", merged, conflicts, upstream, local
    )


def _union_merge(g: tuple[str, ...], root: str, rel: str) -> bool:
    """把冲突文件按「两边都保留」合上 —— worklog 正文是追加式的，两边各加一条
    执行记录没必要让人选，union 正好。返回是否真的写出去了。
    """
    staged: dict[int, bytes] = {}
    for n in (1, 2, 3):
        raw = _git_bytes(*g, "show", f":{n}:{rel}")
        if raw is None:
            if n == 1:
                # add/add：两边各自新建、没有共同祖先，用空 base 当三方合并的底
                raw = b""
            else:
                return False
        staged[n] = raw
    with tempfile.TemporaryDirectory() as td:
        order = (2, 1, 3)  # git merge-file 的顺序是 current / base / other
        paths = []
        for n in order:
            p = Path(td) / str(n)
            p.write_bytes(staged[n])
            paths.append(str(p))
        out = _git(*g, "merge-file", "--union", "-p", *paths)
        if out.returncode != 0:
            return False
        text = out.stdout
        if "/history/" in rel:
            text = _tidy_history_text(text)  # 两边都带表头 → 去重合并成一份
        try:
            write_text_atomic(Path(root) / rel, text, track=False)
        except Fail:
            return False
    return True


def _tidy_history_text(text: str) -> str:
    """union 合并后的历史层正文整理：一份表头 + 数据行去重（保序）。

    表头**沿用原文那一份**，不无条件换成 9 列：少列文件（4/5/6/8 列，升级不了或还没升）
    若硬套 9 列表头，GFM 会按 9 列渲染、把后面的行挤歪，这里还会多出一行表头。
    分隔行按表头列数重生成，多余的（union 带来的第二份）一律丢弃。
    """
    rows: list[str] = []
    header: str | None = None
    for line in text.splitlines():
        row = line.strip()
        if not row.startswith("|"):
            continue
        cells = split_row(row)
        if not cells or _is_sep_row(cells):
            continue
        if _looks_like_header(cells):
            if header is None:
                header = row
            continue
        if row not in rows:
            rows.append(row)
    if header is None:
        header = HISTORY_HEADER
    cols = len(split_row(header))
    sep = "|" + "|".join(["---"] * cols) + "|"
    body = "\n".join(rows)
    return f"{HISTORY_TITLE}\n\n{header}\n{sep}\n{body}\n"


def _drop_trailing_blank(out: list[str]) -> None:
    """去掉已在结果里的尾部空行（丢弃重复表头时用）：中间的空行会把 GFM 表格截断。"""
    while out and not out[-1].strip():
        out.pop()


def _resolve_ledger_conflict(
    g: tuple[str, ...], root: str, ledger_rel: str
) -> bool | str | None:
    """rebase 卡在台账数据上时接管合并。

    台账的 JSON（pool.json / owners/<hash>.json / owners.json）按条目做三方合并
    （同一任务两边都改 → 保留冲突标记等人）；worklog 与 history 是追加式正文，
    两边各加一条记录就 union 合上。业务代码的冲突一个字都不碰。
    返回 True = 合上并继续 rebase；"conflict" = 有任务被两边改，标记已写好；
    None = 不归这里管，走原有回滚路径。
    """
    conflicted = _split_z(
        _git_bytes(*g, "diff", "--name-only", "--diff-filter=U", "-z")
    )
    if not conflicted:
        return None
    worklog_prefix = f"{ledger_rel}/worklog/"
    history_prefix = f"{ledger_rel}/history/"
    pool_rel = f"{ledger_rel}/pool.json"
    index_rel = f"{ledger_rel}/owners.json"
    owners_prefix = f"{ledger_rel}/owners/"

    def json_key(rel: str) -> str | None:
        """这份冲突文件按哪个字段做条目级合并；None = 不归这里管。"""
        if rel == index_rel:
            return "workers"
        if rel == pool_rel or (rel.startswith(owners_prefix) and rel.endswith(".json")):
            return "tasks"
        return None

    for rel in conflicted:
        if json_key(rel) is not None:
            continue
        if rel.startswith((worklog_prefix, history_prefix)):
            continue
        return None  # 混进业务文件：整体交回原路径，不由脚本代劳

    conflicts: list[str] = []
    for rel in conflicted:
        key = json_key(rel)
        if key is None:
            if not _union_merge(g, root, rel):
                # 合不了就整体退回原路径：留半合并状态比不合更糟
                return None
            continue

        def stage(
            n: int, rel: str = rel, key: str = key
        ) -> tuple[dict[str, Any], dict[str, Any]] | None:
            raw = _git_bytes(*g, "show", f":{n}:{rel}")
            if raw is None:
                return None
            try:
                data = json.loads(raw.decode("utf-8-sig"))
            except ValueError:
                return None
            if not isinstance(data, dict):
                return None
            rows = data.get(key)
            if not isinstance(rows, dict):
                return None
            return data, rows

        # stage(1)=共同祖先、stage(2)=上游别人的、stage(3)=本机正在重放的（rebase 语义，实测确认）
        s1, s2, s3 = stage(1), stage(2), stage(3)
        if s2 is None or s3 is None:
            return None
        # add/add（两边各自新建同一份文件）没有 stage 1：用空 base，按条目并起来
        base, upstream, local = (s1[1] if s1 else {}), s2[1], s3[1]
        merged, file_conflicts = _merge_task_dicts(base, upstream, local)
        conflicts.extend(file_conflicts)
        try:
            write_text_atomic(
                Path(root) / rel,
                _render_ledger_conflict(
                    s3[0], key, merged, file_conflicts, upstream, local
                ),
                track=False,
            )
        except Fail:
            return None

    if conflicts:
        return "conflict"
    if _git(*g, "add", "--", *conflicted).returncode != 0:
        return None
    if _git(
        *g, "-c", "core.editor=true", "rebase", "--continue", timeout=60
    ).returncode:
        return None
    return True


def _rebase_retry(g: tuple[str, ...], ledger_rel: str) -> bool:
    """推送被拒后自动 rebase 一次；只在工作树干净时做，失败立刻 abort。

    台账按任务分条存（pool.json / 分片是按任务号 key 的对象，history 一行一条），
    各自改各自的任务时 git 能按行自动合并。真冲突（同一条任务被两边改）就干净失败，
    绝不把仓库留在 rebase 中间态，也绝不 --force。
    """
    fetched = _git(*g, "fetch", timeout=30)
    if fetched.returncode != 0:
        # 不静默：凭据过期 / 离线时这里就是唯一能说明「为什么没自动合并」的地方
        print(
            f"提示：推送被拒后重新取最新失败"
            f"（{_why(fetched.stderr or fetched.stdout, f'退出码 {fetched.returncode}')}），未自动合并。",
            file=sys.stderr,
        )
        return False
    # 用户自己 commit 的代码不动：rebase 会重放整支分支，把他们的提交号全改写。
    # 只在自己那几条台账提交上做，才是「只碰台账」这条边界的完整实现。
    # foreign != 0：-1 表示数不出来，同样按「可能有」处理，宁可不动也不越权。
    foreign, titles = _foreign_commits(g, "@{upstream}", ledger_rel)
    if foreign != 0:
        if foreign > 0:
            detail = f"：{'；'.join(titles)}" if titles else ""
            what = f"本地有 {foreign} 个你自己的提交还没推送{detail}"
        else:
            what = "没能确认本地有没有你自己的提交（git 数不出来）"
        print(
            f"提示：{what}。脚本不替你 rebase（那会改写提交号），本次没有自动合并。\n"
            "  处理：手动 `git pull --rebase` 或 `git merge` 后再 `git push`；"
            "台账改动已安全留在本地。",
            file=sys.stderr,
        )
        return False
    # --autostash：把工作树里未提交的改动（用户正在写的代码）临时收走、rebase 完自动放回。
    # 不这样做的话，只要仓库里有一处未提交改动，自动合并就永久失效 —— 台账提交越堆越多，
    # 直到下一次写被「有未推送提交」拦住，而提示跟用户的业务代码毫无关系。
    try:
        rebase = _git(*g, "rebase", "--autostash", "@{upstream}", timeout=60)
    except subprocess.TimeoutExpired:
        # 超时会被 kill，仓库可能已经停在 rebase 中间态（autostash 也没 pop 回来）。
        # 不在这里收拾，留给上层的 catch-all 只会打一句「写后自动同步未执行」——
        # 仓库却卡住了，下一次写直接被中间态拦死。所以就地 abort 再报。
        left = _git(*g, "rebase", "--abort", timeout=30)
        print(
            "提示：自动 rebase 超时（60 秒），已尝试回滚。\n"
            f"  回滚结果：{'成功' if left.returncode == 0 else '失败，仓库可能停在 rebase 中间态'}\n"
            "  处理：`git status` 看清状态；你的未提交改动若被 autostash 收走，"
            "在 `git stash list` 里，解完冲突再 `git stash drop`。",
            file=sys.stderr,
        )
        return False
    if rebase.returncode == 0:
        combined = f"{rebase.stdout or ''}{rebase.stderr or ''}"
        # 判「改动放回时冲突了」不能认 git 的文案：2.27+ 的措辞是
        # 「Your local changes are stashed, however applying them resulted in conflicts」，
        # 跟旧版的「Applying autostash resulted in conflicts」不是一回事 —— 认字符串时
        # 实测 git 2.55 会漏判，把「工作树里带着冲突标记」说成「已放回」（最坏的一种错）。
        # rebase 本身成功（returncode 0）就说明冲突不来自 rebase，只可能来自 autostash，
        # 于是直接看 index 有没有未合并项。
        conflicted = _split_z(
            _git_bytes(*g, "diff", "--name-only", "--diff-filter=U", "-z")
        )
        if conflicted:
            # 必须点名文件：此刻这些文件带 `<<<<<<<` 标记，不写清楚就会有人把冲突标记
            # 当成品提交上去（git 不会替你报错，它只当普通改动）。
            print(
                "提示：rebase 成功，但把你的未提交改动放回工作树时冲突了 —— "
                "这些文件现在带着 `<<<<<<<` 冲突标记，别当成品提交：\n  "
                + "\n  ".join(conflicted)
                + "\n  改动同时还在 stash 里（`git stash list`）；解完冲突、确认内容没错"
                "再 `git stash drop`。",
                file=sys.stderr,
            )
        elif "autostash" in combined:
            print(
                "提示：自动合并前暂存了你的未提交改动，rebase 后已放回。",
                file=sys.stderr,
            )
        return True
    conflict = (rebase.stderr or rebase.stdout or "").strip()
    # 行级冲突先按任务号对账一次：不同任务的改动本该自动合上，只有同一任务被两边
    # 改过才真需要人。合上了就继续，不必让人去手写一坨 JSON 冲突标记。
    resolved = _resolve_ledger_conflict(g, g[2], ledger_rel)
    if resolved is True:
        print(
            "提示：合并时按任务号自动对账了台账（不同任务互不影响）。",
            file=sys.stderr,
        )
        return True
    if resolved == "conflict":
        print(
            f"提示：{ledger_rel} 下的台账文件里有任务被两边同时改过，"
            "已按任务逐个标出冲突（标记里左边是远端、右边是本机），没有替你选任何一个。\n"
            "  处理：编辑该文件保留你要的版本 → `git add` → `git rebase --continue`；"
            "不想合就 `git rebase --abort` 回到写之前。\n"
            "  你的台账改动已提交在本地，不会丢。",
            file=sys.stderr,
        )
        return False
    abort = _git(*g, "rebase", "--abort", timeout=30)
    if abort.returncode != 0:
        # abort 也失败：仓库现在真的停在 rebase 中间态，必须把真实状态原样交出去。
        # 谎称「已回滚」最坏 —— 那时台账文件可能带冲突标记，继续写会全盘读坏。
        status = _git(*g, "status", "--short", "--branch")
        print(
            "错误：自动 rebase 冲突后回滚也失败了，仓库可能停在 rebase 中间态。"
            "在收拾干净之前不要再跑台账命令。\n"
            f"  冲突：{conflict}\n"
            f"  当前状态：{(status.stdout or '').strip()}\n"
            "  处理：在仓库根执行 `git rebase --abort`；仍失败就先 `git status` 看清残留文件"
            "（必要时删掉 .git/rebase-merge 或 .git/rebase-apply）再重试。",
            file=sys.stderr,
        )
        return False
    # `--abort` 会把 autostash 重新 apply，这一步同样可能冲突。那时工作树里带着
    # `<<<<<<<` 标记，只说「已回滚到 rebase 前」等于让人把冲突标记当成品提交。
    left = _split_z(_git_bytes(*g, "diff", "--name-only", "--diff-filter=U", "-z"))
    stash = _git(*g, "stash", "list", "--format=%gd")
    stash_n = len([ln for ln in (stash.stdout or "").splitlines() if ln.strip()])
    extra = ""
    if left:
        extra += (
            "\n  注意：回滚时把你的未提交改动放回工作树也冲突了，这些文件带着 "
            "`<<<<<<<` 标记，别当成品提交：\n  " + "\n  ".join(left)
        )
    if stash_n:
        extra += f"\n  另外仓库里现有 {stash_n} 条 stash（可能含刚才的 autostash），先别 drop。"
    print(
        "提示：自动 rebase 未成功（已回滚到 rebase 前），多半是同一条任务被两边同时改了，"
        f"请手动合并：{conflict}{extra}",
        file=sys.stderr,
    )
    return False


def git_sync(action: str) -> None:
    """写成功后调用一次：把本次改动的台账文件提交；有上游跟踪分支则推送。

    纯脚本、确定性，不依赖大模型。无 git / 无上游 / 全被 ignore / 无实际变更 都静默跳过。
    同步失败（提交被仓库钩子拒后连 --no-verify 也失败、推送被拒、意外异常）一律打到
    stderr 提示，绝不静默；但退出码不变 —— 台账本身已经写成功，别让调用方误判去重做。
    """
    if os.environ.get("TASK_LEDGER_NO_SYNC"):
        # 这条以前是纯静默的：写成功了却一个字不提没签入，三天后没人知道那次没签上。
        # 只在真有改动时说，纯只读式的写入（内容没变）不吵。
        pending = [
            p for p in dict.fromkeys([*CHANGED_FILES, *PRESYNC_FILES]) if p.exists()
        ]
        if pending:
            print(
                f"提示：本次按 --no-sync 未签入 git，{len(pending)} 个台账文件留在工作树里。"
                "下次写命令会先要求你提交它们。",
                file=sys.stderr,
            )
        return
    try:
        # 本次写入目标 + 写前补下的 worklog：后者不是本次改动，但也得随这次提交入库
        files = [
            p for p in dict.fromkeys([*CHANGED_FILES, *PRESYNC_FILES]) if p.exists()
        ]
        if not files:
            return
        # 从任一文件反查仓库根，不依赖调用方透传 --repo
        top = _git("git", "-C", str(files[0].parent), "rev-parse", "--show-toplevel")
        if top.returncode != 0:
            return  # 不是 git 项目 → 跳过（规则1：有才提交）
        root = top.stdout.strip()
        g = ("git", "-C", root)
        # 只 add 本次真实改动、且未被 ignore 的文件。
        # --no-index 不能省：忽略规则对已跟踪文件同样生效（先提交过台账、之后才把
        # ledger/ 写进 .gitignore 就是这种情形），而默认的 check-ignore 只报未跟踪
        # 文件、漏判后 git add 会撞「paths are ignored」并打一句「请手动提交」的瞎提示。
        to_add = [
            str(f)
            for f in files
            if _git(*g, "check-ignore", "--no-index", "-q", str(f)).returncode != 0
        ]
        if not to_add:
            # 全被 ignore → 尊重用户选择，不强行提交；但必须说一声：
            # 不说的话台账从此永远「已写未提交」，下一次写会被 guard 报成
            # 「本地台账有未提交改动」，用户根本猜不到根因在 .gitignore。
            print(
                "提示：台账目录被 .gitignore 排除，本次只写本地文件、没有提交也没有推送。"
                "要从 .gitignore 里去掉 ledger/ 才会恢复自动同步。",
                file=sys.stderr,
            )
            return
        staged = _git(*g, "add", *to_add)
        if staged.returncode != 0:
            print(
                "提示：台账已写入本地，但 git add 失败，请手动提交 ledger/："
                f"{(staged.stderr or staged.stdout or '').strip()}",
                file=sys.stderr,
            )
            return
        # 只看本次要提交的路径：别人暂存的文件不该让这里误判成「有变更」
        if _git(*g, "diff", "--cached", "--quiet", "--", *to_add).returncode == 0:
            return  # 无实际变更
        actor = _git_actor(root)
        # 消息按 conventional commits 写：多数仓库装了 commitlint，只认白名单里的 type
        msg = f"chore(ledger): {action} {actor}"
        # 必须 --only + pathspec：git commit 默认提交整个 index，会把用户或别的 agent
        # 已 git add 的业务文件一起卷进这条 chore(ledger) 提交并推走。
        done = _git(*g, "commit", "--only", "-m", msg, "--", *to_add)
        if done.returncode != 0:
            # 各仓库提交规则各不相同（type 白名单、大小写、scope 枚举……），台账是数据文件，
            # 过不了就让这一次跳过钩子提交，别把台账永久锁在本地暂存区。
            done = _git(*g, "commit", "--only", "--no-verify", "-m", msg, "--", *to_add)
            if done.returncode == 0:
                print(
                    f"提示：仓库提交检查拒绝了消息「{msg}」，已用 --no-verify 提交本次台账改动。",
                    file=sys.stderr,
                )
        if done.returncode != 0:
            # 把台账改动撤出暂存区：留着的话用户下一次裸 `git commit` 会把数据文件
            # 卷进业务提交（脚本声称「只碰台账」，不能自己留下这个副作用）。
            _git(*g, "reset", "-q", "--", *to_add)
            print(
                "提示：台账已写入本地，但自动提交失败（台账改动已撤出暂存区），"
                "请手动提交 ledger/："
                f"{(done.stderr or done.stdout or '').strip()}",
                file=sys.stderr,
            )
            return
        # 规则2：有上游跟踪分支才推
        upstream = _git(*g, "rev-parse", "--abbrev-ref", "@{upstream}")
        if upstream.returncode != 0:
            return
        # push 是分支级的：本地有用户自己 commit 但没推的代码，会一并送到远端。
        # 脚本不替用户下这个决定，但必须说出来，别让它无声发生。
        up = upstream.stdout.strip()
        if "/" not in up:
            # 上游是本地分支（branch.x.remote="."）时，短名里没有 remote 段：
            # _push 会把分支名当 remote 拼出 `git push main HEAD` 这种命令，
            # 要么推错远端、要么报「不是 git repository」。与 git_presync 的守卫对齐。
            print(
                f"提示：上游 {up} 是本地分支而不是远端分支，本次只提交到本地、不会推送。",
                file=sys.stderr,
            )
            return
        ledger_rel = _ledger_rel(files, root)
        foreign, titles = _foreign_commits(g, up, ledger_rel)
        if foreign > 0:
            detail = f"：{'；'.join(titles)}" if titles else ""
            print(
                f"提示：本次推送会把本地 {foreign} 个你自己的提交一并推上去{detail}。",
                file=sys.stderr,
            )
        elif foreign < 0:
            # 数不出来（旧 git / 浅克隆 / rev-list 失败）时不能当成 0 静默：
            # 推送是分支级的，用户自己的提交照样会被带走，只是说不清有几个。
            print(
                "提示：没能确认本地有没有你自己的提交（git 数不出来），"
                "本次推送可能把它们一并推上去。",
                file=sys.stderr,
            )
        try:
            _push(g, up, check=True)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as push_exc:
            # 非快进：只在台账工作树干净时自动 rebase 一次再推，冲突立刻 abort。
            # 各自改各自的任务时 git 按行自动合并；同一条任务冲突就干净失败，绝不 --force。
            if _rebase_retry(g, ledger_rel):
                try:
                    _push(g, up, check=True)
                    return
                except (
                    subprocess.CalledProcessError,
                    subprocess.TimeoutExpired,
                ) as retry_exc:
                    print(
                        "提示：自动合并后再次推送仍被拒"
                        f"（{_why(getattr(retry_exc, 'stderr', '') or str(retry_exc), '推送失败')}）。",
                        file=sys.stderr,
                    )
            # 必须带 git 原话：认证过期 / 分支保护 / 非快进只能从原文分辨，只给一句猜测等于没说
            print(
                "提示：本地已提交，但推送被拒，本次改动已安全留在本地。\n"
                f"  git：{_why(getattr(push_exc, 'stderr', '') or str(push_exc), '推送失败')}\n"
                "  处理：`git push` 看原话；认证 / 权限问题找用户，不要反复重试。",
                file=sys.stderr,
            )
    except Exception as exc:  # noqa: BLE001 —— 同步失败不应污染台账主流程
        print(
            f"提示：写后自动同步未执行（{type(exc).__name__}: {exc}）。数据已写入本地。",
            file=sys.stderr,
        )


# 只读命令不碰 git；其余（含写类与 tags）写前刷新 ledger/。
READ_ONLY_COMMANDS = {"list", "show", "history", "validate"}


def _git_bytes(*args: str, timeout: int | None = None) -> bytes | None:
    """跑 git 拿原始字节；失败返回 None。

    不走 _git()：那里固定 text=True + 默认编码，会按 locale 解码并做换行归一，
    中文路径与非 UTF-8 locale 都会出事。取台账内容必须字节保真。
    """
    try:
        proc = subprocess.run(
            list(args), capture_output=True, timeout=timeout, check=False
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    return proc.stdout if proc.returncode == 0 else None


def _split_z(out: bytes | None) -> list[str]:
    """按 NUL 切 -z 输出（路径原样，不被 core.quotepath 转义）。"""
    if not out:
        return []
    return [s.decode("utf-8", "surrogateescape") for s in out.split(b"\0") if s]


def _remote_exists(root: str, upstream: str, rel: str) -> bool:
    """远端是否有这个文件。"""
    return (
        subprocess.run(
            ["git", "-C", root, "cat-file", "-e", f"{upstream}:{rel}"],
            capture_output=True,
            check=False,
        ).returncode
        == 0
    )


def _remote_dir_files(root: str, upstream: str, rel_dir: str) -> list[str]:
    """列远端目录下的文件（相对仓库根，原样路径）。远端没有该目录时返回空。"""
    return _split_z(
        _git_bytes(
            "git",
            "-C",
            root,
            "ls-tree",
            "-r",
            "-z",
            "--name-only",
            upstream,
            "--",
            rel_dir + "/",
        )
    )


def _git_midstate(git_root: str) -> str | None:
    """仓库是否停在 merge / rebase 等冲突中间态；是就返回人话名字。

    中间态下工作树里的台账可能是冲突版本（带 `<<<<<<<` 标记），
    写前同步与写后提交都会往这个现场里写，必须先让用户收尾。
    """
    out = _git("git", "-C", git_root, "rev-parse", "--absolute-git-dir")
    if out.returncode != 0:
        return None
    git_dir = Path(out.stdout.strip())
    for marker, label in (
        ("MERGE_HEAD", "merge"),
        ("rebase-merge", "rebase"),
        ("rebase-apply", "rebase/am"),
        ("CHERRY_PICK_HEAD", "cherry-pick"),
        ("REVERT_HEAD", "revert"),
    ):
        if (git_dir / marker).exists():
            return label
    return None


def _presync_guard(
    git_root: str,
    upstream: str,
    managed: list[str],
    remote_files: set[str],
    *,
    check_ahead: bool = True,
) -> None:
    """取最新之前确认本地没有会被覆盖掉的东西；命中就中止，绝不静默覆盖。

    三种命中：未推送的台账提交（取最新会把它们的内容回退掉）、已跟踪文件的
    未提交改动、本地还没入库但远端已有同名文件。

    check_ahead=False 用在自动补推之前：那时本地还领先，ahead 必然非 0；
    补推完成后再跑一次完整检查。
    """
    if check_ahead:
        ahead = _git_bytes(
            "git",
            "-C",
            git_root,
            "rev-list",
            "--count",
            f"{upstream}..HEAD",
            "--",
            *managed,
        )
        # 数不出来 ≠ 没有未推送提交。旧写法把 None 当成空串放行，紧接着就会用远端版本
        # 覆盖本地未推送的台账 —— 正是「绝不静默覆盖」要防的那件事（与 _foreign_commits
        # 的 -1 fail-closed 口径对齐）。
        if ahead is None:
            raise Fail(
                "数不出本地台账是否领先上游（git rev-list 失败），为免覆盖未推送的内容，"
                "已中止本次操作。\n  处理：先 `git status`、`git log @{u}..HEAD` 看清状态；"
                "确认不要远端版本可加 --no-sync 继续本地写。"
            )
        count = ahead.decode("ascii", "replace").strip()
        if count and count != "0":
            listing = _git_bytes(
                "git",
                "-C",
                git_root,
                "log",
                "--oneline",
                f"{upstream}..HEAD",
                "--",
                *managed,
            )
            recent = (
                (listing or b"").decode("utf-8", "replace").strip().splitlines()[:3]
            )
            detail = ("\n  未推送：" + "；".join(recent)) if recent else ""
            raise Fail(
                f"本地有 {count} 个台账提交还没推到 {upstream}，写前取最新会把它们的内容"
                f"回退掉，已中止本次操作。{detail}\n"
                "  处理：先 `git push` 补齐再重跑；暂时离线可加 --no-sync 继续在本地写，"
                "联网后再提交推送。"
            )
    dirty_raw = _git_bytes(
        "git", "-C", git_root, "diff", "--name-only", "-z", "HEAD", "--", *managed
    )
    if dirty_raw is None:
        raise Fail(
            "数不出本地台账有没有未提交改动（git diff 失败），为免覆盖，已中止本次操作。\n"
            "  处理：先 `git status` 看清状态；确认要强行继续可加 --no-sync。"
        )
    dirty = _split_z(dirty_raw)
    if dirty:
        raise Fail(
            "本地台账有还没签入 git 的改动（多半是上次用了 --no-sync，或上次提交/推送没成功）。"
            "写前取最新会覆盖它们，已中止本次操作：\n  "
            + "\n  ".join(dirty)
            + '\n  处理：先提交（`git add ledger/ && git commit -m "chore(ledger): ..."`）再重跑；'
            "这些改动不要了就用 `git checkout -- <文件>`；确认要按原样继续可加 --no-sync。"
        )
    untracked_raw = _git_bytes(
        "git",
        "-C",
        git_root,
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
        *managed,
    )
    if untracked_raw is None and remote_files:
        # 有远端同名文件要刷、却列不出本地未入库文件：同样按「可能有」处理，不放行覆盖。
        raise Fail(
            "数不出本地有哪些台账文件还没入库（git ls-files 失败），为免覆盖，已中止本次操作。\n"
            "  处理：先 `git status` 看清状态；确认要强行继续可加 --no-sync。"
        )
    untracked = set(_split_z(untracked_raw))
    clash = sorted(untracked & remote_files)
    if clash:
        raise Fail(
            "这些台账文件本地还没入库、远端已有同名文件，写前取最新会覆盖它们，"
            "已中止本次操作：\n  "
            + "\n  ".join(clash)
            + "\n  处理：先提交（或删掉）这些文件再重跑；确认不要远端版本可加 --no-sync。"
        )


def _presync_fetch_file(
    git_root: str, upstream: str, rel: str, *, track: bool = False
) -> bool:
    """把远端某个文件的当前内容落到工作树；内容相同就不写。返回是否真的写了。

    用 blob 内容自己落盘，而不是 checkout / restore：只碰工作树、不动 index，
    不需要 git ≥2.23，也不会因为一个路径失败而整批失败。

    track=False（默认）用于随后还要改写的脚本独占文件；track=True 用于补下来的
    worklog 新文件——它不是本次改动，但必须随本次提交入库（记进 PRESYNC_FILES），
    否则会一直以未跟踪状态留在工作树里，把「有没有未提交改动」的判断弄脏。
    """
    data = _git_bytes("git", "-C", git_root, "cat-file", "blob", f"{upstream}:{rel}")
    if data is None:
        return False
    dest = Path(git_root) / rel
    try:
        if dest.is_file() and dest.read_bytes() == data:
            return False
    except OSError:
        pass
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        print(f"提示：{rel} 不是 UTF-8，已跳过写前刷新。", file=sys.stderr)
        return False
    # 覆盖前留底：命令随后失败时回滚，别让远端版本留在工作树里冒充用户的未提交改动
    if dest not in PRESYNC_BACKUPS:
        try:
            PRESYNC_BACKUPS[dest] = dest.read_bytes() if dest.is_file() else None
        except OSError:
            PRESYNC_BACKUPS[dest] = None
    try:
        write_text_atomic(dest, text, track=False)
    except Fail as exc:
        print(f"提示：写前刷新 {rel} 失败（{exc}），继续用本地版本。", file=sys.stderr)
        return False
    if track:
        PRESYNC_FILES.append(dest)
    return True


def _is_dirty(root: str, rel: str) -> bool:
    """该文件相对 HEAD 有没有未提交改动。数不出来按「有」处理（fail-closed）。"""
    raw = _git_bytes("git", "-C", root, "diff", "--name-only", "-z", "HEAD", "--", rel)
    if raw is None:
        return True
    return bool(_split_z(raw))


def _rel_to_git(git_root: Path, path: Path | None) -> str | None:
    """仓内绝对路径 → 相对仓根的 posix 路径；不在仓内返回 None。"""
    if path is None:
        return None
    try:
        return path.resolve().relative_to(git_root.resolve()).as_posix()
    except (OSError, ValueError):
        return None


def _stash_ff_worklog(root: str, upstream: str, rels: list[str]) -> bool:
    """worklog 有手写未提交改动时的「取最新」：收起来 → 快进 → 叠回去。

    直接覆盖会吞掉手写内容；不覆盖则后面「读全文→追加→写回」基于旧版，把远端
    那次改动整段写没（实测：两台机器各写过同一 worklog，远端内容直接消失）。
    stash 是唯一两头都保住的走法，冲突就留给 git 标出来让人合。

    返回「这些文件现在已是远端最新」—— 是就别再打「没刷最新」的提示了。
    """
    if not rels:
        return False
    names = "、".join(rels)
    st = _git("git", "-C", root, "stash", "push", "-q", "--", *rels, timeout=30)
    if st.returncode != 0:
        print(f"提示：{names} 暂时收起失败，本次没取它们的最新版本。", file=sys.stderr)
        return False
    ff = _git("git", "-C", root, "merge", "--ff-only", "-q", upstream, timeout=30)
    if ff.returncode != 0:
        back = _git("git", "-C", root, "stash", "pop", "-q", timeout=30)
        if back.returncode != 0:
            raise Fail(
                f"{names} 已从工作树收起，但快进失败、放回时又冲突了：改动在 stash 里没丢。\n"
                f"  处理：`git stash list` 找到它 → `git stash pop` 解决冲突 → 重跑这条命令。"
            )
        print(
            f"提示：{names} 收起后仍没能快进到 {upstream}，手写内容已放回。",
            file=sys.stderr,
        )
        return False
    pop = _git("git", "-C", root, "stash", "pop", "-q", timeout=30)
    if pop.returncode != 0:
        raise Fail(
            f"{names} 的手写改动与 {upstream} 的最新版本冲突，冲突标记已留在工作树里。\n"
            f"  处理：逐个编辑解决冲突 → `git add <文件>` → `git stash drop`，然后重跑这条命令。\n"
            "  顺序不能反：先 drop 再解决，手写的那段就没了。"
        )
    print(f"提示：{names} 的手写改动已叠到 {upstream} 的最新版本上。", file=sys.stderr)
    return True


def _presync_worklog_rels(
    repo: Path, git_root: Path, action: str, args: argparse.Namespace
) -> list[str]:
    """本次写命令会「读全文 → 改 → 写回」的已有 worklog（相对仓根）。

    `log` / `claim` / `set` 追加执行记录，`close` 还要封卷 + 追加，`tags --rename`
    改分类/标签行 —— 全都改写已有正文，不先刷成最新就是把别处那次改动整段写没。
    路径取自自己分片（找不到再看公共池）即可：worklog 路径建档时定死，不随别人
    改别的字段而变；本地根本没有这条任务，后面的命令自己会报错。
    """
    if action == "tags":
        if not getattr(args, "rename", None):
            return []
        try:
            tasks = tasks_in(repo / shard_rel(current_identity(repo)["email"]))
        except Fail:
            return []
        out: list[str] = []
        for tid_, task in tasks.items():
            if not isinstance(task, dict):
                continue
            rel = _rel_to_git(git_root, find_worklog(repo, tid_, task))
            if rel and rel not in out:
                out.append(rel)
        return out
    if action not in ("log", "claim", "set", "close"):
        return []
    tid = getattr(args, "id", None)
    if not tid:
        return []
    try:
        email = current_identity(repo)["email"]
        task = tasks_in(repo / shard_rel(email)).get(tid) or tasks_in(
            repo / POOL_REL
        ).get(tid)
    except Fail:
        return []
    if not isinstance(task, dict):
        return []
    rel = _rel_to_git(git_root, find_worklog(repo, tid, task))
    return [rel] if rel else []


def _write_targets(repo: Path, action: str, args: argparse.Namespace) -> list[Path]:
    """本次写命令可能改写的台账文件（写前同步与脏检查的范围）。

    宁宽勿窄：多刷一个本来不会改的文件只多一次 git 比对；漏刷一个就可能把
    别人刚推到远端的内容当成自己的改动提交上去。
    """
    try:
        email = current_identity(repo)["email"]
    except Fail:
        return []  # 身份拿不到：命令自己会报错，这里不重复
    pool = repo / POOL_REL
    shard = repo / shard_rel(email)
    targets: list[Path] = [repo / OWNERS_REL, shard]
    if action == "new":
        targets.append(shard if getattr(args, "self", False) else pool)
    elif action == "claim":
        targets.append(pool)
    elif action == "set":
        if getattr(args, "status", None) == "open":
            targets.append(pool)
        raw_owner = getattr(args, "owner", None)
        if raw_owner:
            who = norm_identity(str(raw_owner).strip().lstrip("@"))
            if who != email:
                try:
                    shards = registered_shards(repo)
                except Fail:
                    shards = {}
                targets.append(shards.get(who) or repo / shard_rel(who))
    elif action == "close":
        finished = ""
        raw_finished = getattr(args, "finished", None)
        if raw_finished:
            try:
                # 与 close 落盘口径一致（本地 → UTC），否则跨月补录会取错月份的历史文件
                finished = to_utc(raw_finished, field="--finished")
            except Fail:
                finished = ""  # 参数不合法交给 close 自己报错，这里按当前月
        targets.append(history_path_for(repo, finished or now()))

    out: list[Path] = []
    for path in targets:
        if path not in out:
            out.append(path)
    return out


def git_presync(action: str, args: argparse.Namespace) -> None:
    """写命令执行前把「这条命令真的要写的那几个文件」刷成远端最新。

    范围只到本次写入目标（由 _write_targets 按命令算）：索引 owners.json、自己的
    分片、认领 / 释放涉及的 pool.json，以及 `close` 时结案时间所在的那个月 history
    文件（`--finished` 补录旧月份就刷那个月）——不是整个 history 目录。
    `ledger/worklog/` 的正文由人写：只补「远端有、本地缺」的新文件；本次命令真要
    改写的那几篇（追加执行记录 / 封卷 / 改分类标签）另算，干净就刷成最新、脏了先
    stash 再叠回。本地有会被覆盖掉的东西（未推送提交 / 未提交改动 / 未入库且远端
    同名）就中止，不静默覆盖。
    无 git / 无上游 / 远端尚无该文件 静默跳过；拉取失败只提示不中止。
    """
    if os.environ.get("TASK_LEDGER_NO_SYNC"):
        return
    if action in READ_ONLY_COMMANDS:
        return
    # tags --all 是纯读，不拉取
    if action == "tags" and not getattr(args, "rename", None):
        return
    try:
        repo = find_repo(getattr(args, "repo", None))
    except Fail:
        return
    ledger_dir = repo / "ledger"
    top = _git("git", "-C", str(repo), "rev-parse", "--show-toplevel")
    if top.returncode != 0:
        return
    git_root = Path(top.stdout.strip())
    try:
        ledger_rel = ledger_dir.resolve().relative_to(git_root.resolve()).as_posix()
    except ValueError:
        return  # ledger 不在 git 仓内
    midstate = _git_midstate(str(git_root))
    if midstate:
        raise Fail(
            f"仓库正处于 {midstate} 中间态（有没收尾的冲突），此刻做写前同步和写后提交"
            "都会把台账写进冲突现场，已中止本次操作。\n"
            "  处理：先把这次 merge / rebase 收尾 —— `git merge --continue`、"
            "`git rebase --continue`，要放弃就 `--abort`；然后重跑台账命令。"
        )
    ups = _git("git", "-C", str(git_root), "rev-parse", "--abbrev-ref", "@{upstream}")
    if ups.returncode != 0:
        head = _git("git", "-C", str(git_root), "rev-parse", "--abbrev-ref", "HEAD")
        branch = (head.stdout or "").strip()
        if branch == "HEAD":
            print(
                "提示：当前是 detached HEAD，台账只写本地文件并提交到当前 HEAD，不会推送。\n"
                "  注意：这个提交挂在游离 HEAD 上，一旦 checkout 到别的分支，工作树会回到旧版，"
                "这次的台账写入就看不到了。建议先切回分支再写。",
                file=sys.stderr,
            )
        else:
            print(
                f"提示：分支 {branch or '(未知)'} 没有上游跟踪分支，"
                "台账只提交到本地、不会推送。",
                file=sys.stderr,
            )
        return
    upstream = ups.stdout.strip()
    if "/" not in upstream:
        print(
            f"提示：上游 {upstream} 是本地分支而不是远端分支，无法取最新，已跳过写前同步。",
            file=sys.stderr,
        )
        return
    remote = upstream.split("/", 1)[0]
    try:
        _git("git", "-C", str(git_root), "fetch", remote, timeout=30, check=True)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        print(
            "提示：写前拉取失败（离线 / 无权限 / 超时），将基于本地当前内容写入；"
            "若他人已改动，推送时可能冲突。",
            file=sys.stderr,
        )
        return

    # 本地没有未推送提交时先快进到远端（等价 `pull --ff-only`）。
    # 只覆盖工作树会留个后患：本次写入提交会把「远端新增的内容」当成自己的改动一起提交，
    # 推送被拒后 rebase 与远端那次提交撞车（同一段内容被重放两次）—— 实测必冲突。
    # 有未推送提交就跳过：那是用户自己的时间线，脚本不碰。
    def _rev_count(spec: str) -> int:
        raw = _git_bytes("git", "-C", str(git_root), "rev-list", "--count", spec)
        try:
            return int((raw or b"-1").decode("ascii", "replace").strip())
        except ValueError:
            return -1

    # 本次要改写的 worklog（log / claim / set / close 追加执行记录、close 封卷、
    # tags --rename 改分类标签）。它比台账 JSON 麻烦：「脏」是常态 —— 人手写的
    # 正文就躺在那儿还没提交。
    wl_rels = _presync_worklog_rels(repo, git_root, action, args)

    ahead_n = _rev_count(f"{upstream}..HEAD")
    behind_n = _rev_count(f"HEAD..{upstream}")
    if ahead_n == 0 and behind_n > 0:
        ff = _git(
            "git", "-C", str(git_root), "merge", "--ff-only", "-q", upstream, timeout=30
        )
        if ff.returncode == 0:
            print(
                f"提示：写前把本地快进到 {upstream}（{behind_n} 个提交，仅 fast-forward）。",
                file=sys.stderr,
            )
        else:
            # 不中止：工作区有未提交改动时 ff 必然失败，那是常态，后面还有脏检查兜底。
            # 但必须说出来，否则「为什么没快进」无从查起。
            print(
                f"提示：写前快进到 {upstream} 没成功"
                f"（{_why(ff.stderr or ff.stdout, f'退出码 {ff.returncode}')}），"
                "改为只刷新本次要写的台账文件。",
                file=sys.stderr,
            )
            # 绝大多数 ff 失败就是「worklog 里有手写还没提交的正文」。不处理的话，
            # 后面的写命令会基于旧版改写再写回，把远端那次改动整段写没。
            dirty_wl = [r for r in wl_rels if _is_dirty(str(git_root), r)]
            if dirty_wl and _stash_ff_worklog(str(git_root), upstream, dirty_wl):
                # 已经叠到远端最新上了，别再走下面「没刷最新」的提示
                wl_rels = [r for r in wl_rels if r not in dirty_wl]

    root = str(git_root)
    worklog_rel = f"{ledger_rel}/{WORKLOG_DIR.name}"
    # 只刷「这条命令真的要写」的文件（索引 / 自己的分片 / 池 / 当月的 history）。
    # 由 _write_targets 统一算，避免这里和命令实现各写一份路径规则。
    managed: list[str] = []
    for path in _write_targets(repo, action, args):
        try:
            rel = path.resolve().relative_to(git_root.resolve()).as_posix()
        except ValueError:
            continue  # 不在仓内：跳过（写的时候自有报错）
        if rel not in managed:
            managed.append(rel)
    if not managed:
        # 算不出目标文件（身份拿不到等）：空 pathspec 会让 git 把整仓提交都算进来，
        # 宁可不刷也不能误判成「有未推送的台账提交」。命令自己会把身份问题报出来。
        return

    remote_files = {rel for rel in managed if _remote_exists(root, upstream, rel)}

    # 先查本地有没有会被覆盖掉的东西（尤其未提交改动），必须排在自动补推之前：
    # 补推里的 rebase --autostash 会先把改动收进 stash，abort 后工作树看起来「干净」，
    # 后续覆盖就会把那一版改动弄丢。
    _presync_guard(root, upstream, managed, remote_files, check_ahead=False)

    # 离线攒下的台账提交：联网后第一笔写先把它们推上去，别拿「有 N 个没推」挡住写入。
    # 用户自己的提交一并带走（push 是分支级的），但只提示、不 rebase —— 改写提交号才是越权。
    if ahead_n > 0:
        g_tuple = ("git", "-C", str(git_root))
        foreign_n, _ = _foreign_commits(g_tuple, upstream, ledger_rel)
        pushed = _push(g_tuple, upstream)
        if pushed.returncode != 0 and _rebase_retry(g_tuple, ledger_rel):
            pushed = _push(g_tuple, upstream)
        if pushed.returncode == 0:
            extra = f"（其中 {foreign_n} 个是你自己的提交）" if foreign_n > 0 else ""
            print(
                f"提示：写前把本地 {ahead_n} 个未推送的提交推上去了{extra}。",
                file=sys.stderr,
            )
            ahead_n = 0
        else:
            mid = _git_midstate(str(git_root))
            if mid:
                raise Fail(
                    f"写前合并卡在 {mid} 中间态，处理完才能继续写。\n"
                    "  处理：按上面的提示编辑冲突文件 → `git add` → `git rebase --continue`；"
                    "不想合就 `git rebase --abort` 回到写之前。台账改动已提交在本地。"
                )
            print(
                "提示：写前推送失败"
                f"（{_why(pushed.stderr or pushed.stdout, f'退出码 {pushed.returncode}')}）。",
                file=sys.stderr,
            )

    # 补推后复查：补推失败（多半是本地有你自己的提交，脚本不替你 rebase）时，
    # 这里仍会把「台账提交领先」拦下来，避免写进过期数据。
    _presync_guard(root, upstream, managed, remote_files)

    for rel in remote_files:
        # track=True：刷下来的台账 JSON 要随本次提交入库。命令随后可能一个字段都没改
        # （比如 release 到同状态），那时没有别的改动，这份刷新就会以「未提交改动」
        # 留在工作树里，把下一次写的 guard 挡住。
        _presync_fetch_file(root, upstream, rel, track=True)

    # worklog：只补本地缺的新文件，已有文件（正文由人写）一个字都不碰
    added = 0
    for rel in _remote_dir_files(root, upstream, worklog_rel):
        if (git_root / rel).exists():
            continue
        # track=True：补下来的新文件要随本次提交入库，否则它会一直以未跟踪状态挡在
        # 工作树里（后续 rebase 直接被它挡住）
        if _presync_fetch_file(root, upstream, rel, track=True):
            added += 1
    if added:
        print(
            f"提示：从 {upstream} 补下 {added} 个本地缺的 worklog 文件（没有动已有正文）。",
            file=sys.stderr,
        )

    # 本次要改写的那些 worklog：刷新到远端最新再动笔，与台账 JSON 同一口径。
    # 走到这里还有未提交改动，说明快进和 stash 叠回都没成（冲突已由上面报错中止），
    # 这时只提示不刷 —— 覆盖会吞掉手写内容。
    if behind_n > 0:
        for wl_rel in wl_rels:
            if _is_dirty(root, wl_rel):
                print(
                    f"提示：{wl_rel} 有未提交的手写改动，本次没刷它的最新版本；"
                    "若远端也改过同一处，推送时会让你合并。",
                    file=sys.stderr,
                )
            elif _presync_fetch_file(root, upstream, wl_rel):
                print(
                    f"提示：写前把 {wl_rel} 刷成 {upstream} 的最新版本。",
                    file=sys.stderr,
                )


def require_task_id(tid: str) -> str:
    """任务号会参与拼路径，任何命令拿到它都要先验一遍。"""
    if not ID_RE.fullmatch(tid):
        raise Fail(
            f"任务号 {tid!r} 不合规：只用小写字母、数字、连字符和汉字，且以字母、数字或汉字开头。"
        )
    return tid


def normalize_label(value: str, *, field: str = "分类", tid: str | None = None) -> str:
    """分类 / 标签单值形态校验：拒控制字符与换行（防注入 worklog 头部行）、折叠内部空白。

    含 CJK 按字符数 ≤4；纯 ASCII 按单词数 ≤3 —— 中英混排按字符数卡，逼 Agent 写短。
    """
    where = f"{tid}: " if tid else ""
    if any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise Fail(f"{where}{field}不能含控制字符或换行：{value!r}")
    s = " ".join(value.split())
    if not s:
        raise Fail(f"{where}{field}不能为空。")
    if CJK_RE.search(s):
        if len(s) > LABEL_MAX_CHARS:
            raise Fail(
                f"{where}{field}「{s}」超长：含中文按字符数最多 {LABEL_MAX_CHARS} 个。"
            )
    elif len(s.split()) > LABEL_MAX_WORDS_EN:
        raise Fail(
            f"{where}{field}「{s}」超长：纯英文按单词数最多 {LABEL_MAX_WORDS_EN} 个。"
        )
    return s


def _tags_arg(raw: str | None) -> str | None:
    """`--tags ""` / `--tags "  "` 一律当「没传」（0 个标签就是留空，不是写个空标签）。"""
    if raw is None:
        return None
    return raw if raw.strip() else None


def parse_tags_arg(raw: str | None, *, field: str = "标签") -> list[str]:
    """命令行上的 `--tags`：空白串一律当「没传」（留空 = 不传，不是写个空标签）。"""
    text = _tags_arg(raw)
    return parse_tags(text, field=field) if text else []


def parse_tags(raw: str, *, field: str = "标签", tid: str | None = None) -> list[str]:
    """标签串 → 列表：逗号 / 顿号切分（**不按空格**——空格留给英文多词标签自身），
    去空、去重保序；数量 ≤5，逐个过 normalize_label。"""
    where = f"{tid}: " if tid else ""
    tags: list[str] = []
    for part in re.split(r"[,，、]", raw):
        if not part.strip():
            continue
        tag = normalize_label(part, field=field, tid=tid)
        if tag not in tags:
            tags.append(tag)
    if not tags:
        raise Fail(f"{where}{field}不能为空。")
    if len(tags) > TAGS_MAX_COUNT:
        raise Fail(
            f"{where}{field}最多 {TAGS_MAX_COUNT} 个，收到 {len(tags)} 个：{'、'.join(tags)}"
        )
    return tags


def esc_cell(text: str) -> str:
    """表格单元格：折叠空白并转义竖线，避免把历史表格写坏。"""
    return " ".join(text.split()).replace("|", "\\|")


def owner_cell(owner: str | None) -> str:
    """owner 列的展示值：人名前加 @（一眼看出这是个人），空给空串。

    @ 只是展示层约定：存储（台账 JSON）与 --owner 匹配始终用裸标识，
    parse_history 读回来时会把 @ 剥掉。
    """
    return f"@{owner}" if owner else ""


def creator_cell(creator: str | None) -> str:
    """creator 列展示值（与 owner_cell 同一 @ 约定）。"""
    return f"@{creator}" if creator else ""


def history_line(
    finished: str,
    created: str | None,
    title: str,
    owner: str | None,
    summary: str,
    log_rel: str,
    category: str | None = None,
    tags: list[str] | None = None,
    creator: str | None = None,
) -> str:
    """历史层的一行（9 列：结案时间 / 创建时间 / 工作包 / 分类 / 标签 / owner / creator / 完成了什么 / 过程文档）。

    close 专用，避免两处格式漂移。owner / creator 是独立列、单独过 esc_cell ——
    它们来自 git 身份（新数据是邮箱，旧数据是 user.name），含 `|` 也不稀奇。分类/标签由 close 传 task 终值。
    """
    cat_cell = esc_cell(category or "")
    tag_cell = esc_cell("、".join(tags) if tags else "")
    return (
        f"| {finished} | {created or ''} | {esc_cell(title)} | {cat_cell} | {tag_cell} "
        f"| {esc_cell(owner_cell(owner))} | {esc_cell(creator_cell(creator))} "
        f"| {esc_cell(summary)} | [{log_rel}]({log_rel}) |\n"
    )


def history_line_for_cols(
    cols: int,
    finished: str,
    created: str | None,
    title: str,
    owner: str | None,
    summary: str,
    log_rel: str,
    category: str | None = None,
    tags: list[str] | None = None,
    creator: str | None = None,
) -> str:
    """「历史层有无法解析的行、不敢整体升级」时，按现有列数追加一行，避免列错位。

    GFM 按首行列数渲染，列数写错会被静默丢弃 / 错位。cols<=4 ⇒ 旧 4 列（owner 缝在
    工作包末尾）；5 ⇒ 无创建时间列；6 ⇒ 无分类/标签列（存量改造前的最后形态）；
    否则 9 列。分类/标签/creator 只在 9 列里出现 —— 少列的文件硬塞会把整行挤歪。
    """
    if cols <= 4:
        who = f" @{owner}" if owner else ""
        return (
            f"| {finished} | {esc_cell(title + who)} | {esc_cell(summary)} "
            f"| [{log_rel}]({log_rel}) |\n"
        )
    if cols == 5:
        return (
            f"| {finished} | {esc_cell(title)} | {esc_cell(owner_cell(owner))} "
            f"| {esc_cell(summary)} | [{log_rel}]({log_rel}) |\n"
        )
    if cols == 6:
        return (
            f"| {finished} | {created or ''} | {esc_cell(title)} "
            f"| {esc_cell(owner_cell(owner))} | {esc_cell(summary)} | [{log_rel}]({log_rel}) |\n"
        )
    return history_line(
        finished, created, title, owner, summary, log_rel, category, tags, creator
    )


def history_cols(text: str) -> int:
    """现有历史表格数据行的列数（取众数、平局取较大）；无数据行时按 6。"""
    counts: dict[int, int] = {}
    for raw in text.splitlines():
        if not raw.strip().startswith("|"):
            continue
        cells = split_row(raw)
        if not cells or _is_sep_row(cells) or _looks_like_header(cells):
            continue
        n = len(cells)
        if n >= 4:
            counts[n] = counts.get(n, 0) + 1
    if not counts:
        return 6
    return max(counts, key=lambda k: (counts[k], k))


# 旧行切 owner：最右一个「空格 + @」之后的整段是 owner（owner 可含空格，git user.name 合法）。
# 要求 @ 前有空白 ⇒ 标题里的 `rulemux@0.1.0` 不会误伤；贪婪 title 保证最后一个「 @」赢。
HISTORY_OLD_OWNER_RE = re.compile(r"^(?P<title>.*\S)\s+@(?P<owner>\S.*)$")


def split_row(line: str) -> list[str]:
    """按 | 切表格行。反顾后视让转义竖线 \\| 不当分隔符；切完再反转义、去首尾空单元。"""
    cells = re.split(r"(?<!\\)\|", line.strip())
    if cells and cells[0] == "":
        cells = cells[1:]
    if cells and cells[-1] == "":
        cells = cells[:-1]
    return [c.strip().replace("\\|", "|") for c in cells]


def _is_sep_row(cells: list[str]) -> bool:
    return bool(cells) and all(re.fullmatch(r":?-+:?", c) for c in cells)


def _looks_like_header(cells: list[str]) -> bool:
    # 按内容判、不按位置判：无表头的老文件首行就是数据，位置判断会把第一条记录当表头删掉。
    # v6 表头首列是「结案时间」，「工作包」在第 3 列；v4/v5 首列是「时间」、「工作包」在第 2 列。
    return bool(cells) and (cells[0] in ("时间", "结案时间") or "工作包" in cells[:3])


def parse_history(text: str) -> tuple[list[dict[str, Any]], list[str]]:
    """解析历史层，返回 (records, warnings)。

    多格式兼容：9 列 = v9（结案时间 / 创建时间 / 工作包 / 分类 / 标签 / owner / creator / …）；
    8 列 = v8（存量改造后、2026-10-17 前，无 creator）；6 列 = v6
    （存量改造前最后形态，无分类/标签）；5 列且第 2 列是时间 = 旧 ledger 格式
    （有创建时间列、无 owner 列）；5 列 = 无创建时间列；4 列 = 最旧（owner 缝在工作包末尾）。
    **逐行按自己的列数判别**，表头只用来跳过 —— 旧文件追加新列
    后是混排态，按表头判列数会切错。坏行（列数不在 4/5/6/8/9、时间列不合法）不中断：跳过 + 警告。
    8 列行无 creator 列 ⇒ creator 留 None，cmd_history 回链 worklog 头部「创建」行补（与 created 同源）。
    """
    records: list[dict[str, Any]] = []
    warnings: list[str] = []
    for lineno, raw in enumerate(text.splitlines(), 1):
        if not raw.strip().startswith("|"):
            continue
        cells = split_row(raw)
        if not cells or _is_sep_row(cells) or _looks_like_header(cells):
            continue
        created = ""
        category: str | None = None
        tags: list[str] = []
        creator: str | None = None
        if len(cells) == 9:
            (
                finished,
                created,
                workpackage,
                category,
                tag_cell,
                owner,
                creator,
                summary,
                doc,
            ) = cells
            fmt = "v9"
            category = category.strip() or None
            tags = [t.strip() for t in re.split(r"[,，、]", tag_cell) if t.strip()]
            creator = creator.strip().removeprefix("@") or None
        elif len(cells) == 8:
            finished, created, workpackage, category, tag_cell, owner, summary, doc = (
                cells
            )
            fmt = "v8"
            category = category.strip() or None
            tags = [t.strip() for t in re.split(r"[,，、]", tag_cell) if t.strip()]
            # 旧 8 列无 creator 列：留 None，cmd_history 回链 worklog 头部补（不丢）
        elif len(cells) == 6:
            finished, created, workpackage, owner, summary, doc = cells
            fmt = "v6"
        elif len(cells) == 5 and TIME_RE.fullmatch(cells[1]):
            # 旧 ledger 格式（结案时间 / 创建时间 / 工作包 / 摘要 / 过程文档）：无 owner 列。
            # 与下面的 v5（无创建时间列、owner 缝在中间）靠「第 2 列是不是时间」区分 ——
            # v5 的第 2 列是工作包（标题），不会是时间，判别无歧义。
            finished, created, workpackage, summary, doc = cells
            owner = ""
            fmt = "v5ledger"
        elif len(cells) == 5:
            finished, workpackage, owner, summary, doc = cells
            fmt = "v5"
        elif len(cells) == 4:
            finished, workpackage, summary, doc = cells
            m = HISTORY_OLD_OWNER_RE.match(workpackage)
            if m:
                workpackage, owner = m.group("title"), m.group("owner")
            else:
                owner = ""
            fmt = "v4"
        else:
            warnings.append(f"第 {lineno} 行列数不是 4 / 5 / 6 / 8 / 9，已跳过")
            continue
        if not TIME_RE.fullmatch(finished):
            warnings.append(f"第 {lineno} 行时间列 {finished!r} 不合法，已跳过")
            continue
        m = re.fullmatch(r"\[[^\]]*\]\(([^)]*)\)", doc)
        log = m.group(1) if m else doc
        # 展示层写入带 @；存储与匹配一律裸名字
        own = (owner or "").strip().removeprefix("@")
        records.append(
            {
                "time": finished,
                "created": time_key(created) if created else None,
                "workpackage": workpackage,
                "category": category,
                "tags": tags,
                "owner": own or None,
                "creator": creator,
                "summary": summary,
                "log": log or None,
                "fmt": fmt,
                "line": lineno,
            }
        )
    return records, warnings


# worklog 头部「创建」行：`> **创建**：2026-10-06 00:00（@某人）`。
# 时间给旧历史行回填创建时间；括号内 @某人 即 creator（发起人）。
WORKLOG_CREATED_RE = re.compile(
    r"^\s*>\s*\*\*创建\*\*\s*[：:]\s*"
    r"(\d{4}-\d{2}-\d{2}(?: +\d{1,2}:\d{1,2}(?::\d{1,2})?)?)"
)
# 同一行的发起人（@某人）——creator 列来源。
WORKLOG_CREATOR_RE = re.compile(r"^\s*>\s*\*\*创建\*\*\s*[：:].*?（@(.+?)）")


def created_for_history(log_cell: str, history_path: Path) -> str | None:
    """顺着历史行的文档链接找到 worklog，读它头部「创建」行的时间；找不到返回 None。

    链接相对历史文件所在目录解析：存量平铺文件里是 `worklog/…`，按月文件里是 `../worklog/…`。
    """
    m = re.fullmatch(r"\[[^\]]*\]\(([^)]*)\)", log_cell.strip())
    rel = (m.group(1) if m else log_cell).strip()
    if not rel:
        return None
    try:
        text = (history_path.parent / rel).read_text(encoding="utf-8-sig")
    except (OSError, UnicodeDecodeError):
        return None
    for ln in text.splitlines():
        mm = WORKLOG_CREATED_RE.match(ln)
        if mm:
            try:
                return normalize_time(mm.group(1), field="创建")
            except Fail:
                return None
    return None


def creator_for_history(log_cell: str | None, history_path: Path) -> str | None:
    """顺着历史行的文档链接找到 worklog，读它头部「创建」行的发起人（@某人）；找不到返回 None。

    旧 8 列历史行没有 creator 列，迁移 / 只读回填都靠它 —— 与 created 同源，不丢数据。
    """
    if not log_cell:
        return None
    m = re.fullmatch(r"\[[^\]]*\]\(([^)]*)\)", log_cell.strip())
    rel = (m.group(1) if m else log_cell).strip()
    if not rel:
        return None
    try:
        text = (history_path.parent / rel).read_text(encoding="utf-8-sig")
    except (OSError, UnicodeDecodeError):
        return None
    for ln in text.splitlines():
        mm = WORKLOG_CREATOR_RE.match(ln)
        if mm:
            return mm.group(1).strip()
    return None


def labels_for_log(
    log_cell: str | None, history_path: Path
) -> tuple[str | None, list[str]]:
    """顺着历史行的文档链接找 worklog，解析头部「分类/标签」行；读不到返回空。

    接受纯路径或 markdown 链接单元格（`[x](y)`）—— cmd_history 传解好的路径，
    upgrade_history 传原始单元格，两处都走这里。
    """
    if not log_cell:
        return (None, [])
    m = re.fullmatch(r"\[[^\]]*\]\(([^)]*)\)", log_cell.strip())
    rel = (m.group(1) if m else log_cell).strip()
    if not rel:
        return (None, [])
    try:
        text = (history_path.parent / rel).read_text(encoding="utf-8-sig")
    except (OSError, UnicodeDecodeError):
        return (None, [])
    return parse_label_line(text)


def upgrade_history(text: str, history_path: Path) -> tuple[str, int] | None:
    """旧格式（4 / 5 / 6 / 8 列）→ v9（9 列）。全部数据行可解析才返回 (新文本, 转换行数)，否则 None。

    None 的语义是「不敢动」：调用方必须退回按原列数追加并明示，绝不半升级、绝不猜。
    分类/标签列：回链每行的 worklog 头部读「分类/标签」行（读不到留空，不编造）——
    与 created 的回填同一模式，依赖 Step 2 已给存量 worklog 补行。
    creator 列（2026-10-17 加）：旧 8 列无此列，同样回链 worklog 头部「创建」行的
    （@发起人）补 —— **与 created 同源，迁移不丢发起人**。读不到留空。
    缺创建时间的旧行：先读它链接的 worklog 头部「创建」行，找不到用升级时刻 —— 不允许留空。
    5 列有两种（判别与 parse_history 一致，靠「第 2 列是不是时间」）：旧 ledger 格式
    （结案 / 创建 / 工作包 / 摘要 / 文档，无 owner）行内自带创建时间，优先用它；
    v5（结案 / 工作包 / owner / 摘要 / 文档，无创建时间）才去 worklog 头找。
    只重排表格行；标题、空行、表头外的散文原样保留。
    history_path 只用于按文件所在目录解析文档链接。
    """
    fallback = now()
    out: list[str] = []
    converted = 0
    # 表头只留一份：union 合并 / 手工拼接会留下两份表头，两份都留着会被 GFM 当数据行渲染
    seen_header = False
    seen_sep = False
    for raw in text.splitlines():
        if not raw.strip().startswith("|"):
            out.append(raw)
            continue
        cells = split_row(raw)
        if not cells:
            out.append(raw)
            continue
        if _is_sep_row(cells):
            if seen_sep:
                _drop_trailing_blank(out)  # 拼接处的空行一并去掉，否则表格会被空行截断
                continue
            seen_sep = True
            out.append(HISTORY_SEP)
            continue
        if _looks_like_header(cells):
            if seen_header:
                _drop_trailing_blank(out)
                continue
            seen_header = True
            out.append(HISTORY_HEADER)
            continue
        if len(cells) == 9:
            # v9 行原样回写：已含 creator
            if time_key(cells[0]) is None:
                return None
            out.append("| " + " | ".join(cells) + " |")
            continue
        explicit_created: str | None = None
        creator: str | None = None
        if len(cells) == 8:
            # v8 → v9：补 creator 列（回链 worklog 头部「创建」行的 @发起人；读不到留空不编造）
            finished, created, workpackage, category, tag_cell, owner, summary, doc = (
                cells
            )
            if time_key(finished) is None:
                return None
            created_key = time_key(created.strip())
            cat = category.strip() or None
            tags = [t.strip() for t in re.split(r"[,，、]", tag_cell) if t.strip()]
            creator = creator_for_history(doc, history_path) or ""
            out.append(
                f"| {finished} | {created_key or ''} | {esc_cell(workpackage)} "
                f"| {esc_cell(cat or '')} | {esc_cell('、'.join(tags) if tags else '')} "
                f"| {esc_cell(owner_cell(owner.lstrip('@')))} | {esc_cell(creator_cell(creator))} "
                f"| {esc_cell(summary)} | {doc} |"
            )
            converted += 1
            continue
        if len(cells) == 6:
            finished, created, workpackage, owner, summary, doc = cells
            # v6 升级：owner 单元格已是展示格式（带 @），剥掉再走 owner_cell，否则升级出 @@
            owner = owner.lstrip("@")
            explicit_created = time_key(created.strip())
        elif len(cells) == 5 and TIME_RE.fullmatch(cells[1]):
            # 旧 ledger 格式（结案时间 / 创建时间 / 工作包 / 摘要 / 过程文档）：无 owner 列。
            # 与下面的 v5（无创建时间列、owner 缝在中间）靠「第 2 列是不是时间」区分 ——
            # v5 的第 2 列是工作包（标题），不会是时间，判别无歧义。
            finished, created_cell, workpackage, summary, doc = cells
            owner = ""
            explicit_created = time_key(created_cell.strip())
        elif len(cells) == 5:
            finished, workpackage, owner, summary, doc = cells
            # v5 行 owner 列可能已是展示格式（带 @），剥掉再走 owner_cell，否则升级出 @@
            owner = owner.lstrip("@")
        elif len(cells) == 4:
            finished, workpackage, summary, doc = cells
            m = HISTORY_OLD_OWNER_RE.match(workpackage)
            owner = m.group("owner") if m else ""
            if m:
                workpackage = m.group("title")
        else:
            return None
        finished_key = time_key(finished)
        if finished_key is None:
            return None
        created = explicit_created or created_for_history(doc, history_path) or fallback
        cat, tags = labels_for_log(doc, history_path)
        creator = creator_for_history(doc, history_path) or ""
        out.append(
            f"| {finished_key} | {created} | {esc_cell(workpackage)} "
            f"| {esc_cell(cat or '')} | {esc_cell('、'.join(tags) if tags else '')} "
            f"| {esc_cell(owner_cell(owner))} | {esc_cell(creator_cell(creator))} "
            f"| {esc_cell(summary)} | {doc} |"
        )
        converted += 1
    return "\n".join(out) + "\n", converted


# ---------- 历史层：按结案时间分月归档 ----------


def history_path_for(repo: Path, finished: str) -> Path:
    """结案时间（YYYY-MM-DD HH:MM:SS）→ ledger/history/<YYYYMM>.md。

    与 worklog 的 ledger/worklog/<年月>/ 同构：一个按创建月、一个按结案月。
    """
    month = re.sub(r"[^0-9]", "", finished[:7])[:6]
    if len(month) != 6:
        raise Fail(f"结案时间 {finished!r} 取不到年月，无法路由历史文件。")
    return repo / HISTORY_DIR / f"{month}.md"


def history_sources(repo: Path) -> list[Path]:
    """全部历史来源（读侧用）：存量平铺文件 + ledger/history/*.md，按路径排序。

    存量文件只读 —— 写侧永远不碰它，它停在原地、链接基准（相对 ledger/）不变。
    """
    paths: list[Path] = []
    legacy = repo / HISTORY_REL
    if legacy.exists():
        paths.append(legacy)
    hdir = repo / HISTORY_DIR
    if hdir.is_dir():
        paths.extend(sorted(p for p in hdir.glob("*.md") if p.is_file()))
    return paths


# 数行计数的封顶值（2026-10-17 为 dsh-task-ledger 看板统计卡新增）：显示级统计封顶，
# 超出即 capped，精确值走 history --json / 列表。
COUNT_CAP = 10000


def history_row_count(
    sources: list[Path], since: str | None, until: str | None, cap: int = COUNT_CAP
) -> dict[str, Any]:
    """数行计数（只读；2026-10-17 新增，服务看板「本周 / 近一年完成」统计卡）。

    只数数据行（`| 2` 开头 = 结案时间以年份开头），到 cap 封顶返回 capped=True。
    给了 since/until 时按创建时间列（第 2 列）粗筛——取日期部分做字符串比较
    （ISO 日期字典序即时间序），不建对象、不判格式，比 parse_history 便宜一个量级。
    ⚠️ 显示级统计：坏行 / 旧格式行可能多数少数，精确数以 history --json 为准。
    """
    since_d = (since or "")[:10]
    until_d = (until or "")[:10]
    total = 0
    for hp in sources:
        try:
            text = hp.read_text(encoding="utf-8-sig")
        except (OSError, UnicodeDecodeError):
            continue
        for line in text.splitlines():
            if not line.startswith("| 2"):
                continue
            if since_d or until_d:
                cells = line.split("|")
                if len(cells) < 4:
                    continue
                created = cells[2].strip()[:10]
                if since_d and created < since_d:
                    continue
                if until_d and created > until_d:
                    continue
            total += 1
            if total >= cap:
                return {"count": total, "capped": True}
    return {"count": total, "capped": False}


def worklog_link(log_path: Path, history_path: Path) -> str:
    """worklog 相对历史文件所在目录的 posix 链接。

    存量平铺文件得 `worklog/<月>/<文件>.md`；按月文件得 `../worklog/<月>/<文件>.md`
    —— 链接跟着所在文件走，两边都可点击、可解析。
    """
    return os.path.relpath(log_path, history_path.parent).replace(os.sep, "/")


def append_history_line(
    history_path: Path,
    finished: str,
    created: str | None,
    title: str,
    owner: str | None,
    summary: str,
    log_rel: str,
    category: str | None = None,
    tags: list[str] | None = None,
    creator: str | None = None,
) -> tuple[str, int, bool]:
    """把一行历史追加到指定历史文件，返回 (新全文, 升级行数, 是否已存在)。

    读目标 → upgrade_history → 解析不了就按现有列数追加（绝不把 9 列写进少列表头）
    → 文件不存在则带 9 列表头新建。close 专用：「行落哪个月」之外，
    历史行的落盘逻辑只此一处。分类/标签/creator 由 close 传 task 终值。

    幂等键 = 过程文档路径（任务号 + 随机码，天然唯一）：`close` 崩在「历史已写、
    分片未删」之后重跑，同一篇文档对应的行不再追加第二条。
    """
    if not history_path.exists():
        return (
            f"{HISTORY_TITLE}\n\n{HISTORY_HEADER}\n{HISTORY_SEP}\n"
            + history_line(
                finished,
                created,
                title,
                owner,
                summary,
                log_rel,
                category,
                tags,
                creator,
            ),
            0,
            False,
        )
    try:
        text = history_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        raise Fail(f"读不了 {history_path}：{exc}")
    # 幂等：这一篇过程文档已经有一行了（多半是上次崩在「历史写完、任务没删」）
    want = Path(log_rel).name
    rows, _warns = parse_history(text)
    if any((r.get("log") or "").endswith(want) for r in rows):
        return text, 0, True
    if not text.endswith("\n"):
        text += "\n"
    upgraded = upgrade_history(text, history_path)
    if upgraded is None:
        # 有解析不了的行：不升级、不猜，退回「按现有列数」追加
        print(
            f"警告：{history_path.name} 有无法解析的行，未做格式升级，本次按现有列数追加。",
            file=sys.stderr,
        )
        return (
            text
            + history_line_for_cols(
                history_cols(text),
                finished,
                created,
                title,
                owner,
                summary,
                log_rel,
                category,
                tags,
                creator,
            ),
            0,
            False,
        )
    new_text, n = upgraded
    return (
        new_text
        + history_line(
            finished, created, title, owner, summary, log_rel, category, tags, creator
        ),
        n,
        False,
    )


def slugify(title: str) -> str:
    """任务号用：保留 ASCII 字母数字与中文汉字，其余转连字符。"""
    s = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "-", title.strip().lower())
    return s.strip("-")[:40].strip("-")


def id_stamp(created: str) -> str:
    """从 created（YYYY-MM-DD HH:MM:SS）取任务号前缀 YYYYMMDD-HHMM（任务号只到分）。"""
    return (
        f"{created[0:4]}{created[5:7]}{created[8:10]}-{created[11:13]}{created[14:16]}"
    )


def make_id(title: str, tasks: dict[str, Any], created: str | None = None) -> str:
    slug = slugify(title)
    if not slug:
        raise Fail(
            "标题里没有可用字符（字母、数字或汉字），无法自动生成任务号。"
            f'用 --id 指定一个，例如 --id "task-{secrets.token_hex(2)}"。'
        )
    # 前置创建时间：年月日-时分（任务号 / 文件名只到分，与记录时间到秒分开）。随机码不能省
    # —— make_id 只在在办任务里去重，而 worklog 结案后仍留在磁盘上，去掉随机码会让新任务与
    # 已结案的过程文档同名、覆盖历史。
    stamp = id_stamp(created or now())
    for _ in range(20):
        tid = f"{stamp}-{slug}-{secrets.token_hex(2)}"
        if tid not in tasks:
            return tid
    raise Fail("任务号连续冲突 20 次，请检查台账是否异常。")


def load_task(repo: Path, tid: str) -> dict[str, Any]:
    """按任务号在 pool + 索引登记的全部分片里找（只读）。

    `show` 要的是「这条任务现在在哪」，与 `list` 的默认范围不同 —— 别人的任务
    也得能看，所以这里按索引全扫一遍。
    """
    found: dict[str, Any] | None = None
    where: list[str] = []
    for path in (repo / POOL_REL, *registered_shards(repo).values()):
        task = tasks_in(path).get(tid)
        if task is not None:
            found = task  # 后读为准，与 list 的取舍保持一致
            where.append(path.relative_to(repo).as_posix())
    if found is not None:
        if len(where) > 1:
            # 同号两处：搬文件崩在中途或有人手改过。显示一份，但必须说出来。
            print(
                "提示：任务号 "
                + tid
                + " 在多个文件里出现（"
                + "、".join(where)
                + "），这里显示最后读到的那份；跑 validate 看全貌。",
                file=sys.stderr,
            )
        return found
    raise Fail(
        f"没有任务 {tid}（在 pool.json 与所有已登记分片里都没找到；"
        "可能已被结案或删除）。用 list 看现有任务。"
    )


def require_owner(task: dict, tid: str, me: str) -> None:
    """只有当前 owner 能变更该任务；owner 取变更前的值，不放行就报错。"""
    owner = task.get("owner")
    if not owner:
        status = task.get("status")
        if status == "open":
            raise Fail(f"任务 {tid} 还没人认领（open）。先认领再操作：claim --id {tid}")
        raise Fail(
            f"任务 {tid} 的 status 是 {status} 却没有 owner，台账不一致。先跑 validate。"
        )
    if owner != me:
        raise Fail(
            f"任务 {tid} 的 owner 是 {owner}，不是你（{me}）。\n"
            f"要接手只能走「释放 → 认领」：让 {owner} 自己释放"
            f"（set --id {tid} --status open），你再 claim；不要替别人改名。"
        )


# 头部「分类/标签」行（label_line 生成、parse_label_line 解析，两处共用一个格式）：
# `> **分类**：缺陷修复 ｜ **标签**：镜像拉取、Hindsight`
LABEL_CAT_RE = re.compile(r"分类\*\*\s*[：:]\s*([^｜|]+)")
LABEL_TAG_RE = re.compile(r"标签\*\*\s*[：:]\s*(.+)$")


def label_line(category: str | None, tags: list[str] | None) -> str:
    """worklog 头部的「分类/标签」行；两者皆空返回空串（此行不写）。"""
    segs = []
    if category:
        segs.append(f"**分类**：{category}")
    if tags:
        segs.append(f"**标签**：{'、'.join(tags)}")
    return "> " + " ｜ ".join(segs) if segs else ""


def _insert_after_head(lines: list[str], line: str) -> list[str]:
    """把一行插到「创建」行之后（头部引用块内）；找不到创建行就插标题后。"""
    at = next((i for i, ln in enumerate(lines) if WORKLOG_CREATED_RE.match(ln)), None)
    if at is None:
        at = 1 if lines and lines[0].startswith("# ") else 0
    lines.insert(at + 1, line)
    return lines


def parse_label_line(text: str) -> tuple[str | None, list[str]]:
    """从 worklog 头部（第一个 `## ` 小节之前）解析「分类/标签」行；解析不到返回空。"""
    for ln in text.splitlines():
        if ln.startswith("## "):
            break
        mc = LABEL_CAT_RE.search(ln)
        mt = LABEL_TAG_RE.search(ln)
        if not (mc or mt):
            continue
        cat = mc.group(1).strip() if mc else None
        tags = (
            [t.strip() for t in re.split(r"[,，、]", mt.group(1).strip()) if t.strip()]
            if mt
            else []
        )
        return (cat or None, tags)
    return (None, [])


def rewrite_label_line(text: str, category: str | None, tags: list[str]) -> str:
    """改写 worklog 头部的「分类/标签」行：有就地替换，没有就插到创建行后（close 覆盖用）。"""
    line = label_line(category, tags)
    lines = text.splitlines()
    for i, ln in enumerate(lines):
        if ln.startswith("## "):
            break
        if LABEL_CAT_RE.search(ln) or LABEL_TAG_RE.search(ln):
            if line:
                lines[i] = line
            else:
                del lines[i]
            return "\n".join(lines) + "\n"
    if not line:
        return text
    return "\n".join(_insert_after_head(lines, line)) + "\n"


def render_worklog(tid: str, task: dict[str, Any]) -> str:
    template = FALLBACK_TEMPLATE
    try:
        if WORKLOG_TEMPLATE.exists():
            template = WORKLOG_TEMPLATE.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        template = FALLBACK_TEMPLATE
    text = (
        template.replace("<id>", tid)
        .replace("<title>", task.get("title") or "")
        .replace("<created>", task.get("created") or "")
        .replace("<creator>", task.get("creator") or "")
    )
    # 分类/标签行走动态插入（不占模板占位符）：两个模板都不用改，空值时自动不写行
    meta = label_line(task.get("category"), task.get("tags") or [])
    if not meta:
        return text
    return "\n".join(_insert_after_head(text.splitlines(), meta)) + "\n"


def worklog_dir_for(task: dict[str, Any]) -> Path:
    """按月归档目录：ledger/worklog/<YYYYMM>/。取任务创建月份，取不到就退回当前月。"""
    created = (task.get("created") or "").strip()
    month = re.sub(r"[^0-9]", "", created[:7])[:6]
    if len(month) != 6:
        month = re.sub(r"[^0-9]", "", now()[:7])[:6]
    return WORKLOG_DIR / month


def worklog_name(tid: str) -> str:
    """过程文档的文件名：任务号剥掉前缀的年月（YYYYMM）。

    父目录 worklog/<YYYYMM>/ 已经带了年月，文件名里再写一遍是冗余，所以只留
    日-时分-说明-随机码：任务号 20261006-0000-doc-arch-review-7a3c（前 8 位
    是年月日）得到 06-0000-doc-arch-review-7a3c.md。随机码保留：结案文件长期
    留在磁盘上，同一分钟内建两个同标题任务仍要能不撞名。
    自定义 --id 不以「8 位数字-」开头时，文件名就是任务号本身。
    """
    if len(tid) > 9 and tid[:8].isdigit() and tid[8] == "-":
        return f"{tid[6:]}.md"
    return f"{tid}.md"


def worklog_rel(tid: str, task: dict[str, Any]) -> str:
    """过程文档相对 ledger/ 的路径。任务对象记它，历史层也记它，两处同口径。"""
    return (
        (worklog_dir_for(task) / worklog_name(tid))
        .relative_to(WORKLOG_DIR.parent)
        .as_posix()
    )


def find_worklog(
    repo: Path, tid: str, task: dict[str, Any] | None = None
) -> Path | None:
    """定位任务的过程文档。

    先信任务对象里记的路径（记了就不猜）；没记再按新命名推算；最后回退到
    「文件名就是任务号」的老命名，并兼顾平铺旧位置 —— 规则改动前建的文件
    留在原地不动，照样能读能封卷。
    """
    if task:
        recorded = task.get("worklog")
        if recorded:
            cand = repo / WORKLOG_DIR.parent / recorded
            if cand.exists():
                return cand
    parent = repo / WORKLOG_DIR
    names = (worklog_name(tid), f"{tid}.md")
    dirs = [parent]
    if parent.is_dir():
        dirs += [d for d in sorted(parent.iterdir()) if d.is_dir()]
    for d in dirs:
        for name in names:
            cand = d / name
            if cand.exists():
                return cand
    return None


def exec_line(when: str, who: str | None, kind: str, note: str) -> str:
    """一条执行记录：`- 时间 · 类型 · @某人 · 说明`。

    类型取脚本子命令名（new / claim / set / log / close），纯 ASCII、可 grep 统计；
    记录只追加不改写 —— 移交后旧记录仍记在原来那个人名下。
    """
    head = f"- {when} · {kind}"
    return f"{head} · @{who} · {note}" if who else f"{head} · {note}"


def append_exec_log(text: str, line: str) -> str:
    """把一条记录追加到「执行记录」节末尾。

    升级前建的老 worklog 没有这一节：在文末补一节再写（不迁移正文，也不让记录静默丢掉）。
    """
    lines = text.splitlines()
    at = next((i for i, ln in enumerate(lines) if ln.strip() == EXEC_HEAD), None)
    if at is None:
        # 只去文末多余空行：正文最后一行的行尾空格是人家写的，别顺手抹掉
        return text.rstrip("\n") + f"\n\n{EXEC_HEAD}\n\n{EXEC_HINT}\n\n{line}\n"
    end = next(
        (i for i in range(at + 1, len(lines)) if lines[i].startswith("## ")), len(lines)
    )
    # 同一条记录已经在节里了就跳过：close 崩在「文档已封卷、分片未删」之后重跑，
    # 时间与内容逐字相同，重复追加等于伪造时间线。
    if any(lines[i].strip() == line.strip() for i in range(at + 1, end)):
        return text
    insert = end
    while insert > at + 1 and not lines[insert - 1].strip():
        insert -= 1
    lines.insert(insert, line)
    return "\n".join(lines) + "\n"


def record_exec(
    repo: Path, tid: str, task: dict[str, Any], who: str | None, kind: str, note: str
) -> bool:
    """给任务的过程文档补一条执行记录（`who` = 这次动手的人，不是任务现 owner）。

    返回是否真的落盘；`log` 用它判断要不要报错。调用方必须已经持有 progress_lock ——
    与 close 的封卷（读全文→改写→落盘）互斥，否则两条记录并发追加会互相覆盖。
    """
    log = find_worklog(repo, tid, task)
    if log is None:
        return False
    try:
        text = log.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return False
    line = exec_line(now(), who, kind, note)
    try:
        write_text_atomic(log, append_exec_log(text, line))
    except OSError:
        return False
    return True


def write_worklog(repo: Path, tid: str, task: dict[str, Any]) -> Path:
    log = repo / worklog_dir_for(task) / worklog_name(tid)
    write_text_atomic(log, render_worklog(tid, task))
    return log


def worklog_is_skeleton(repo: Path, tid: str, task: dict[str, Any]) -> bool:
    """正文是否还是模板骨架（「执行记录」之前只剩标题、引用行和注释占位）。

    读不到文件返回 False（那是别处要报的错，不在这里重复）。只做体检、不改盘。
    """
    log = find_worklog(repo, tid, task)
    if log is None:
        return False
    try:
        text = log.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return False
    in_comment = False
    for line in text.splitlines():
        s = line.strip()
        if s == EXEC_HEAD:
            break
        if in_comment:
            if "-->" in s:
                in_comment = False
            continue
        if s.startswith("<!--"):
            in_comment = "-->" not in s
            continue
        if not s or s.startswith(("#", ">")):
            continue
        return False
    return True


def print_worklog(repo: Path, tid: str, task: dict[str, Any] | None = None) -> None:
    """把该任务的过程文档全文打出来；读不到只提示，不拖垮主操作。"""
    log = find_worklog(repo, tid, task)
    if log is None:
        print(
            f"\n--- 缺少 {WORKLOG_DIR}/<年月>/{worklog_name(tid)}（跑 validate 看看） ---"
        )
        return
    try:
        body = log.read_text(encoding="utf-8").rstrip()
    except (OSError, UnicodeDecodeError) as exc:
        print(f"\n--- 读不了 {log.relative_to(repo)}：{exc} ---", file=sys.stderr)
        return
    print(f"\n--- {log.relative_to(repo)} ---")
    print(body)
    print("--- 以上是该任务的过程文档，直接编辑这个文件即可 ---")


def stamp_frozen(text: str, finished: str, finisher: str | None = "") -> str:
    """把 worklog 标成已封卷：封卷标记并进头部引用块。

    已经封过卷就原样返回：`close` 崩在「文档已封卷、分片未删」之后重跑会再进来一次，
    再插一条就是两个封卷时间。
    """
    if FROZEN_MARK in text:
        return text
    lines = text.splitlines()
    who = f"（@{finisher}）" if finisher else ""
    marker = f"> **{FROZEN_MARK}**：{finished}{who}"
    at = next((i for i, ln in enumerate(lines) if ln.startswith(">")), None)
    if at is None:
        # 只认一级标题；`## 背景` 这类小节标题不算，否则标记会插进正文里面。
        at = 1 if lines and lines[0].startswith("# ") else 0
    lines.insert(at, marker)
    return "\n".join(lines) + "\n"


# ---------- 子命令 ----------


def cmd_new(args: argparse.Namespace) -> None:
    repo = find_repo(args.repo)
    me = ensure_ledger(repo)
    creator = me["email"]
    created = to_utc(args.created, field="--created") if args.created else now()
    # 参数自检前移：分类/标签形态校验在锁外做，失败的调用不该占着锁
    category = (
        normalize_label(args.category, field="--category") if args.category else None
    )
    tags = parse_tags_arg(args.tags, field="--tags")

    shard_path = repo / shard_rel(me["email"])
    pool_path = repo / POOL_REL
    # 查重范围：公共池 + 自己分片（不看别人的分片，跨人同号交给 validate）
    known = {
        **load_pool(repo).get("tasks", {}),
        **load_shard(repo, me["email"]).get("tasks", {}),
    }

    tid = args.id or make_id(args.title, known, created)
    require_task_id(tid)
    if tid in known:
        raise Fail(f"任务号 {tid} 已存在。")

    stamp = created
    task = {
        "title": args.title,
        "creator": creator,
        "owner": creator if args.self else None,
        "status": "doing" if args.self else "open",
        "created": stamp,
        "started": stamp if args.self else None,
        "updated": stamp,
        "finished": None,
        "category": category,
        "tags": tags,
    }
    # 路径先算好再落盘：文件名不等于任务号，文件里不记就只能靠约定去猜。
    task["worklog"] = worklog_rel(tid, task)

    target = shard_path if args.self else pool_path
    target_rel = shard_rel(me["email"]) if args.self else POOL_REL
    with ledger_lock(repo, target_rel):
        current = read_ledger(target, identity=me if args.self else None)
        if tid in current.get("tasks", {}):
            raise Fail(f"任务号 {tid} 已存在。")
        current.setdefault("tasks", {})[tid] = task
        write_ledger_json(target, current)
    try:
        log = write_worklog(repo, tid, task)
    except Fail as exc:
        # 过程文档建不出来就把刚写进去的任务撤掉，别留下「有任务、没文档」
        with ledger_lock(repo, target_rel):
            rollback = read_ledger(target)
            rollback.get("tasks", {}).pop(tid, None)
            write_ledger_json(target, rollback)
        # 任务已从台账里撤回；本次新建的文件（首次建台账时的 pool.json / 索引 /
        # 分片 / 空 worklog）由失败收尾统一删掉，工作树回到命令前的样子 ——
        # 别在这里 clear()：那会把 ensure_ledger 建的文件也留在工作树里没人提交，
        # 下一次写就被「本地有未提交改动」拦住。
        raise Fail(f"创建失败，已撤销该任务：{exc}")
    if not record_exec(
        repo, tid, task, creator, "new", f"创建任务（{task['status']}）"
    ):
        print(
            "提示：任务已建好，但执行记录没写进过程文档（路径不可读？）；"
            "补一条：progress.py log --id " + tid,
            file=sys.stderr,
        )
    print(f"已创建任务 {tid}")
    print(f"  标题    {task['title']}")
    print(f"  状态    {task['status']}")
    print(f"  creator @{creator}")
    owner_show = f"@{task['owner']}" if task["owner"] else "（待认领）"
    print(f"  owner   {owner_show}")
    if category or tags:
        print(f"  分类    {category or '—'}")
        if tags:
            print(f"  标签    {'、'.join(tags)}")
    print(f"  落在    {target_rel.as_posix()}")
    print(f"  worklog {log.relative_to(repo)}")
    if not args.self:
        print(f"\n空开状态。谁做谁认领：progress.py claim --id {tid}")
    print_worklog(repo, tid, task)


def cmd_claim(args: argparse.Namespace) -> None:
    """从公共池认领：先写进自己分片，再删池里那一行（顺序反了任务会凭空消失）。"""
    repo = find_repo(args.repo)
    tid = require_task_id(args.id)
    me = ensure_ledger(repo)
    email = me["email"]
    pool_path = repo / POOL_REL
    shard_path = repo / shard_rel(email)

    # 别人分片里已经有这个号：说明池里那份被删之后又有人认领过一次（或搬移崩了一半）。
    # 再追加一条只会让两边都以为自己拿到了，直接拒、交人裁决。
    others = {
        who: path
        for who, path in registered_shards(repo).items()
        if who != email and path != shard_path and path.is_file()
    }
    with ledger_lock(repo, POOL_REL, shard_rel(email), *others.values()):
        for who, path in others.items():
            if tid in tasks_in(path):
                raise Fail(
                    f"任务 {tid} 已经在 {who} 的分片里了（{path.name}），"
                    "池里这份是残留或有人重复认领。\n"
                    "  先跑 validate 看清两份，删掉多余那份；不要直接 claim。"
                )
        pool = read_ledger(pool_path)
        shard = read_ledger(shard_path, identity=me)
        pool_task = pool.setdefault("tasks", {}).get(tid)
        mine = shard.setdefault("tasks", {}).get(tid)

        if pool_task is None and mine is None:
            raise Fail(
                f"没有任务 {tid}：pool.json 里不存在。它可能已被他人认领或已结案；"
                "要确认请查 history，或问认领人。"
            )
        if pool_task is not None:
            pool_owner = pool_task.get("owner")
            pool_status = pool_task.get("status")
            if pool_owner or pool_status != "open":
                raise Fail(
                    f"池里的任务 {tid} 状态不一致（owner={pool_owner or '空'}，"
                    f"status={pool_status}），未认领任务应为 owner 空且 status=open。"
                    "先跑 validate。"
                )

        wrote_shard = False
        if mine is not None:
            task = mine  # 上次搬移崩了一半：分片里已有，只补删池里那行
        else:
            stamp = now()
            task = dict(pool_task or {})
            task["owner"] = email
            task["status"] = "doing"
            task["started"] = task.get("started") or stamp
            task["updated"] = stamp
            shard["tasks"][tid] = task
            write_ledger_json(shard_path, shard)
            wrote_shard = True
        if pool_task is not None:
            pool["tasks"].pop(tid, None)
            write_ledger_json(pool_path, pool)
        if wrote_shard:
            record_exec(repo, tid, task, email, "claim", "认领 → doing")

    if wrote_shard:
        print(
            f"已认领 {tid}：已写入你的分片（{shard_rel(email).as_posix()}），"
            "并从 pool.json 移除。"
        )
    elif pool_task is not None:
        print(
            f"任务 {tid} 已在你分片里，本次只补删 pool.json 里那一行（上次搬移未完成）。"
        )
    else:
        print(
            f"任务 {tid} 已在你的分片里（status={task.get('status')}），无需重复认领。"
        )
    if task.get("owner"):
        print(f"  owner   @{task['owner']}")
    print_worklog(repo, tid, task)


def cmd_set(args: argparse.Namespace) -> None:
    # 参数自检全部前移：必然失败的调用不该先去起 git 子进程、读文件
    if args.status is None and args.owner is None:
        raise Fail("至少要给 --status 或 --owner 之一。结案请用 close。")
    if args.status is not None and not args.status.strip():
        raise Fail(f"--status 不能为空；可选 {' / '.join(STATUSES)}")
    if args.owner is not None and not args.owner.strip():
        raise Fail("--owner 不能为空。")
    status = args.status.strip() if args.status else None
    if status == "open" and args.owner is not None:
        raise Fail(
            "--status open（退回未认领）不能同时给 --owner；要交给别人就别改回 open。"
        )
    if status == "blocked":
        raise Fail(
            "没有 blocked 状态：超期由时间自动判定（接任务满 14 天仍未结案），"
            "状态只有 open / doing；卡在哪里请写进 worklog。"
        )
    if status == "done":
        raise Fail(
            "不要把状态直接改成 done —— 用 close 结案（它会同时移出状态、追加历史、封卷 worklog）。"
        )
    if status is not None and status not in STATUSES:
        raise Fail(f"--status 只能是 {' / '.join(STATUSES)}；结案请用 close。")

    repo = find_repo(args.repo)
    tid = require_task_id(args.id)
    me = ensure_ledger(repo)
    email = me["email"]
    # 容忍「@名字」写法；存储与匹配用裸标识
    new_owner = (
        norm_identity(args.owner.lstrip("@")) if args.owner is not None else None
    )

    shard_path = repo / shard_rel(email)
    pool_path = repo / POOL_REL
    # 落盘位置随归属走：自己 → 自己的分片；别人 → 对方分片；没人 → 公共池
    target_path = shard_path
    target_rel = shard_rel(email)
    target_identity: dict[str, str] | None = None
    if new_owner is not None and new_owner != email:
        shards = registered_shards(repo)
        if new_owner not in shards:
            raise Fail(
                f"接管人 @{new_owner} 还没在台账里登记过（owners.json 里没有这个身份），"
                "没法把任务放进对方分片。\n"
                "  处理：让对方先跑一条写命令（例如 new --self）建出自己的分片，再交接。"
            )
        target_path = shards[new_owner]
        target_rel = target_path.relative_to(repo)
        target_identity = {"email": new_owner, "name": new_owner}

    with ledger_lock(repo, shard_rel(email), POOL_REL, target_rel):
        shard = read_ledger(shard_path, identity=me)
        task = shard.get("tasks", {}).get(tid)
        if task is None:
            if tid in tasks_in(pool_path):
                raise Fail(f"任务 {tid} 还没人认领（在 pool.json 里）。先 claim 再改。")
            raise Fail(f"没有任务 {tid}：不在你的分片里（可能属于别人，或已结案）。")
        require_owner(task, tid, email)

        changed = []
        stamp = now()
        if status is not None:
            task["status"] = status
            if status == "open":
                task["owner"] = None
                task["started"] = None
            changed.append(f"status={status}")

        if new_owner is not None:
            old = task.get("owner")
            task["owner"] = new_owner
            if task.get("status") == "open":
                task["status"] = "doing"
            task["started"] = task.get("started") or stamp
            changed.append(f"owner {old or '（无）'} → {new_owner}")

        task["updated"] = stamp
        if not task.get("owner"):
            # 释放：先写回 pool，再删自己分片那行（崩在中间最多两边都有，重跑即收敛）
            pool = read_ledger(pool_path)
            pool.setdefault("tasks", {}).setdefault(tid, task)
            write_ledger_json(pool_path, pool)
            shard["tasks"].pop(tid, None)
            write_ledger_json(shard_path, shard)
            where = POOL_REL.as_posix()
        elif new_owner is not None and new_owner != email:
            # 交接：先写对方分片，再从自己这删
            other = read_ledger(target_path, identity=target_identity)
            other_tasks = other.setdefault("tasks", {})
            if tid in other_tasks and other_tasks[tid] != task:
                # 目标分片里已有同号（多半是上次交接崩了一半）：覆盖等于替人拍板
                raise Fail(
                    f"{target_rel.as_posix()} 里已经有任务号 {tid}，内容还不一样。\n"
                    "  先跑 validate 看清哪份是真的，处理完再交接。"
                )
            other_tasks[tid] = task
            write_ledger_json(target_path, other)
            shard["tasks"].pop(tid, None)
            write_ledger_json(shard_path, shard)
            where = target_rel.as_posix()
        else:
            shard.setdefault("tasks", {})[tid] = task
            write_ledger_json(shard_path, shard)
            where = shard_rel(email).as_posix()

        # 释放认领（退回 open）单列一个类型，便于一眼看出「被释放过」
        kind = "release" if status == "open" else "set"
        record_exec(repo, tid, task, email, kind, "，".join(changed))
    print(f"已更新 {tid}：" + "，".join(changed))
    print(f"  落在    {where}")
    print_worklog(repo, tid, task)


def cmd_log(args: argparse.Namespace) -> None:
    repo = find_repo(args.repo)
    tid = require_task_id(args.id)
    note = " ".join(args.note.split())
    if not note:
        raise Fail("--note 不能为空：一句话写清这轮做了什么。")
    me = ensure_ledger(repo)
    email = me["email"]
    shard_path = repo / shard_rel(email)
    with ledger_lock(repo, shard_rel(email)):
        shard = read_ledger(shard_path, identity=me)
        task = shard.get("tasks", {}).get(tid)
        if task is None:
            if tid in tasks_in(repo / POOL_REL):
                raise Fail(f"任务 {tid} 还没人认领（在 pool.json 里）。先 claim 再记。")
            raise Fail(f"没有任务 {tid}（可能未建或已结案；封卷后不再记）。")
        require_owner(task, tid, email)
        task["updated"] = now()
        write_ledger_json(shard_path, shard)
        written = record_exec(repo, tid, task, email, "log", note)
    if not written:
        raise Fail(
            f"没写进 {tid} 的过程文档（文件不存在或不可读）；分片里的 updated 已刷新。"
            "先用 show --id 确认 worklog 路径，不要手写「执行记录」。"
        )
    print(f"已记入 {tid} 的执行记录：{note}")


def cmd_close(args: argparse.Namespace) -> None:
    repo = find_repo(args.repo)
    tid = require_task_id(args.id)
    me = ensure_ledger(repo)
    email = me["email"]
    shard_path = repo / shard_rel(email)
    # 参数自检前移：--category / --tags 的形态校验在锁外做（None = 没传，沿用建档值）
    close_category = (
        normalize_label(args.category, field="--category") if args.category else None
    )
    tags_in = _tags_arg(args.tags)  # 空串 / 全是空白 = 没传（留空不是「改成空标签」）
    close_tags = parse_tags(tags_in, field="--tags") if tags_in else None

    # 结案时间先定死（--finished 或现在），历史文件按它分月 —— 历史文件也归本次写：
    # 同一个月两条 close 各追加一行，不锁就会丢行。
    finished = (
        to_utc(args.finished, field="--finished", tid=tid) if args.finished else now()
    )
    lock_history = history_path_for(repo, finished).relative_to(repo)

    with ledger_lock(repo, shard_rel(email), lock_history):
        before = stat_key(shard_path)
        data = read_ledger(shard_path, identity=me)
        task = data["tasks"].get(tid)
        if task is None:
            if tid in tasks_in(repo / POOL_REL):
                raise Fail(
                    f"任务 {tid} 还没人认领（在 pool.json 里）。先 claim 再结案。"
                )
            raise Fail(f"没有任务 {tid}（不在你的分片里；可能已结案或属于别人）。")
        require_owner(task, tid, email)
        if task.get("finished"):
            raise Fail(f"任务 {tid} 已经结案过了。")
        title = " ".join((task.get("title") or tid).split())
        summary = " ".join(args.summary.split())
        if not summary:
            raise Fail("--summary 不能为空：写清楚「做成了什么」。")

        owner = task.get("owner") or email
        # 老文件留在平铺位置，新文件在按月子目录；找不到就按新规则推算目标路径。
        log_path = find_worklog(repo, tid, task)
        if log_path is None and task.get("worklog"):
            # 记过路径却找不到文件：绝不能按模板新建一份空文档封卷 —— 那会把真正的
            # 正文永久顶掉（封卷后不再改）。让调用方先把文件恢复回来。
            raise Fail(
                f"任务 {tid} 的过程文档找不到：ledger/{task['worklog']}。\n"
                "不要新建同名空文档（会把正文顶掉）。先从 git 恢复再结案：\n"
                f"  git checkout HEAD -- ledger/{task['worklog']}"
            )
        if log_path is None:
            log_path = repo / worklog_dir_for(task) / worklog_name(tid)
        # 历史行按结案时间落月文件；文档链接相对该文件所在目录算（../worklog/…）。
        history_path = repo / lock_history
        log_rel = worklog_link(log_path, history_path)
        created_key = time_key(task.get("created")) or ""
        hist_before = stat_key(history_path)
        log_before = stat_key(log_path)

        # 三个文件的新内容先在内存里备好
        new_tasks = dict(data["tasks"])
        new_tasks.pop(tid)

        bak_path: Path | None = None
        # 历史行的分类/标签取终值：--category/--tags 覆盖过就用覆盖值，否则用建档值
        final_cat = (
            close_category if close_category is not None else task.get("category")
        )
        final_tags = close_tags if close_tags is not None else (task.get("tags") or [])
        new_history, history_upgrade_n, history_dup = append_history_line(
            history_path,
            finished,
            created_key,
            title,
            owner,
            summary,
            log_rel,
            final_cat,
            final_tags,
            task.get("creator"),
        )

        if log_path.exists():
            try:
                log_text = log_path.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError) as exc:
                raise Fail(f"读不了 {log_path}：{exc}")
            if close_category is not None or close_tags is not None:
                # 覆盖走改写头部「分类/标签」行（在封卷之前），真源与展示副本同口径
                log_text = rewrite_label_line(
                    log_text,
                    close_category
                    if close_category is not None
                    else task.get("category"),
                    close_tags
                    if close_tags is not None
                    else list(task.get("tags") or []),
                )
        else:
            log_text = render_worklog(
                tid,
                dict(
                    task,
                    status="done",
                    category=(
                        close_category
                        if close_category is not None
                        else task.get("category")
                    ),
                    tags=(
                        close_tags
                        if close_tags is not None
                        else list(task.get("tags") or [])
                    ),
                ),
            )
        # 结案本身是最后一个节点：封卷前补上这条记录，封卷后不再追加
        new_log = stamp_frozen(
            append_exec_log(
                log_text,
                exec_line(finished, email, "close", f"结案：{summary}"),
            ),
            finished,
            owner,
        )

        # 落盘前复查：三个文件都没被别人动过
        for p, mark in (
            (shard_path, before),
            (history_path, hist_before),
            (log_path, log_before),
        ):
            if stat_key(p) != mark:
                raise Fail(
                    f"{p.relative_to(repo)} 在操作期间被改动过，已中止。重新执行一次。"
                )

        if history_upgrade_n:
            # 复查通过才落备份：并发中止时不留孤儿 .bak。成功后删除（内容没丢，只是 owner 换了列）。
            bak_path = history_path.with_name(history_path.name + ".pre-upgrade.bak")
            write_text_atomic(bak_path, history_path.read_text(encoding="utf-8"))
            # 备份是「历史层没恢复成功时」的最后保障：别让它被失败收尾当成本次新建的
            # 临时文件删掉（成功路径下面会主动删它）。
            if bak_path in CREATED_FILES:
                CREATED_FILES.remove(bak_path)
            print(
                f"历史层已升级为 9 列（补分类/标签/creator，{history_upgrade_n} 行转换），原文件备份在 {bak_path.name}",
                file=sys.stderr,
            )

        backups: dict[Path, bytes] = {}
        created: list[Path] = []
        for p in (shard_path, history_path, log_path):
            try:
                backups[p] = p.read_bytes()
            except FileNotFoundError:
                created.append(p)
            except OSError as exc:
                raise Fail(f"读不了 {p} 用于备份：{exc}")

        # 顺序：先写历史与过程文档，**最后**才从自己的分片移除。
        # 中途崩溃最坏是「历史多一行、任务还留着」，可重跑识别，不会丢记录。
        if history_dup:
            print(
                "提示：历史层已有这篇过程文档的行，未重复追加"
                "（上次可能崩在「历史写完、任务没删」）。",
                file=sys.stderr,
            )
        try:
            write_text_atomic(history_path, new_history)
            write_text_atomic(log_path, new_log)
            write_ledger_json(shard_path, dict(data, tasks=new_tasks))
        except (OSError, Fail) as exc:
            restored, failed = [], []
            history_restored = False
            for p, content in backups.items():
                try:
                    p.write_bytes(content)
                    restored.append(str(p.relative_to(repo)))
                    if p == history_path:
                        history_restored = True
                except OSError as rerr:
                    failed.append(f"{p.relative_to(repo)}（{rerr}）")
            for p in created:
                try:
                    if p.exists():
                        p.unlink()
                except OSError as rerr:
                    failed.append(f"{p.relative_to(repo)} 清理失败（{rerr}）")
            if bak_path is not None and bak_path.exists():
                if history_restored:
                    try:
                        bak_path.unlink()
                    except OSError:
                        pass
                else:
                    # 历史层没恢复成功 ⇒ .bak 是最后保障，留着并报告
                    failed.append(
                        f"{bak_path.name}（历史层未恢复成功，升级备份保留待人工处理）"
                    )
            msg = f"结案失败：{exc}"
            if restored:
                msg += f"\n已恢复：{'、'.join(restored)}"
            if failed:
                msg += f"\n回滚未完成，请手工检查：{'、'.join(failed)}"
            raise Fail(msg)

        if bak_path is not None and bak_path.exists():
            try:
                bak_path.unlink()
            except OSError:
                pass

    print(f"已结案 {tid}")
    print(f"  从 {shard_rel(email).as_posix()} 移出")
    print(f"  追加到 {history_path.relative_to(repo)}")
    print(f"  封卷 {log_path.relative_to(repo)}")
    if final_cat or final_tags:
        print(f"  分类    {final_cat or '—'}")
        if final_tags:
            print(f"  标签    {'、'.join(final_tags)}")
    print(f"\n摘要：{summary}")


def cmd_list(args: argparse.Namespace) -> None:
    """查询在办任务（只读，不建台账）。

    取数范围由这次查询决定：默认 = 公共池 + 自己分片；`--owner <身份>` 看某人
    （`me` 指自己）；`--all` 看索引登记的全量分片。同一任务号出现在多个文件里时
    这里按「后读到的为准」只显示一次，重复由 validate 报出来。
    """
    repo = find_repo(args.repo)
    scopes = [bool(args.all), args.owner is not None, bool(args.mine)]
    if sum(scopes) > 1:
        raise Fail("--all / --owner / --mine 只能给一个。")

    wanted = None
    if args.status is not None:
        wanted = [s.strip() for s in args.status.split(",") if s.strip()]
        if not wanted:
            raise Fail("--status 不能为空；逗号分隔，如 doing,open")
        # blocked 只用于捞旧数据（新任务不可能再有这个值）
        bad = [s for s in wanted if s not in STATUSES and s not in LEGACY_STATUSES]
        if bad:
            raise Fail(
                f"--status 含非法值 {', '.join(bad)}；可选 {' / '.join(STATUSES)}"
            )

    # --since / --until 收本地墙钟，内部转 UTC 与存盘值比较
    since = to_utc(args.since, field="--since") if args.since else None
    until = (
        to_utc(args.until, field="--until", date_only_ref="23:59:59")
        if args.until
        else None
    )

    def my_email() -> str:
        """只读命令按需取身份：认不出自己就少看自己那份，不该整条查询都失败。"""
        try:
            return current_identity(repo)["email"]
        except Fail as exc:
            raise Fail(f"{exc}\n  --mine / --owner me / 默认范围都要先认出你是谁。")

    owner_filter: str | None = None
    sources: list[tuple[str, dict[str, Any]]] = []
    if args.owner is not None:
        raw = args.owner.strip().lstrip("@")
        who = my_email() if raw.lower() == "me" else norm_identity(raw)
        owner_filter = who
        # 只认索引：目录里有、索引没登记的分片对它人等于不存在（validate 会报出来）
        path = registered_shards(repo).get(who)
        if path is None or not path.exists():
            raise Fail(
                f"没有 {who} 的分片（owners.json 里也没登记），看不到这个人名下的任务。\n"
                "  要确认是谁：读 ledger/owners.json 的 workers 键；"
                "自己刚建的分片如果没登记，跑一次任意写命令会自动补登记。"
            )
        sources.append((path.relative_to(repo).as_posix(), tasks_in(path)))
    elif args.all:
        sources.append((POOL_REL.as_posix(), tasks_in(repo / POOL_REL)))
        for who, path in registered_shards(repo).items():
            sources.append((path.relative_to(repo).as_posix(), tasks_in(path)))
    elif args.mine:
        me = my_email()
        _warn_unregistered_shard(repo, me)
        sources.append((shard_rel(me).as_posix(), tasks_in(repo / shard_rel(me))))
    else:
        sources.append((POOL_REL.as_posix(), tasks_in(repo / POOL_REL)))
        try:
            me = current_identity(repo)["email"]
        except Fail as exc:
            print(
                f"提示：{exc}\n  本次只列公共池；要看自己分片请先配好 git 邮箱。",
                file=sys.stderr,
            )
        else:
            _warn_unregistered_shard(repo, me)
            sources.append((shard_rel(me).as_posix(), tasks_in(repo / shard_rel(me))))

    found: dict[str, dict[str, Any]] = {}
    origin: dict[str, str] = {}
    for src, tasks in sources:
        for tid, task in tasks.items():
            if owner_filter is not None and task.get("owner") != owner_filter:
                continue
            status_now = task.get("status")
            # 旧数据里的 blocked：读侧按进行中算（2026-10-19 起逾期由时间判定）
            want_status = wanted
            if status_now == "blocked" and wanted is not None and "doing" in wanted:
                want_status = None
            if want_status is not None and status_now not in want_status:
                continue
            # 分类精确匹配（统计轴，同值才能比较）；标签包含匹配（容错下钻，吃掉同义变体）
            if args.category and (task.get("category") or "") != args.category.strip():
                continue
            if args.tag:
                q = args.tag.strip()
                if not any(q in t for t in (task.get("tags") or [])):
                    continue
            created = time_key(task.get("created"))
            if since and (created is None or created < since):
                continue
            if until and (created is None or created > until):
                continue
            found[tid] = task
            origin[tid] = src

    if args.json:
        print(json.dumps(found, ensure_ascii=False, indent=2))
        return

    if not found:
        if not _has_ledger(repo):
            print(
                "还没有台账（没有 pool.json / owners.json）。写一条任务就有了：new --title …"
            )
            return
        print("没有符合条件的在办任务。")
        return

    rows = sorted(found.items())
    print(f"在办任务 {len(rows)} 条：\n")
    for tid, task in rows:
        who = f"@{task['owner']}" if task.get("owner") else "（待认领）"
        print(f"  [{task.get('status')}] {tid}")
        print(
            f"      {task.get('title')} — owner={who}，"
            f"created={fmt_local(task.get('created'))}"
        )
        if task.get("category") or task.get("tags"):
            cat = task.get("category") or "—"
            line = f"      分类：{cat}"
            if task.get("tags"):
                line += f" ｜ 标签：{'、'.join(task['tags'])}"
            print(line)
        print(f"      落在：{origin[tid]}")
    print(
        "\n细节在 worklog 里（路径记在任务对象的 worklog 字段）；已结案的用 history 子命令查"
        "（ledger/history/<年月>.md）。"
    )


def cmd_show(args: argparse.Namespace) -> None:
    repo = find_repo(args.repo)
    tid = require_task_id(args.id)
    task = load_task(repo, tid)
    print(json.dumps(task, ensure_ascii=False, indent=2))
    print_worklog(repo, tid, task)


def cmd_tags(args: argparse.Namespace) -> None:
    """分类/标签巡检与归并。

    --all：全量频次表（扫全部 worklog 头部，每任务恰好一次；已结案也含在内）—— 让漂移可见。
    --rename 旧 新：把在办任务里等于「旧」的 category / tag 改成「新」，同步改在办 worklog
    头部；已封卷文档不动（封卷即不可变，看板侧自行归并）。
    """
    if args.all and args.rename:
        raise Fail("--all 和 --rename 只能给一个。")
    if not args.all and not args.rename:
        raise Fail("至少给一个：--all（巡检）或 --rename 旧 新（归并）。")
    repo = find_repo(args.repo)

    if args.rename:
        old, new = args.rename
        old = old.strip()
        new_label = normalize_label(new, field="新标签")
        me = ensure_ledger(repo)
        email = me["email"]
        shard_path = repo / shard_rel(email)
        with ledger_lock(repo, shard_rel(email)):
            data = read_ledger(shard_path, identity=me)
            tasks = data["tasks"]
            changed: list[str] = []
            for tid, task in tasks.items():
                cat = task.get("category")
                tags = list(task.get("tags") or [])
                new_cat = new_label if cat == old else cat
                new_tags = [new_label if t == old else t for t in tags]
                if new_cat != cat or new_tags != tags:
                    task["category"] = new_cat
                    task["tags"] = new_tags
                    changed.append(tid)
            if not changed:
                print(
                    f"你分片里的在办任务没有分类/标签等于「{old}」。"
                    "（池里与别人分片的任务一律不动：要动先认领）"
                )
                return
            if getattr(args, "dry_run", False):
                # 预览：先把「会改哪些」摆出来给人确认，再决定要不要真改
                print(
                    f"预览（未改动任何文件）：「{old}」→「{new_label}」涉及 {len(changed)} 个任务："
                )
                for tid in changed:
                    print(f"  {tid}")
                print("确认无误后去掉 --dry-run 再跑一次。")
                return
            # 先改在办 worklog 头部（展示副本与真源同口径），最后才写分片：
            # 中途失败时 json 未动、worklog 改写幂等，重跑一次即可收敛
            backups: dict[Path, bytes] = {}
            try:
                for tid in changed:
                    task = tasks[tid]
                    log = find_worklog(repo, tid, task)
                    if log is None:
                        continue
                    backups[log] = log.read_bytes()
                    write_text_atomic(
                        log,
                        rewrite_label_line(
                            backups[log].decode("utf-8"),
                            task.get("category"),
                            task.get("tags") or [],
                        ),
                    )
            except (OSError, Fail, UnicodeDecodeError) as exc:
                for log, raw in backups.items():
                    try:
                        log.write_bytes(raw)
                    except OSError:
                        pass
                raise Fail(f"归并失败，已恢复已改文档，重跑一次即可：{exc}")
            write_ledger_json(shard_path, data)
        print(f"已归并「{old}」→「{new_label}」，涉及 {len(changed)} 个在办任务：")
        for tid in changed:
            print(f"  {tid}")
        return

    # --all：worklog 目录是唯一来源 —— 在办任务的 worklog 也在里面（new 建档即写），
    # 与在办任务合并会重复计数；已结案任务已从分片移除、只剩 worklog，天然只计一次。
    # 在办 / 已封卷分开数：`--rename` 只动在办，两者合起来会把「影响条数」估高
    cat_count: dict[str, int] = {}
    tag_count: dict[str, int] = {}
    cat_frozen: dict[str, int] = {}
    tag_frozen: dict[str, int] = {}
    wdir = repo / WORKLOG_DIR
    n_logs = 0
    n_frozen = 0
    if wdir.is_dir():
        for log in sorted(wdir.rglob("*.md")):
            try:
                text = log.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            cat, tags = parse_label_line(text)
            frozen = FROZEN_MARK in text
            n_logs += 1
            n_frozen += 1 if frozen else 0
            live_cat = cat_frozen if frozen else cat_count
            live_tag = tag_frozen if frozen else tag_count
            if cat:
                live_cat[cat] = live_cat.get(cat, 0) + 1
            for t in tags:
                live_tag[t] = live_tag.get(t, 0) + 1
    if not cat_count and not tag_count:
        print("还没有任何分类/标签：new 时用 --category / --tags 让 Agent 自行总结。")
        return
    print(
        f"扫描 {n_logs} 份 worklog（在办 {n_logs - n_frozen} / 已封卷 {n_frozen}）：\n"
        "「在办」列才是 --rename 会动的；已封卷文档不可变，只在「已封卷」列里算。"
    )
    print("\n分类（看板统计轴，精确匹配）：")
    for cat in sorted(
        set(cat_count) | set(cat_frozen),
        key=lambda c: (-(cat_count.get(c, 0) + cat_frozen.get(c, 0)), c),
    ):
        print(f"  {cat_count.get(cat, 0):>4}  {cat_frozen.get(cat, 0):>4}  {cat}")
    print("\n标签（下钻用，包含匹配）：")
    for t in sorted(
        set(tag_count) | set(tag_frozen),
        key=lambda x: (-(tag_count.get(x, 0) + tag_frozen.get(x, 0)), x),
    ):
        print(f"  {tag_count.get(t, 0):>4}  {tag_frozen.get(t, 0):>4}  {t}")
    print("   ↑在办  ↑已封卷")
    low = sorted(t for t, n in tag_count.items() if n <= 2)
    if low:
        print(
            f"\n低频标签（≤2 次，疑似变体）：{'、'.join(low)}\n"
            "归并：tags --rename <旧> <新>（只改在办任务；已封卷文档不动）"
        )


def cmd_validate(args: argparse.Namespace) -> None:
    """校验台账（只读）：索引 ↔ 目录双向、跨文件任务号重复、池里只装未认领。

    逐任务字段检查照旧，只是范围从「一份文件」扩到「pool + 所有分片」。
    """
    repo = find_repo(args.repo)
    problems: list[str] = []
    blank: list[str] = []

    if not _has_ledger(repo):
        print("✓ 还没有台账（没有 pool.json / owners.json），无需校验。")
        return

    pool_path = repo / POOL_REL
    if not pool_path.exists():
        problems.append(
            f"{POOL_REL} 不存在（索引在、公共池没了）：下一次写会重建空池，"
            "旧内容需要从 git 恢复。"
        )

    # ① 索引 → 文件：登记了但文件不在
    registered = registered_shards(repo)
    for ident, path in sorted(registered.items()):
        if not path.exists():
            problems.append(f"owners.json 登记了 {ident} → {path.name}，但文件不存在")
            continue
        try:
            shard_data = _load_shaped(
                path, default={"version": FORMAT_VERSION, "tasks": {}}
            )
        except Fail as exc:
            problems.append(str(exc))
            continue
        ident_in_file = (shard_data.get("identity") or {}).get("email")
        if isinstance(ident_in_file, str) and norm_identity(ident_in_file) != ident:
            problems.append(
                f"{path.name}: 文件内 identity={ident_in_file} 与索引 key {ident} 不一致"
                "（索引或文件被手改过）"
            )

    # ② 文件 → 索引：目录里有、索引没登记（里面的任务等于静默消失）
    owner_dir = repo / OWNERS_DIR
    on_disk = (
        sorted(p for p in owner_dir.glob("*.json") if p.is_file())
        if owner_dir.is_dir()
        else []
    )

    def tasks_or_problem(rel: str, path: Path) -> dict[str, Any]:
        """读坏了就记一条问题并当空文件继续 —— 不能让一处坏 JSON 吞掉已收集的问题。"""
        try:
            return tasks_in(path)
        except Fail as exc:
            problems.append(f"{rel}: {exc}")
            return {}

    registered_names = {p.name for p in registered.values()}
    for path in on_disk:
        if path.name not in registered_names:
            rel = f"{OWNERS_DIR.as_posix()}/{path.name}"
            try:
                n_tasks = len(tasks_in(path))
            except Fail:
                n_tasks = 0  # 坏 JSON 会在 ③ 里作为独立问题报出来，这里不重复报
            problems.append(
                f"{rel} 没在 owners.json 里登记（里面 {n_tasks} 个任务会静默消失）"
            )

    # ③ 同一任务号出现在多个文件 + ④ 池里只该装未认领 + 逐任务字段检查
    files: list[tuple[str, dict[str, Any]]] = [
        (POOL_REL.as_posix(), tasks_or_problem(POOL_REL.as_posix(), pool_path))
    ]
    for path in [*registered.values(), *on_disk]:
        rel = path.relative_to(repo).as_posix()
        if any(rel == known_rel for known_rel, _ in files):
            continue
        files.append((rel, tasks_or_problem(rel, path)))

    seen: dict[str, str] = {}
    total = 0
    for rel, tasks in files:
        for tid, task in sorted(tasks.items()):
            total += 1
            if tid in seen:
                problems.append(
                    f"{tid}: 同时出现在 {seen[tid]} 与 {rel}"
                    "（认领 / 释放搬移崩了一半，手动删掉多余那份）"
                )
            else:
                seen[tid] = rel
            if rel == POOL_REL.as_posix():
                if task.get("owner"):
                    problems.append(
                        f"{tid}: pool.json 里的任务不该有 owner（{task['owner']}）；先 claim 再改"
                    )
                if task.get("status") != "open":
                    problems.append(
                        f"{tid}: pool.json 里的任务 status 应为 open"
                        f"（现在是 {task.get('status')!r}）"
                    )
            if not ID_RE.fullmatch(tid):
                problems.append(f"{tid}: 任务号不合规（小写字母、数字、连字符、汉字）")
            if not task.get("title"):
                problems.append(f"{tid}: 缺 title")
            status = task.get("status")
            if status not in STATUSES and status not in LEGACY_STATUSES:
                problems.append(f"{tid}: status={status!r} 非法")
            if status == "open" and task.get("owner"):
                problems.append(f"{tid}: status=open 却有 owner")
            if status in ("doing", "blocked") and not task.get("owner"):
                problems.append(f"{tid}: status={status} 却没有 owner")
            if status == "done":
                problems.append(f"{tid}: status=done 不该留在台账里（该用 close 结案）")
            cat = task.get("category")
            if cat is not None:
                try:
                    normalize_label(cat, tid=tid)
                except Fail as exc:
                    problems.append(str(exc))
            raw_tags = task.get("tags")
            if raw_tags is not None:
                if not isinstance(raw_tags, list) or any(
                    not isinstance(t, str) for t in raw_tags
                ):
                    problems.append(f"{tid}: tags 必须是字符串数组")
                else:
                    for t in raw_tags:
                        try:
                            normalize_label(t, field="标签", tid=tid)
                        except Fail as exc:
                            problems.append(str(exc))
                    if len(raw_tags) > TAGS_MAX_COUNT:
                        problems.append(f"{tid}: tags 超过 {TAGS_MAX_COUNT} 个")
            if find_worklog(repo, tid, task) is None:
                problems.append(
                    f"{tid}: 缺 worklog 文件（记的路径：{task.get('worklog') or '未记'}）"
                )
            elif worklog_is_skeleton(repo, tid, task):
                blank.append(tid)

    if blank:
        # 只提示、不算问题：正文写没写是人的事，脚本不替他下判断；
        # 但「骨架」通常意味着忘了写、或曾被写前同步覆盖，给一条可见信号。
        print(
            f"提示：{len(blank)} 个在办任务的 worklog 正文还是模板骨架"
            f"（背景/待办/下一步/过程/结论都是注释占位）：{'、'.join(blank)}\n"
            '      补写正文后跑一次 log --id <任务号> --note "…"。',
            file=sys.stderr,
        )

    if problems:
        for p in problems:
            print(f"✗ {p}", file=sys.stderr)
        raise Fail(f"校验失败：{len(problems)} 项问题。")

    print(f"✓ 校验通过（在办 {total} 条，{len(files)} 个文件）")

    # 历史层只读体检：发现非 v6 只提示、不写盘 —— 「要不要升级」交给下一次真实写入，
    # validate 保持只读契约（原设计就不碰历史层，这里只补一条可见的迁移信号）。
    # 存量平铺文件是只读来源，不会被写入，故其中的旧格式行不会被自动升级。
    for hp in history_sources(repo):
        rel = hp.relative_to(repo).as_posix()
        try:
            htext = hp.read_text(encoding="utf-8-sig")
        except (OSError, UnicodeDecodeError) as exc:
            print(f"提示：读不了 {rel}：{exc}", file=sys.stderr)
            continue
        hrecords, hwarnings = parse_history(htext)
        old_n = sum(1 for r in hrecords if r["fmt"] not in ("v8", "v9"))
        if old_n:
            print(
                f"提示：{rel} 含 {old_n} 行旧格式（4 / 5 / 6 列）；"
                "只读文件不自动升级，新记录一律按 9 列写入 ledger/history/。",
                file=sys.stderr,
            )
        for w in hwarnings:
            print(f"提示：{rel} {w}", file=sys.stderr)


def cmd_history(args: argparse.Namespace) -> None:
    """查已结案任务（只读）。不加锁、不写任何字节、不依赖格式升级是否完成。

    --owner / --mine 一律**精确相等**：身份标识没有「按前缀找人」的语义，
    子串匹配正是 a 误命中 a-11 的根因。
    --since / --until 按**创建时间**过滤（含边界），可只给其一；旧格式行没有创建时间，
    带时间过滤时会被排除（另行提示）。--limit 在过滤 + 倒序之后取前 N 条。
    默认输出紧凑单行、不含「完成了什么」摘要（与 list 不吐正文同一原则）；要全量走 --json。
    """
    if args.owner is not None and args.mine:
        raise Fail("--owner 和 --mine 只能给一个：要么查某人，要么查自己。")
    if args.owner is not None and not args.owner.strip():
        raise Fail("--owner 不能为空。")
    if args.limit is not None and args.limit < 1:
        raise Fail("--limit 必须是正整数。")
    # --since / --until 收本地墙钟，内部转 UTC 与存盘值比较
    since = to_utc(args.since, field="--since") if args.since else None
    until = (
        to_utc(args.until, field="--until", date_only_ref="23:59:59")
        if args.until
        else None
    )

    repo = find_repo(args.repo)
    sources = history_sources(repo)
    want_owner = (
        args.owner.strip().lstrip("@") if args.owner else None
    )  # 容忍「@名字」写法
    me = current_identity(repo)["email"] if args.mine else None
    me_keys = my_identity_keys(repo) if args.mine else None
    filter_echo = {
        "owner": want_owner,
        "mine": args.mine,
        "since": since,
        "until": until,
        "limit": args.limit,
        "category": args.category.strip() if args.category else None,
        "tag": args.tag.strip() if args.tag else None,
    }
    if not sources:
        # JSON / 计数模式必须**始终**机器可读：空台账也给 JSON，人话只走 stderr。
        # （2026-10-17 真机教训：这里原先直接 print 人话后 return，--json 调用方
        # 拿到非 JSON 输出 ⇒ dsh-task-ledger 看板 /board 整条 500。）
        if args.count_only:
            print(json.dumps({"count": 0, "capped": False}, ensure_ascii=False))
            return
        if args.json:
            print(
                json.dumps(
                    {"count": 0, "filters": filter_echo, "records": []},
                    ensure_ascii=False,
                    indent=2,
                )
            )
            return
        print(
            f"没有已结案记录：ledger/history/ 还没有文件（存量 {HISTORY_REL} 也没有）。"
        )
        return
    if args.months is not None:
        if args.months < 1:
            raise Fail("--months 必须是正整数")
        # 只取按月归档的文件（存量平铺文件不进了——它是改造前的历史，窗口模式用不到）
        monthly = [p for p in sources if p.parent.name == HISTORY_DIR.name]
        sources = monthly[-args.months :]
    if args.count_only:
        print(json.dumps(history_row_count(sources, since, until), ensure_ascii=False))
        return
    records: list[dict[str, Any]] = []
    warnings: list[str] = []
    for hp in sources:
        rel = hp.relative_to(repo).as_posix()
        try:
            text = hp.read_text(encoding="utf-8-sig")
        except (OSError, UnicodeDecodeError) as exc:
            raise Fail(f"读不了 {hp}：{exc}")
        recs, warns = parse_history(text)
        for r in recs:
            r["src"] = rel  # 行所在的历史文件：链接相对它所在目录，带上才可定位
            # 8 列行自带分类/标签；旧 4/5/6 列行没有，回链读 worklog 头部兜底
            if not r.get("category") and not r.get("tags"):
                r["category"], r["tags"] = labels_for_log(r["log"], hp)
            # v8 行（无 creator 列）回链 worklog 头部「创建」行取发起人，不丢
            if not r.get("creator"):
                r["creator"] = creator_for_history(r["log"], hp)
        records.extend(recs)
        warnings.extend(f"{rel} {w}" for w in warns)

    rows = []
    undated = 0
    for r in records:
        if want_owner is not None and r["owner"] != want_owner:
            continue
        if me_keys is not None and r["owner"] not in me_keys:
            continue
        # 分类精确、标签包含（与 list 同口径；值优先读列，列空回链 worklog 头部）
        if args.category and r.get("category") != args.category.strip():
            continue
        if args.tag:
            q = args.tag.strip()
            if not any(q in t for t in r.get("tags") or []):
                continue
        if since or until:
            c = r.get("created")
            if c is None:  # 旧格式行没有创建时间，无法参与时间过滤
                undated += 1
                continue
            if since and c < since:
                continue
            if until and c > until:
                continue
        rows.append(r)
    if undated:
        print(
            f"提示：{undated} 行没有创建时间（旧格式），未参与时间过滤；"
            "下次 close 写入后会自动补齐。",
            file=sys.stderr,
        )
    # 倒序：最新创建在前（旧行无创建时间时退回按结案时间）；同一时刻稳定排序保持文件物理先后。
    rows.sort(key=lambda r: r.get("created") or r["time"], reverse=True)
    if args.limit is not None:
        rows = rows[: args.limit]

    if args.json:
        print(
            json.dumps(
                {
                    "count": len(rows),
                    "filters": filter_echo,
                    "records": rows,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    if not rows:
        print("没有符合条件的已结案记录。")
        return
    who_label = want_owner or me
    label = f"（owner=@{who_label}）" if who_label else ""
    span = (
        f"，创建 {fmt_local(since) or '…'} ~ {fmt_local(until) or '…'}"
        if (since or until)
        else ""
    )
    print(f"已结案 {len(rows)} 条{label}{span}：\n")

    def _who(r: dict[str, Any]) -> str:
        return f"@{r['owner']}" if r["owner"] else "（无 owner）"

    width = max(len(_who(r)) for r in rows)
    for r in rows:
        who = _who(r).ljust(width)
        print(
            f"  {fmt_local(r['time'])}  建 {fmt_local(r.get('created')) or '—'}  {who}  "
            f"[{r.get('category') or '—'}]  "
            f"{r['workpackage']}  → {r['log'] or '（无过程文档）'}（{r.get('src', '')}）"
        )
    if warnings:
        print(f"\n（{len(warnings)} 行无法解析，已跳过；详见 stderr）")
    print(
        "\n时间列＝结案时间；过滤按创建时间。默认不输出「完成了什么」；要摘要跑 history --json。"
        "\n方括号＝分类（回链自 worklog 头部；历史行本身不存这列）。"
        "\n行尾括号＝该行所在的历史文件（文档链接相对它所在目录解析）。"
    )


# ---------- 入口 ----------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="progress.py",
        description="管理项目任务进度（ledger/pool.json + owners/ 分片 + worklog + 历史）",
    )
    parser.add_argument(
        "--no-sync",
        action="store_true",
        help="跳过写前取最新与写后自动 git 提交 / 推送（等价于 TASK_LEDGER_NO_SYNC=1）",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    def add_repo(p: argparse.ArgumentParser) -> None:
        p.add_argument("--repo", help="当前工作区（项目根）。agent 调用时应显式传入")

    p = sub.add_parser("new", help="新建任务")
    p.add_argument("--title", required=True, help="一句话标题")
    p.add_argument("--id", help="指定任务号，默认取标题生成的语义名 + 4 位随机")
    p.add_argument(
        "--created", help="补录创建时间（默认当前时刻）；YYYY-MM-DD[ HH:MM[:SS]]"
    )
    p.add_argument(
        "--self",
        action="store_true",
        help="创建即由自己执行（doing），否则留 open 待认领",
    )
    p.add_argument(
        "--category",
        help="一句话分类：这事是什么类型（≤4 字；纯英文 ≤3 词）。由 Agent 按口径总结，可省",
    )
    p.add_argument(
        "--tags",
        help="标签：这事涉及什么（对象/领域/模块），逗号分隔（至多 5 个，每个 ≤4 字；空格归英文多词标签自身，不当分隔符）。由 Agent 按口径总结，可省",
    )
    add_repo(p)
    p.set_defaults(func=cmd_new)

    p = sub.add_parser("claim", help="认领一个 open 任务（认领人只能是当前 git 身份）")
    p.add_argument("--id", required=True)
    add_repo(p)
    p.set_defaults(func=cmd_claim)

    p = sub.add_parser(
        "set", help="改状态 / 释放认领（--status open）/ 交接（结案请用 close）"
    )
    p.add_argument("--id", required=True)
    p.add_argument("--status", help=f"{' / '.join(STATUSES)}（done 请走 close）")
    p.add_argument("--owner", help="交接给谁（仅供 UI / 维护者；agent 提示词不暴露）")
    add_repo(p)
    p.set_defaults(func=cmd_set)

    p = sub.add_parser("log", help="往 worklog 的「执行记录」节补一条记录")
    p.add_argument("--id", required=True)
    p.add_argument("--note", required=True, help="一句话：这轮做了什么")
    add_repo(p)
    p.set_defaults(func=cmd_log)

    p = sub.add_parser("close", help="结案：移出状态 + 追加历史 + 封卷 worklog")
    p.add_argument("--id", required=True)
    p.add_argument("--summary", required=True, help="做成了什么，一句话")
    p.add_argument(
        "--finished", help="结案时间（默认当前时刻）；YYYY-MM-DD[ HH:MM[:SS]]"
    )
    p.add_argument("--category", help="结案时修正分类（不传则沿用 new 时的值）")
    p.add_argument("--tags", help="结案时修正标签（不传则沿用 new 时的值）")
    add_repo(p)
    p.set_defaults(func=cmd_close)

    p = sub.add_parser("list", help="查询在办任务")
    p.add_argument("--mine", action="store_true", help="只看自己分片里的")
    p.add_argument("--owner", help="只看某个人分片里的（写身份，如邮箱；me 指自己）")
    p.add_argument(
        "--all", action="store_true", help="看全量：公共池 + 索引里登记的所有分片"
    )
    p.add_argument("--status", help="逗号分隔，如 doing,open")
    p.add_argument("--category", help="按分类过滤（精确匹配）")
    p.add_argument("--tag", help="按标签过滤（包含匹配，命中任一面即算）")
    p.add_argument(
        "--since", help="只看该时间（含）之后创建的任务；YYYY-MM-DD[ HH:MM[:SS]]"
    )
    p.add_argument(
        "--until", help="只看该时间（含）之前创建的任务；YYYY-MM-DD 含当天整天"
    )
    p.add_argument("--json", action="store_true", help="输出原始 JSON")
    add_repo(p)
    p.set_defaults(func=cmd_list)

    p = sub.add_parser("show", help="单任务详情")
    p.add_argument("--id", required=True)
    add_repo(p)
    p.set_defaults(func=cmd_show)

    p = sub.add_parser(
        "tags", help="分类/标签巡检（--all）与归并（--rename 旧 新，只改在办任务）"
    )
    p.add_argument("--all", action="store_true", help="输出全量分类/标签频次表")
    p.add_argument(
        "--rename",
        nargs=2,
        metavar=("旧", "新"),
        help="把在办任务里等于「旧」的分类/标签改为「新」，同步改在办 worklog 头部",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="只列出 --rename 会改哪些任务、共几条，不动文件",
    )
    add_repo(p)
    p.set_defaults(func=cmd_tags)

    p = sub.add_parser(
        "history",
        help="查已结案任务（只读）：--owner / --mine / --since / --until / --limit / --json / --category / --tag",
    )
    p.add_argument("--owner", help="只看某个人的（精确匹配，不做前缀/子串）")
    p.add_argument("--mine", action="store_true", help="只看自己的（当前 git 身份）")
    p.add_argument("--category", help="按分类过滤（精确匹配；回链读 worklog 头部）")
    p.add_argument("--tag", help="按标签过滤（包含匹配；回链读 worklog 头部）")
    p.add_argument(
        "--since", help="只看该时间（含）之后创建的任务；YYYY-MM-DD[ HH:MM[:SS]]"
    )
    p.add_argument(
        "--until", help="只看该时间（含）之前创建的任务；YYYY-MM-DD 含当天整天"
    )
    p.add_argument("--limit", type=int, help="过滤 + 倒序后取前 N 条（最近 N 条）")
    p.add_argument("--json", action="store_true", help="输出结构化 JSON（含摘要）")
    p.add_argument(
        "--count-only",
        action="store_true",
        help="只数行数（封顶 1 万，输出 {count, capped}）；显示级统计，精确数以 --json 为准",
    )
    p.add_argument(
        "--months",
        type=int,
        help="只读最近 N 个月的历史文件（ledger/history/*.md 按文件名取末 N 个；不含存量平铺文件）",
    )
    add_repo(p)
    p.set_defaults(func=cmd_history)

    p = sub.add_parser("validate", help="校验台账（池 / 索引 / 分片）与 worklog")
    add_repo(p)
    p.set_defaults(func=cmd_validate)

    # 每个子命令也认 --no-sync：人（和 agent）习惯把参数缀在子命令后面，
    # 只挂在主 parser 上时 `new --no-sync` 会直接 usage 报错、命令根本跑不起来。
    # default=SUPPRESS 是关键：否则解析子命令时会把主 parser 上已解析的 True 覆盖回 False。
    for sub_parser in sub.choices.values():
        sub_parser.add_argument(
            "--no-sync",
            action="store_true",
            default=argparse.SUPPRESS,
            help="跳过写前取最新与写后自动 git 提交 / 推送（等价于 TASK_LEDGER_NO_SYNC=1；写在子命令前后均可）",
        )

    return parser


def _repo_lock_dir(args: argparse.Namespace) -> Path | None:
    """写命令要仓级串行时返回 git 目录；只读 / 纯读 tags / --no-sync / 无 git 返回 None。"""
    if os.environ.get("TASK_LEDGER_NO_SYNC"):
        return None
    action = getattr(args, "command", "")
    if action in READ_ONLY_COMMANDS:
        return None
    if action == "tags" and not getattr(args, "rename", None):
        return None
    try:
        repo = find_repo(getattr(args, "repo", None))
    except Fail:
        return None
    # 用 --git-common-dir 而不是 --absolute-git-dir：链接工作树（git worktree）各有
    # 独立 git dir，按它加锁等于两个工作树各拿一把锁，仍会并发同步同一分支。
    out = _git("git", "-C", str(repo), "rev-parse", "--git-common-dir")
    if out.returncode != 0:
        return None
    common = Path(out.stdout.strip())
    if not common.is_absolute():
        common = (repo / common).resolve()
    return common


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if getattr(args, "no_sync", False):
        os.environ["TASK_LEDGER_NO_SYNC"] = "1"
    lock_dir = _repo_lock_dir(args)
    lock = (
        repo_sync_lock(lock_dir) if lock_dir is not None else contextlib.nullcontext()
    )
    try:
        # 整段持锁：写前同步的「检查 → 覆盖」与随后的写入、提交推送必须是同一段临界区
        with lock:
            return _run_once(args)
    except Fail as exc:  # 这里只可能是等锁超时
        print(f"错误：{exc}", file=sys.stderr)
        return 1


def _run_once(args: argparse.Namespace) -> int:
    """一条命令的完整生命周期：写前同步 → 命令本身 → 写后提交推送。"""
    try:
        git_presync(args.command, args)  # 写前刷新 ledger/ 到远端最新
        args.func(args)
    except Fail as exc:
        # 命令没成功：把写前刷新覆盖过的文件恢复原样，别让远端版本冒充用户改动
        presync_rollback()
        discard_created_files()
        print(f"错误：{exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        presync_rollback()
        discard_created_files()
        print("已中断。", file=sys.stderr)
        return 130
    except BrokenPipeError:
        # 输出被下游截断（如 | head）：命令本身可能已经写成功，不回滚。
        # 但写后同步必须照做 —— 早先这里直接 return 0，台账就停在「已写未提交」
        # 状态，下一笔写被 guard 拦成「本地台账有未提交改动」，用户只能手动提交。
        # stdout 先接到 /dev/null，免得 git_sync 里再碰这个断掉的管道。
        devnull = os.open(os.devnull, os.O_WRONLY)
        try:
            os.dup2(devnull, sys.stdout.fileno())
        finally:
            os.close(devnull)
        wrote = bool(CHANGED_FILES or PRESYNC_FILES)
        PRESYNC_BACKUPS.clear()
        if wrote:
            git_sync(args.command)
        else:
            # 一个文件都没写就断了：此时提交只会把「什么都没做」记成一次写
            print(
                "提示：输出管道被下游关闭，命令没有完成写入，本次未做任何提交。",
                file=sys.stderr,
            )
        return 0
    except OSError as exc:
        presync_rollback()
        discard_created_files()
        print(f"错误：{exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 —— 兜底：未预期的失败用独立退出码，与业务错误区分
        presync_rollback()
        discard_created_files()
        print(f"错误：未预期的失败 {type(exc).__name__}: {exc}", file=sys.stderr)
        return 3
    PRESYNC_BACKUPS.clear()  # 写成功：留底作废
    CREATED_FILES.clear()  # 写成功：新建的就是要留的，别让后面的逻辑误删
    git_sync(args.command)  # 写成功后一次性自动同步（commit / push）
    return 0


if __name__ == "__main__":
    sys.exit(main())
