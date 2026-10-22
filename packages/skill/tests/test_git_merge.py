#!/usr/bin/env python3
"""台账共享文件的写入布局与 git 自动合并行为。

为什么单独有这一层：台账是多人共写的 git 文件，真正的风险不是代码算错，
而是「两个人各写各的、git 合不进来」。所以这里不 mock，直接起真 git 仓库
（bare 远端 + 两个 clone），两边各写一版再 merge，看结果到底是什么。

跑法：python3 -B -m unittest discover -s packages/skill/tests -t packages/skill
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))

import progress

POOL_REL = Path("ledger") / "pool.json"


def make_task(title: str, owner: str | None = None) -> dict:
    return {
        "title": title,
        "status": "doing" if owner else "open",
        "owner": owner,
        "created": "2026-10-22 02:30:00",
    }


class WriteLedgerLayoutTest(unittest.TestCase):
    """write_ledger_json 的布局是合并行为的全部前提，先把它钉死。"""

    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.path = self.tmp / "pool.json"

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_one_task_per_line(self) -> None:
        data = {
            "version": progress.FORMAT_VERSION,
            "tasks": {"t1": make_task("一"), "t2": make_task("二")},
        }
        progress.write_ledger_json(self.path, data)
        lines = self.path.read_text(encoding="utf-8").splitlines()

        self.assertEqual(lines[0], "{")
        self.assertEqual(lines[1], '  "tasks": {')
        self.assertTrue(lines[2].startswith('    "t1": '))
        self.assertTrue(lines[2].endswith(","))
        self.assertTrue(lines[3].startswith('    "t2": '))
        self.assertFalse(lines[3].endswith(","))
        self.assertEqual(lines[4], "  },")
        self.assertTrue(lines[5].startswith('  "version": '))
        self.assertEqual(lines[6], "}")

    def test_task_keys_sorted_and_values_inline(self) -> None:
        data = {
            "version": progress.FORMAT_VERSION,
            "tasks": {"b": make_task("后"), "a": make_task("前")},
        }
        progress.write_ledger_json(self.path, data)
        text = self.path.read_text(encoding="utf-8")
        self.assertLess(text.index('"a"'), text.index('"b"'))
        # 值不许折行：折行会让「一个任务」占多行，删改就不再是单行操作
        for line in text.splitlines():
            if line.startswith('    "'):
                self.assertIn("{", line)
                self.assertTrue(line.rstrip().endswith((",", "}")))

    def test_round_trip(self) -> None:
        data = {
            "version": progress.FORMAT_VERSION,
            "tasks": {"t1": make_task("一", "a@example.com")},
        }
        progress.write_ledger_json(self.path, data)
        self.assertEqual(json.loads(self.path.read_text(encoding="utf-8")), data)

    def test_empty_tasks(self) -> None:
        progress.write_ledger_json(
            self.path, {"version": progress.FORMAT_VERSION, "tasks": {}}
        )
        lines = self.path.read_text(encoding="utf-8").splitlines()
        self.assertEqual(
            lines,
            [
                "{",
                '  "tasks": {',
                "  },",
                f'  "version": "{progress.FORMAT_VERSION}"',
                "}",
            ],
        )


class GitMergeTest(unittest.TestCase):
    """真 git：a 先推，b 本地提交后 pull，看是否自动合。"""

    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.origin = self.tmp / "origin.git"
        self.a = self.tmp / "a"
        self.b = self.tmp / "b"
        self.git("init", "--bare", "-b", "main", str(self.origin), cwd=self.tmp)
        self.git("clone", str(self.origin), str(self.a), cwd=self.tmp)
        self.git("clone", str(self.origin), str(self.b), cwd=self.tmp)

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    # --- 基础设施 -------------------------------------------------------

    def git(
        self, *args: str, cwd: Path, check: bool = True
    ) -> subprocess.CompletedProcess:
        env = dict(os.environ)
        env.update(
            {
                "GIT_AUTHOR_NAME": "tester",
                "GIT_AUTHOR_EMAIL": "tester@example.com",
                "GIT_COMMITTER_NAME": "tester",
                "GIT_COMMITTER_EMAIL": "tester@example.com",
                "GIT_CONFIG_GLOBAL": str(self.tmp / "gitconfig"),
                "GIT_CONFIG_SYSTEM": os.devnull,
            }
        )
        proc = subprocess.run(
            ["git", *args],
            cwd=cwd,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        if check and proc.returncode != 0:
            self.fail(f"git {' '.join(args)} 失败：\n{proc.stdout}\n{proc.stderr}")
        return proc

    def write_pool(self, repo: Path, tasks: dict) -> None:
        progress.write_ledger_json(
            repo / POOL_REL, {"version": progress.FORMAT_VERSION, "tasks": tasks}
        )

    def read_pool(self, repo: Path) -> dict:
        return json.loads((repo / POOL_REL).read_text(encoding="utf-8"))["tasks"]

    def commit(self, repo: Path, msg: str) -> None:
        self.git("add", "-A", cwd=repo)
        self.git("commit", "-m", msg, cwd=repo)

    def seed(self, tasks: dict) -> None:
        (self.a / "ledger").mkdir(parents=True, exist_ok=True)
        self.write_pool(self.a, tasks)
        self.commit(self.a, "seed")
        self.git("push", "origin", "main", cwd=self.a)
        self.git("pull", "--no-rebase", "--no-edit", "origin", "main", cwd=self.b)

    def diverged(self, edit_a, edit_b) -> subprocess.CompletedProcess:
        """a 先推送自己那版，b 改完后 pull —— 返回 b 的 merge 结果。"""
        edit_a(self.a)
        self.commit(self.a, "a")
        self.git("push", "origin", "main", cwd=self.a)

        edit_b(self.b)
        self.commit(self.b, "b")
        return self.git(
            "pull",
            "--no-rebase",
            "--no-edit",
            "origin",
            "main",
            cwd=self.b,
            check=False,
        )

    def assert_merged(self, proc: subprocess.CompletedProcess) -> None:
        self.assertEqual(
            proc.returncode,
            0,
            f"应当自动合并，却失败了（冲突）：\n{proc.stdout}\n{proc.stderr}",
        )
        self.assertNotIn("CONFLICT", proc.stdout + proc.stderr)

    def assert_conflict(self, proc: subprocess.CompletedProcess) -> None:
        self.assertNotEqual(proc.returncode, 0, "应当冲突，却自动合上了")
        self.assertIn("CONFLICT", proc.stdout + proc.stderr)

    # --- 应当自动合的 ---------------------------------------------------

    def test_new_different_tasks_conflicts(self) -> None:
        """两人同时新建**不同**任务 —— 实测必冲突。

        原因不是「改了同一个 key」，而是两边新增的插入点相同（任务号带时间前缀，
        排序后新任务永远排在末尾），同一个位置插入两行，git 无从判断先后。
        这条是当前设计的硬伤，钉在这儿等定案；改成一任务一文件后应反转成 assert_merged。
        """
        self.seed({"t1": make_task("一")})

        def a(repo: Path) -> None:
            tasks = self.read_pool(repo)
            tasks["ta"] = make_task("A 新建")
            self.write_pool(repo, tasks)

        def b(repo: Path) -> None:
            tasks = self.read_pool(repo)
            tasks["tb"] = make_task("B 新建")
            self.write_pool(repo, tasks)

        self.assert_conflict(self.diverged(a, b))

    def test_delete_and_add_auto_merge(self) -> None:
        tasks = {f"t{i}": make_task(f"任务{i}") for i in range(1, 7)}
        self.seed(tasks)

        def a(repo: Path) -> None:
            got = self.read_pool(repo)
            del got["t1"]  # 认领：从公共池搬走，删的是首行
            self.write_pool(repo, got)

        def b(repo: Path) -> None:
            got = self.read_pool(repo)
            got["tb"] = make_task("B 新建")  # 加在末行
            self.write_pool(repo, got)

        self.assert_merged(self.diverged(a, b))
        expected = sorted([f"t{i}" for i in range(2, 7)] + ["tb"])
        self.assertEqual(sorted(self.read_pool(self.b)), expected)

    def test_delete_different_tasks_auto_merge(self) -> None:
        tasks = {f"t{i}": make_task(f"任务{i}") for i in range(1, 7)}
        self.seed(tasks)

        def a(repo: Path) -> None:
            got = self.read_pool(repo)
            del got["t1"]
            self.write_pool(repo, got)

        def b(repo: Path) -> None:
            got = self.read_pool(repo)
            del got["t6"]
            self.write_pool(repo, got)

        self.assert_merged(self.diverged(a, b))
        self.assertEqual(sorted(self.read_pool(self.b)), [f"t{i}" for i in range(2, 6)])

    def test_edit_different_tasks_auto_merge(self) -> None:
        tasks = {f"t{i}": make_task(f"任务{i}") for i in range(1, 7)}
        self.seed(tasks)

        def a(repo: Path) -> None:
            got = self.read_pool(repo)
            got["t1"]["title"] = "A 改的"
            self.write_pool(repo, got)

        def b(repo: Path) -> None:
            got = self.read_pool(repo)
            got["t6"]["title"] = "B 改的"
            self.write_pool(repo, got)

        self.assert_merged(self.diverged(a, b))
        got = self.read_pool(self.b)
        self.assertEqual(got["t1"]["title"], "A 改的")
        self.assertEqual(got["t6"]["title"], "B 改的")

    # --- 已知代价：必须如实钉住，别让后人以为是 bug ---------------------

    def test_same_task_edit_conflicts(self) -> None:
        self.seed({"t1": make_task("一"), "t2": make_task("二")})

        def a(repo: Path) -> None:
            got = self.read_pool(repo)
            got["t1"]["title"] = "A 的说法"
            self.write_pool(repo, got)

        def b(repo: Path) -> None:
            got = self.read_pool(repo)
            got["t1"]["title"] = "B 的说法"
            self.write_pool(repo, got)

        self.assert_conflict(self.diverged(a, b))

    def test_adjacent_tasks_edit_conflicts(self) -> None:
        """相邻两个任务同时改也会撞：一行一条，但 git 的 hunk 上下文是 3 行。"""
        self.seed({f"t{i}": make_task(f"任务{i}") for i in range(1, 4)})

        def a(repo: Path) -> None:
            got = self.read_pool(repo)
            got["t2"]["title"] = "A 改的"
            self.write_pool(repo, got)

        def b(repo: Path) -> None:
            got = self.read_pool(repo)
            got["t3"]["title"] = "B 改的"
            self.write_pool(repo, got)

        self.assert_conflict(self.diverged(a, b))

    def test_delete_same_task_both_sides_no_conflict(self) -> None:
        """两人同时认领同一任务：pool 里删的是同一行 ⇒ git 判一致不报冲突。

        这就是「静默重复认领」的根：文件层不会拦。两个分片各写一条，各留一份。
        """
        self.seed({"t1": make_task("一"), "t2": make_task("二")})

        def claim(repo: Path, owner: str) -> None:
            tasks = self.read_pool(repo)
            del tasks["t2"]
            self.write_pool(repo, tasks)
            shard = repo / "ledger" / "owners" / f"{owner}.json"
            shard.parent.mkdir(parents=True, exist_ok=True)
            progress.write_ledger_json(
                shard,
                {
                    "version": progress.FORMAT_VERSION,
                    "tasks": {"t2": make_task("二", owner)},
                },
            )

        proc = self.diverged(lambda r: claim(r, "a"), lambda r: claim(r, "b"))
        self.assert_merged(proc)
        self.assertEqual(self.read_pool(self.b), {"t1": make_task("一")})
        shards = sorted(p.name for p in (self.b / "ledger" / "owners").glob("*.json"))
        self.assertEqual(
            shards, ["a.json", "b.json"], "两边都留了自己的认领，无任何提示"
        )


if __name__ == "__main__":
    unittest.main()
