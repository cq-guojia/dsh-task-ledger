"""命令行：只做解析与装配，不碰文件。

- `--json` 与 `--count-only` 互斥（退出码 2）。
- `TASK_LEDGER_NO_SYNC` **只在这里读一次**，折成 `args.no_sync` 往下传。
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from ..actions.query import HistoryQuery, ListQuery
from ..core.paths import LEDGER_DIR
from ..core.time import to_utc
from ..errors import BUSINESS, USAGE, Fail
from . import render, runner
from .gitops import repo_sync_lock

NO_SYNC_ENV = "TASK_LEDGER_NO_SYNC"


def build_parser() -> argparse.ArgumentParser:
    """动作名与只读名单从 `actions.registry` 取，不在 cli 里另写一份。"""
    parser = argparse.ArgumentParser(
        prog="progress.py", description="任务台账（本地文件 + git 同步）"
    )
    parser.add_argument(
        "--repo", help="台账所在仓库（默认按当前目录向上找含 ledger/ 的目录）"
    )
    parser.add_argument(
        "--no-sync", action="store_true", help="只写本地，不取最新 / 不提交 / 不推送"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    new = sub.add_parser("new", help="建任务")
    new.add_argument("--title", required=True)
    new.add_argument("--id")
    new.add_argument("--created")
    new.add_argument("--category")
    new.add_argument("--tags")
    new.add_argument("--self", action="store_true", dest="mine")

    claim = sub.add_parser("claim", help="认领公共池里的任务")
    claim.add_argument("--id", required=True, dest="tid")

    setp = sub.add_parser("set", help="释放 / 交接任务")
    setp.add_argument("--id", required=True, dest="tid")
    setp.add_argument("--owner")

    logp = sub.add_parser("log", help="记一条进展")
    logp.add_argument("--id", required=True, dest="tid")
    logp.add_argument("--note", required=True)

    close = sub.add_parser("close", help="结案")
    close.add_argument("--id", required=True, dest="tid")
    close.add_argument("--summary", required=True)
    close.add_argument("--finished")
    close.add_argument("--category")
    close.add_argument("--tags")

    tags = sub.add_parser("tags", help="标签统计")
    tags.add_argument("--all", action="store_true")
    tags.add_argument("--json", action="store_true")

    listp = sub.add_parser("list", help="查在办任务")
    listp.add_argument("--pool", action="store_true")
    listp.add_argument("--mine", action="store_true")
    listp.add_argument("--owner")
    listp.add_argument("--status")
    listp.add_argument("--category")
    listp.add_argument("--tag")
    listp.add_argument("--since")
    listp.add_argument("--until")
    listp.add_argument("--json", action="store_true")

    showp = sub.add_parser("show", help="看一条任务")
    showp.add_argument("--id", required=True, dest="tid")
    showp.add_argument("--json", action="store_true")

    hist = sub.add_parser("history", help="查已结案")
    hist.add_argument("--owner")
    hist.add_argument("--mine", action="store_true")
    hist.add_argument("--category")
    hist.add_argument("--tag")
    hist.add_argument("--since")
    hist.add_argument("--until")
    hist.add_argument("--limit", type=int)
    hist.add_argument("--months", type=int)
    hist.add_argument("--count-only", action="store_true")
    hist.add_argument("--json", action="store_true")

    valp = sub.add_parser("validate", help="台账体检")
    valp.add_argument("--json", action="store_true")

    # 宿主（插件 / SKILL.md）的调用写法是 `progress.py list --repo <仓库>`：
    # `--repo` 挂在**子命令后面**，所以每个子命令都要认；子命令给的值覆盖顶层那个。
    for parser_ in sub.choices.values():
        # default=SUPPRESS：子命令没给就不写回 namespace，否则会把顶层的 --repo 覆盖成 None
        parser_.add_argument(
            "--repo", default=argparse.SUPPRESS, help=argparse.SUPPRESS
        )

    return parser


def to_query(args: argparse.Namespace) -> None:
    """装配查询条件并挂到 `args.q`（参数 → 查询对象的装配只此一处）。"""
    command = getattr(args, "command", "")
    if command == "list":
        if getattr(args, "mine", False):
            scope = "mine"
        elif getattr(args, "pool", False):
            scope = "pool"
        elif getattr(args, "owner", None):
            scope = "owner"
        else:
            scope = "all"
        args.q = ListQuery(
            scope=scope,
            owner=getattr(args, "owner", None),
            statuses=tuple(
                s.strip()
                for s in (getattr(args, "status", "") or "").split(",")
                if s.strip()
            ),
            category=getattr(args, "category", None),
            tag=getattr(args, "tag", None),
            since=_utc_of(getattr(args, "since", None), "--since"),
            until=_utc_of(
                getattr(args, "until", None), "--until", date_only_ref="23:59:59"
            ),
        )
    elif command == "history":
        args.q = HistoryQuery(
            owner=getattr(args, "owner", None),
            mine=bool(getattr(args, "mine", False)),
            category=getattr(args, "category", None),
            tag=getattr(args, "tag", None),
            since=_utc_of(getattr(args, "since", None), "--since"),
            until=_utc_of(
                getattr(args, "until", None), "--until", date_only_ref="23:59:59"
            ),
            limit=getattr(args, "limit", None),
            months=getattr(args, "months", None),
            count_only=bool(getattr(args, "count_only", False)),
        )


def _utc_of(
    value: str | None, field: str, *, date_only_ref: str | None = None
) -> str | None:
    return to_utc(value, field=field, date_only_ref=date_only_ref) if value else None


def command_of(args: argparse.Namespace) -> str:
    """命令行 → 名册的键（命令写法）。"""
    command = str(getattr(args, "command", ""))
    if command == "tags" and getattr(args, "all", False):
        return "tags --all"
    return command


def _split_tags(value: str | None) -> tuple[str, ...]:
    if not value:
        return ()
    # 分隔符与 core/labels._SPLIT_RE 保持一致：少一个「、」就会把
    # 「甲、乙」静默合成一个标签（2026-10-24 修）
    for sep in ("，", "、"):
        value = value.replace(sep, ",")
    return tuple(t.strip() for t in value.split(",") if t.strip())


def resolve_repo(arg: str | None, start: Path | None = None) -> Path:
    """`--repo` 给了就用；没给就从 `start`（默认 cwd）往上找含 `ledger/` 的目录。

    找不到 ⇒ Fail：绝不在当前目录自作主张建台账（2026-10-22 设计定稿）。
    建台账是第一条写命令的事，不需要、也没有 `init` 子命令。
    """
    if arg:
        return Path(arg)
    here = (start or Path.cwd()).resolve()
    for candidate in (*here.parents, here):
        if (candidate / LEDGER_DIR).is_dir():
            return candidate
    raise Fail(
        "找不到台账：从当前目录往上都没有 ledger/ 目录。\n"
        "  处理：回到项目根再跑；或用 --repo <项目根> 指定。\n"
        "  第一条写命令会自动把 ledger/ 建出来，不用先初始化。"
    )


def _repo_of(args: argparse.Namespace) -> Path:
    """本次命令的工作区根（runner 与锁都用它；`main` 里已解析过一次）。"""
    return resolve_repo(getattr(args, "repo", None))


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if os.environ.get(NO_SYNC_ENV):
        args.no_sync = True
    if getattr(args, "json", False) and getattr(args, "count_only", False):
        parser.error("--json 与 --count-only 不能同时用")
        return USAGE
    for field in ("tags",):
        if hasattr(args, field):
            setattr(args, field, _split_tags(getattr(args, field)))
    to_query(args)

    command = command_of(args)
    try:
        # 定位只做一次：解析好的工作区根挂回 args，runner 与整命令锁都拿它
        args.repo = str(resolve_repo(getattr(args, "repo", None)))
        if _readonly(command):
            return runner.run(command, args)  # 只读不碰 git ⇒ 不拿同步锁
        with repo_sync_lock(_lock_dir(Path(args.repo))):
            return runner.run(command, args)
    except Fail as exc:
        render.fail_message(exc)
        return BUSINESS
    finally:
        render.flush_notices()


def _lock_dir(repo: Path) -> Path:
    """整命令锁放 **git 公共目录**里（不进仓库、不被 git status 看见；worktree 之间共享）。

    `repo/.git` 是目录 ⇒ 就是它；是文件 ⇒ 链接 worktree，按 `gitdir:` 指针反推公共目录
    （`<common>/worktrees/<name>` 的上级的上级）；两者都不成 ⇒ 不是 git 仓库，
    锁文件放系统临时目录（按仓库绝对路径哈希）—— 落用户工作区会被日后
    `git init && git add -A` 误提交（2026-10-24 修）。
    """
    dot = Path(repo) / ".git"
    if dot.is_dir():
        return dot
    if dot.is_file():
        try:
            text = dot.read_text(encoding="utf-8").strip()
        except OSError:
            text = ""
        if text.startswith("gitdir:"):
            common = Path(text.split(":", 1)[1].strip()).parent.parent
            if common.is_dir():
                return common
    import hashlib
    import tempfile

    key = hashlib.sha256(str(Path(repo).resolve()).encode("utf-8")).hexdigest()[:16]
    lock_dir = Path(tempfile.gettempdir()) / f"dsh-task-ledger-{key}"
    lock_dir.mkdir(parents=True, exist_ok=True)
    return lock_dir


def _readonly(command: str) -> bool:
    from ..actions.registry import spec_of

    return spec_of(command).readonly


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
