#!/usr/bin/env python3
"""端到端冒烟：真起一个临时 git 仓库，按用户视角跑命令。

只用 `--no-sync`（不 fetch / 不提交 / 不推），所以能在任何机器上跑。
跑法：`python3 -B packages/skill/tests/smoke.py`
"""

from __future__ import annotations

import json
import os
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
        # 固定时区：时间断言要可重复（存盘 UTC / 出门本机时区的换算要能验）
        env={**os.environ, "TASK_LEDGER_HOME": str(home), "TZ": "Asia/Shanghai"},
        check=False,
    )


def check(name: str, cond: bool, detail: str = "") -> None:
    print(f"{'ok  ' if cond else 'FAIL'} {name}{'' if cond else ' :: ' + detail}")
    if not cond:
        FAILED.append(name)


def worklog_path(repo: Path, tid: str) -> Path | None:
    """这条任务的过程文档路径：文件名是任务号剥掉前 6 位年月（`paths.worklog_name`）。"""
    tail = tid[6:] if tid[:8].isdigit() and tid[8:9] == "-" else tid
    hits = sorted((repo / "ledger" / "worklog").rglob("*.md"))
    return next((p for p in hits if p.stem.endswith(tail)), None)


def worklog_text(repo: Path, tid: str) -> str:
    """这条任务的过程文档全文；找不到给空串（状态行断言用）。"""
    path = worklog_path(repo, tid)
    return path.read_text(encoding="utf-8") if path is not None else ""


