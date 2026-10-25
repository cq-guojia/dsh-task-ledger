"""结案：历史加一行 → 封卷过程文档 → **最后**删分片那行。

`finished` 必填、由外壳算好（同一个值也用于算锁集与刷取范围）—— 业务层不许再调时钟，
这是跨月刷错月份的唯一根因。
"""

from __future__ import annotations

from pathlib import Path

from ..core.identity import Identity, uuid_or_none
from ..core.labels import normalize_label, parse_tags
from ..core.paths import history_path_for, shard_rel, to_repo_rel, worklog_name
from ..core.worklog_md import (
    append_exec_log,
    exec_line,
    has_frozen_line,
    rewrite_label_line,
    stamp_frozen,
)
from ..errors import Fail
from ..store.atomic import ensure_dir, fingerprint, restore, snapshot
from ..store.history_store import HIT, UNDECIDABLE, HistoryStore
from ..store.task_store import TaskStore
from ..store.worklog_store import WorklogStore
from .guard import require_owner
from .result import Result, rel

_COLS_FALLBACK_HINT = "警告：历史表列数不是 9 且无法整体升级，本次按现有列数追加。"


def close_task(
    repo: Path,
    me: Identity,
    tid: str,
    *,
    summary: str,
    finished: str,
    category: str | None = None,
    tags: tuple[str, ...] | None = None,
) -> Result:
    """写序四步：改标签行 → 历史加一行 → 封卷 → 删分片（永远是最后一步）。"""
    if not finished:
        raise Fail("结案必须由外壳先算好时间（内部错误：finished 为空）。")
    text_summary = " ".join((summary or "").split())
    if not text_summary:
        raise Fail("结案要写一句「完成了什么」（--summary 不能为空）。")
    new_category = normalize_label(category, field="分类") if category else None
    new_tags = parse_tags(tags) if tags else None

    logs = WorklogStore(repo)
    history = HistoryStore(repo)
    hist_path = repo / to_repo_rel(history_path_for(finished))

    mine = TaskStore(repo, shard_rel(me.uuid), identity=me)
    task = mine.get(tid)  # 锁内重读
    if task is None:
        # 分片里已经没有这条：上次崩在「删分片」之后。只按过程文档名判重，命中即已结案
        state = history.has_log(
            hist_path, log_name=worklog_name(tid), created=None, title=None
        )
        if state == HIT:
            return Result(
                already_done=True,
                where=rel(repo, hist_path),
                notices=(f"任务 {tid} 已经结过案，无需重复。",),
            )
        raise Fail(f"任务 {tid} 不在我的分片里（只能结案自己的任务）。")

    # 分片里在、但行内 owner 不是我 ⇒ 台账脏了（validate 会报⑤）：先拦下来，别用我的 uuid 记历史
    require_owner(task, tid, me)

    # 历史行那两列取**最终值**：给了参数用新值，没给用任务原值，两处必须一致
    final_category = new_category if new_category else task.get("category")
    final_tags = tuple(new_tags) if new_tags else tuple(task.get("tags") or ())

    doc_path = logs.find(tid, task.get("worklog"))

    # 写前核对：指纹任一变了就中止，同时留三份字节备用
    paths = [p for p in (mine.path, hist_path, doc_path) if p is not None]
    stamps = {p: fingerprint(p) for p in paths}
    backups = {p: snapshot(p) for p in paths}

    try:
        log_name = Path(doc_path).name if doc_path else None
        state = history.has_log(
            hist_path,
            log_name=log_name,
            created=task.get("created"),
            title=task.get("title"),
        )
        if state == HIT:
            # 崩在②（历史行已写）之后、③/④之前：历史里已有，但分片行可能还在、
            # 过程文档可能还没封卷。不补齐就留下「已结案却仍在办」的僵尸 ——
            # 它还能收 log，甚至被释放推回公共池让别人认领（2026-10-24 修）。
            notes = [f"任务 {tid} 已经结过案，无需重复。"]
            if doc_path is not None:
                text = logs.read(doc_path)
                if not has_frozen_line(text):
                    frozen = stamp_frozen(text, finished, me.label())
                    frozen = append_exec_log(
                        frozen, exec_line(finished, me.label(), "close", "结案封卷")
                    )
                    logs.write(doc_path, frozen)
                    notes.append("补齐上次未完成的封卷。")
            if mine.get(tid) is not None:
                mine.drop(tid)
                notes.append("补齐上次未完成的移出分片。")
            return Result(
                already_done=True,
                where=rel(repo, hist_path),
                notices=tuple(notes),
            )
        if state == UNDECIDABLE:
            raise Fail(
                f"历史里有一条没有过程文档链接的旧行，判不出是不是 {tid} ⇒ 已中止，"
                f"请人工看一眼 {rel(repo, hist_path)} 再重跑。"
            )
        # 写前核对（2026-10-23 补）：三个文件的指纹与读到时不一致 ⇒ 有人在锁外动过，
        # 一个字节都不写（snapshot 那份留着给下面的异常分支按字节退回）。
        for path in paths:
            if fingerprint(path) != stamps[path]:
                raise Fail(
                    f"{rel(repo, path)} 在本命令执行期间被改动过"
                    "（可能是编辑器或 git 操作），已中止、未写入任何内容；重跑一次即可。"
                )

        # ① 改标签行（给了 --category / --tags 才做，且必须在封卷之前）
        if doc_path is not None and (new_category or new_tags):
            text = logs.read(doc_path)
            logs.write(doc_path, rewrite_label_line(text, final_category, final_tags))

        # ② 历史加一行（先 ensure_dir：首次结案时 history/ 可能还不存在）
        ensure_dir(hist_path.parent)
        out = history.append_row(
            hist_path,
            {
                "finished": finished,
                "created": task.get("created"),
                "title": task.get("title") or "",
                "category": final_category,
                "tags": final_tags,
                # 历史两列只存 **uuid**（身份唯一键）；显示名在读的时候按名册换，
                # 不落盘 —— 否则 `history --owner <uuid>` / `--mine` 永远比不到东西。
                # 老任务里的 creator 可能是显示名（旧版本写的）⇒ 形态不对就退回我，不把名字写进历史。
                "owner": me.uuid,
                "creator": uuid_or_none(task.get("creator")) or me.uuid,
                "summary": text_summary,
                "worklog": task.get("worklog") if doc_path else None,
            },
        )
        history.write(hist_path, out["text"])

        # ③ 封卷（没有过程文档就跳过）
        if doc_path is not None:
            text = logs.read(doc_path)
            if not has_frozen_line(text):
                frozen = stamp_frozen(text, finished, me.label())
                frozen = append_exec_log(
                    frozen, exec_line(finished, me.label(), "close", "结案封卷")
                )
                logs.write(doc_path, frozen)

        # ④ 删我分片那行（永远最后）
        mine.drop(tid)
    except Exception:
        for path in paths:
            if path in backups:
                restore(path, backups[path])
        raise

    notices: list[str] = []
    if out.get("fallback_cols"):
        notices.append(_COLS_FALLBACK_HINT)
    if doc_path is None:
        notices.append(f"提示：任务 {tid} 没有过程文档，已跳过封卷，历史末列留空。")
    return Result(
        changed=("status", "finished"),
        where=rel(repo, hist_path),
        message=f"结案 {tid}：{task.get('title') or ''}".strip(),
        payload={
            "history_path": rel(repo, hist_path),
            "worklog_path": rel(repo, doc_path) if doc_path else None,
            "fallback_cols": out.get("fallback_cols"),
        },
        notices=tuple(notices),
    )
