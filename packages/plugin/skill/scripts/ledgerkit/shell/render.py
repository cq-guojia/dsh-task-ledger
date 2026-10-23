"""唯一打印处。一个返回类型一个函数，**不做统一分发**；也**不 flush**。

`flush_notices()` 只在 `cli.main` 的 `finally` 里调一次 —— 提交 / 推送阶段冒出来的提示也才打得到。
"""

from __future__ import annotations

import json
import sys
from typing import Any

from .. import notices
from ..actions.query import HistoryQuery, ListQuery
from ..actions.result import (
    Census,
    HistoryResult,
    ListResult,
    Result,
    ShowResult,
    ValidationReport,
)
from ..core.time import fmt_local


def _out(text: str = "") -> None:
    print(text)


def _err(text: str) -> None:
    print(text, file=sys.stderr)


def flush_notices() -> None:
    """把 `notices` 一次性打到 stderr（退出前调一次，同一句只打一次）。"""
    for line in notices.warnings():
        _err(line)
    notices.clear()


def fail_message(exc: BaseException, *, title: str = "错误") -> None:
    """业务错误 / 未预期错误的 stderr 输出。"""
    _err(f"{title}：{exc}")


def _json(data: Any) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2))


def result(res: Result, *, as_json: bool) -> None:
    """写动作：一律人话（`--json` 不挂写动作，传进来也按人话打）。"""
    del as_json
    if res.dry_run:
        _out("预览：本次没有写任何文件。")
    elif res.already_done:
        _out("无需重复：这次没有新的改动。")
    else:
        _out(f"已改：{'、'.join(res.changed) if res.changed else '（无字段改动）'}")
    if res.where:
        _out(f"落点：{res.where}")
    for line in res.notices:
        _err(line)
    if res.worklog is not None:
        if res.worklog.path:
            _out(f"过程文档：{res.worklog.path}")
        elif res.worklog.error:
            _err(f"过程文档：{res.worklog.error}")


def list_view(res: ListResult, q: ListQuery | None, *, as_json: bool) -> None:
    if as_json:
        _json({tid: task for tid, task in res.rows.items()})
        return
    if not res.table:
        _out("没有符合条件的在办任务。")
        return
    _out(f"在办 {len(res.table)} 条：")
    for row in res.table:
        owner = row.owner or "（未认领）"
        _out(f"  {row.tid}  {row.status:<6} {owner:<12} {row.title}")
    for line in res.notices:
        _err(line)


def show_view(res: ShowResult, *, as_json: bool) -> None:
    if as_json:
        _json(
            {
                "task": res.task,
                "worklog": {
                    "path": res.worklog.path if res.worklog else None,
                    "text": res.worklog.text if res.worklog else None,
                    "error": res.worklog.error if res.worklog else None,
                },
                "others": list(res.others),
            }
        )
        return
    task = res.task
    _out(f"{task.get('tid', '')}：{task.get('title', '')}")
    _out(f"  状态：{task.get('status', '')}　负责人：{task.get('owner') or '（未认领）'}")
    _out(
        f"  创建：{fmt_local(task.get('created'))}　"
        f"最后更新：{fmt_local(task.get('updated'))}"
    )
    if res.others:
        _out(f"  还出现在：{'、'.join(res.others)}")
    if res.worklog is None:
        return
    if res.worklog.error:
        _err(f"  过程文档：{res.worklog.error}")
    elif res.worklog.path:
        _out(f"  过程文档：{res.worklog.path}")


def history_view(res: HistoryResult, q: HistoryQuery | None, *, as_json: bool) -> None:
    # `--count-only` 是**计数口径**：固定两个键的 JSON（§六 / ledger-data.md 第七节）。
    # 它与 `--json` 互斥（同给即用法错），所以这里不看 as_json —— 否则那个分支永远是死代码。
    if q is not None and q.count_only:
        _json({"count": res.count, "capped": res.capped})
        return
    if as_json:
        _json(
            {
                "count": res.count,
                "filters": res.filters,
                "records": list(res.records),
                "warnings": list(res.warnings),
                "capped": res.capped,
            }
        )
        return
    if not res.records:
        _out("没有符合条件的结案记录。")
        return
    _out(f"已结案 {res.count} 条：")
    for row in res.records:
        _out(
            f"  {fmt_local(row.get('finished'))}  "
            f"{row.get('owner') or '（无人）':<12} {row.get('title', '')}"
        )
    for line in res.warnings:
        _err(f"警告：{line}")


def validate_view(rep: ValidationReport, *, as_json: bool) -> None:
    if as_json:
        _json(
            {
                "problems": list(rep.problems),
                "notices": list(rep.notices),
                "checked_files": rep.checked_files,
                "total_tasks": rep.total_tasks,
            }
        )
        return
    _out(f"体检：查了 {rep.checked_files} 个文件、{rep.total_tasks} 条任务。")
    if rep.problems:
        _out(f"问题 {len(rep.problems)} 条：")
        for line in rep.problems:
            _out(f"  - {line}")
    else:
        _out("没有发现问题。")
    for line in rep.notices:
        _err(f"提示：{line}")


def census_view(res: Census, *, as_json: bool) -> None:
    if as_json:
        _json(
            {
                "tasks": res.tasks,
                "categories": res.categories,
                "tags": res.tags,
                "owners": res.owners,
                "months": res.months,
                "notices": list(res.notices),
            }
        )
        return
    _out(f"在办文档 {res.tasks} 篇。")
    if res.categories:
        _out(f"  分类：{_kv(res.categories)}")
    if res.tags:
        _out(f"  标签：{_kv(res.tags)}")
    if res.owners:
        _out(f"  按人：{_kv(res.owners)}")
    if res.months:
        _out(f"  按月：{_kv(res.months)}")
    for line in res.notices:
        _err(f"提示：{line}")


def _kv(mapping: dict[str, int]) -> str:
    return "、".join(f"{k}({v})" for k, v in sorted(mapping.items(), key=lambda kv: -kv[1]))