def status_line(repo: Path, tid: str) -> str:
    """头部状态行原文（`> **状态**：…`）；没有这行给空串。"""
    for line in worklog_text(repo, tid).splitlines():
        if line.startswith("> **状态**"):
            return line
    return ""


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
        # 每行自带 mine（只比 uuid）：调用方不必自己拿 uuid 再比一次
        check(
            "list --json 行带 mine，自己的是 true", mine_task["mine"] is True, r.stdout
        )
        # 文档头部状态行（镜像）：new --self 一次写盘就要有 doing + 名字 + uuid
        head = status_line(repo, tid)
        check(
            "new --self 文档头部状态行是 doing + 自己",
            head.startswith("> **状态**：doing") and "Me" in head and ME in head,
            head or "(没有状态行)",
        )

        r = run(repo, "whoami", "--json")
        check(
            "whoami --json 报本机身份",
            json.loads(r.stdout) == {"uuid": ME, "name": "Me"},
            r.stdout,
        )
        r = run(repo, "whoami")
        check(
            "whoami 人话含名字与 uuid",
            "Me" in r.stdout and ME in r.stdout,
            r.stdout,
        )

        # 释放 → 认领（自动 doing）→ 记进展 → set 指向自己走空转
        r = run(repo, "set", "--id", tid, "--release")
        check("release 退出码 0", r.returncode == 0, r.stderr)
        r = run(repo, "list", "--json")
        released = json.loads(r.stdout)[tid]
        check(
            "release 清掉冗余显示名（池里那条不许再挂着原负责人）",
            released["owner"] is None and released["owner_name"] is None,
            r.stdout,
        )
        check("释放后那行 mine 变 false", released["mine"] is False, r.stdout)
        head = status_line(repo, tid)
        check(
            "release 后文档状态行回 open",
            head.startswith("> **状态**：open"),
            head or "(没有状态行)",
        )
        r = run(repo, "claim", "--id", tid)
        check("claim 退出码 0", r.returncode == 0, r.stderr)
        r = run(repo, "list", "--json")
        check(
            "claim 后 status 是 doing",
            json.loads(r.stdout)[tid]["status"] == "doing",
            r.stdout,
        )
        head = status_line(repo, tid)
        check(
            "claim 后文档状态行回 doing",
            head.startswith("> **状态**：doing") and ME in head,
            head or "(没有状态行)",
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
        # 给了 --owner 就必须生效：不许被 --mine / 空串静默吃掉
        r = run(repo, "list", "--mine", "--owner", ME)
        check(
            "list --mine 与 --owner 同给被拒",
            r.returncode == 1 and "不能和" in r.stderr,
            r.stdout + r.stderr,
        )
        r = run(repo, "list", "--owner", "")
        check(
            "list --owner 传空串被拒",
            r.returncode == 1 and "只收身份 uuid" in r.stderr,
            r.stdout + r.stderr,
        )
        r = run(repo, "set", "--id", tid)
        check(
            "set 既没 --release 也没 --owner 被拒",
            r.returncode == 1 and "--release" in r.stderr,
            r.stdout + r.stderr,
        )
        r = run(repo, "set", "--id", tid, "--release", "--owner", ME)
        check(
            "set --release 与 --owner 同给被拒",
            r.returncode == 1 and "不能同时给" in r.stderr,
            r.stdout + r.stderr,
        )
        r = run(repo, "set", "--id", tid, "--owner", "   ")
        check(
            "set --owner 全空白被拒",
            r.returncode == 1 and "只收身份 uuid" in r.stderr,
            r.stdout + r.stderr,
        )
        # 空串不是「释放」的隐式语义：host 曾拿 `set --owner ""` 当释放，必然失败（2026-10-25 修）
        r = run(repo, "set", "--id", tid, "--owner", "")
        check(
            "set --owner 空串被拒（释放只认 --release）",
            r.returncode == 1 and "只收身份 uuid" in r.stderr,
            r.stdout + r.stderr,
        )

        # show / history / validate
        r = run(repo, "show", "--id", tid)
        check("show 退出码 0", r.returncode == 0, r.stderr)
        r = run(repo, "validate", "--json")
        check("validate 无问题", '"problems": []' in r.stdout, r.stdout)

        # 结案 → 历史
        r = run(repo, "close", "--id", tid, "--summary", "冒烟结案")
        check("close 退出码 0", r.returncode == 0, r.stderr)
        head = status_line(repo, tid)
        check(
            "close 后文档状态行是 closed + 结案人",
            head.startswith("> **状态**：closed") and ME in head,
            head or "(没有状态行)",
        )
        # show 已结案：文档自述即可，不必再翻历史 / 索引
        r = run(repo, "show", "--id", tid, "--json")
        shown = json.loads(r.stdout) if r.returncode == 0 else {}
        check(
            "show 已结案任务读文档即可（不标 legacy）",
            shown.get("task", {}).get("status") == "closed"
            and shown.get("legacy") is False,
            r.stdout[:300] + r.stderr,
        )
        # validate 两档都不读过程文档（2026-10-27 拍板）：文档改坏也不该进体检结论
        doc_path = worklog_path(repo, tid)
        intact = doc_path.read_text(encoding="utf-8") if doc_path is not None else ""
        if doc_path is not None:
            doc_path.write_text(
                intact.replace("## 背景", "## 背景没了", 1), encoding="utf-8"
            )
        shallow = run(repo, "validate", "--json")
        deep = run(repo, "validate", "--deep", "--json")
        check(
            "过程文档改坏不影响 validate（浅度 / 深度都不扫）",
            doc_path is not None
            and '"problems": []' in shallow.stdout
            and '"problems": []' in deep.stdout,
            shallow.stdout + deep.stdout,
        )
        if doc_path is not None:
            doc_path.write_text(intact, encoding="utf-8")
        r = run(repo, "history", "--count-only")
        check(
            "history 计数 1",
            '"count": 1' in r.stdout and '"capped": false' in r.stdout,
            r.stdout,
        )
        r = run(repo, "history", "--json")
        check("history json 有 records", '"records"' in r.stdout, r.stdout)
        # 历史行十一列：uuid 与显示名**都落盘**（落的是结案那一刻的名字，改名不改旧行）
        hist = next(iter((repo / "ledger" / "history").glob("*.md")))
        data_rows = [
            line
            for line in hist.read_text(encoding="utf-8").splitlines()
            if line.startswith("| 2026")
        ]
        check(
            "历史数据行是十一列",
            bool(data_rows) and len(data_rows[0].split("|")) == 13,  # 11 列 + 首尾空
            data_rows[0] if data_rows else "(没有数据行)",
        )
        cells = data_rows[0].split("|")[1:-1] if data_rows else []
        check(
            "历史行 @ 只加在名字列（owner/creator 列裸写 uuid）",
            len(cells) == 11
            and cells[5].strip() == ME
            and cells[6].strip() == "@Me"
            and cells[7].strip() == ME
            and cells[8].strip() == "@Me",
            data_rows[0] if data_rows else "(没有数据行)",
        )
        body = json.loads(r.stdout)["records"]
        check(
            "历史行落盘显示名（不是 uuid）",
            bool(body)
            and body[0].get("owner_name") == "Me"
            and body[0].get("creator_name") == "Me"
            and body[0].get("owner") == ME,
            json.dumps(body[:1], ensure_ascii=False),
        )
        check(
            "历史每条记录带 mine（自己的是 true）",
            bool(body) and body[0].get("mine") is True,
            json.dumps(body[:1], ensure_ascii=False),
        )
        # 过程文档三处落点（创建行 / 封卷行 / 执行记录）都记「名字 + uuid」，不靠历史表回链
        doc = next(iter((repo / "ledger" / "worklog").rglob("*.md")))
        text = doc.read_text(encoding="utf-8")
        check(
            "过程文档头部记名字 + uuid",
            f"（@Me · {ME}）" in text,
            text[:200],
        )
        check(
            "执行记录记名字 + uuid",
            f"· @Me · {ME} · " in text,
            text[-200:],
        )
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
        r = run(repo, "history", "--mine", "--owner", ME)
        check(
            "history --mine 与 --owner 同给被拒",
            r.returncode == 1 and "不能和" in r.stderr,
            r.stdout + r.stderr,
        )
        r = run(repo, "history", "--limit", "0")
        check(
            "history --limit 0 被拒",
            r.returncode == 1 and "≥ 1" in r.stderr,
            r.stdout + r.stderr,
        )

        # 参数白名单与状态白名单：不许静默给空表
        r = run(repo, "list", "--status", "blocked")
        check(
            "list --status 非法值被拒",
            r.returncode == 1 and "--status 只认" in r.stderr,
            r.stdout + r.stderr,
        )

        # init 幂等：已初始化再跑一次退 0、身份不变
        idfile = Path(repo) / ".tlhome" / ".taskledger" / "identity.json"
        before = json.loads(idfile.read_text())
        r = run(repo, "init", "--new", "--name", "Me")
        after = json.loads(idfile.read_text())
        check(
            "重复 init 幂等（退 0、身份不变）",
            r.returncode == 0 and before["uuid"] == after["uuid"],
            r.stdout + r.stderr,
        )

        # 身份闸门（2026-10-26 事故回归）：无终端时 init 写操作必须被拒，且不落身份文件
        gate_home = Path(tempfile.mkdtemp(prefix="ledgerkit-gate-home-"))
        r = subprocess.run(
            [
                PY,
                "-B",
                str(PROGRESS),
                "--repo",
                str(repo),
                "init",
                "--new",
                "--name",
                "X",
            ],
            capture_output=True,
            text=True,
            cwd=str(repo),
            stdin=subprocess.DEVNULL,
            env={**os.environ, "TASK_LEDGER_HOME": str(gate_home)},
            check=False,
        )
        check(
            "无终端 init --new 被拒且不写身份文件",
            r.returncode != 0
            and not (gate_home / ".taskledger" / "identity.json").exists(),
            r.stdout + r.stderr,
        )
        shutil.rmtree(gate_home, ignore_errors=True)

        # --yes 已禁用：Agent 不得代写/重建身份（2026-10-26 二次事故回归）
        yes_home = Path(tempfile.mkdtemp(prefix="ledgerkit-yes-home-"))
        r = subprocess.run(
            [
                PY,
                "-B",
                str(PROGRESS),
                "--repo",
                str(repo),
                "init",
                "--new",
                "--name",
                "GateYes",
                "--yes",
            ],
            capture_output=True,
            text=True,
            cwd=str(repo),
            stdin=subprocess.DEVNULL,
            env={**os.environ, "TASK_LEDGER_HOME": str(yes_home)},
            check=False,
        )
        check(
            "非终端 init --new --yes 被拒且不写身份文件",
            r.returncode != 0
            and not (yes_home / ".taskledger" / "identity.json").exists(),
            r.stdout + r.stderr,
        )
        shutil.rmtree(yes_home, ignore_errors=True)

        # whoami 未初始化也要照常回答（不是错误）：uuid / name 双 null、退 0
        fresh_home = Path(tempfile.mkdtemp(prefix="ledgerkit-who-home-"))
        r = subprocess.run(
            [PY, "-B", str(PROGRESS), "whoami", "--json"],
            capture_output=True,
            text=True,
            cwd=str(repo),
            stdin=subprocess.DEVNULL,
            env={**os.environ, "TASK_LEDGER_HOME": str(fresh_home)},
            check=False,
        )
        check(
            "whoami 未初始化给双 null 且退 0",
            r.returncode == 0 and json.loads(r.stdout) == {"uuid": None, "name": None},
            r.stdout + r.stderr,
        )
        shutil.rmtree(fresh_home, ignore_errors=True)

        # 裸 init（无 flag）非终端：只读报候选、不写文件（agent 走这条拿名单交给用户）
        list_home = Path(tempfile.mkdtemp(prefix="ledgerkit-list-home-"))
        r = subprocess.run(
            [PY, "-B", str(PROGRESS), "--repo", str(repo), "init"],
            capture_output=True,
            text=True,
            cwd=str(repo),
            stdin=subprocess.DEVNULL,
            env={**os.environ, "TASK_LEDGER_HOME": str(list_home)},
            check=False,
        )
        check(
            "裸 init 非终端只读报候选且不写文件",
            r.returncode == 0
            and not (list_home / ".taskledger" / "identity.json").exists()
            and "已有的用户" in r.stdout,
            r.stdout + r.stderr,
        )
        shutil.rmtree(list_home, ignore_errors=True)

        # 时间口径：存盘一律 UTC，出门（--json 与人话）一律本机时区 —— 调用方不用再转
        tzrepo = Path(tempfile.mkdtemp(prefix="ledgerkit-tz-"))
        try:
            r = run(
                tzrepo,
                "new",
                "--title",
                "时间口径",
                "--created",
                "2026-01-05 10:00:00",
                "--self",
            )
            check("带 --created 建任务退出码 0", r.returncode == 0, r.stderr)
            r = run(tzrepo, "list", "--json")
            rows = json.loads(r.stdout) if r.returncode == 0 else {}
            tid_tz = next(iter(rows), "")
            check(
                "list --json 的 created 是本机时区（与传入的一致）",
                rows.get(tid_tz, {}).get("created") == "2026-01-05 10:00:00",
                r.stdout,
            )
            shard_text = next(
                iter((tzrepo / "ledger" / "owners").glob("*.json"))
            ).read_text(encoding="utf-8")
            check(
                "分片里存的是 UTC（本机 10:00 → 存 02:00）",
                '"2026-01-05 02:00:00"' in shard_text,
                shard_text[:200],
            )
            r = run(tzrepo, "show", "--id", tid_tz, "--json")
            shown = json.loads(r.stdout) if r.returncode == 0 else {}
            check(
                "show --json 的 created 也是本机时区",
                shown.get("task", {}).get("created") == "2026-01-05 10:00:00",
                r.stdout[:300] + r.stderr,
            )
        finally:
            shutil.rmtree(tzrepo, ignore_errors=True)

        # 空台账契约（ledger-data.md §七）：没有任何历史文件时，--json 仍必须是 JSON。
        # 这条一破，插件把「输出不是 JSON」当失败 ⇒ 一个空工作区就能让整块看板 500（2026-10-17 真机）。
        empty = Path(tempfile.mkdtemp(prefix="ledgerkit-empty-"))
        try:
            r = run(empty, "list", "--json")
            check(
                "空台账 list --json 是 {}",
                r.returncode == 0 and r.stdout.strip() == "{}",
                r.stdout + r.stderr,
            )
            r = run(empty, "history", "--json")
            shape = json.loads(r.stdout) if r.returncode == 0 else {}
            check(
                "空台账 history --json 五键齐全",
                r.returncode == 0
                and set(shape) == {"count", "filters", "records", "warnings", "capped"}
                and shape["count"] == 0
                and shape["records"] == [],
                r.stdout + r.stderr,
            )
            r = run(empty, "history", "--count-only")
            check(
                "空台账 --count-only 只有两键",
                json.loads(r.stdout) == {"count": 0, "capped": False},
                r.stdout + r.stderr,
            )
        finally:
            shutil.rmtree(empty, ignore_errors=True)

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
