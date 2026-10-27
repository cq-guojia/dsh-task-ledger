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
from ..core.roots import as_root, root_of
from ..core.time import to_utc
from ..errors import BUSINESS, OK, USAGE, Fail
from . import render, runner
from .gitops import repo_sync_lock

NO_SYNC_ENV = "TASK_LEDGER_NO_SYNC"


def build_parser() -> argparse.ArgumentParser:
    """动作名与只读名单从 `actions.registry` 取，不在 cli 里另写一份。"""
    parser = argparse.ArgumentParser(
        prog="progress.py", description="任务台账（本地文件 + git 同步）"
    )
    parser.add_argument(
        "--repo", help="工作区根（直接含有 ledger/ 的那个目录；默认按当前目录向上找）"
    )
    parser.add_argument(
        "--no-sync", action="store_true", help="只写本地，不取最新 / 不提交 / 不推送"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    new = sub.add_parser("new", help="建任务")
    new.add_argument("--title", required=True)
    new.add_argument("--id", dest="tid")
    new.add_argument("--created")
    new.add_argument("--category")
    new.add_argument("--tags")
    new.add_argument("--self", action="store_true", dest="mine")

    claim = sub.add_parser("claim", help="认领公共池里的任务")
    claim.add_argument("--id", required=True, dest="tid")

    setp = sub.add_parser("set", help="释放 / 交接 / 改标签")
    setp.add_argument("--id", required=True, dest="tid")
    setp.add_argument("--owner", help="交给别人的 uuid（交接）")
    setp.add_argument("--release", action="store_true", help="释放回公共池")
    setp.add_argument("--tags", help="改标签，顿号 / 逗号分隔")

    logp = sub.add_parser("log", help="记一条进展")
    logp.add_argument("--id", required=True, dest="tid")
    logp.add_argument("--note", required=True)

    close = sub.add_parser("close", help="结案")
    close.add_argument("--id", required=True, dest="tid")
    close.add_argument("--summary", required=True)
    close.add_argument("--finished")
    close.add_argument("--tags")

    listp = sub.add_parser("list", help="查在办任务")
    listp.add_argument("--pool", action="store_true")
    listp.add_argument("--mine", action="store_true")
    listp.add_argument(
        "--owner", help="某个人的 uuid（精确匹配；名字请用 --owner-name）"
    )
    listp.add_argument(
        "--owner-name", dest="owner_name", help="按显示名模糊筛（子串、不分大小写）"
    )
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
    hist.add_argument(
        "--owner", help="某个人的 uuid（精确匹配；名字请用 --owner-name）"
    )
    hist.add_argument(
        "--owner-name", dest="owner_name", help="按显示名模糊筛（子串、不分大小写）"
    )
    hist.add_argument("--mine", action="store_true")
    hist.add_argument("--category")
    hist.add_argument("--tag")
    hist.add_argument("--since")
    hist.add_argument("--until")
    hist.add_argument("--limit", type=int)
    hist.add_argument("--months", type=int)
    hist.add_argument("--count-only", action="store_true")
    hist.add_argument("--json", action="store_true")

    valp = sub.add_parser(
        "validate",
        help="台账体检（默认浅度；--deep 历史读全部月份；两档都不读过程文档）",
    )
    valp.add_argument("--deep", action="store_true")
    valp.add_argument("--json", action="store_true")

    who = sub.add_parser("whoami", help="我是谁（本机身份；未初始化也照常回答）")
    who.add_argument("--json", action="store_true")

    initp = sub.add_parser("init", help="初始化本机身份（一台机器只一次）")
    initp.add_argument("--claim", help="认领名册里已有的 uuid")
    initp.add_argument("--new", action="store_true", dest="new_id", help="新建身份")
    initp.add_argument("--name", help="新建身份时的显示名字（必填）")
    initp.add_argument(
        "--yes",
        action="store_true",
        help="已禁用：身份写入只能在真终端交互完成",
    )

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
            owner_name=getattr(args, "owner_name", None),
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
            owner_name=getattr(args, "owner_name", None),
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
    return str(getattr(args, "command", ""))


def _split_tags(value: str | None) -> tuple[str, ...]:
    if not value:
        return ()
    # 分隔符与 core/labels._SPLIT_RE 保持一致：少一个「、」就会把
    # 「甲、乙」静默合成一个标签（2026-10-24 修）
    for sep in ("，", "、"):
        value = value.replace(sep, ",")
    return tuple(t.strip() for t in value.split(",") if t.strip())


def resolve_repo(arg: str | None, start: Path | None = None) -> Path:
    """`--repo` 给了就校验后用；没给就从 `start`（默认 cwd）往上找。

    找不到 ⇒ Fail：绝不在当前目录自作主张建台账（2026-10-22 设计定稿）。
    建台账是第一条写命令的事，不需要、也没有 `init` 子命令。
    """
    if arg:
        return as_root(arg, source="--repo")
    here = (start or Path.cwd()).resolve()
    root = root_of(here)
    if root is None:
        raise Fail(
            "找不到台账：从当前目录往上都没有 ledger/ 目录。\n"
            "  处理：用 --repo <工作区根> 指定（根是直接含 ledger/ 的那个目录，不是 ledger/ 本身）；\n"
            "  或先 cd 到项目根再跑。第一条写命令会自动把 ledger/ 建出来，不用先初始化。"
        )
    return root


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
    if command == "whoami":
        return _run_whoami(args)
    if command == "init":
        return _run_init(args)
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


def _print_candidates(opts: list[dict]) -> None:
    print("这台机器还没初始化。当前仓库里已有的用户：")
    for i, opt in enumerate(opts, 1):
        print(f"  {i}. @{opt['name']}   {opt['uuid']}")


def _print_init_result(res: dict) -> None:
    name_disp = res.get("name") or res["uuid"][:8]
    if res.get("already"):
        print(f"已经初始化过，未做改动：@{name_disp}   {res['uuid']}")
        print(f"文件：{res['path']}")
        return
    print(f"\x1b[32m✓ 已初始化：\x1b[0m@{name_disp}   {res['uuid']}")
    print(f"文件：{res['path']}")


def _select_identity(opts: list[dict], *, title: str) -> tuple[str, int | None]:
    """交互式选身份：↑/↓ 移动、Enter 确认、Ctrl-C 取消，末尾「+ 新建身份」。

    返回 (kind, index)：kind∈{claim,new,cancel}；claim/new 时 index 为候选项下标。
    TTY 下用 raw 键盘 + 原地重绘（不整屏清屏、不动滚动条）；不支持时退回编号输入。
    仅在 TTY 调用。
    """
    entries = list(opts) + [{"new": True}]
    n = len(entries)
    height = n + 4  # 标题 + 空行 + n 个选项 + 空行 + 提示

    def _frame(sel: int) -> list[str]:
        rows = ["\x1b[1;36m" + title + "\x1b[0m", ""]
        for i, e in enumerate(entries):
            label = (
                "+ 新建身份（自己输入名字）"
                if e.get("new")
                else f"@{e['name']}   {e['uuid']}"
            )
            rows.append(
                "\x1b[7m  ❯ " + label + "  \x1b[0m" if i == sel else "    " + label
            )
        rows += ["", "\x1b[2m  ↑/↓ 移动     Enter 确认     ESC / Ctrl-C 退出\x1b[0m"]
        return rows

    try:
        fd = sys.stdin.fileno()
        if not sys.stdin.isatty():
            raise OSError("not a tty")
        import os
        import select
        import termios
        import tty

        old = termios.tcgetattr(fd)
        sel = 0
        drew = False
        result: tuple[str, int | None] = ("cancel", None)
        try:
            tty.setraw(fd)
            sys.stdout.write("\x1b[?25l")  # 隐藏光标
            while True:
                if drew:
                    sys.stdout.write("\x1b[1A" * height)  # 相对上移回块顶
                else:
                    sys.stdout.write("\n")  # 另起一行，不覆盖 shell 提示
                    drew = True
                # promptui 同款：每行「清整行 + 回车 + 内容 + LF」
                for row in _frame(sel):
                    sys.stdout.write("\x1b[2K\r" + row + "\n")
                sys.stdout.flush()

                ch = os.read(fd, 1)
                if ch == b"\x1b":
                    # 区分「单独 ESC（退出）」与「方向键 ESC [ A/B」：短暂等待后续字节
                    if not select.select([fd], [], [], 0.05)[0]:
                        result = ("cancel", None)
                        break
                    nxt = os.read(fd, 1)
                    if nxt in (b"[", b"O"):
                        k = os.read(fd, 1)
                        if k == b"A":
                            sel = (sel - 1) % n
                        elif k == b"B":
                            sel = (sel + 1) % n
                elif ch in (b"\r", b"\n"):
                    result = (
                        ("new", None) if entries[sel].get("new") else ("claim", sel)
                    )
                    break
                elif ch == b"\x03":  # Ctrl-C
                    result = ("cancel", None)
                    break
        finally:
            sys.stdout.write("\x1b[?25h")  # 显示光标
            if drew:
                # promptui 同款擦除：逐行「上移 + 清整行 + 回车」，不动主屏滚动
                sys.stdout.write("\x1b[1A\x1b[2K\r" * height)
            termios.tcsetattr(fd, termios.TCSADRAIN, old)
            sys.stdout.flush()
        return result
    except (OSError, ImportError):
        print(title)
        for i, o in enumerate(opts, 1):
            print(f"  {i}. @{o['name']}   {o['uuid']}")
        print(f"  {n}. + 新建身份")
        while True:
            try:
                c = input(f"选编号(1-{n})：").strip()
            except (EOFError, KeyboardInterrupt):
                return ("cancel", None)
            if c.lower() in ("n", "new"):
                return ("new", None)
            try:
                idx = int(c) - 1
            except ValueError:
                continue
            if idx == len(opts):
                return ("new", None)
            if 0 <= idx < len(opts):
                return ("claim", idx)
    return ("cancel", None)


def _confirm(question: str) -> bool:
    """Y/N 确认：Y 返回 True，N 返回 False；Ctrl-C/Ctrl-D 向上抛，当作取消退出。"""
    while True:
        ans = input(question + " [Y/N]：").strip().lower()
        if ans in ("y", "yes"):
            return True
        if ans in ("n", "no"):
            return False
        print("请输入 Y 或 N。")


def _run_whoami(args: argparse.Namespace) -> int:
    """只读机器身份：不解析台账、不碰 git、不看 `--repo`。

    未初始化**不是错误**：照常回答（`uuid` / `name` 双 null），由调用方据此引导 init。
    """
    from .. import env

    try:
        identity = env.read_identity()
    except Fail as exc:
        render.fail_message(exc)
        return BUSINESS
    render.whoami_view(identity, as_json=bool(getattr(args, "json", False)))
    return OK


def _run_init(args: argparse.Namespace) -> int:
    """init 不进 runner、不解析台账、不碰 git：只写机器身份文件。

    交互式：裸 init 在真终端读名册、让用户箭头选 / 新建；无终端（agent）只报候选、不写。
    """
    from .. import env
    from ..actions.init_identity import init_identity

    repo: Path | None = None
    raw = getattr(args, "repo", None)
    try:
        repo = as_root(raw, source="--repo") if raw else root_of(Path.cwd().resolve())
    except Fail:
        repo = None
    claim = getattr(args, "claim", None)
    new = bool(getattr(args, "new_id", False))
    name = (getattr(args, "name", "") or "").strip()
    yes = bool(getattr(args, "yes", False))
    tty = sys.stdin.isatty()

    try:
        if yes:
            raise Fail(
                "--yes 已禁用：身份写入只能在真终端交互完成，Agent 不得代写或重建身份。\n"
                "  处理：请用户在自己的终端运行 `python3 progress.py init --repo <工作区根>`。"
            )
        existing = env.read_identity()
        if existing is not None:
            # 已初始化：幂等空转（带不带 flag 都一样，零写）
            res = init_identity(repo, claim=claim, new=new, name=name)
        elif claim or new or name:
            # 身份写入只能由用户在真终端交互完成；非终端（agent）一律拒绝（2026-10-26 事故）
            if not tty:
                raise Fail(
                    "身份写入只能在真终端交互完成；Agent 不得代写或代为重建身份。\n"
                    "  处理：请用户在自己的终端运行 `python3 progress.py init --repo <工作区根>`，\n"
                    "  由 ta 亲自选择/新建并确认。"
                )
            res = init_identity(repo, claim=claim, new=new, name=name)
        else:
            # 裸 init：先看名册
            res = init_identity(repo, claim=None, new=False, name="")
            if res.get("need_choose"):
                opts = res.get("options", [])
                if not tty:
                    _print_candidates(opts)
                    print(
                        "请重跑：init --claim=<uuid>  认领，或  init --new --name=<名字>  新建"
                    )
                    return 0
                while True:
                    kind, idx = _select_identity(
                        opts, title="这台机器还没初始化。选择你的身份，或新建一个："
                    )
                    if kind == "cancel":
                        print(
                            "\x1b[2m✕ 已取消初始化。随时可重跑 init 重新开始。\x1b[0m"
                        )
                        return 0
                    if kind == "new":
                        prompt_name = input("输入用户名：").strip()
                        if not prompt_name:
                            print("\x1b[2m✕ 未输入用户名，已取消。\x1b[0m")
                            return 0
                        if not _confirm(
                            f"您确认要用「{prompt_name}」这个名称新建账户吗？"
                        ):
                            continue  # N：回到选择菜单重来
                        res = init_identity(
                            repo, claim=None, new=True, name=prompt_name
                        )
                        break
                    chosen = opts[idx]
                    if not _confirm(f"您确认是要使用「@{chosen['name']}」这个身份吗？"):
                        continue  # N：回到选择菜单重来
                    res = init_identity(repo, claim=chosen["uuid"], new=False, name="")
                    break
            else:
                # 名册空：交互输入名字；非终端交给用户去终端跑（init_identity 会报需要名字）
                prompt_name = input("输入用户名：").strip() if tty else ""
                res = init_identity(repo, claim=None, new=tty, name=prompt_name)
    except Fail as exc:
        render.fail_message(exc)
        return BUSINESS
    except (ValueError, IndexError):
        render.fail_message(Fail("输入无效，初始化已取消。"))
        return BUSINESS
    except (KeyboardInterrupt, EOFError):
        # 中途 Ctrl-C / Ctrl-D：平静取消，不抛栈、干净退出
        print("\x1b[2m✕ 已取消初始化。随时可重跑 init 重新开始。\x1b[0m")
        return 0
    _print_init_result(res)
    return 0


def _readonly(command: str) -> bool:
    from ..actions.registry import spec_of

    return spec_of(command).readonly


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
