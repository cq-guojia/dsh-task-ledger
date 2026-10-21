#!/usr/bin/env python3
# pyright: standard
"""task-ledger — 管理项目任务进度。

  ledger/progress.json                在办任务的状态
  ledger/worklog/<年月>/<日>-<时分>-<说明>-<随机码>.md
                                     单个任务的过程（路径另记在状态表 worklog 字段）
  ledger/history/<年月>.md            已结案任务，一行一条（9 列：结案时间 / 创建时间 / 工作包 / 分类 / 标签 / owner / creator / 完成了什么 / 过程文档）；
                                     按结案时间分月归档。存量 ledger/PROGRESS-HISTORY.md 只读兼容、永不重写

只用标准库，无第三方依赖。
"""

from __future__ import annotations

import argparse
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
from datetime import datetime
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
PROGRESS_REL = Path("ledger/progress.json")
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
    "<!-- 本节由脚本维护：new / claim / set / close / log 自动追加，请勿手改。\n"
    '     要补一条就跑 progress.py log --id <任务号> --note "做了什么"。 -->'
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
    """当前时刻，精确到秒：YYYY-MM-DD HH:MM:SS。"""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


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


def find_repo(explicit: str | None) -> Path:
    """项目根：--repo > 向上找含 ledger/progress.json 的目录 > 向上找含 ledger/ 的目录。

    git 根只作为一个候选，不无条件优先 —— 否则 monorepo 子目录会定位到整个仓库根。
    """
    if explicit:
        p = Path(explicit).expanduser().resolve()
        if not p.is_dir():
            raise Fail(f"--repo 不是目录：{p}")
        # 传进来的常是工作区子目录；向上找真正的台账根，否则写前同步会对着
        # 不存在的 <子目录>/ledger 空转。都找不到就仍用传入目录（首次 init 需要它）。
        for cand in (p, *p.parents):
            if (cand / PROGRESS_REL).exists():
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
        if (p / PROGRESS_REL).exists():
            return p
    for p in ordered:
        if (p / "docs").is_dir():
            return p
    raise Fail(
        "定位不到项目根：向上找不到 ledger/progress.json 或 ledger/。用 --repo 指定。"
    )


def git_user() -> str:
    """owner 身份：只认 git config user.name。取不到就报错，不做任何兜底。"""
    try:
        proc = subprocess.run(  # noqa: PLW1510 —— 要看 stdout，不抛异常
            ["git", "config", "user.name"], capture_output=True, text=True
        )
    except FileNotFoundError:
        raise Fail("需要用户名才能执行：本机没有 git，读不到 git config user.name。")
    name = proc.stdout.strip()
    if not name:
        raise Fail(
            "需要用户名才能执行：读不到本机 git 身份（git config user.name 为空）。\n"
            '先配置：git config --global user.name "你的名字"'
        )
    return name


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"tasks": {}}
    try:
        text = path.read_text(encoding="utf-8-sig")
    except (OSError, UnicodeDecodeError) as exc:
        raise Fail(f"读不了 {path}：{exc}")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise Fail(f"{path} 不是合法 JSON：{exc}")
    if not isinstance(data, dict) or not isinstance(data.get("tasks"), dict):
        raise Fail(f'{path} 结构不对，顶层应为 {{"tasks": {{...}}}}')
    return data


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
    while PRESYNC_BACKUPS:
        path, original = PRESYNC_BACKUPS.popitem()
        try:
            if original is None:
                path.unlink(missing_ok=True)
            else:
                path.write_bytes(original)
        except OSError as exc:
            print(
                f"提示：写前刷新 {path} 的回滚未完成（{exc}），请手动检查该文件。",
                file=sys.stderr,
            )
    PRESYNC_FILES.clear()


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
        except OSError:
            mode = 0o644  # 新文件：与 git 默认 644 对齐
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


