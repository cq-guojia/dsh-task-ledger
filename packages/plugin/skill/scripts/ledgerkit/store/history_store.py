"""已结案 `history/<年月>.md`：列全部文件、读一篇、算「追加一行后的新全文」、判重、落盘。

「算」和「落」是两个方法 —— 结案要控顺序（历史 → 封卷 → 删分片），落盘时机由业务层定。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ..core import history_md
from ..core.paths import HISTORY_DIR, to_repo_rel
from .atomic import write_text_atomic

HIT = "hit"
MISS = "miss"
UNDECIDABLE = "undecidable"


class HistoryStore:
    def __init__(self, repo: Path):
        self.repo = Path(repo)

    # ---- 读 ----

    def sources(self) -> list[Path]:
        """按月的 `history/*.md`（按文件名排序）。"""
        base = self.repo / to_repo_rel(HISTORY_DIR)
        return sorted(base.glob("*.md")) if base.is_dir() else []

    def month_key(self, path: Path) -> str:
        """按月文件的 `YYYYMM`。"""
        stem = Path(path).stem
        return stem if len(stem) == 6 and stem.isdigit() else ""

    def read(self, path: Path) -> str:
        try:
            return path.read_text(encoding="utf-8-sig")
        except FileNotFoundError:
            return ""
        except OSError as exc:
            raise ValueError(f"读 {path} 失败：{exc}") from exc

    # ---- 判重 ----

    def has_log(
        self,
        path: Path,
        *,
        log_name: str | None,
        created: str | None,
        title: str | None,
    ) -> str:
        """这个月的历史里已经有这条了吗？三态：`hit` / `miss` / `undecidable`。

        有末列就比**文件名**（不比整条路径）。末列为空的行改按「创建时间 + 工作包」两列比
        —— 那种行在调用方给不出 `created` / `title` 时判不了，明说 `undecidable`，不拿 miss 冒充。
        """
        records, _ = history_md.parse_history(self.read(path))
        undecidable = False
        for row in records:
            worklog = (row.get("worklog") or "").strip()
            if log_name and worklog:
                if Path(worklog).name == Path(log_name).name:
                    return HIT
                continue
            if log_name is None and worklog:
                # 历史行里有链接，但这次判不出对应的是哪篇文档（任务的过程文档丢了 / 被移走）：
                # 判不了就明说。拿 miss 冒充会再追加一行 ⇒ 同一条任务两条结案记录。
                undecidable = True
                continue
            if not worklog:
                if created and title:
                    if row.get("created") == created and row.get("title") == title:
                        return HIT
                else:
                    undecidable = True
        return UNDECIDABLE if undecidable else MISS

    # ---- 算 ----

    def append_row(self, path: Path, row: dict[str, Any]) -> dict[str, Any]:
        """算出「追加这一行后的新全文」，**不落盘**。返回 `text` / `duplicate`。"""
        original = self.read(path)
        duplicate = (
            self.has_log(
                path,
                log_name=_name_of(row.get("worklog")),
                created=row.get("created"),
                title=row.get("title"),
            )
            == HIT
        )
        text = original if original.strip() else _fresh_table()
        line = history_md.history_line(
            row.get("finished") or "",
            row.get("created"),
            row.get("title") or "",
            row.get("owner"),
            row.get("summary") or "",
            row.get("worklog"),
            row.get("category"),
            row.get("tags"),
            row.get("creator"),
        )
        return {"text": _append_line(text, line), "duplicate": duplicate}

    # ---- 写 ----

    def write(self, path: Path, text: str) -> None:
        """历史表唯一的写回口：只用于「结案追加」的结果落盘。"""
        write_text_atomic(path, text)


def _name_of(worklog: str | None) -> str | None:
    return Path(worklog).name if worklog else None


def _fresh_table() -> str:
    """当月第一次结案：按九列表头起表（表头的真源只有 `history_md` 一处）。"""
    return (
        f"{history_md.HISTORY_TITLE}\n\n"
        f"{history_md.HISTORY_HEADER}\n{history_md.HISTORY_SEP}\n"
    )


def _append_line(text: str, line: str) -> str:
    body = text.rstrip("\n")
    if body and not body.splitlines()[-1].strip().startswith("|"):
        # 表前有散文：补一个空行，别把表头贴上去
        return body + "\n\n" + line
    return body + "\n" + line
