"""记进展：刷分片的「最后更新」，再往过程文档追加一行。"""

from __future__ import annotations

from pathlib import Path

from ..core.identity import Identity
from ..core.paths import shard_rel
from ..core.time import now
from ..core.worklog_md import exec_line
from ..errors import Fail
from ..store.task_store import TaskStore
from ..store.worklog_store import WorklogStore
from .guard import require_owner
from .result import Result, rel


def log_progress(repo: Path, me: Identity, tid: str, note: str) -> Result:
    """写序：刷 `updated` → 过程文档追加一行。

    文档写不进（`append_exec` 回 False）⇒ **不算失败**：分片已经刷了就照常提交，
    只留一条警告 —— 抛错让外壳回滚会变成「改了又不提交」，下一条命令被写前 guard 拦死。
    """
    text = " ".join((note or "").split())
    if not text:
        raise Fail("--note 不能为空。")
    mine = TaskStore(repo, shard_rel(me.uuid), identity=me)
    task = mine.get(tid)  # 锁内重读
    if task is None:
        raise Fail(f"任务 {tid} 不在我的分片里（只能给自己的任务记进展）。")
    # 分片里有、行内 owner 却不是我 ⇒ 台账脏了（validate ⑤），先拦下来
    require_owner(task, tid, me)

    updated = dict(task)
    updated["updated"] = now()
    mine.put(tid, updated)

    logs = WorklogStore(repo)
    path = logs.find(tid, updated.get("worklog"))
    if path is None:
        return Result(
            changed=("updated",),
            where=rel(repo, mine.path),
            message=f"{tid}：记进展",
            notices=(
                "提示：这条任务没有过程文档，已跳过执行记录（分片的最后更新已刷）。",
            ),
        )
    ok = logs.append_exec(path, exec_line(now(), me.label(), "log", text))
    if not ok:
        return Result(
            changed=("updated",),
            where=rel(repo, mine.path),
            message=f"{tid}：记进展",
            notices=(
                "警告：分片的最后更新已刷，过程文档补不上（文件不可写）；已写的分片照常提交，文档那行要手动补。",
            ),
        )
    return Result(
        changed=("updated",),
        where=rel(repo, mine.path),
        message=f"{tid}：记进展",
    )
