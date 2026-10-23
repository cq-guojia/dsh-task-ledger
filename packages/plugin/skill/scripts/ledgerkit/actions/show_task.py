"""只读：看一条任务（池 + 索引登记的全部分片都扫，别人的也要能看）。"""

from __future__ import annotations

from pathlib import Path

from ..core.identity import Identity
from ..store.worklog_store import WorklogStore
from .guard import load_task
from .result import ShowResult, WorklogView, rel


def show_task(repo: Path, me: Identity, tid: str) -> ShowResult:
    task, where = load_task(repo, tid)
    logs = WorklogStore(repo)
    path = logs.find(tid, task.get("worklog"))
    if path is None:
        view = WorklogView(
            path=None, text=None, error="这条任务没有过程文档（或文档已不在原处）。"
        )
    else:
        view = WorklogView(path=rel(repo, path), text=logs.read(path), error=None)
    return ShowResult(
        task=task,
        worklog=view,
        others=tuple(rel(repo, p) for p in where),
    )
