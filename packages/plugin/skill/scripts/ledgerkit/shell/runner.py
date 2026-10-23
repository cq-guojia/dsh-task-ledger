"""七步的执行顺序：唯一创建记账本、唯一决定退出码、唯一统一回滚的地方。

七步：绑记账本 → 取最新 → 自举 → 调动作 → 打印 → 提交 → 推送。
（仓库定位在更前面，见 `run` 开头。）

- `Result.dry_run` ⇒ 跳过「提交 / 推送」；`already_done` **不**跳过（写没写只看记账本）。
- 记账本为空 ⇒ 提交与推送都跳过（没脏文件就没得提交）。
- **唯一不回滚的失败分支是 `BrokenPipeError`**：文件已经写完，照常提交推送。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .. import notices
from ..actions import registry
from ..actions.atom import atom
from ..actions.guard import current_identity
from ..core.ids import make_id
from ..core.time import now, to_utc
from ..errors import (
    BUSINESS,
    INTERRUPTED,
    OK,
    UNEXPECTED,
    Fail,
)
from ..store import dirty
from . import render
from .gitops import GitRepo
from .presync import presync_scope

def run(command: str, args: argparse.Namespace) -> int:
    """跑一条命令，返回退出码。"""
    log = dirty.WriteLog()
    try:
        with dirty.bound(log):
            return _run(command, args, log)
    except Fail as exc:
        log.rollback_presync()
        log.discard_created()
        render.fail_message(exc)
        return BUSINESS
    except BrokenPipeError:
        # 唯一不回滚的分支：文件已写，按记账本照常提交推送
        _finalize(command, args, log, broken=True)
        return OK
    except KeyboardInterrupt:
        log.rollback_presync()
        log.discard_created()
        return INTERRUPTED
    except Exception as exc:  # noqa: BLE001 —— 兜底：任何未预期异常都要留下可诊断信息
        log.rollback_presync()
        log.discard_created()
        render.fail_message(exc, title="未预期错误")
        return UNEXPECTED


def _run(command: str, args: argparse.Namespace, log: dirty.WriteLog) -> int:
    spec = registry.spec_of(command)
    repo = _repo_of(args)
    me = current_identity(repo)
    dry_run = bool(getattr(args, "dry_run", False))
    no_sync = bool(getattr(args, "no_sync", False))
    as_json = bool(getattr(args, "json", False))

    params = _params(command, args, repo, me, spec)

    # 只读：不建 GitRepo、不进事务、不提交
    if spec.readonly:
        value = spec.func(repo, me, **params)
        _render(spec, value, args, as_json=as_json)
        if getattr(value, "problems", ()):
            return BUSINESS   # validate 有 problems ⇒ 退出码 1（§六）
        return OK

    boot_scope, act_scope = presync_scope(repo, me, spec.lock_action or command, params)
    git = GitRepo(repo)

    if not dry_run and not no_sync:
        git.guard_before_write(boot_scope | act_scope)
        for path, before in git.sync_down(boot_scope | act_scope):
            log.record_presync(path, before)

    if not dry_run:
        with atom(repo, *boot_scope.files):
            me = registry.bootstrap_func()(repo, me)

    with atom(repo, *act_scope.files):
        value = spec.func(repo, me, **params)

    _render(spec, value, args, as_json=as_json)
    _finalize(command, args, log, message=getattr(value, "message", None))
    return OK


def _finalize(
    command: str,
    args: argparse.Namespace,
    log: dirty.WriteLog,
    *,
    message: str | None = None,
    broken: bool = False,
) -> None:
    """提交 + 推送：要不要做只看记账本（与 `already_done` 无关，`dry_run` / `--no-sync` 才整段跳过）。"""
    if broken:
        try:
            sys.stdout.close()
        except Exception:  # noqa: BLE001
            pass
    if getattr(args, "dry_run", False) or getattr(args, "no_sync", False):
        if getattr(args, "no_sync", False) and log.has_writes():
            # 以前这条路径一个字都不打，「已写未提交」就此静默腐烂
            notices.note(
                "提示：--no-sync 本次只写了本地文件、未签入 git（也未推送）。\n"
                "  处理：确认后自行 git add ledger && git commit && git push；"
                "留着不提交的话，下一条写命令会被「本地有未提交的台账改动」拦住。"
            )
        log.clear()
        return
    if not log.has_writes():
        log.clear()
        return
    repo = _repo_of(args)
    git = GitRepo(repo)
    message = message or f"chore(ledger): {command}"
    git.commit(log.commit_set(), message)
    git.push()
    log.clear()


def _render(spec: registry.ActionSpec, value, args, *, as_json: bool) -> None:
    func = getattr(render, spec.render)
    if spec.render in ("list_view", "history_view"):
        func(value, getattr(args, "q", None), as_json=as_json)
    else:
        func(value, as_json=as_json)


def _params(
    command: str, args: argparse.Namespace, repo: Path, me, spec: registry.ActionSpec
) -> dict:
    """按 `spec.params` 从 args 里挑；**不许把整个 args 透传进业务层**。"""
    out: dict = {}
    for key in spec.params:
        out[key] = getattr(args, key, None)
    if command == "new":
        created = out.get("created") or now()
        if getattr(args, "created", None):
            created = to_utc(args.created, field="--created")
        out["created"] = created
        if not out.get("tid"):
            out["tid"] = make_id(out.get("title") or "", _task_snapshot(repo, me), created)
        out["tags"] = tuple(out.get("tags") or ())
    if command == "close":
        out["finished"] = (
            to_utc(args.finished, field="--finished")
            if getattr(args, "finished", None)
            else now()
        )
        out["tags"] = tuple(out.get("tags") or ())
    return out


def _task_snapshot(repo: Path, me) -> dict:
    """建任务查重要用的在办任务快照（**锁外**只读，只用于生成不撞的号）。"""
    from ..core.paths import POOL_REL, shard_rel
    from ..store.task_store import TaskStore

    tasks: dict = {}
    tasks.update(TaskStore(repo, POOL_REL).all())
    tasks.update(TaskStore(repo, shard_rel(me.email)).all())
    return tasks


def _repo_of(args: argparse.Namespace) -> Path:
    """工作区根：`cli.main` 已经解析好挂在 `args.repo` 上（定位只做一次）。

    直接调 runner（测试 / 内嵌调用）时没挂过 ⇒ 现解一次，规则与 cli 一致。
    """
    repo = getattr(args, "repo", None)
    if repo:
        return Path(repo)
    from .cli import resolve_repo  # 延迟导入：cli 在模块层 import runner

    return resolve_repo(None)