def write_json(path: Path, data: dict[str, Any]) -> None:
    """原子写状态表：一个任务一行，任务内 key 按字母序。

    为什么压成一行一条：progress.json 是多 agent 共享的并发写点。任务块各占十几行时，
    A 结案删掉一个任务、B 同时刷新相邻任务的 updated，两处改动间距不足 git 的 3 行
    patch 上下文，rebase 必冲突（实测撞到过）。一行一条后，删任务只删一行、改任务只改
    一行，只有相邻两个任务同时被改才可能撞上。

    顶层不是 `{"tasks": {...}}` 形状时退回缩进格式：本函数只管状态表，不顺手改坏别的结构。
    """
    tasks = data.get("tasks")
    if not isinstance(tasks, dict) or set(data) != {"tasks"}:
        write_text_atomic(
            path, json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        )
        return
    rows = ",\n".join(
        f"    {json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False, sort_keys=True)}"
        for k, v in sorted(tasks.items())
    )
    body = '{\n  "tasks": {\n' + (rows + "\n" if rows else "") + "  }\n}\n"
    write_text_atomic(path, body)


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
    """把状态表的「读-改-写」串行化，避免并发丢更新。

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

    为什么必须整段：写前同步是「检查本地干净 → 覆盖 progress.json」两步，中间是敞开的。
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


def read_guarded(path: Path):
    """读状态表并记下指纹；配合 commit_guarded 做写前复查。"""
    return stat_key(path), read_json(path)


def commit_guarded(
    path: Path, before: str | tuple[str, ...] | None, data: dict[str, Any]
) -> None:
    """写前复查指纹：被并发改动过就报错，不覆盖别人的改动。"""
    if stat_key(path) != before:
        raise Fail(f"{path.name} 在操作期间被改动过，已中止。重新执行一次。")
    write_json(path, data)


def _git(
    *args: str, timeout: int | None = None, check: bool = False
) -> subprocess.CompletedProcess:
    """跑一条 git 命令，吞掉输出（同步用，不污染 stdout）。

    check=True 让失败抛异常（推送要能被下面的兜底捕获）；提交则靠返回码分辨，
    因为不同仓库的提交检查（commitlint 等）会拒掉消息，需要看 stderr 原文。
    """
    return subprocess.run(
        list(args), capture_output=True, text=True, timeout=timeout, check=check
    )


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
            if (cand / PROGRESS_REL.name).is_file():
                try:
                    return cand.resolve().relative_to(Path(root).resolve()).as_posix()
                except ValueError:
                    break
    return PROGRESS_REL.parent.as_posix()


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
    exclude = f":(exclude){ledger_rel}"
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


def _rebase_retry(g: tuple[str, ...], ledger_rel: str) -> bool:
    """推送被拒后自动 rebase 一次；只在工作树干净时做，失败立刻 abort。

    台账按任务分条存（progress.json 是按任务号 key 的对象、history 一行一条），
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
    abort = _git(*g, "rebase", "--abort", timeout=30)
    if abort.returncode != 0:
        # abort 也失败：仓库现在真的停在 rebase 中间态，必须把真实状态原样交出去。
        # 谎称「已回滚」最坏 —— 那时 progress.json 可能带冲突标记，继续写会全盘读坏。
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
            "本地台账有未提交改动，写前取最新会覆盖它，已中止本次操作：\n  "
            + "\n  ".join(dirty)
            + '\n  处理：先提交这份改动（`git add ledger/ && git commit -m "chore(ledger): ..."`）'
            "再重跑；确认不要它可加 --no-sync。"
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


