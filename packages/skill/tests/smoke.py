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

#: 本机身份 uuid（身份键只认 UUID，测试也用真形态；名字只用于显示与模糊筛）
ME = "11111111-1111-4111-8111-111111111111"

FAILED: list[str] = []


def run(repo: Path, *args: str) -> subprocess.CompletedProcess:
    import json
    import os

    home = Path(repo) / ".tlhome"
    idf = home / ".taskledger" / "identity.json"
    if not idf.exists():
        idf.parent.mkdir(parents=True, exist_ok=True)
        idf.write_text(json.dumps({"uuid": ME, "name": "Me"}), encoding="utf-8")
    return subprocess.run(
        [PY, "-B", str(PROGRESS), "--repo", str(repo), "--no-sync", *args],
        capture_output=True,
        text=True,
        cwd=str(repo),
        env={**os.environ, "TASK_LEDGER_HOME": str(home)},
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
        check("new --self owner 是我", mine_task["owner"] == ME, r.stdout)
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
        r = run(repo, "set", "--id", tid, "--owner", ME)
        check(
            "set 指向自己 = 空转",
            r.returncode == 0 and "无需重复" in r.stdout,
            r.stdout,
        )
        # 身份参数只收 uuid：传名字当场报错，不静默查不到
        r = run(repo, "set", "--id", tid, "--owner", "Me")
        check(
            "set --owner 传名字被拒",
            r.returncode == 1 and "--owner-name" in r.stderr,
            r.stdout + r.stderr,
        )

        # 查询：--owner 只收 uuid；名字只能走 --owner-name 模糊筛
        r = run(repo, "list", "--owner", ME)
        check("list --owner <uuid> 命中", "在办 1 条" in r.stdout, r.stdout)
        r = run(repo, "list", "--owner", "Me")
        check(
            "list --owner 传名字被拒",
            r.returncode == 1 and "--owner-name" in r.stderr,
            r.stdout + r.stderr,
        )
        r = run(repo, "list", "--owner-name", "m")
        check("list --owner-name 模糊命中", "在办 1 条" in r.stdout, r.stdout)
        r = run(repo, "list", "--owner-name", "zzz")
        check("list --owner-name 不匹配 = 空", "没有符合条件" in r.stdout, r.stdout)

        # show / history / validate
        r = run(repo, "show", "--id", tid)
        check("show 退出码 0", r.returncode == 0, r.stderr)
        r = run(repo, "validate", "--json")
        check("validate 无问题", '"problems": []' in r.stdout, r.stdout)

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
        # 历史行的 owner 存 uuid ⇒ --owner / --mine 才真能比到（此前存显示名，恒查不到）
        r = run(repo, "history", "--owner", ME, "--count-only")
        check("history --owner <uuid> 命中", '"count": 1' in r.stdout, r.stdout)
        r = run(repo, "history", "--mine", "--count-only")
        check("history --mine 命中", '"count": 1' in r.stdout, r.stdout)
        r = run(repo, "history", "--owner-name", "m", "--count-only")
        check("history --owner-name 模糊命中", '"count": 1' in r.stdout, r.stdout)
        r = run(repo, "history", "--owner", "Me")
        check(
            "history --owner 传名字被拒",
            r.returncode == 1 and "--owner-name" in r.stderr,
            r.stdout + r.stderr,
        )

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
