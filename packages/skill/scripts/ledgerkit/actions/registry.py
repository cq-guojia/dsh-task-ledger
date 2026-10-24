"""动作名册：命令写法 → `ActionSpec`。只有 `shell/cli.py` 与 `shell/runner.py` 会 import 它。

**渲染函数只存名字**，不 import `shell/render.py` —— 否则 actions → shell 的依赖就反了；
由 runner 用 `getattr(render, spec.render)` 取到函数。
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from ..errors import Fail
from . import (
    bootstrap,
    claim,
    close_task,
    list_tasks,
    log_progress,
    new_task,
    query_history,
    set_task,
    show_task,
    validate,
)


@dataclass(frozen=True)
class ActionSpec:
    func: Callable  # (repo, me, **params) -> Result | 视图对象
    render: str  # 渲染函数**名**；runner 用 getattr 取
    readonly: bool = False
    lock_action: str = ""  # 交给 lock_scope 的动作名；默认同命令名
    params: tuple[str, ...] = field(default=())  # 从参数里挑哪些键传给 func


ACTIONS: dict[str, ActionSpec] = {
    "new": ActionSpec(
        new_task.new_task,
        "result",
        params=("title", "tid", "created", "category", "tags", "mine"),
    ),
    "claim": ActionSpec(claim.claim, "result", params=("tid",)),
    "set": ActionSpec(
        set_task.set_task,
        "result",
        params=("tid", "owner"),
        lock_action="set",
    ),
    "log": ActionSpec(log_progress.log_progress, "result", params=("tid", "note")),
    "close": ActionSpec(
        close_task.close_task,
        "result",
        params=("tid", "summary", "finished", "category", "tags"),
    ),
    "list": ActionSpec(
        list_tasks.list_tasks, "list_view", readonly=True, params=("q",)
    ),
    "show": ActionSpec(
        show_task.show_task, "show_view", readonly=True, params=("tid",)
    ),
    "history": ActionSpec(
        query_history.query_history, "history_view", readonly=True, params=("q",)
    ),
    "validate": ActionSpec(
        validate.validate, "validate_view", readonly=True, params=("deep",)
    ),
}

READONLY = tuple(name for name, spec in ACTIONS.items() if spec.readonly)


def spec_of(command: str) -> ActionSpec:
    """按命令写法取名册项；不在名册里就是用法错（业务错，退 1 人话）。"""
    spec = ACTIONS.get(command)
    if spec is None:
        raise Fail(f"未知命令：{command}")
    return spec


def bootstrap_func():
    """自举不是名册里的命令（runner 单独调），这里只给它的入口，避免 shell 直接 import 动作。"""
    return bootstrap.bootstrap
