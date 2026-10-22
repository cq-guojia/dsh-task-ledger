#!/usr/bin/env python3
"""台账合并语义：按任务号三方合并（不是行级），以及冲突接管。

台账真正的合并发生在脚本自己 rebase 撞车时：`_rebase_retry` → `_resolve_ledger_conflict`
→ `_merge_task_dicts(base, upstream, local)`。所以这里测的是那套语义，不是 git 的行级行为
（行级的坑在 test_git_merge.py 里，那里只说明「手动 merge 会怎样」）。

跑法：python3 -B packages/skill/tests/test_merge_semantics.py -v
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


def task(title: str, owner: str | None = None) -> dict:
    return {
        "title": title,
        "status": "doing" if owner else "open",
        "owner": owner,
        "created": "2026-10-22 02:30:00",
    }


class MergeTaskDictsTest(unittest.TestCase):
    """纯函数：只一边动过就采纳，两边都动过才冲突，删除就是真删。"""

    def test_different_new_tasks_both_kept(self) -> None:
        merged, conflicts = progress._merge_task_dicts(
            {"t1": task("一")},
            {"t1": task("一"), "ta": task("A")},
            {"t1": task("一"), "tb": task("B")},
        )
        self.assertEqual(conflicts, [])
        self.assertEqual(sorted(merged), ["t1", "ta", "tb"])

    def test_one_side_new_task(self) -> None:
        merged, conflicts = progress._merge_task_dicts(
            {"t1": task("一")}, {"t1": task("一")}, {"t1": task("一"), "tb": task("B")}
        )
        self.assertEqual(conflicts, [])
        self.assertEqual(sorted(merged), ["t1", "tb"])

    def test_both_edit_same_task_conflicts(self) -> None:
        merged, conflicts = progress._merge_task_dicts(
            {"t1": task("原")},
            {"t1": task("远端改")},
            {"t1": task("本地改")},
        )
        self.assertEqual(conflicts, ["t1"])
        # 冲突时先放远端版本，再由渲染层包冲突标记
        self.assertEqual(merged["t1"]["title"], "远端改")

    def test_one_side_delete_really_deletes(self) -> None:
        """回归 ff3c44c：上游删了就得真删，不许留 "<tid>": null。"""
        merged, conflicts = progress._merge_task_dicts(
            {"t1": task("一"), "t2": task("二")},
            {"t1": task("一")},
            {"t1": task("一"), "t2": task("二")},
        )
        self.assertEqual(conflicts, [])
        self.assertEqual(sorted(merged), ["t1"])
        self.assertNotIn("t2", merged)

    def test_delete_vs_edit_conflicts(self) -> None:
        merged, conflicts = progress._merge_task_dicts(
            {"t1": task("一")},
            {},
            {"t1": task("本地改了")},
        )
        self.assertEqual(conflicts, ["t1"])
        self.assertEqual(merged["t1"]["title"], "本地改了")  # 远端 None ⇒ 取本地

    def test_both_delete_no_conflict(self) -> None:
        merged, conflicts = progress._merge_task_dicts({"t1": task("一")}, {}, {})
        self.assertEqual(conflicts, [])
        self.assertEqual(merged, {})

    def test_identical_edit_no_conflict(self) -> None:
        same = task("都改成这个")
        merged, conflicts = progress._merge_task_dicts(
            {"t1": task("原")}, {"t1": same}, {"t1": same}
        )
        self.assertEqual(conflicts, [])
        self.assertEqual(merged["t1"]["title"], "都改成这个")

    def test_empty_base_both_add(self) -> None:
        merged, conflicts = progress._merge_task_dicts(
            {}, {"ta": task("A")}, {"tb": task("B")}
        )
        self.assertEqual(conflicts, [])
        self.assertEqual(sorted(merged), ["ta", "tb"])

    def test_never_emits_none_value(self) -> None:
        merged, _ = progress._merge_task_dicts(
            {"t1": task("一"), "t2": task("二")},
            {"t1": task("一")},
            {"t1": task("一")},
        )
        self.assertTrue(all(v is not None for v in merged.values()))


class RenderConflictTest(unittest.TestCase):
    def test_conflict_markers_put_remote_left(self) -> None:
        merged, conflicts = progress._merge_task_dicts(
            {"t1": task("原")}, {"t1": task("远端改")}, {"t1": task("本地改")}
        )
        text = progress._render_progress_conflict(
            merged, conflicts, {"t1": task("远端改")}, {"t1": task("本地改")}
        )
        self.assertIn("<<<<<<< 远端", text)
        self.assertIn(">>>>>>> 本地", text)
        left, right = text.split("=======")
        self.assertIn("远端改", left)
        self.assertIn("本地改", right)
        self.assertNotIn("<<<<<<< 本地", text)

    def test_deleted_side_is_labelled(self) -> None:
        # 远端删、本地改 ⇒ 冲突，左边标「远端已删除」
        merged, conflicts = progress._merge_task_dicts(
            {"t1": task("一")}, {}, {"t1": task("本地改")}
        )
        self.assertEqual(conflicts, ["t1"])
        text = progress._render_progress_conflict(
            merged, conflicts, {}, {"t1": task("本地改")}
        )
        self.assertIn("(远端已删除)", text)

        # 远端改、本地删 ⇒ 冲突，右边标「本地已删除」
        merged2, conflicts2 = progress._merge_task_dicts(
            {"t1": task("一")}, {"t1": task("远端改")}, {}
        )
        self.assertEqual(conflicts2, ["t1"])
        text2 = progress._render_progress_conflict(
            merged2, conflicts2, {"t1": task("远端改")}, {}
        )
        self.assertIn("(本地已删除)", text2)

    def test_clean_merge_is_one_task_per_line(self) -> None:
        merged, conflicts = progress._merge_task_dicts(
            {}, {"ta": task("A")}, {"tb": task("B")}
        )
        text = progress._render_progress_conflict(merged, conflicts, {}, {})
        self.assertEqual(json.loads(text), {"tasks": merged})
        self.assertEqual(
            len([ln for ln in text.splitlines() if ln.startswith('    "')]), 2
        )


class ResolveLedgerConflictTest(unittest.TestCase):
    """真 git rebase 撞在台账上，交给 _resolve_ledger_conflict 接管。"""

    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.origin = self.tmp / "origin.git"
        self.a = self.tmp / "a"
        self.b = self.tmp / "b"
        self._env = dict(os.environ)
        os.environ.update(
            {
                "GIT_AUTHOR_NAME": "tester",
                "GIT_AUTHOR_EMAIL": "tester@example.com",
                "GIT_COMMITTER_NAME": "tester",
                "GIT_COMMITTER_EMAIL": "tester@example.com",
                "GIT_CONFIG_GLOBAL": str(self.tmp / "gitconfig"),
                "GIT_CONFIG_SYSTEM": os.devnull,
            }
        )
        self.git("init", "--bare", "-b", "main", str(self.origin), cwd=self.tmp)
        self.git("clone", str(self.origin), str(self.a), cwd=self.tmp)
        self.git("clone", str(self.origin), str(self.b), cwd=self.tmp)

    def tearDown(self) -> None:
        os.environ.clear()
        os.environ.update(self._env)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def git(
        self, *args: str, cwd: Path, check: bool = True
    ) -> subprocess.CompletedProcess:
        proc = subprocess.run(
            ["git", *args], cwd=cwd, capture_output=True, text=True, check=False
        )
        if check and proc.returncode != 0:
            self.fail(f"git {' '.join(args)} 失败：\n{proc.stdout}\n{proc.stderr}")
        return proc

    def write(self, repo: Path, tasks: dict) -> None:
        progress.write_ledger_json(
            Path(repo) / POOL_REL, {"version": progress.FORMAT_VERSION, "tasks": tasks}
        )

    def read(self, repo: Path) -> dict:
        return json.loads((repo / POOL_REL).read_text(encoding="utf-8"))["tasks"]

    def commit(self, repo: Path, msg: str) -> None:
        self.git("add", "-A", cwd=repo)
        self.git("commit", "-m", msg, cwd=repo)

    def seed(self, tasks: dict) -> None:
        (self.a / "ledger").mkdir(parents=True, exist_ok=True)
        self.write(self.a, tasks)
        self.commit(self.a, "seed")
        self.git("push", "origin", "main", cwd=self.a)
        self.git("pull", "--no-rebase", "--no-edit", "origin", "main", cwd=self.b)

    def diverge_and_rebase(self, edit_a, edit_b) -> subprocess.CompletedProcess:
        """a 先推，b 改完 rebase 到 a 之上 —— 返回 b 的 rebase 结果（预期冲突）。"""
        edit_a(self.a)
        self.commit(self.a, "a")
        self.git("push", "origin", "main", cwd=self.a)

        edit_b(self.b)
        self.commit(self.b, "b")
        self.git("fetch", "origin", cwd=self.b)
        return self.git("rebase", "origin/main", cwd=self.b, check=False)

    def resolve(self) -> bool | str | None:
        return progress._resolve_ledger_conflict(
            ("git", "-C", str(self.b)), str(self.b), "ledger"
        )

    def test_two_new_tasks_auto_merged(self) -> None:
        """两人同时新建不同任务：行级必冲突，但接管后按任务号合并，两条都在。"""
        self.seed({"t1": task("一")})

        def a(repo: Path) -> None:
            got = self.read(repo)
            got["ta"] = task("A 新建")
            self.write(repo, got)

        def b(repo: Path) -> None:
            got = self.read(repo)
            got["tb"] = task("B 新建")
            self.write(repo, got)

        rebase = self.diverge_and_rebase(a, b)
        self.assertNotEqual(rebase.returncode, 0, "行级应当冲突，否则这个用例失去意义")

        self.assertIs(self.resolve(), True)
        self.assertEqual(sorted(self.read(self.b)), ["t1", "ta", "tb"])
        status = self.git("status", "--porcelain", cwd=self.b)
        self.assertEqual(status.stdout.strip(), "", "接管后应当干净收尾")

    def test_same_task_both_edited_left_as_conflict(self) -> None:
        self.seed({"t1": task("一")})

        def a(repo: Path) -> None:
            got = self.read(repo)
            got["t1"]["title"] = "远端改"
            self.write(repo, got)

        def b(repo: Path) -> None:
            got = self.read(repo)
            got["t1"]["title"] = "本地改"
            self.write(repo, got)

        self.assertNotEqual(self.diverge_and_rebase(a, b).returncode, 0)

        self.assertEqual(self.resolve(), "conflict")
        text = (self.b / POOL_REL).read_text(encoding="utf-8")
        self.assertIn("<<<<<<< 远端", text)
        self.assertIn("本地改", text)

    def test_new_and_claim_auto_merged(self) -> None:
        """一人新建、一人认领 —— 两个不同任务号，互不干扰。"""
        self.seed({"t1": task("一")})

        def a(repo: Path) -> None:
            got = self.read(repo)
            got["ta"] = task("A 新建")
            self.write(repo, got)

        def b(repo: Path) -> None:
            got = self.read(repo)
            got["t1"]["owner"] = "b@example.com"
            got["t1"]["status"] = "doing"
            self.write(repo, got)

        self.assertNotEqual(self.diverge_and_rebase(a, b).returncode, 0)
        self.assertIs(self.resolve(), True)
        got = self.read(self.b)
        self.assertEqual(sorted(got), ["t1", "ta"])
        self.assertEqual(got["t1"]["owner"], "b@example.com")

    def test_close_and_new_auto_merged(self) -> None:
        """一人结案（真删一行）、一人新建 —— 删与加落在不同任务号，各自采纳。"""
        self.seed({"t1": task("一"), "t2": task("二")})

        def a(repo: Path) -> None:
            got = self.read(repo)
            del got["t1"]
            self.write(repo, got)

        def b(repo: Path) -> None:
            got = self.read(repo)
            got["tb"] = task("B 新建")
            self.write(repo, got)

        self.assertNotEqual(self.diverge_and_rebase(a, b).returncode, 0)
        self.assertIs(self.resolve(), True)
        got = self.read(self.b)
        self.assertEqual(
            sorted(got), ["t2", "tb"], "结案的那条必须真的没了，不许留 null"
        )

    def test_worklog_union_keeps_both_notes(self) -> None:
        """worklog 是追加式正文：两边各加一条执行记录，union 合上、两行都在。"""
        log_rel = Path("ledger") / "worklog" / "202610" / "22-0230-abcd.md"
        (self.a / log_rel).parent.mkdir(parents=True, exist_ok=True)
        (self.a / log_rel).write_text("# 过程\n\n- 起始\n", encoding="utf-8")
        self.seed({"t1": task("一")})
        self.git("pull", "--no-rebase", "--no-edit", "origin", "main", cwd=self.b)

        (self.a / log_rel).write_text(
            "# 过程\n\n- 起始\n- A 记的一条\n", encoding="utf-8"
        )
        self.commit(self.a, "a")
        self.git("push", "origin", "main", cwd=self.a)
        (self.b / log_rel).write_text(
            "# 过程\n\n- 起始\n- B 记的一条\n", encoding="utf-8"
        )
        self.commit(self.b, "b")
        self.git("fetch", "origin", cwd=self.b)
        self.assertNotEqual(
            self.git("rebase", "origin/main", cwd=self.b, check=False).returncode, 0
        )

        self.assertIs(self.resolve(), True)
        text = (self.b / log_rel).read_text(encoding="utf-8")
        self.assertIn("A 记的一条", text)
        self.assertIn("B 记的一条", text)
        self.assertNotIn("<<<<<<<", text)

    def test_business_file_conflict_not_touched(self) -> None:
        """业务代码的冲突不归这里管：一个字节都不碰，原样返回 None。"""
        self.seed({"t1": task("一")})
        src = self.a / "main.py"
        src.write_text("x = 1\n", encoding="utf-8")
        self.commit(self.a, "add src")
        self.git("push", "origin", "main", cwd=self.a)
        self.git("pull", "--no-rebase", "--no-edit", "origin", "main", cwd=self.b)

        (self.a / "main.py").write_text("x = 2\n", encoding="utf-8")
        self.commit(self.a, "a")
        self.git("push", "origin", "main", cwd=self.a)
        (self.b / "main.py").write_text("x = 3\n", encoding="utf-8")
        self.commit(self.b, "b")
        self.git("fetch", "origin", cwd=self.b)
        self.assertNotEqual(
            self.git("rebase", "origin/main", cwd=self.b, check=False).returncode, 0
        )

        self.assertIsNone(self.resolve())
        # 不接管 ⇒ 文件保持 git 留下的冲突态，一个字节都不改写
        content = (self.b / "main.py").read_text(encoding="utf-8")
        self.assertIn("<<<<<<< HEAD", content)
        self.assertIn("x = 3", content)


if __name__ == "__main__":
    unittest.main()
