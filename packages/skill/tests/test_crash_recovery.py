#!/usr/bin/env python3
"""§六 写序崩溃恢复契约（单仓内）：

A. 程序崩在中间 → 同一条命令**重跑收敛**（不重复、不报错、数据一致）。
   实现保证：动作层在锁内重读，命中「已完成」状态就返回 already_done，没命中就幂等补齐；
   配合 store/atomic 的 snapshot/restore，崩在任一步都能靠重跑收敛。

（用户自己删文件 / 改坏文件属「手动瞎操作」，不处理也不模拟 —— 见整理用例时的口径。）

与 test_scenarios.py 的区别：本文件不涉跨 clone 并发，只验证单仓内的崩溃恢复契约。
跑法：python3 -B tests/test_crash_recovery.py
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unicodedata
import unittest
from pathlib import Path

sys.dont_write_bytecode = True

PROGRESS = Path(__file__).resolve().parents[1] / "scripts" / "progress.py"
NOSYNC = {"TASK_LEDGER_NO_SYNC": "1"}
BASE_ENV = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
CREATED = "2026-10-23 00:00:00"


def run(repo, *args, env=None):
    proc = subprocess.run(
        [sys.executable, "-B", str(PROGRESS), *args, "--repo", str(repo)],
        capture_output=True,
        text=True,
        cwd=str(repo),
        env={**BASE_ENV, **NOSYNC, **(env or {})},
        check=False,
    )
    return proc.returncode, proc.stdout, proc.stderr


def _nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s or "")


def git(repo, *args):
    return subprocess.run(
        ["git", *args], cwd=str(repo), capture_output=True, text=True, check=True
    ).stdout.strip()


def tasks_of(repo, rel):
    """`rel` 可为 `pool.json`，也可为分片文件名（自动补 `owners/`）或完整相对路径。"""
    cand = Path(repo) / "ledger" / rel
    if not cand.exists() and "/" not in str(rel):
        cand = Path(repo) / "ledger" / "owners" / rel
    if not cand.exists():
        return {}
    return json.loads(cand.read_text(encoding="utf-8")).get("tasks", {})


class Repo:
    def __init__(self):
        self.root = Path(tempfile.mkdtemp(prefix="dtl-cr-"))
        git(self.root, "init", "-q")
        git(self.root, "config", "user.name", "cr")
        git(self.root, "config", "user.email", "cr@example.com")
        (self.root / "README.md").write_text("# x\n", encoding="utf-8")
        git(self.root, "add", "README.md")
        git(self.root, "commit", "-q", "-m", "init")

    def close(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def switch(self, email):
        git(self.root, "config", "user.email", email)


class CrashRecoveryCase(unittest.TestCase):
    def setUp(self):
        self.r = Repo()
        self.addCleanup(self.r.close)

    @property
    def shards(self):
        return list((self.r.root / "ledger" / "owners").glob("*.json"))

    def shard_with(self, tid):
        for p in self.shards:
            if tid in tasks_of(self.r.root, p.name):
                return p
        return None

    def new_mine(self, title):
        self.assertEqual(
            run(self.r.root, "new", "--title", title, "--self", "--created", CREATED)[
                0
            ],
            0,
        )
        for p in self.shards:
            for tid, t in tasks_of(self.r.root, p.name).items():
                if _nfc(t.get("title")) == _nfc(title):
                    return tid
        raise AssertionError("建任务失败")

    def new_pool(self, title):
        self.assertEqual(
            run(self.r.root, "new", "--title", title, "--created", CREATED)[0], 0
        )
        for tid, t in tasks_of(self.r.root, "pool.json").items():
            if _nfc(t.get("title")) == _nfc(title):
                return tid
        raise AssertionError("建池任务失败")


class ProgramCrashRerunTest(CrashRecoveryCase):
    """A. 程序崩在中间 → 重跑收敛（不重复、不报错、数据一致）。"""

    def test_bootstrap_rerun_is_zero_write(self):
        self.assertEqual(
            run(self.r.root, "new", "--title", "A", "--self", "--created", CREATED)[0],
            0,
        )
        self.assertEqual(len(self.shards), 1, "自举应只建一个分片")
        self.assertEqual(
            run(self.r.root, "new", "--title", "B", "--self", "--created", CREATED)[0],
            0,
        )
        self.assertEqual(len(self.shards), 1, "自举重跑不应再建分片（零写）")

    def test_new_recovers_from_orphan_worklog(self):
        # new 的 tid 带随机码，重跑不会同号拒；其崩溃恢复契约是：
        # 崩在「过程文档已写、台账任务未落」时，重跑 new 必须成功且台账仍合法。
        title = "孤儿任务"
        self.new_mine(title)
        my = self.shards[0]
        data = json.loads(my.read_text())
        tid = next(
            t for t, v in data["tasks"].items() if _nfc(v.get("title")) == _nfc(title)
        )
        data["tasks"].pop(tid)  # 模拟崩溃：只留下过程文档，分片里没这条任务
        my.write_text(json.dumps(data, ensure_ascii=False))
        code, _, err = run(
            self.r.root, "new", "--title", title, "--self", "--created", CREATED
        )
        self.assertEqual(code, 0, f"孤儿过程文档下重跑 new 应成功：{err}")
        titles = [
            t.get("title")
            for p in self.shards
            for t in tasks_of(self.r.root, p.name).values()
        ]
        self.assertEqual(
            sum(_nfc(x) == _nfc(title) for x in titles), 1, "重跑后恰好一条该标题任务"
        )
        vcode, _, _ = run(self.r.root, "validate")
        self.assertEqual(vcode, 0, "重跑后台账应合法")

    def test_claim_rerun_idempotent(self):
        tid = self.new_pool("待认领")
        self.assertEqual(run(self.r.root, "claim", "--id", tid)[0], 0)
        code, _, err = run(self.r.root, "claim", "--id", tid)
        self.assertEqual(code, 0, f"认领重跑应收敛：{err}")
        self.assertNotIn(tid, tasks_of(self.r.root, "pool.json"), "池里不应还有")

    def test_release_rerun_idempotent(self):
        tid = self.new_pool("待释放")
        self.assertEqual(run(self.r.root, "claim", "--id", tid)[0], 0)
        self.assertEqual(run(self.r.root, "set", "--id", tid, "--owner", "")[0], 0)
        self.assertIn(tid, tasks_of(self.r.root, "pool.json"))
        code, _, err = run(self.r.root, "set", "--id", tid, "--owner", "")
        self.assertEqual(code, 0, f"释放重跑应收敛：{err}")
        self.assertIn(tid, tasks_of(self.r.root, "pool.json"))

    def test_set_rerun_idempotent(self):
        tid = self.new_mine("待释放")
        shard = self.shard_with(tid)
        assert shard is not None, "任务应在我的分片里"
        self.assertEqual(run(self.r.root, "set", "--id", tid, "--owner", "")[0], 0)
        code, _, err = run(self.r.root, "set", "--id", tid, "--owner", "")
        self.assertEqual(code, 0, f"释放重跑应收敛：{err}")
        self.assertIn(tid, tasks_of(self.r.root, "pool.json"), "释放后任务应回公共池")

    def test_log_rerun_idempotent(self):
        tid = self.new_mine("待记")
        self.assertEqual(run(self.r.root, "log", "--id", tid, "--note", "第一步")[0], 0)
        code, _, err = run(self.r.root, "log", "--id", tid, "--note", "第一步")
        self.assertEqual(code, 0, f"log 重跑应收敛：{err}")

    def test_handoff_rerun_after_crash_in_both(self):
        # 登记第二个人 b，再把任务交接给他（完整成功 → 只在 b 分片）
        self.r.switch("b@example.com")
        self.assertEqual(
            run(
                self.r.root,
                "new",
                "--title",
                "b 的任务",
                "--self",
                "--created",
                CREATED,
            )[0],
            0,
        )
        self.r.switch("cr@example.com")
        tid = self.new_mine("待交接")
        self.assertEqual(
            run(self.r.root, "set", "--id", tid, "--owner", "b@example.com")[0], 0
        )
        # 模拟崩溃：交接写到 b、删我之前崩了 → 任务还在我分片
        b_shard = self.shard_with(tid)
        assert b_shard is not None, "交接后任务应在 b 分片"
        my_shard = next(p for p in self.shards if p != b_shard)
        b_task = json.loads(b_shard.read_text())["tasks"][tid]
        my_data = json.loads(my_shard.read_text())
        my_data.setdefault("tasks", {})[tid] = b_task
        my_shard.write_text(json.dumps(my_data, ensure_ascii=False))
        # 重跑交接（set --owner）：内容一致 ⇒ 只补删我 → 收敛
        code, _, err = run(self.r.root, "set", "--id", tid, "--owner", "b@example.com")
        self.assertEqual(code, 0, f"交接重跑(在两边)应收敛：{err}")
        self.assertNotIn(tid, tasks_of(self.r.root, my_shard.name), "我分片不应还有")
        self.assertIn(tid, tasks_of(self.r.root, b_shard.name), "b 分片应有")

    def test_close_rerun_idempotent(self):
        tid = self.new_mine("待结案")
        self.assertEqual(
            run(self.r.root, "close", "--id", tid, "--summary", "做完")[0], 0
        )
        code, out, err = run(self.r.root, "close", "--id", tid, "--summary", "做完")
        self.assertEqual(code, 0, f"结案重跑应返回已结案：{err}")
        self.assertIn("无需重复", out + err, "应提示已结案无需重复")
        shard = self.shard_with(tid)
        if shard is not None:
            self.assertNotIn(tid, tasks_of(self.r.root, shard.name), "分片不应还有")


if __name__ == "__main__":
    unittest.main(verbosity=2)
