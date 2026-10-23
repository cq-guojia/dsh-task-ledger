"""建任务：拿外壳算好的任务号写过程文档、写进池（或直接写进自己的分片）。

`tid` / `created` 由外壳算好传进来（锁层要靠它们算出那篇文档的路径），
业务层不许现算现用；缺了就是外壳的 bug，直接 Fail。
"""

from __future__ import annotations

from pathlib import Path

from ..core.identity import Identity
from ..core.ids import require_task_id
from ..core.labels import normalize_label, parse_tags
from ..core.paths import POOL_REL, shard_rel, to_repo_rel, worklog_rel
from ..core.worklog_md import exec_line
from ..errors import Fail
from ..store.atomic import ensure_dir, restore, snapshot
from ..store.task_store import TaskStore
from ..store.worklog_store import WorklogStore
from .result import Result, WorklogView, rel

FIELDS = ("created", "title", "status", "owner", "creator", "worklog")


def new_task(
    repo: Path,
    me: Identity,
    *,
    title: str,
    tid: str,
    created: str,
    category: str | None = None,
    tags: tuple[str, ...] = (),
    mine: bool = False,
) -> Result:
    """写序：`ensure_dir(当月文档目录)` → 过程文档（含首条记录）→ 台账。"""
    if not (title or "").strip():
        raise Fail("标题不能为空。")
    if not tid:
        raise Fail("建任务必须由外壳先算好任务号（内部错误：tid 为空）。")
    if not created:
        raise Fail("建任务必须由外壳先算好创建时间（内部错误：created 为空）。")
    tid = require_task_id(tid)
    clean_title = " ".join(title.strip().split())
    category = normalize_label(category, field="分类") if category else None
    tag_list = parse_tags(tags)

    mine_store = TaskStore(repo, shard_rel(me.email), identity=me)
    pool = TaskStore(repo, POOL_REL)
    target = mine_store if mine else pool

    # 查重：池 + 我自己的分片，**并且在锁内重读**（锁外的快照只配决定锁多宽）
    if target.get(tid) is not None:
        raise Fail(f"任务号 {tid} 已经存在了（这不是重跑，是重号）。")
    other = pool if mine else mine_store
    if other.get(tid) is not None:
        raise Fail(f"任务号 {tid} 已经存在了（这不是重跑，是重号）。")

    doc_rel = worklog_rel(tid, created)   # 别叫 rel：那是 result.rel 的函数名
    path = repo / to_repo_rel(doc_rel)
    logs = WorklogStore(repo)
    before_doc = snapshot(path)

    task = {
        "title": clean_title,
        "created": created,
        "status": "open",
        "owner": me.email if mine else None,
        "creator": me.email,
        "category": category,
        "tags": list(tag_list),
        "worklog": doc_rel,
        "started": None,
        "updated": created,
        "finished": None,
    }
    try:
        ensure_dir(path.parent)
        logs.create(
            tid=tid,
            title=clean_title,
            created=created,
            creator=me.email,
            category=category,
            tags=tag_list,
            first_exec=exec_line(created, me.email, "new", "创建任务"),
        )
        target.put(tid, task)
    except Exception:
        # 同一个 atom 内收尾：台账那条 drop 掉，文档原本不存在 ⇒ restore(None) 删掉
        target.drop(tid)
        restore(path, before_doc)
        raise

    text = logs.read(path)
    return Result(
        changed=FIELDS,
        where=rel(repo, target.path),
        message=f"新建任务 {tid}：{clean_title}",
        worklog=WorklogView(path=rel(repo, path), text=text, error=None),
        payload={"tid": tid},
        notices=(f"新建过程文档：{rel(repo, path)}",),
    )
