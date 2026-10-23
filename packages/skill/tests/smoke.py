#!/usr/bin/env python3
"""端到端冒烟：真起一个临时 git 仓库，按用户视角跑命令。

只用 `--no-sync`（不 fetch / 不提交 / 不推），所以能在任何机器上跑。
跑法：`python3 -B packages/skill/tests/smoke.py`
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
PROGRESS = SCRIPTS / "progress.py"
PY = sys.executable

FAILED: list[str] = []


def run(repo: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [PY, "-B", str(PROGRESS), "--repo", str(repo), "--no-sync", *args],
        capture_output=True,
        text=True,
        cwd=str(repo),
        check=False,
    )


def check(name: str, cond: bool, detail: str = "") -> None:
    print(f"{'ok  ' if cond else 'FAIL'} {name}{'' if cond else ' :: ' + detail}")
    if not cond:
        FAILED.append(name)


def main() -> int:
    repo = Path(tempfile.mkdtemp(prefix="ledgerkit-smoke-"))
    subprocess.run(["git", "init", "-q", str(repo)], check=False)
    subprocess.run(
        ["git", "-C", str(repo), "config", "user.email", "me@example.com"], check=False
    )
    subprocess.run(["git", "-C", str(repo), "config", "user.name", "Me"], check=False)

    try:
        # 建任务
        r = run(repo, "new", "--title", "冒烟任务", "--self")
        check("new 退出码 0", r.returncode == 0, r.stderr)
        check("new 打印落点", "落点" in r.stdout, r.stdout)

        r = run(repo, "list")
        check("list 有一条", "在办 1 条" in r.stdout, r.stdout)

        r = run(repo, "list", "--json")
        check("list --json 是对象", r.stdout.strip().startswith("{"), r.stdout)

        # 取任务号
        import json

        tid = next(iter(json.loads(r.stdout)), "")
        mine_task = json.loads(r.stdout)[tid]
        check(
            "new --self 建出来就是 doing",
            mine_task["status"] == "doing",
            r.stdout,
        )
        check("new --self owner 是我", mine_task["owner"] == "me@example.com", r.stdout)
        check("new --self 记了 started", bool(mine_task["started"]), r.stdout)

        # 释放 → 认领（自动 doing）→ 记进展 → set 指向自己走空转
        r = run(repo, "set", "--id", tid, "--owner", "")
        check("release 退出码 0", r.returncode == 0, r.stderr)
        r = run(repo, "claim", "--id", tid)
        check("claim 退出码 0", r.returncode == 0, r.stderr)
        r = run(repo, "list", "--json")
        check(
            "claim 后 status 是 doing",
            json.loads(r.stdout)[tid]["status"] == "doing",
            r.stdout,
        )
        r = run(repo, "log", "--id", tid, "--note", "冒烟记一条")
        check("log 退出码 0", r.returncode == 0, r.stderr)
        r = run(repo, "set", "--id", tid, "--owner", "me@example.com")
        check(
            "set 指向自己 = 空转",
            r.returncode == 0 and "无需重复" in r.stdout,
            r.stdout,
        )

        # show / history / validate / tags
        r = run(repo, "show", "--id", tid)
        check("show 退出码 0", r.returncode == 0, r.stderr)
        r = run(repo, "validate", "--json")
        check("validate 无问题", '"problems": []' in r.stdout, r.stdout)
        r = run(repo, "tags", "--all", "--json")
        check("tags --all 有 tasks 键", '"tasks"' in r.stdout, r.stdout)
        r = run(repo, "tags")
        check(
            "裸 tags 报业务错（退 1 + 人话）",
            r.returncode == 1 and "必须带 --all" in (r.stdout + r.stderr),
            r.stdout + r.stderr,
        )
        # 结案 → 历史
        r = run(repo, "close", "--id", tid, "--summary", "冒烟结案")
        check("close 退出码 0", r.returncode == 0, r.stderr)
        r = run(repo, "history", "--count-only")
        check(
            "history 计数 1",
            '"count": 1' in r.stdout and '"capped": false' in r.stdout,
            r.stdout,
        )
        r = run(repo, "history", "--json")
        check("history json 有 records", '"records"' in r.stdout, r.stdout)

        # 关掉字节码：产物里不许有 __pycache__
        pycache = list(SCRIPTS.rglob("__pycache__"))
        check("没有 __pycache__", not pycache, str(pycache))
    finally:
        shutil.rmtree(repo, ignore_errors=True)

    print()
    if FAILED:
        print(f"冒烟失败 {len(FAILED)} 项：{FAILED}")
        return 1
    print("冒烟全绿。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