def git_presync(action: str, args: argparse.Namespace) -> None:
    """写命令执行前把「这条命令真的要写的那几个文件」刷成远端最新。

    范围只到本次写入目标：`ledger/progress.json`（每条写命令都写），以及 `close`
    时结案时间所在的那一个月历史文件（`--finished` 补录旧月份就刷那个月）——不是
    整个 history 目录。`ledger/worklog/` 的正文由人写，这里只补「远端有、本地缺」
    的新文件，已有文件一个字都不碰。本地有会被覆盖掉的东西（未推送提交 / 未提交
    改动 / 未入库且远端同名）就中止，不静默覆盖。
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

    root = str(git_root)
    progress_rel = f"{ledger_rel}/{PROGRESS_REL.name}"
    worklog_rel = f"{ledger_rel}/{WORKLOG_DIR.name}"
    # 只刷「这条命令真的要写」的文件：progress.json 人人都写；
    # 历史层只有 close 写，而且只写结案时间所在的那一个月（--finished 可能补录旧月份）。
    managed = [progress_rel]
    if action == "close":
        finished = ""
        raw_finished = getattr(args, "finished", None)
        if raw_finished:
            try:
                finished = normalize_time(raw_finished, field="--finished")
            except Fail:
                finished = ""  # 参数不合法交给 close 自己报错，这里按当前月兜底
        target = (
            history_path_for(repo, finished)
            if finished
            else history_path_for(repo, now())
        )
        try:
            managed.append(target.resolve().relative_to(git_root.resolve()).as_posix())
        except ValueError:
            pass  # 历史文件不在仓内：跳过（写的时候自有报错）

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
            print(
                "提示：写前推送失败"
                f"（{_why(pushed.stderr or pushed.stdout, f'退出码 {pushed.returncode}')}）。",
                file=sys.stderr,
            )

    # 补推后复查：补推失败（多半是本地有你自己的提交，脚本不替你 rebase）时，
    # 这里仍会把「台账提交领先」拦下来，避免写进过期数据。
    _presync_guard(root, upstream, managed, remote_files)

    for rel in remote_files:
        _presync_fetch_file(root, upstream, rel)

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

    @ 只是展示层约定：存储（progress.json）与 --owner 匹配始终用裸名字，
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
    它们来自 git config user.name，含 `|` 也不稀奇。分类/标签由 close 传 task 终值。
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
    for raw in text.splitlines():
        if not raw.strip().startswith("|"):
            out.append(raw)
            continue
        cells = split_row(raw)
        if not cells:
            out.append(raw)
            continue
        if _is_sep_row(cells):
            out.append(HISTORY_SEP)
            continue
        if _looks_like_header(cells):
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
) -> tuple[str, int]:
    """把一行历史追加到指定历史文件，返回 (新全文, 升级行数)。

    读目标 → upgrade_history → 解析不了就按现有列数追加（绝不把 9 列写进少列表头）
    → 文件不存在则带 9 列表头新建。close 专用：「行落哪个月」之外，
    历史行的落盘逻辑只此一处。分类/标签/creator 由 close 传 task 终值。
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
        )
    try:
        text = history_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        raise Fail(f"读不了 {history_path}：{exc}")
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
        )
    new_text, n = upgraded
    return (
        new_text
        + history_line(
            finished, created, title, owner, summary, log_rel, category, tags, creator
        ),
        n,
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
    stamp = id_stamp(created) if created else datetime.now().strftime("%Y%m%d-%H%M")
    for _ in range(20):
        tid = f"{stamp}-{slug}-{secrets.token_hex(2)}"
        if tid not in tasks:
            return tid
    raise Fail("任务号连续冲突 20 次，请检查状态表是否异常。")


def load_task(repo: Path, tid: str) -> dict[str, Any]:
    data = read_json(repo / PROGRESS_REL)
    task = data["tasks"].get(tid)
    if task is None:
        raise Fail(f"没有任务 {tid}（可能已被结案或删除）。用 list 看现有任务。")
    return task


def require_owner(task: dict, tid: str, me: str) -> None:
    """只有当前 owner 能变更该任务；owner 取变更前的值，不放行就报错。"""
    owner = task.get("owner")
    if not owner:
        status = task.get("status")
        if status == "open":
            raise Fail(f"任务 {tid} 还没人认领（open）。先认领再操作：claim --id {tid}")
        raise Fail(
            f"任务 {tid} 的 status 是 {status} 却没有 owner，状态表不一致。先跑 validate。"
        )
    if owner != me:
        raise Fail(
            f"任务 {tid} 的 owner 是 {owner}，不是你（{me}）。\n"
            f'要接手得让 {owner} 先交接：set --id {tid} --owner "{me}"'
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
        month = datetime.now().strftime("%Y%m")
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
    """过程文档相对 ledger/ 的路径。状态表记它，历史层也记它，两处同口径。"""
    return (
        (worklog_dir_for(task) / worklog_name(tid))
        .relative_to(WORKLOG_DIR.parent)
        .as_posix()
    )


def find_worklog(
    repo: Path, tid: str, task: dict[str, Any] | None = None
) -> Path | None:
    """定位任务的过程文档。

    先信状态表里记的路径（记了就不猜）；没记再按新命名推算；最后回退到
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
    """把 worklog 标成已封卷：封卷标记并进头部引用块。"""
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


def cmd_init(args: argparse.Namespace) -> None:
    repo = find_repo(args.repo)
    progress = repo / PROGRESS_REL
    with progress_lock(progress):
        if progress.exists():
            print(f"已存在，未改动：{progress.relative_to(repo)}")
            return
        before, data = read_guarded(progress)
        data.setdefault("tasks", {})
        commit_guarded(progress, before, data)
    print(f"已创建 {progress.relative_to(repo)}")
    print("按需创建的目录（worklog/、history/ 等）留到实际有内容时再建。")


def cmd_new(args: argparse.Namespace) -> None:
    repo = find_repo(args.repo)
    path = repo / PROGRESS_REL
    if not path.exists():
        raise Fail(f"{PROGRESS_REL} 不存在，先跑 init。")
    creator = git_user()
    created = normalize_time(args.created, field="--created") if args.created else now()
    # 参数自检前移：分类/标签形态校验在锁外做，失败的调用不该占着锁
    category = (
        normalize_label(args.category, field="--category") if args.category else None
    )
    tags = parse_tags(args.tags, field="--tags") if args.tags else []

    with progress_lock(path):
        before, data = read_guarded(path)
        tasks = data["tasks"]

        tid = args.id or make_id(args.title, tasks, created)
        require_task_id(tid)
        if tid in tasks:
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
        # 路径先算好再落盘：文件名不等于任务号，状态表不记就只能靠约定去猜。
        task["worklog"] = worklog_rel(tid, task)
        tasks[tid] = task
        commit_guarded(path, before, data)
        try:
            log = write_worklog(repo, tid, task)
        except Fail as exc:
            # 过程文档建不出来就把刚写进去的任务撤掉，别留下「有任务、没文档」
            tasks.pop(tid, None)
            try:
                write_json(path, data)
            except Fail:
                pass
            # 撤销完成：别让写后自动同步把这个「有任务、没文档」的半成品提交上去
            CHANGED_FILES.clear()
            raise Fail(f"创建失败，已从状态表撤销该任务：{exc}")
        record_exec(repo, tid, task, creator, "new", f"创建任务（{task['status']}）")
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
    print(f"  worklog {log.relative_to(repo)}")
    if not args.self:
        print(f"\n空开状态。谁做谁认领：progress.py claim --id {tid}")
    print_worklog(repo, tid, task)


def cmd_claim(args: argparse.Namespace) -> None:
    repo = find_repo(args.repo)
    tid = require_task_id(args.id)
    owner = git_user()  # 先取身份：拿不到就直接报错，不进入后续判断
    path = repo / PROGRESS_REL
    with progress_lock(path):
        before, data = read_guarded(path)
        task = data["tasks"].get(tid)
        if task is None:
            raise Fail(f"没有任务 {tid}。")
        if task.get("owner"):
            raise Fail(
                f"任务 {tid} 状态不一致：owner 已是 {task['owner']}，但 status 是 {task.get('status')}。先跑 validate。"
            )
        if task.get("status") != "open":
            raise Fail(
                f"任务 {tid} 当前状态是 {task.get('status')}，只有 open 才能认领。"
            )

        stamp = now()
        task["owner"] = owner
        task["status"] = "doing"
        task["started"] = task.get("started") or stamp
        task["updated"] = stamp
        commit_guarded(path, before, data)
        record_exec(repo, tid, task, owner, "claim", "认领 → doing")
    print(f"已认领 {tid} → doing，owner = @{owner}")
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
    me = git_user()
    path = repo / PROGRESS_REL
    with progress_lock(path):
        before, data = read_guarded(path)
        task = data["tasks"].get(tid)
        if task is None:
            raise Fail(f"没有任务 {tid}。")
        require_owner(task, tid, me)

        changed = []
        if status is not None:
            task["status"] = status
            if status == "open":
                task["owner"] = None
                task["started"] = None
            changed.append(f"status={status}")

        if args.owner is not None:
            old = task.get("owner")
            task["owner"] = args.owner.strip().lstrip(
                "@"
            )  # 容忍「@名字」写法；存储与匹配用裸名
            if task.get("status") == "open":
                task["status"] = "doing"
            task["started"] = task.get("started") or now()
            changed.append(f"owner {old or '（无）'} → {task['owner']}")

        task["updated"] = now()
        commit_guarded(path, before, data)
        # 释放认领（退回 open）单列一个类型，便于一眼看出「被释放过」
        kind = "release" if status == "open" else "set"
        record_exec(repo, tid, task, me, kind, "，".join(changed))
    print(f"已更新 {tid}：" + "，".join(changed))
    print_worklog(repo, tid, task)


def cmd_log(args: argparse.Namespace) -> None:
    repo = find_repo(args.repo)
    tid = require_task_id(args.id)
    note = " ".join(args.note.split())
    if not note:
        raise Fail("--note 不能为空：一句话写清这轮做了什么。")
    me = git_user()
    path = repo / PROGRESS_REL
    with progress_lock(path):
        before, data = read_guarded(path)
        task = data["tasks"].get(tid)
        if task is None:
            raise Fail(f"没有任务 {tid}（可能未建或已结案；封卷后不再记）。")
        require_owner(task, tid, me)
        task["updated"] = now()
        commit_guarded(path, before, data)
        written = record_exec(repo, tid, task, me, "log", note)
    if not written:
        raise Fail(
            f"没写进 {tid} 的过程文档（文件不存在或不可读）；progress.json 的 updated 已刷新。"
            "先用 show --id 确认 worklog 路径，不要手写「执行记录」。"
        )
    print(f"已记入 {tid} 的执行记录：{note}")


def cmd_close(args: argparse.Namespace) -> None:
    repo = find_repo(args.repo)
    tid = require_task_id(args.id)
    me = git_user()
    progress_path = repo / PROGRESS_REL
    # 参数自检前移：--category / --tags 的形态校验在锁外做（None = 没传，沿用建档值）
    close_category = (
        normalize_label(args.category, field="--category") if args.category else None
    )
    close_tags = parse_tags(args.tags, field="--tags") if args.tags else None

    with progress_lock(progress_path):
        before, data = read_guarded(progress_path)
        task = data["tasks"].get(tid)
        if task is None:
            raise Fail(f"没有任务 {tid}（可能已结案）。")
        require_owner(task, tid, me)
        if task.get("finished"):
            raise Fail(f"任务 {tid} 已经结案过了。")

        finished = (
            normalize_time(args.finished, field="--finished")
            if args.finished
            else now()
        )
        title = " ".join((task.get("title") or tid).split())
        summary = " ".join(args.summary.split())
        if not summary:
            raise Fail("--summary 不能为空：写清楚「做成了什么」。")

        owner = task.get("owner") or me
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
        history_path = history_path_for(repo, finished)
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
        new_history, history_upgrade_n = append_history_line(
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
                exec_line(finished, me, "close", f"结案：{summary}"),
            ),
            finished,
            owner,
        )

        # 落盘前复查：三个文件都没被别人动过
        for p, mark in (
            (progress_path, before),
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
            print(
                f"历史层已升级为 9 列（补分类/标签/creator，{history_upgrade_n} 行转换），原文件备份在 {bak_path.name}",
                file=sys.stderr,
            )

        backups: dict[Path, bytes] = {}
        created: list[Path] = []
        for p in (progress_path, history_path, log_path):
            try:
                backups[p] = p.read_bytes()
            except FileNotFoundError:
                created.append(p)
            except OSError as exc:
                raise Fail(f"读不了 {p} 用于备份：{exc}")

        # 顺序：先写历史与过程文档，**最后**才从状态表移除。
        # 中途崩溃最坏是「历史多一行、状态还留着」，可重跑识别，不会丢记录。
        try:
            write_text_atomic(history_path, new_history)
            write_text_atomic(log_path, new_log)
            write_json(
                progress_path, {"tasks": {k: v for k, v in sorted(new_tasks.items())}}
            )
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
    print(f"  从 {PROGRESS_REL} 移出")
    print(f"  追加到 {history_path.relative_to(repo)}")
    print(f"  封卷 {log_path.relative_to(repo)}")
    if final_cat or final_tags:
        print(f"  分类    {final_cat or '—'}")
        if final_tags:
            print(f"  标签    {'、'.join(final_tags)}")
    print(f"\n摘要：{summary}")


def cmd_list(args: argparse.Namespace) -> None:
    repo = find_repo(args.repo)
    path = repo / PROGRESS_REL
    if not path.exists():
        raise Fail(f"{PROGRESS_REL} 不存在：这个项目还没初始化，先跑 init。")
    data = read_json(path)

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

    since = normalize_time(args.since, field="--since") if args.since else None
    until = (
        normalize_time(args.until, field="--until", date_only_ref="23:59:59")
        if args.until
        else None
    )

    me = git_user() if args.mine else None

    rows = []
    for tid, task in sorted(data["tasks"].items()):
        if me is not None and task.get("owner") != me:
            continue
        if args.owner and task.get("owner") != args.owner.strip().lstrip("@"):
            continue
        if wanted is not None and task.get("status") not in wanted:
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
        rows.append((tid, task))

    if args.json:
        print(
            json.dumps({tid: task for tid, task in rows}, ensure_ascii=False, indent=2)
        )
        return

    if not rows:
        print("没有符合条件的在办任务。")
        return

    print(f"在办任务 {len(rows)} 条：\n")
    for tid, task in rows:
        who = f"@{task['owner']}" if task.get("owner") else "（待认领）"
        print(f"  [{task.get('status')}] {tid}")
        print(f"      {task.get('title')} — owner={who}，created={task.get('created')}")
        if task.get("category") or task.get("tags"):
            cat = task.get("category") or "—"
            line = f"      分类：{cat}"
            if task.get("tags"):
                line += f" ｜ 标签：{'、'.join(task['tags'])}"
            print(line)
    print(
        "\n细节在 worklog 里（路径记在状态表 worklog 字段）；已结案的用 history 子命令查"
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
        path = repo / PROGRESS_REL
        with progress_lock(path):
            before, data = read_guarded(path)
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
                print(f"没有在办任务的分类/标签等于「{old}」。")
                return
            # 先改在办 worklog 头部（展示副本与真源同口径），最后才提交状态表：
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
            commit_guarded(path, before, data)
        print(f"已归并「{old}」→「{new_label}」，涉及 {len(changed)} 个在办任务：")
        for tid in changed:
            print(f"  {tid}")
        return

    # --all：worklog 目录是唯一来源 —— 在办任务的 worklog 也在里面（new 建档即写），
    # 与状态表合并会重复计数；已结案任务状态表已移除、只剩 worklog，天然只计一次。
    cat_count: dict[str, int] = {}
    tag_count: dict[str, int] = {}
    wdir = repo / WORKLOG_DIR
    n_logs = 0
    if wdir.is_dir():
        for log in sorted(wdir.rglob("*.md")):
            try:
                text = log.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            cat, tags = parse_label_line(text)
            n_logs += 1
            if cat:
                cat_count[cat] = cat_count.get(cat, 0) + 1
            for t in tags:
                tag_count[t] = tag_count.get(t, 0) + 1
    if not cat_count and not tag_count:
        print("还没有任何分类/标签：new 时用 --category / --tags 让 Agent 自行总结。")
        return
    print(f"扫描 {n_logs} 份 worklog：\n")
    print("分类（看板统计轴，精确匹配）：")
    for cat, n in sorted(cat_count.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {n:>4}  {cat}")
    print("\n标签（下钻用，包含匹配）：")
    for t, n in sorted(tag_count.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {n:>4}  {t}")
    low = sorted(t for t, n in tag_count.items() if n <= 2)
    if low:
        print(
            f"\n低频标签（≤2 次，疑似变体）：{'、'.join(low)}\n"
            "归并：tags --rename <旧> <新>（只改在办任务；已封卷文档不动）"
        )


def cmd_validate(args: argparse.Namespace) -> None:
    repo = find_repo(args.repo)
    progress_path = repo / PROGRESS_REL
    problems: list[str] = []
    blank: list[str] = []

    if not progress_path.exists():
        raise Fail(f"{PROGRESS_REL} 不存在，先跑 init。")

    data = read_json(progress_path)
    for tid, task in sorted(data["tasks"].items()):
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
            problems.append(f"{tid}: status=done 不该留在状态表（该用 close 结案）")
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
                f"{tid}: 缺 worklog 文件（状态表记的路径：{task.get('worklog') or '未记'}）"
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

    print(f"✓ 校验通过（在办 {len(data['tasks'])} 条）")

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
        old_n = sum(1 for r in hrecords if r["fmt"] != "v8")
        if old_n:
            print(
                f"提示：{rel} 含 {old_n} 行旧格式（4 / 5 / 6 列）；"
                "只读文件不自动升级，新记录一律按 8 列写入 ledger/history/。",
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
    since = normalize_time(args.since, field="--since") if args.since else None
    until = (
        normalize_time(args.until, field="--until", date_only_ref="23:59:59")
        if args.until
        else None
    )

    repo = find_repo(args.repo)
    sources = history_sources(repo)
    want_owner = (
        args.owner.strip().lstrip("@") if args.owner else None
    )  # 容忍「@名字」写法
    me = git_user() if args.mine else None
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
        if me is not None and r["owner"] != me:
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
    span = f"，创建 {since or '…'} ~ {until or '…'}" if (since or until) else ""
    print(f"已结案 {len(rows)} 条{label}{span}：\n")

    def _who(r: dict[str, Any]) -> str:
        return f"@{r['owner']}" if r["owner"] else "（无 owner）"

    width = max(len(_who(r)) for r in rows)
    for r in rows:
        who = _who(r).ljust(width)
        print(
            f"  {r['time']}  建 {r.get('created') or '—'}  {who}  "
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
        description="管理项目任务进度（ledger/progress.json + worklog + 历史）",
    )
    parser.add_argument(
        "--no-sync",
        action="store_true",
        help="跳过写前取最新与写后自动 git 提交 / 推送（等价于 TASK_LEDGER_NO_SYNC=1）",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    def add_repo(p: argparse.ArgumentParser) -> None:
        p.add_argument("--repo", help="当前工作区（项目根）。agent 调用时应显式传入")

    p = sub.add_parser("init", help="建 ledger/progress.json")
    add_repo(p)
    p.set_defaults(func=cmd_init)

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

    p = sub.add_parser("set", help="改状态 / 交接（结案请用 close）")
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
    p.add_argument("--mine", action="store_true", help="只看自己的")
    p.add_argument("--owner", help="只看某个人的")
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

    p = sub.add_parser("validate", help="校验状态表与 worklog")
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
        print(f"错误：{exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        presync_rollback()
        print("已中断。", file=sys.stderr)
        return 130
    except BrokenPipeError:
        # 输出被下游截断（如 | head）：命令本身已经写成功，不回滚。
        # 但写后同步必须照做 —— 早先这里直接 return 0，台账就停在「已写未提交」
        # 状态，下一笔写被 guard 拦成「本地台账有未提交改动」，用户只能手动提交。
        # stdout 先接到 /dev/null，免得 git_sync 里再碰这个断掉的管道。
        devnull = os.open(os.devnull, os.O_WRONLY)
        os.dup2(devnull, sys.stdout.fileno())
        PRESYNC_BACKUPS.clear()
        git_sync(args.command)
        return 0
    except OSError as exc:
        presync_rollback()
        print(f"错误：{exc}", file=sys.stderr)
        return 1
    except Exception as exc:  # noqa: BLE001 —— 兜底：未预期的失败用独立退出码，与业务错误区分
        presync_rollback()
        print(f"错误：未预期的失败 {type(exc).__name__}: {exc}", file=sys.stderr)
        return 3
    PRESYNC_BACKUPS.clear()  # 写成功：留底作废
    git_sync(args.command)  # 写成功后一次性自动同步（commit / push）
    return 0


if __name__ == "__main__":
    sys.exit(main())
