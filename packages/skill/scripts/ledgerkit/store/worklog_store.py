"""过程文档 `worklog/<年月>/*.md`：找一篇、读、列全部、建新篇、写回、追加执行记录。

模板的**读取**在这里（`template()` 是全仓唯一读 `assets/worklog.md` 的地方），
套模板的字符串替换归 `core/worklog_md.render_worklog`。
写回只走「锚点编辑后的新全文」，不许用它替换前五节正文。
"""

from __future__ import annotations

from pathlib import Path

from .. import notices
from ..core import worklog_md
from ..core.paths import (
    WORKLOG_DIR,
    WORKLOG_TEMPLATE,
    to_repo_rel,
    worklog_name,
    worklog_rel,
)
from .atomic import ensure_dir, write_text_atomic

FALLBACK_TEMPLATE = """# <id>：<title>

> **创建**：<created>（@<creator>）

## 背景

## 待办

## 下一步

## 过程

## 结论

## 执行记录

<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。 -->
"""


class WorklogStore:
    def __init__(self, repo: Path):
        self.repo = Path(repo)

    # ---- 模板 ----

    def template(self) -> str:
        """六节模板：读不到 `assets/worklog.md` → 内置骨架 + 一条提示。"""
        try:
            if WORKLOG_TEMPLATE.exists():
                return WORKLOG_TEMPLATE.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            pass
        notices.note(
            "提示：读不到模板 assets/worklog.md，本次用内置骨架建篇（六节齐全，正文仍是空的）。"
        )
        return FALLBACK_TEMPLATE

    # ---- 找 ----

    def find(self, tid: str, worklog_rel_value: str | None = None) -> Path | None:
        """定位一篇过程文档：先信任务对象里记的路径，再按命名推算，最后扫目录。"""
        if worklog_rel_value:
            cand = self.repo / to_repo_rel(worklog_rel_value)
            if cand.is_file():
                return cand
        base = self.repo / to_repo_rel(WORKLOG_DIR)
        names = (worklog_name(tid), f"{tid}.md")
        dirs = [base]
        if base.is_dir():
            dirs += sorted(d for d in base.iterdir() if d.is_dir())
        for directory in dirs:
            for name in names:
                cand = directory / name
                if cand.is_file():
                    return cand
        return None

    def by_name(self, log_name: str) -> Path | None:
        """按文件名找（历史末列回链用）。"""
        base = self.repo / to_repo_rel(WORKLOG_DIR)
        if not base.is_dir():
            return None
        direct = base / log_name
        if direct.is_file():
            return direct
        for path in sorted(base.rglob(log_name)):
            if path.is_file():
                return path
        return None

    def all(self) -> list[Path]:
        """递归列出全部过程文档。"""
        base = self.repo / to_repo_rel(WORKLOG_DIR)
        if not base.is_dir():
            return []
        return sorted(p for p in base.rglob("*.md") if p.is_file())

    # ---- 读 ----

    def read(self, path: Path) -> str:
        try:
            return path.read_text(encoding="utf-8-sig")
        except FileNotFoundError:
            return ""
        except OSError as exc:
            raise ValueError(f"读 {path} 失败：{exc}") from exc

    def head_meta(self, path: Path) -> dict:
        """头部四样：`created` / `creator` / `category` / `tags`；读不出给空值。"""
        text = self.read(path)
        category, tags = worklog_md.head_meta(text)
        return {
            "created": worklog_md.head_created(text),
            "creator": worklog_md.head_creator(text),
            "category": category,
            "tags": list(tags),
        }

    # ---- 写 ----

    def create(
        self,
        *,
        tid: str,
        title: str,
        created: str,
        creator: str,
        category: str | None = None,
        tags: tuple[str, ...] = (),
        first_exec: str | None = None,
    ) -> Path:
        """一次写完整篇（含首条执行记录）。返回绝对路径。"""
        rel = worklog_rel(tid, created)
        path = self.repo / to_repo_rel(rel)
        ensure_dir(path.parent)
        text = worklog_md.render_worklog(
            tid=tid,
            title=title,
            created=created,
            creator=creator,
            category=category,
            tags=tags,
            template=self.template(),
        )
        if first_exec:
            text = worklog_md.append_exec_log(text, first_exec)
        write_text_atomic(path, text)
        return path

    def write(self, path: Path, text: str) -> None:
        """写回「锚点编辑后的新全文」；不许用它替换前五节正文。"""
        write_text_atomic(path, text)

    def append_exec(self, path: Path, line: str) -> bool:
        """追加一条执行记录；写不进返回 False，**不抛**（调用方自己决定报不报）。"""
        try:
            text = path.read_text(encoding="utf-8-sig")
        except (OSError, UnicodeDecodeError):
            return False
        try:
            write_text_atomic(path, worklog_md.append_exec_log(text, line))
        except Exception:  # noqa: BLE001 —— 写不进是这条记录的失败，不该掀翻整条命令
            return False
        return True
