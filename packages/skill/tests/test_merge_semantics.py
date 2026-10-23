#!/usr/bin/env python3
"""台账合并语义：按任务号三方合并（不是行级），追加式正文 union，冲突接管。

台账真正的合并发生在脚本自己 rebase 撞车时：`GitRepo._rebase_retry` →
`GitRepo.resolve_conflicts` → `merge.merge_task_dicts` / `merge.union_merge`。
所以这里测的是那套语义，不是 git 的行级行为（行级的坑由插件冒烟的真仓用例守）。

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
from typing import Any

SKILL = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL / "scripts"))

from ledgerkit.core.labels import FORMAT_VERSION
from ledgerkit.shell import merge
from ledgerkit.shell.gitops import GitRepo
from ledgerkit.store.json_store import dump_ledger_json

POOL_REL = "ledger/pool.json"
WORKLOG_REL = "ledger/worklog/202610/22-0230-abcd.md"


def task(title: str, owner: str | None = None) -> dict[str, Any]:
    return {
        "title": title,
        "status": "doing" if owner else "open",
        "owner": owner,
        "created": "2026-10-22 02:30:00",
    }


def doc(tasks: dict[str, Any]) -> dict[str, Any]:
    """一份台账文件的形状（`merge_task_dicts` 吃的是整份文档，不是 tasks 字典）。"""
    return {"version": "20261022000000", "tasks": tasks}


def text(tasks: dict[str, Any]) -> str:
    return json.dumps(doc(tasks))


class WriteLedgerLayoutTest(unittest.TestCase):
    """「一个任务一行」是多人 git 合并的全部前提，先把它钉死。"""

    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.path = self.tmp / "pool.json"

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_one_task_per_line(self) -> None:
        data = doc({"t1": task("一"), "t2": task("二")})
        lines = dump_ledger_json(data).splitlines()

        self.assertEqual(lines[0], "{")
        self.assertEqual(lines[1], '  "tasks": {')
        self.assertTrue(lines[2].startswith('    "t1": '))
        self.assertTrue(lines[2].endswith(","))
        self.assertTrue(lines[3].startswith('    "t2": '))
        self.assertFalse(lines[3].endswith(","))
        self.assertEqual(lines[4], "  },")
        self.assertTrue(lines[5].startswith('  "version": '))
        self.assertEqual(lines[6], "}")

    def test_task_values_inline_and_sorted(self) -> None:
        data = doc({"b": task("后"), "a": task("前")})
        out = dump_ledger_json(data)
        self.assertLess(out.index('"a"'), out.index('"b"'))
        for line in out.splitlines():
            if line.startswith('    "'):
                self.assertIn("{", line)
                self.assertTrue(line.rstrip().endswith((",", "}")))

    def test_round_trip_and_version_stamped(self) -> None:
        out = dump_ledger_json({"tasks": {"t1": task("一")}})
        self.assertEqual(json.loads(out)["tasks"]["t1"]["title"], "一")
        self.assertEqual(json.loads(out)["version"], FORMAT_VERSION)

    def test_empty_tasks(self) -> None:
        self.assertEqual(
            dump_ledger_json({"tasks": {}}).splitlines(),
            [
                "{",
                '  "tasks": {',
                "  },",
                f'  "version": "{FORMAT_VERSION}"',
                "}",
            ],
        )


class MergeTaskDictsTest(unittest.TestCase):
    """纯函数：只一边动过就采纳，两边都动过才冲突，删除就是真删。"""

    def test_different_new_tasks_both_kept(self) -> None:
        merged, conflicts = merge.merge_task_dicts(
            doc({"t1": task("一")}),
            doc({"t1": task("一"), "ta": task("A")}),
            doc({"t1": task("一"), "tb": task("B")}),
        )
        self.assertEqual(conflicts, [])
        self.assertEqual(sorted(merged["tasks"]), ["t1", "ta", "tb"])

    def test_one_side_new_task(self) -> None:
        merged, conflicts = merge.merge_task_dicts(
            doc({"t1": task("一")}),
            doc({"t1": task("一")}),
            doc({"t1": task("一"), "tb": task("B")}),
        )
        self.assertEqual(conflicts, [])
        self.assertEqual(sorted(merged["tasks"]), ["t1", "tb"])

    def test_both_edit_same_task_conflicts(self) -> None:
        merged, conflicts = merge.merge_task_dicts(
            doc({"t1": task("原")}),
            doc({"t1": task("远端改")}),
            doc({"t1": task("本地改")}),
        )
        self.assertEqual(conflicts, ["t1"])
        # 冲突时先放上游版本，再由渲染层包冲突标记
        self.assertEqual(merged["tasks"]["t1"]["title"], "远端改")

    def test_one_side_delete_really_deletes(self) -> None:
        """回归：上游删了就得真删，不许留 "<tid>": null。"""
        merged, conflicts = merge.merge_task_dicts(
            doc({"t1": task("一"), "t2": task("二")}),
            doc({"t1": task("一")}),
            doc({"t1": task("一"), "t2": task("二")}),
        )
        self.assertEqual(conflicts, [])
        self.assertEqual(sorted(merged["tasks"]), ["t1"])
        self.assertNotIn("t2", merged["tasks"])

    def test_local_delete_vs_upstream_edit_conflicts(self) -> None:
        merged, conflicts = merge.merge_task_dicts(
            doc({"t1": task("一")}),
            doc({"t1": task("远端改")}),
            doc({}),
        )
        self.assertEqual(conflicts, ["t1"])
        self.assertEqual(merged["tasks"]["t1"]["title"], "远端改")  # 本地 None ⇒ 取上游

    def test_upstream_delete_vs_local_edit_conflicts(self) -> None:
        merged, conflicts = merge.merge_task_dicts(
            doc({"t1": task("一")}),
            doc({}),
            doc({"t1": task("本地改")}),
        )
        self.assertEqual(conflicts, ["t1"])
        self.assertEqual(merged["tasks"]["t1"]["title"], "本地改")

    def test_both_delete_no_conflict(self) -> None:
        merged, conflicts = merge.merge_task_dicts(
            doc({"t1": task("一")}), doc({}), doc({})
        )
        self.assertEqual(conflicts, [])
        self.assertEqual(merged["tasks"], {})

    def test_identical_edit_no_conflict(self) -> None:
        same = task("都改成这个")
        merged, conflicts = merge.merge_task_dicts(
            doc({"t1": task("原")}), doc({"t1": same}), doc({"t1": same})
        )
        self.assertEqual(conflicts, [])
        self.assertEqual(merged["tasks"]["t1"]["title"], "都改成这个")

    def test_empty_base_both_add(self) -> None:
        merged, conflicts = merge.merge_task_dicts(
            doc({}), doc({"ta": task("A")}), doc({"tb": task("B")})
        )
        self.assertEqual(conflicts, [])
        self.assertEqual(sorted(merged["tasks"]), ["ta", "tb"])

    def test_never_emits_none_value(self) -> None:
        merged, _ = merge.merge_task_dicts(
            doc({"t1": task("一"), "t2": task("二")}),
            doc({"t1": task("一")}),
            doc({"t1": task("一")}),
        )
        self.assertTrue(all(v is not None for v in merged["tasks"].values()))

    def test_text_sides_are_parsed(self) -> None:
        """git 给过来的是文本（`git show :N:rel`），不是 dict。"""
        merged, conflicts = merge.merge_task_dicts(
            text({"t1": task("原")}),
            text({"t1": task("远端改")}),
            text({"t1": task("本地改")}),
        )
        self.assertEqual(conflicts, ["t1"])
        self.assertEqual(merged["tasks"]["t1"]["title"], "远端改")

    def test_broken_json_is_reported_not_guessed(self) -> None:
        merged, conflicts = merge.merge_task_dicts("{ 不是 JSON", text({}), text({}))
        self.assertEqual(merged, {})
        self.assertTrue(any("合法 JSON" in line for line in conflicts))

    def test_owners_index_merges_workers(self) -> None:
        merged, conflicts = merge.merge_task_dicts(
            {"workers": {"a@x": {"name": "A"}}},
            {"workers": {"a@x": {"name": "A"}, "b@x": {"name": "B"}}},
            {"workers": {"a@x": {"name": "A"}}},
        )
        self.assertEqual(conflicts, [])
        self.assertEqual(sorted(merged["workers"]), ["a@x", "b@x"])


class ConflictMarkedTest(unittest.TestCase):
    """冲突标记：左边是远端、右边是本机，删掉的那一侧要有字。"""

    def test_markers_put_remote_left(self) -> None:
        text, conflicts = merge.conflict_marked(
            POOL_REL,
            json.dumps({"tasks": {"t1": task("原")}}),
            json.dumps({"tasks": {"t1": task("远端改")}}),
            json.dumps({"tasks": {"t1": task("本地改")}}),
        )
        self.assertEqual(conflicts, ["t1"])
        self.assertIn("<<<<<<< 远端", text)
        self.assertIn(">>>>>>> 本地", text)
        left, right = text.split("=======")
        self.assertIn("远端改", left)
        self.assertIn("本地改", right)
        self.assertNotIn("<<<<<<< 本地", text)

    def test_deleted_side_is_labelled(self) -> None:
        text, conflicts = merge.conflict_marked(
            POOL_REL,
            json.dumps({"tasks": {"t1": task("一")}}),
            json.dumps({"tasks": {"t1": task("远端改")}}),
            json.dumps({"tasks": {}}),
        )
        self.assertEqual(conflicts, ["t1"])
        self.assertIn("(本地已删除)", text)

    def test_clean_merge_is_one_task_per_line(self) -> None:
        text, conflicts = merge.conflict_marked(
            POOL_REL,
            json.dumps({"tasks": {}}),
            json.dumps({"tasks": {"ta": task("A")}}),
            json.dumps({"tasks": {"tb": task("B")}}),
        )
        self.assertEqual(conflicts, [])
        self.assertEqual(json.loads(text)["tasks"].keys(), {"ta", "tb"})
        self.assertEqual(
            len([ln for ln in text.splitlines() if ln.startswith('    "')]), 2
        )

    def test_business_file_not_owned(self) -> None:
        self.assertIsNone(merge.conflict_marked("main.py", "", "", ""))
        self.assertFalse(merge.owns("main.py"))
        self.assertTrue(merge.owns(POOL_REL))
        self.assertTrue(merge.owns("ledger/owners/abcd1234abcd.json"))
        self.assertTrue(merge.owns(WORKLOG_REL))
        self.assertTrue(merge.owns("ledger/history/202610.md"))

    def test_render_conflict_text_is_human_words(self) -> None:
        text = merge.render_conflict_text(
            POOL_REL,
            json.dumps({"tasks": {"t1": task("原")}}),
            json.dumps({"tasks": {"t1": task("远端改")}}),
            json.dumps({"tasks": {"t1": task("本地改")}}),
        )
        self.assertIn("t1", text)
        self.assertIn("git rebase --continue", text)
        self.assertIn("main.py", merge.render_conflict_text("main.py", "", "", ""))


class UnionMergeTest(unittest.TestCase):
    """追加式正文：两边各加一条执行记录，union 合上、两行都在。"""

    def test_both_appends_kept(self) -> None:
        base = "# 过程\n\n- 起始\n"
        ours = "# 过程\n\n- 起始\n- 上游记的\n"
        theirs = "# 过程\n\n- 起始\n- 本机记的\n"
        text = merge.union_merge(base, ours, theirs)
        self.assertIn("上游记的", text)
        self.assertIn("本机记的", text)
        self.assertNotIn("<<<<<<<", text)

    def test_local_already_has_remote_line(self) -> None:
        """写前同步已把远端那行带进来了：合完就是本机那份，不重复。"""
        base = "# 过程\n\n- 起始\n"
        ours = "# 过程\n\n- 起始\n- 上游记的\n"
        theirs = "# 过程\n\n- 起始\n- 上游记的\n- 本机记的\n"
        self.assertEqual(merge.union_merge(base, ours, theirs), theirs)

    def test_no_new_line_returns_other_side(self) -> None:
        self.assertEqual(merge.union_merge("a\n", "a\n", "b\n"), "b\n")


class ResolveConflictsTest(unittest.TestCase):
    """真 git rebase 撞在台账上，交给 GitRepo.resolve_conflicts 接管。"""

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

    def write(self, repo: Path, tasks: dict[str, Any]) -> None:
        path = Path(repo) / POOL_REL
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            dump_ledger_json({"version": "", "tasks": tasks}), encoding="utf-8"
        )

    def read(self, repo: Path) -> dict[str, Any]:
        return json.loads((repo / POOL_REL).read_text(encoding="utf-8"))["tasks"]

    def commit(self, repo: Path, msg: str) -> None:
        self.git("add", "-A", cwd=repo)
        self.git("commit", "-m", msg, cwd=repo)

    def seed(self, tasks: dict[str, Any]) -> None:
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

    def resolve(self) -> bool:
        return GitRepo(self.b).resolve_conflicts()

    def test_two_new_tasks_auto_merged(self) -> None:
        """两人同时新建不同任务：行级必冲突，接管后按任务号合并，两条都在。"""
        self.seed({"t1": task("一")})

        def edit_a(repo: Path) -> None:
            got = self.read(repo)
            got["ta"] = task("A 新建")
            self.write(repo, got)

        def edit_b(repo: Path) -> None:
            got = self.read(repo)
            got["tb"] = task("B 新建")
            self.write(repo, got)

        rebase = self.diverge_and_rebase(edit_a, edit_b)
        self.assertNotEqual(rebase.returncode, 0, "行级应当冲突，否则这个用例失去意义")

        self.assertIs(self.resolve(), True)
        self.assertEqual(sorted(self.read(self.b)), ["t1", "ta", "tb"])
        status = self.git("status", "--porcelain", cwd=self.b)
        self.assertEqual(status.stdout.strip(), "", "接管后应当干净收尾")

    def test_same_task_both_edited_left_as_conflict(self) -> None:
        self.seed({"t1": task("一")})

        def edit_a(repo: Path) -> None:
            got = self.read(repo)
            got["t1"]["title"] = "远端改"
            self.write(repo, got)

        def edit_b(repo: Path) -> None:
            got = self.read(repo)
            got["t1"]["title"] = "本地改"
            self.write(repo, got)

        self.assertNotEqual(self.diverge_and_rebase(edit_a, edit_b).returncode, 0)

        self.assertIs(self.resolve(), False)
        text = (self.b / POOL_REL).read_text(encoding="utf-8")
        self.assertIn("<<<<<<< 远端", text)
        self.assertIn("本地改", text)
        # 没替用户选：仓库留在 rebase 中间态，让人继续
        self.assertTrue((self.b / ".git" / "rebase-merge").exists())

    def test_new_and_claim_auto_merged(self) -> None:
        """一人新建、一人认领 —— 两个不同任务号，互不干扰。"""
        self.seed({"t1": task("一")})

        def edit_a(repo: Path) -> None:
            got = self.read(repo)
            got["ta"] = task("A 新建")
            self.write(repo, got)

        def edit_b(repo: Path) -> None:
            got = self.read(repo)
            got["t1"]["owner"] = "b@example.com"
            got["t1"]["status"] = "doing"
            self.write(repo, got)

        self.assertNotEqual(self.diverge_and_rebase(edit_a, edit_b).returncode, 0)
        self.assertIs(self.resolve(), True)
        got = self.read(self.b)
        self.assertEqual(sorted(got), ["t1", "ta"])
        self.assertEqual(got["t1"]["owner"], "b@example.com")

    def test_close_and_new_auto_merged(self) -> None:
        """一人结案（真删一行）、一人新建 —— 删与加落在不同任务号，各自采纳。"""
        self.seed({"t1": task("一"), "t2": task("二")})

        def edit_a(repo: Path) -> None:
            got = self.read(repo)
            del got["t1"]
            self.write(repo, got)

        def edit_b(repo: Path) -> None:
            got = self.read(repo)
            got["tb"] = task("B 新建")
            self.write(repo, got)

        self.assertNotEqual(self.diverge_and_rebase(edit_a, edit_b).returncode, 0)
        self.assertIs(self.resolve(), True)
        got = self.read(self.b)
        self.assertEqual(
            sorted(got), ["t2", "tb"], "结案的那条必须真的没了，不许留 null"
        )

    def test_worklog_union_keeps_both_notes(self) -> None:
        """worklog 是追加式正文：两边各加一条执行记录，union 合上、两行都在。"""
        log_rel = Path(WORKLOG_REL)
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
        """业务代码的冲突不归这里管：一个字节都不碰，原样 abort 退回。"""
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

        self.assertIs(self.resolve(), False)
        # 不接管 ⇒ 干净退回 rebase 之前，业务文件的冲突态交还给人
        self.assertFalse((self.b / ".git" / "rebase-merge").exists())
        self.assertEqual(
            self.git("status", "--porcelain", cwd=self.b).stdout.strip(), ""
        )


if __name__ == "__main__":
    unittest.main()
