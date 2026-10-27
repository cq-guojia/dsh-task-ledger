"""只读：看一条任务。**文档优先**——读到文档就知道状态，不再翻索引（2026-10-27）。

两条路径：
- 文档存在且头部有状态行 ⇒ 完全按文档自述回答（`status` / 负责人 / 更新时间 / 标题），
  pool、分片、历史一个都不读，已结案的任务同样看得到；
- 文档没有状态行（老文档）或根本没有文档 ⇒ 回退 `load_task` 查在办索引，
  返回里标 `legacy=True`，让调用方知道这些字段不是文档自述的。
"""

from __future__ import annotations

from pathlib import Path

from ..core import worklog_md
from ..core.identity import Identity
from ..store.worklog_store import WorklogStore
from .guard import load_task
from .result import ShowResult, WorklogView, rel


def show_task(repo: Path, me: Identity, tid: str) -> ShowResult:
    logs = WorklogStore(repo)
    path = logs.find(tid)  # 只按任务号找文件名：不碰 pool / 分片 / 历史
    text = logs.read(path) if path is not None else ""
    status = worklog_md.read_status(text) if text else None
    if status is not None and path is not None:
        head_tid, title = worklog_md.head_title(text)
        return ShowResult(
            task={
                "tid": head_tid or tid,
                "title": title,
                "status": status.status,
                "owner": status.uuid,
                "owner_name": status.name,
                "created": worklog_md.head_created(text),
                "updated": status.when,
                "finished": worklog_md.head_frozen(text),
            },
            worklog=WorklogView(path=rel(repo, path), text=text, error=None),
        )

    # 老文档 / 文档缺失：回退查在办（找不到会抛，文案与既往一致）
    task, where = load_task(repo, tid)
    if path is None:
        view = WorklogView(
            path=None, text=None, error="这条任务没有过程文档（或文档已不在原处）。"
        )
    else:
        view = WorklogView(path=rel(repo, path), text=text or None, error=None)
    return ShowResult(
        task=task,
        worklog=view,
        others=tuple(rel(repo, p) for p in where),
        legacy=True,
    )
