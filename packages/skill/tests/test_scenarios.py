#!/usr/bin/env python3
"""端到端场景测试：把文档里「整条流程」走一遍，重点是并发与「用户不手动点获取」。

与 smoke.py 的分工：smoke 管**单机单进程**每条命令的正反路；本文件管**跨 clone / 跨进程 /
半途崩溃**这些只有真跑起来才暴露的场合。前提仍是单机串行 + 不处理用户手改坏文件。

跑法：python3 -B tests/test_scenarios.py
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import uuid as uuidlib
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from ledgerkit.shell import merge
from ledgerkit.store.json_store import dump_ledger_json

PROGRESS = Path(__file__).resolve().parents[1] / "scripts" / "progress.py"
NOSYNC = {"TASK_LEDGER_NO_SYNC": "1"}
BASE_ENV = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}


def uid(seed: str) -> str:
    """测试用稳定 uuid：同一个种子永远同一个身份（身份键的形态必须是真 UUID）。"""
    return str(uuidlib.uuid5(uuidlib.NAMESPACE_URL, seed.strip().lower()))


def home_of(repo) -> Path:
    """测试用 TASK_LEDGER_HOME：缺身份时补默认 tester。"""
    home = Path(repo) / ".tlhome"
    idf = home / ".taskledger" / "identity.json"
    if not idf.exists():
        idf.parent.mkdir(parents=True, exist_ok=True)
        idf.write_text(
            json.dumps({"uuid": uid("tester"), "name": "tester"}), encoding="utf-8"
        )
    return home


def run(repo, *args, env=None):
    """跑一次脚本，返回 (退出码, stdout, stderr)。默认**开着同步**（真走 git）。"""
    base_env = {**BASE_ENV, "TASK_LEDGER_HOME": str(home_of(repo))}
    proc = subprocess.run(
        [sys.executable, "-B", str(PROGRESS), *args, "--repo", str(repo)],
        capture_output=True,
        text=True,
        cwd=str(repo),
        env={**base_env, **(env or {})},
        check=False,
    )
    return proc.returncode, proc.stdout, proc.stderr


def git(cwd, *args):
    return subprocess.run(
        ["git", *args], cwd=str(cwd), capture_output=True, text=True, check=True
    ).stdout.strip()


def ident(dirpath, name, seed):
    """设本机身份：写 TASK_LEDGER_HOME 下的 identity.json（uuid 由 seed 推出，便于断言）。"""
    home = Path(dirpath) / ".tlhome" / ".taskledger"
    home.mkdir(parents=True, exist_ok=True)
    (home / "identity.json").write_text(
        json.dumps({"uuid": uid(seed), "name": name}), encoding="utf-8"
    )


def new_task(repo, title, *, mine=True, env=None):
    extra = ("--self",) if mine else ()
    code, _, err = run(repo, "new", "--title", title, *extra, env=env)
    assert code == 0, f"new {title} 失败：{err}"
    return task_id_of(repo, title)


def task_id_of(repo, title):
    for tid, task in merged(repo).items():
        if task.get("title") == title:
            return tid
    raise AssertionError(f"找不到标题为 {title} 的任务")


def merged(repo):
    """合并视图：池 + 本地已有的全部分片（与 list 的合并顺序一致）。"""
    out = {}
    pool = Path(repo) / "ledger" / "pool.json"
    if pool.exists():
        out.update(json.loads(pool.read_text(encoding="utf-8")).get("tasks", {}))
    owners = Path(repo) / "ledger" / "owners"
    if owners.is_dir():
        for path in sorted(owners.glob("*.json")):
            out.update(json.loads(path.read_text(encoding="utf-8")).get("tasks", {}))
    return out


def worklog_text(repo, tid):
    rel = merged(repo)[tid]["worklog"]
    return (Path(repo) / "ledger" / rel).read_text(encoding="utf-8")


class Fixture:
    """一份带远端的双克隆夹具：a 是被测仓，b 是「别人」，remote 是共享远端。"""

    def __init__(self):
        self.base = Path(tempfile.mkdtemp(prefix="dtl-scn-"))
        self.remote = self.base / "remote.git"
        self.a = self.base / "a"
        self.b = self.base / "b"
        subprocess.run(["git", "init", "--bare", "-q", str(self.remote)], check=True)
        self.a.mkdir(parents=True)
        git(self.a, "init", "-q")
        ident(self.a, "smoke-a", "smoke-a@example.com")
        git(self.a, "remote", "add", "origin", str(self.remote))
        (self.a / "README.md").write_text("# fixture\n", encoding="utf-8")
        git(self.a, "add", "README.md")
        git(self.a, "commit", "-q", "-m", "init")
        git(self.a, "push", "-q", "-u", "origin", "HEAD")
        subprocess.run(
            ["git", "clone", "-q", str(self.remote), str(self.b)], check=True
        )
        ident(self.b, "smoke-b", "smoke-b@example.com")

    def close(self):
        subprocess.run(["rm", "-rf", str(self.base)], check=False)

    def push(self, clone, message="chore(ledger): 夹具"):
        """把 ledger/ 的改动提交并推送；已经提交过（开着同步的命令自己提了）就只推。"""
        git(clone, "add", "ledger")
        if git(clone, "status", "--porcelain", "ledger"):
            git(clone, "commit", "-q", "-m", message)
        git(clone, "push", "-q")

    def pull(self, clone):
        branch = git(clone, "rev-parse", "--abbrev-ref", "HEAD")
        subprocess.run(
            ["git", "pull", "-q", "--ff-only", "origin", branch],
            cwd=str(clone),
            check=True,
        )


class ScenarioCase(unittest.TestCase):
    def setUp(self):
        self.fx = Fixture()
        self.addCleanup(self.fx.close)


class ConcurrentClaimTest(ScenarioCase):
    """「同时迁入」：两个 clone 抢同一条待认领任务，只能有一个得手。"""

    def test_interleaved_claim_only_one_wins(self):
        fx = self.fx
        tid = new_task(fx.a, "抢认领的任务", mine=False)
        fx.push(fx.a)
        fx.pull(fx.b)
        for clone in (fx.a, fx.b):
            self.assertIn(tid, run(clone, "list")[1], "两边都该看到待认领")

        a = run(fx.a, "claim", "--id", tid)
        b = run(fx.b, "claim", "--id", tid)
        winners = [res for res in (a, b) if res[0] == 0]
        losers = [res for res in (a, b) if res[0] != 0]
        self.assertEqual(len(winners), 1, f"应只有一边认领成功：{a[2]}｜{b[2]}")
        self.assertTrue(
            "公共池里没有任务" in losers[0][2] or "不能认领" in losers[0][2],
            f"另一边必须被明确拒绝：{losers[0][2]}",
        )

    def test_truly_parallel_claim_lands_once(self):
        """两个进程同时开跑（不同 clone、锁文件不共享）：最终任务只能在一个分片里。"""
        fx = self.fx
        tid = new_task(fx.a, "并行抢的任务", mine=False)
        fx.push(fx.a)
        fx.pull(fx.b)
        procs = []
        for clone in (fx.a, fx.b):
            procs.append(
                subprocess.Popen(
                    [
                        sys.executable,
                        "-B",
                        str(PROGRESS),
                        "claim",
                        "--id",
                        tid,
                        "--repo",
                        str(clone),
                    ],
                    cwd=str(clone),
                    env=BASE_ENV,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
            )
        for p in procs:  # 跑完即可，结果在各自的分片里，不在这里读
            p.communicate()
        # 跨机并发认领本就「不处理」（§5.7）：两边都可能各自写进自己的分片。
        # 要保证的是：状态可恢复 —— 读侧只显示一次（show 点名同号多文件）。
        for clone in (fx.a, fx.b):
            git(clone, "add", "ledger")
            if git(clone, "status", "--porcelain", "ledger"):
                git(clone, "commit", "-q", "-m", "chore(ledger): 并行认领")
            # 两边各有一条提交 ⇒ 必然 diverged：先 rebase 再推，推不动就下一轮
            for _ in range(3):
                subprocess.run(
                    ["git", "pull", "-q", "--rebase", "--autostash"],
                    cwd=str(clone),
                    env=BASE_ENV,
                    check=False,
                )
                if (
                    subprocess.run(
                        ["git", "push", "-q"],
                        cwd=str(clone),
                        env=BASE_ENV,
                        check=False,
                        capture_output=True,
                    ).returncode
                    == 0
                ):
                    break
        for clone in (fx.a, fx.b):
            rows = merged(clone)
            self.assertIn(tid, rows, "两边都该看得到这条任务")
            # 读侧只显示一次，但要在 stderr 点名「这个号出现在多个文件」
            self.assertIn(
                "还出现在",
                run(clone, "show", "--id", tid)[1],
                "同号多文件必须由 show 点名",
            )
        # 同号多文件不再由 validate 报（2026-10-24 用户拍板：读侧 show 已点名、
        # 写侧已有防护，体检不管这件事），断言它不因这个退 1。
        self.assertEqual(run(fx.a, "validate")[0], 0, "同号多文件不该让体检退 1")


class ConcurrentNewTest(ScenarioCase):
    """两个 clone 各建一条：同步后两条都得在（按任务号合，不互相吞）。"""

    def test_both_survive(self):
        fx = self.fx
        new_task(fx.a, "a 侧新建")
        fx.push(fx.a)
        fx.pull(fx.b)
        new_task(fx.b, "b 侧新建")
        fx.push(fx.b)
        # a 落后一个提交，直接写：写前同步自己取最新，推送若被拒则 rebase 合并
        code, _, err = run(
            fx.a, "log", "--id", task_id_of(fx.a, "a 侧新建"), "--note", "x"
        )
        self.assertEqual(code, 0, err)
        titles = {t.get("title") for t in merged(fx.a).values()}
        self.assertLessEqual({"a 侧新建", "b 侧新建"}, titles)


class NoManualFetchTest(ScenarioCase):
    """「用户自己没有手动点获取」：本地落后远端时，写命令必须自己取最新。"""

    def test_write_fetches_and_keeps_remote_body(self):
        fx = self.fx
        tid = new_task(fx.a, "要取最新的任务")
        fx.push(fx.a)
        fx.pull(fx.b)
        # b 侧往同一篇 worklog 追加内容并推上去（别人推进了）
        log_rel = merged(fx.b)[tid]["worklog"]
        log_path = fx.b / "ledger" / log_rel
        log_path.parent.mkdir(parents=True, exist_ok=True)
        marker = "REMOTE-别人写进同一 worklog 的内容"
        with log_path.open("a", encoding="utf-8") as fh:
            fh.write(f"\n{marker}\n")
        fx.push(fx.b, "chore(ledger): 别处改同一 worklog")

        # a 什么都没做：没 fetch、没 pull，直接跑写命令
        code, _, err = run(fx.a, "log", "--id", tid, "--note", "本地一条记录")
        self.assertEqual(code, 0, f"不手动获取也该能写：{err}")
        text = worklog_text(fx.a, tid)
        self.assertIn(marker, text, "远端内容必须被取下来，不能被旧版覆盖写没")
        self.assertIn("本地一条记录", text, "本次执行记录要追加成功")

    def test_remote_new_task_becomes_visible(self):
        fx = self.fx
        new_task(fx.a, "a 的起点任务")
        fx.push(fx.a)
        fx.pull(fx.b)
        new_task(fx.b, "b 侧新建的任务")
        fx.push(fx.b)
        # set 的刷取范围含「他人分片」：跑一次改状态类命令就把别人的分片带下来
        tid_pool = new_task(fx.a, "再放回池里", mine=False)
        code, _, err = run(fx.a, "set", "--id", tid_pool, "--release")
        self.assertEqual(code, 0, err)
        self.assertIn(
            "b 侧新建的任务",
            {t.get("title") for t in merged(fx.a).values()},
            "他人分片应被刷下来（set 的刷取范围含他人分片）",
        )


class SameMachineLockTest(ScenarioCase):
    """同一台机器多个进程同时写：整命令锁必须把它们串起来，且一条都不丢。"""

    def test_concurrent_writes_are_serialized(self):
        fx = self.fx
        tids = [new_task(fx.a, f"并发任务 {i}", env=NOSYNC) for i in range(6)]
        fx.push(fx.a)
        procs = []
        for i, tid in enumerate(tids):
            procs.append(
                subprocess.Popen(
                    [
                        sys.executable,
                        "-B",
                        str(PROGRESS),
                        "log",
                        "--id",
                        tid,
                        "--note",
                        f"并发 {i}",
                        "--repo",
                        str(fx.a),
                    ],
                    cwd=str(fx.a),
                    env={**BASE_ENV, "TASK_LEDGER_HOME": str(home_of(fx.a))},
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                )
            )
        outs = [p.communicate() for p in procs]
        codes = [p.returncode for p in procs]
        self.assertTrue(all(c == 0 for c in codes), f"并发写应全部成功：{codes} {outs}")
        for i, tid in enumerate(tids):
            self.assertIn(
                f"并发 {i}", worklog_text(fx.a, tid), "每条记录都要落在各自文档里"
            )
        self.assertEqual(
            git(fx.a, "status", "--porcelain", "ledger"), "", "并发写完之后工作树要干净"
        )


class ConcurrentMixedWorkloadTest(ScenarioCase):
    """多人同时写/读/领/放弃：所有操作都要成功，台账最终一致且不破。

    8 条公共任务预建好；14 个 worker 进程并发（a/b 两 clone 各分一半），
    各认领/放弃**互不相同**的任务、写命令各自建新号、读命令只读 ——
    因此没有「业务层理应失败」的冲突，任何非 0 退出都算 bug。
    """

    def _spawn(self, clone, *args):
        return subprocess.Popen(
            [sys.executable, "-B", str(PROGRESS), *args, "--repo", str(clone)],
            cwd=str(clone),
            env={**BASE_ENV, "TASK_LEDGER_HOME": str(home_of(clone))},
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

    def _converge(self, clone):
        git(clone, "add", "ledger")
        if git(clone, "status", "--porcelain", "ledger"):
            git(clone, "commit", "-q", "-m", "chore(ledger): 并发混合负载")
        for _ in range(5):
            subprocess.run(
                ["git", "pull", "-q", "--rebase", "--autostash"],
                cwd=str(clone),
                env=BASE_ENV,
                check=False,
            )
            if (
                subprocess.run(
                    ["git", "push", "-q"],
                    cwd=str(clone),
                    env=BASE_ENV,
                    check=False,
                    capture_output=True,
                ).returncode
                == 0
            ):
                break

    def test_mixed_read_write_claim_abandon_all_succeed(self):
        fx = self.fx
        # 预建 8 条公共任务，两 clone 都看得到
        pub = [new_task(fx.a, f"公共任务 {i}", mine=False) for i in range(8)]
        fx.push(fx.a)
        fx.pull(fx.b)

        workers = []  # (proc, label, target_note)
        # 写：各 clone 2 个 writer，各自建新任务（并发 new）
        for clone in (fx.a, fx.b):
            for w in range(2):
                workers.append(
                    (
                        self._spawn(
                            clone,
                            "new",
                            "--title",
                            f"{clone.name}-并发写-{w}",
                            "--self",
                        ),
                        "write",
                    )
                )
        # 领：4 个 claimer 各认领一条互不相同的公共任务（a/b 各 2）
        for clone, tid in (
            (fx.a, pub[0]),
            (fx.a, pub[1]),
            (fx.b, pub[2]),
            (fx.b, pub[3]),
        ):
            workers.append((self._spawn(clone, "claim", "--id", tid), "claim"))
        # 放弃：2 个 abandoner 各把一条公共任务释放回公共池（a/b 各 1）
        for clone, tid in ((fx.a, pub[4]), (fx.b, pub[5])):
            workers.append(
                (self._spawn(clone, "set", "--id", tid, "--release"), "abandon")
            )
        # 读：各 clone 2 个 reader，反复 list / history
        for clone in (fx.a, fx.b):
            for r in range(2):
                workers.append((self._spawn(clone, "list"), f"read-list-{r}"))
                workers.append(
                    (self._spawn(clone, "history", "--count-only"), f"read-hist-{r}")
                )

        # 全并发开跑
        results = []
        for proc, label in workers:
            out, err = proc.communicate()
            results.append((label, proc.returncode, out, err))

        # 任何非 0 退出都算 bug（目标互不冲突，不该有业务拒绝）
        failed = [(l, c, e) for (l, c, _o, e) in results if c != 0]
        self.assertEqual(
            failed, [], f"并发混合负载里出现非 0 退出（应全成功）：{failed}"
        )

        # 收敛：两 clone 都推上去再互拉
        self._converge(fx.a)
        self._converge(fx.b)
        fx.pull(fx.a)
        fx.pull(fx.b)

        # 最终一致且不破：可校验、任务不丢、工作树干净
        self.assertEqual(run(fx.a, "validate")[0], 0, "并发后台账必须仍可通过校验")
        rows = merged(fx.a)
        for tid in pub:
            self.assertIn(tid, rows, f"并发后公共任务不能丢：{tid}")
        self.assertEqual(
            git(fx.a, "status", "--porcelain", "ledger"),
            "",
            "并发收敛后工作树要干净",
        )


class OfflineThenOnlineTest(ScenarioCase):
    """离线写完再联网：下一条写命令先把积压推上去，不让「没推」挡住写入。"""

    def test_offline_write_then_push_backlog(self):
        fx = self.fx
        tid = new_task(fx.a, "离线任务", env=NOSYNC)
        fx.push(fx.a)
        git(fx.a, "remote", "set-url", "origin", str(fx.base / "no-such-remote"))
        code, _, err = run(fx.a, "log", "--id", tid, "--note", "离线记一条")
        self.assertEqual(code, 0, f"离线应仍能写：{err}")
        self.assertIn("写前拉取失败", err, "离线要给出明确提示")
        self.assertIn("离线记一条", worklog_text(fx.a, tid))

        # 联网后：按 2026-10-22 定稿的写前 guard，「有未推送的台账提交」先硬拦，不替用户推
        git(fx.a, "remote", "set-url", "origin", str(fx.remote))
        blocked = run(fx.a, "log", "--id", tid, "--note", "联网后补一条")
        self.assertEqual(blocked[0], 1, "有未推送提交时应先拦住")
        self.assertIn("未推送", blocked[2])
        # 人工推掉积压之后才恢复可写
        git(fx.a, "push", "-q")
        code, _, err = run(fx.a, "log", "--id", tid, "--note", "联网后补一条")
        self.assertEqual(code, 0, f"推完之后该能写：{err}")
        branch = git(fx.a, "rev-parse", "--abbrev-ref", "HEAD")
        self.assertEqual(
            git(fx.a, "rev-parse", f"origin/{branch}"), git(fx.a, "rev-parse", "HEAD")
        )


class PushRejectedTest(ScenarioCase):
    """推送被拒（远端在「取完最新」之后又来提交）：自动 rebase；同任务两边改则留冲突标记。

    用 a 的 `pre-push` 钩子精确制造这个竞态：钩子里让 b 先推一个提交上去，a 的推送必然被拒。
    钩子**只发一次**（flag 文件）—— 否则重试的那次推送又会触发它，永远合不上。
    """

    def _arm_race(self, body, delay="1.1"):
        flag = self.fx.base / "raced"
        hook = self.fx.a / ".git" / "hooks" / "pre-push"
        hook.write_text(
            "#!/bin/sh\n"
            "unset GIT_DIR GIT_WORK_TREE\n"  # git 给钩子设了这个变量，不干掉它内层 git 会跑偏
            f'if [ -f "{flag}" ]; then exit 0; fi\n'
            f'touch "{flag}"\n'
            f"sleep {delay}\n"
            f"TASK_LEDGER_NO_SYNC=1 {sys.executable} -B {PROGRESS} {body}"
            f" --repo {self.fx.b} >/dev/null 2>&1\n"
            f"git -C {self.fx.b} add ledger && git -C {self.fx.b} commit -q -m"
            f" 'chore(ledger): 别人改' && git -C {self.fx.b} push -q\n"
            "exit 0\n",
            encoding="utf-8",
        )
        hook.chmod(0o755)
        self.addCleanup(hook.unlink)

    def test_rejection_auto_merges(self):
        fx = self.fx
        tid = new_task(fx.a, "被拒后自动合的任务")
        time.sleep(1.1)  # 让后面那条 log 真的改到分片（不同秒）
        fx.push(fx.a)
        fx.pull(fx.b)
        self._arm_race("new --title 别人新建的任务 --self")
        code, _, err = run(fx.a, "log", "--id", tid, "--note", "本地改这条")
        self.assertEqual(code, 0, f"推送被拒应自动 rebase 合并：{err}")
        self.assertIn("本地改这条", worklog_text(fx.a, tid), "自己那条不能丢")
        self.assertIn(
            "别人新建的任务",
            {t.get("title") for t in merged(fx.a).values()},
            "远端新提交要合进来",
        )
        for shard in (fx.a / "ledger" / "owners").glob("*.json"):
            self.assertNotIn(
                "<<<<<<<",
                shard.read_text(encoding="utf-8"),
                "不同任务自动合上，不该留标记",
            )
        self.assertEqual(
            git(fx.a, "status", "--porcelain", "ledger"), "", "自动合上之后工作树要干净"
        )
        branch = git(fx.a, "rev-parse", "--abbrev-ref", "HEAD")
        self.assertEqual(
            git(fx.a, "rev-parse", f"origin/{branch}"),
            git(fx.a, "rev-parse", "HEAD"),
            "合并后要推得上去",
        )

    def test_same_task_conflict_is_marked(self):
        """同一个人（同一个 uuid）在两台机器上改同一条任务：必须留冲突标记，不许静默选。

        这是 merge.py 存在的唯一理由 —— 也只有同身份时两边才会写同一份分片文件。
        """
        fx = self.fx
        ident(fx.b, "smoke-a-other", "smoke-a@example.com")  # 同 uuid = 同一个人
        tid = new_task(fx.a, "两边都改的任务")
        time.sleep(1.1)  # 保证 a 的 log 真的改到分片（不同秒）
        fx.push(fx.a)
        fx.pull(fx.b)
        wl_rel = merged(fx.a)[tid]["worklog"]  # 先记下：冲突后分片不是合法 JSON，读不了
        self._arm_race(f"log --id {tid} --note 公司改的")
        code, _, err = run(fx.a, "log", "--id", tid, "--note", "家里改的")
        # 推送失败只提示、退出码仍是 0（台账已写成功）；但冲突必须点名、标记必须留在文件里
        self.assertEqual(code, 0, f"推送失败不该把命令判红：{err}")
        self.assertIn("两边同时改过", err, "要说清是同任务冲突")
        shard = next((fx.a / "ledger" / "owners").glob("*.json"))
        text = shard.read_text(encoding="utf-8")
        self.assertIn("<<<<<<< 远端", text, "冲突任务要标出来，不许静默选一个")
        self.assertIn(">>>>>>> 本地", text, "冲突任务要标出本机版本")
        wl = (fx.a / "ledger" / wl_rel).read_text(encoding="utf-8")
        self.assertIn("家里改的", wl, "本机那条要在")
        self.assertIn("公司改的", wl, "别人那条也要在")
        self.assertNotIn("<<<<<<<", wl, "worklog 是追加式正文，不该留冲突标记")
        # rebase 留在原地等人解：下一条写命令该被「中间态」拦住，而不是接着写
        blocked = run(fx.a, "log", "--id", tid, "--note", "再来一条")
        self.assertEqual(blocked[0], 1, "rebase 中间态必须拦住后续写入")
        self.assertIn("中间态", blocked[2])


class NoUpstreamTest(ScenarioCase):
    """没有上游分支：只做本地提交并提示，不许把写入判失败。"""

    def test_no_upstream_still_writes(self):
        fx = self.fx
        tid = new_task(fx.a, "无上游任务", env=NOSYNC)
        fx.push(fx.a)
        git(fx.a, "branch", "--unset-upstream")
        code, _, err = run(fx.a, "log", "--id", tid, "--note", "无上游也写")
        self.assertEqual(code, 0, f"无上游不该阻断写入：{err}")
        self.assertIn("没有上游分支", err, "要提示未推送")
        self.assertIn("无上游也写", worklog_text(fx.a, tid))


class OthersTaskTest(ScenarioCase):
    """动别人的任务一律拒绝（记进展 / 释放 / 结案 / 交给没登记的人）。"""

    def test_cannot_touch_others(self):
        fx = self.fx
        tid = new_task(fx.a, "a 的任务")
        fx.push(fx.a)
        fx.pull(fx.b)
        code, _, err = run(fx.b, "log", "--id", tid, "--note", "别人的")
        self.assertEqual(code, 1)
        self.assertIn("不在我的分片里", err)
        code, _, err = run(fx.b, "set", "--id", tid, "--release")
        self.assertEqual(code, 1)
        self.assertIn("不在我的分片里", err)
        code, _, err = run(fx.b, "close", "--id", tid, "--summary", "x")
        self.assertEqual(code, 1)
        code, _, err = run(fx.a, "set", "--id", tid, "--owner", uid("ghost"))
        self.assertEqual(code, 1)
        self.assertIn("还没在索引里登记过", err, "不能写出对别人不存在的分片")
        # 交给一个没登记过的身份要拒（写出一份对别人不存在的分片）
        code, _, err = run(
            fx.a, "set", "--id", tid, "--owner", uid("smoke-b@example.com")
        )
        self.assertEqual(code, 1, "b 从未成功写过 ⇒ 没登记过，不能交接给他")
        # b 自己成功建一条（这一步才会把他登记进索引），之后交接就合法
        self.assertEqual(run(fx.b, "new", "--title", "b 自己的任务", "--self")[0], 0)
        fx.push(fx.b)
        fx.pull(fx.a)
        code, _, err = run(
            fx.a, "set", "--id", tid, "--owner", uid("smoke-b@example.com")
        )
        self.assertEqual(code, 0, f"交给已登记的人应成功：{err}")
        fx.push(fx.a)
        fx.pull(fx.b)
        self.assertEqual(merged(fx.b)[tid]["owner"], uid("smoke-b@example.com"))


class NoLedgerTest(ScenarioCase):
    """没有台账时怎么找、怎么报错（SKILL.md「建台账」那条的实测依据）。"""

    def test_read_without_ledger_does_not_create(self):
        fx = self.fx
        code, _out, _err = run(fx.a, "list")
        self.assertEqual(
            code, 0, "指定了 --repo 就认这个目录：没有台账 = 空台账，不是错误"
        )
        self.assertFalse((fx.a / "ledger").exists(), "只读不许顺手把台账建出来")

    def test_without_repo_arg_and_no_ledger_is_rejected(self):
        """不带 --repo 又找不到 ledger/ ⇒ 退 1，绝不在当前目录就地建台账。"""
        fx = self.fx
        proc = subprocess.run(
            [sys.executable, "-B", str(PROGRESS), "list"],
            capture_output=True,
            text=True,
            cwd=str(fx.a),
            env=BASE_ENV,
            check=False,
        )
        self.assertEqual(proc.returncode, 1, "找不到台账要明确报错")
        self.assertIn("找不到台账", proc.stdout + proc.stderr)


class NoGitRepoTest(unittest.TestCase):
    """没有 git 也必须能用（2026-10-24 用户拍板）：台账照写、同步跳过、给提示。"""

    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="dtl-nogit-"))
        self.addCleanup(shutil.rmtree, self.root, True)

    def test_write_works_without_git(self):
        code, out, err = run(self.root, "new", "--title", "无 git 也记", "--self")
        self.assertEqual(code, 0, err)
        self.assertIn("不是 git 仓库", out + err, "要给「只写了本地」的提示")
        task = merged(self.root)
        self.assertEqual(len(task), 1)
        self.assertEqual(task[next(iter(task))]["status"], "doing")
        # 只读也能用
        code, out, _err = run(self.root, "list")
        self.assertEqual(code, 0)
        self.assertIn("无 git 也记", out)

    def test_second_write_not_blocked(self):
        run(self.root, "new", "--title", "第一条", "--self")
        tid = task_id_of(self.root, "第一条")
        code, _, err = run(self.root, "log", "--id", tid, "--note", "无 git 也记进展")
        self.assertEqual(code, 0, err)
        code, _, err = run(self.root, "set", "--id", tid, "--release")
        self.assertEqual(code, 0, err)
        self.assertIn(tid, merged(self.root), "释放后回公共池（merged 含池）")

    def test_close_and_history_without_git(self):
        """无 git 下 close / history / --count-only 也必须能用（2026-10-24 拍板）。"""
        tid = new_task(self.root, "无 git 也结案")
        code, _, err = run(self.root, "close", "--id", tid, "--summary", "无 git 收尾")
        self.assertEqual(code, 0, err)
        # history 读的是台账自带 history（不靠 git），无 git 也要能列出结案
        code, out, err = run(self.root, "history")
        self.assertEqual(code, 0, err)
        self.assertIn("无 git 也结案", out, "无 git 下 history 也要能列出结案")
        # --count-only 固定 {count, capped} 两键，封顶边界另见 COUNT_CAP
        code, out, _ = run(self.root, "history", "--count-only")
        self.assertEqual(code, 0)
        data = json.loads(out)
        self.assertEqual(set(data), {"count", "capped"})
        self.assertGreaterEqual(data["count"], 1)


class RootResolutionTest(unittest.TestCase):
    """工作区根定位回归：--repo 指到 ledger/ 本身、stray ledger/ledger、合法场景（2026-10-25）。"""

    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="dtl-root-"))
        self.addCleanup(shutil.rmtree, self.root, True)
        self.repo = self.root / "proj"
        (self.repo / "ledger" / "owners").mkdir(parents=True)
        (self.repo / "ledger" / "pool.json").write_text(
            '{"version": "1", "tasks": {}}', encoding="utf-8"
        )
        (self.repo / "ledger" / "owners.json").write_text(
            '{"workers": {}}', encoding="utf-8"
        )

    def test_repo_pointing_at_ledger_dir_is_rejected(self):
        """把 ledger/ 当 --repo 传 ⇒ 退 1，且说明它是台账目录、不新造 ledger/ledger。"""
        code, out, err = run(self.repo / "ledger", "list")
        self.assertEqual(code, 1)
        text = out + err
        self.assertIn("台账目录本身", text)
        self.assertIn("才是工作区根", text)
        self.assertFalse(
            (self.repo / "ledger" / "ledger").exists(), "更不该再建出 ledger/ledger"
        )

    def test_readonly_also_rejected(self):
        """只读命令也不许静默读错目录：validate 同样被拦。"""
        code, _out, _err = run(self.repo / "ledger", "validate")
        self.assertEqual(code, 1)

    def test_bootstrap_does_not_create_nested_ledger(self):
        """自举只建 <root>/ledger，绝不再套一层 ledger/ledger（元凶回归）。"""
        code, _out, err = run(
            self.repo, "new", "--title", "根校验", "--self", env=NOSYNC
        )
        self.assertEqual(code, 0, err)
        self.assertTrue((self.repo / "ledger" / "pool.json").exists())
        self.assertFalse(
            (self.repo / "ledger" / "ledger").exists(), "自举不许再建 ledger/ledger"
        )

    def test_stray_ledger_does_not_hijack_upward_lookup(self):
        """造一个 stray 空 ledger/ledger 后，从 ledger/owners 里跑，根不能被带偏成 ledger/。"""
        (self.repo / "ledger" / "ledger").mkdir()
        proc = subprocess.run(
            [sys.executable, "-B", str(PROGRESS), "list"],
            capture_output=True,
            text=True,
            cwd=str(self.repo / "ledger" / "owners"),
            env={**BASE_ENV, **NOSYNC},
            check=False,
        )
        text = proc.stdout + proc.stderr
        self.assertNotIn(
            str(self.repo / "ledger" / "ledger"), text, "根不能被 stray 带偏"
        )

    def test_project_root_named_ledger_is_allowed(self):
        """项目根真的叫 ledger 时不能被误拒。"""
        weird = self.root / "ledger"
        (weird / "ledger" / "owners").mkdir(parents=True)
        (weird / "ledger" / "pool.json").write_text(
            '{"version": "1", "tasks": {}}', encoding="utf-8"
        )
        (weird / "ledger" / "owners.json").write_text(
            '{"workers": {}}', encoding="utf-8"
        )
        code, _out, err = run(weird, "list", env=NOSYNC)
        self.assertEqual(code, 0, f"根叫 ledger 不该被误拒：{err}")

    def test_common_filenames_in_root_are_not_rejected(self):
        """项目根自带 pool.json / history+worklog / owners.json+owners 都不是台账目录。

        判据只看结构（含不含 ledger/、在不在 ledger/ 里），不看目录里有哪些文件
        （2026-10-25 改）。
        """
        cases = {
            "pool": lambda r: (r / "pool.json").write_text("{}", encoding="utf-8"),
            "history_worklog": lambda r: [
                (r / d).mkdir(exist_ok=True) for d in ("history", "worklog")
            ],
            "owners": lambda r: [
                (r / "owners").mkdir(exist_ok=True),
                (r / "owners.json").write_text("{}", encoding="utf-8"),
            ],
        }
        for name, prepare in cases.items():
            with self.subTest(name=name):
                r = self.root / f"proj-{name}"
                (r / "ledger" / "owners").mkdir(parents=True)
                (r / "ledger" / "pool.json").write_text(
                    '{"version": "1", "tasks": {}}', encoding="utf-8"
                )
                prepare(r)
                code, _out, err = run(r, "list", env=NOSYNC)
                self.assertEqual(code, 0, f"{name}：根不该被误当成台账目录：{err}")

    def test_repo_pointing_inside_ledger_is_rejected(self):
        """`--repo <根>/ledger/worklog` 是台账目录里面，不能当根（否则建出嵌套台账）。"""
        (self.repo / "ledger" / "worklog").mkdir()
        code, _out, err = run(self.repo / "ledger" / "worklog", "list")
        self.assertEqual(code, 1)
        self.assertIn("台账目录里面", err)

    def test_half_bootstrapped_ledger_dir_is_rejected(self):
        """半自举遗留（只有 owners/、没有 pool.json）也是台账目录，靠位置判、不靠指纹。"""
        half = self.root / "proj2" / "ledger"
        (half / "owners").mkdir(parents=True)
        code, _out, err = run(half, "list")
        self.assertEqual(code, 1)
        self.assertIn("台账目录本身", err)

    def _run_cwd(self, cwd, *args):
        """不带 `--repo` 跑一条命令，走 cwd 向上定位那条路（`run()` 永远硬塞 --repo）。"""
        proc = subprocess.run(
            [sys.executable, "-B", str(PROGRESS), *args],
            capture_output=True,
            text=True,
            cwd=str(cwd),
            env={**BASE_ENV, **NOSYNC, "TASK_LEDGER_HOME": str(home_of(cwd))},
            check=False,
        )
        return proc.returncode, proc.stdout, proc.stderr

    def test_cwd_root_named_ledger_finds_real_ledger(self):
        """工作区根自己就叫 ledger 时，cwd 定位要走根上的 ledger/，不能被父目录抢走。"""
        weird = self.root / "proj3" / "ledger"
        real = weird / "ledger"
        (real / "owners").mkdir(parents=True)
        (real / "pool.json").write_text(
            '{"version": "1", "tasks": {"T1": {"id": "T1", "title": "真任务",'
            ' "status": "open", "owner": null}}}',
            encoding="utf-8",
        )
        (real / "owners.json").write_text('{"workers": {}}', encoding="utf-8")
        code, out, err = self._run_cwd(weird, "list")
        self.assertEqual(code, 0, err)
        self.assertIn("真任务", out, "必须读到根上的 ledger/，不是父目录")
        self.assertIn(f"台账：{weird.resolve()}", out)

    def test_cwd_root_with_history_and_worklog_dirs(self):
        """根自带 history/ + worklog/ 两个目录时，cwd 定位仍要落到根上（不许说找不到）。"""
        r = self.root / "proj-sibling-dirs"
        (r / "ledger" / "owners").mkdir(parents=True)
        (r / "ledger" / "pool.json").write_text(
            '{"version": "1", "tasks": {}}', encoding="utf-8"
        )
        for d in ("history", "worklog"):
            (r / d).mkdir()
        code, out, err = self._run_cwd(r, "list")
        self.assertEqual(code, 0, err)
        self.assertIn(f"台账：{r.resolve()}", out)


class MonthsWindowTest(ScenarioCase):
    """--months 是自然月窗口：自己算最近 N 个月，读其中存在的文件（2026-10-24）。"""

    def test_months_is_calendar_window_not_file_count(self):
        fx = self.fx
        # 一条现在的、一条三个月前的（用 --finished 把历史行落到指定月）
        now_tid = new_task(fx.a, "本月结案", env=NOSYNC)
        run(fx.a, "close", "--id", now_tid, "--summary", "本月", env=NOSYNC)
        old_tid = new_task(fx.a, "古早结案", env=NOSYNC)
        old_finished = _shift_months(-3)
        code, _, err = run(
            fx.a,
            "close",
            "--id",
            old_tid,
            "--summary",
            "古早",
            "--finished",
            old_finished,
            env=NOSYNC,
        )
        self.assertEqual(code, 0, err)
        # 默认 = 最近 3 个自然月：本月的在，3 个月前的不在（窗口外）
        code, out, _ = run(fx.a, "history", env=NOSYNC)
        self.assertEqual(code, 0)
        self.assertIn("本月结案", out)
        self.assertNotIn("古早结案", out, "默认只查近 3 个月，3 个月前的不在窗口内")
        # 最近 1 个月：只有本月那条（古早的在 3 个月前，窗口外）
        code, out, _ = run(fx.a, "history", "--months", "1", env=NOSYNC)
        self.assertEqual(code, 0)
        self.assertIn("本月结案", out)
        self.assertNotIn("古早结案", out)
        # 最近 2 个月：窗口是 {本月, 上个月}，古早的在 3 个月前 ⇒ 仍不该出现。
        # 这一条是两种语义的分水岭：按文件数取尾 2 个会把古早那条一起裹进来
        code, out, _ = run(fx.a, "history", "--months", "2", env=NOSYNC)
        self.assertEqual(code, 0)
        self.assertIn("本月结案", out)
        self.assertNotIn("古早结案", out, "--months 2 是自然月窗口，不是数文件")
        # 最近 6 个月：两条都该在（窗口覆盖到 3 个月前）
        code, out, _ = run(fx.a, "history", "--months", "6", env=NOSYNC)
        self.assertEqual(code, 0)
        self.assertIn("本月结案", out)
        self.assertIn("古早结案", out)


def _shift_months(delta: int) -> str:
    """当前 UTC 月份偏移 delta 个月，返回 YYYY-MM-DD（当月 15 号，避免跨月边界）。"""
    from ledgerkit.core.time import now as _now

    stamp = _now()
    year, month = int(stamp[0:4]), int(stamp[5:7]) + delta
    while month > 12:
        year, month = year + 1, month - 12
    while month < 1:
        year, month = year - 1, month + 12
    return f"{year:04d}-{month:02d}-15"


class HistoryRangeTest(ScenarioCase):
    """history 的时间区间：按结案时间过滤、默认近 3 月、上限 13 月、缺月跳过。"""

    def _ymd(self, offset: int, day: int) -> str:
        """相对当前的月份偏移 offset，返回该月 day 号的 `YYYY-MM-DD`。"""
        return f"{_shift_months(offset)[:8]}{day:02d}"

    def test_since_until_filters_by_finished_not_created(self):
        fx = self.fx
        # 上月创建、本月结案：记录落在本月历史文件、finished 在本月
        code, _, err = run(
            fx.a,
            "new",
            "--title",
            "跨月任务",
            "--self",
            "--created",
            self._ymd(-1, 15),
            env=NOSYNC,
        )
        self.assertEqual(code, 0, err)
        tid = task_id_of(fx.a, "跨月任务")
        code, _, err = run(
            fx.a, "close", "--id", tid, "--summary", "跨月结案", env=NOSYNC
        )
        self.assertEqual(code, 0, err)
        # 查本月：按 finished 命中（比 created 会漏，因为 created 在上月）
        code, out, _ = run(
            fx.a,
            "history",
            "--since",
            self._ymd(0, 1),
            "--until",
            self._ymd(0, 28),
            env=NOSYNC,
        )
        self.assertEqual(code, 0)
        self.assertIn("跨月任务", out, "结案月的区间应命中（历史按结案月归档）")
        # 查上月：created 在上月，但 finished 在本月 ⇒ 不该命中
        code, out, _ = run(
            fx.a,
            "history",
            "--since",
            self._ymd(-1, 1),
            "--until",
            self._ymd(-1, 28),
            env=NOSYNC,
        )
        self.assertEqual(code, 0)
        self.assertNotIn(
            "跨月任务", out, "按结案时间过滤，不能因 created 在上月就误命中"
        )

    def test_in_file_finished_filter_within_same_month(self):
        fx = self.fx
        # 整月都在过去，避免 --finished 落到未来；验证同一月文件内也按 finished 精确到日筛
        ym = _shift_months(-3)[:8]  # "YYYY-MM-"
        code, _, err = run(
            fx.a,
            "new",
            "--title",
            "精筛任务",
            "--self",
            "--created",
            f"{ym}01",
            env=NOSYNC,
        )
        self.assertEqual(code, 0, err)
        tid = task_id_of(fx.a, "精筛任务")
        code, _, err = run(
            fx.a,
            "close",
            "--id",
            tid,
            "--summary",
            "精筛",
            "--finished",
            f"{ym}05",
            env=NOSYNC,
        )
        self.assertEqual(code, 0, err)
        # 结案在 5 号：查 10-20 应排除（同一月文件，但 finished 不在区间）
        code, out, _ = run(
            fx.a,
            "history",
            "--since",
            f"{ym}10",
            "--until",
            f"{ym}20",
            env=NOSYNC,
        )
        self.assertEqual(code, 0)
        self.assertNotIn("精筛任务", out, "结案在 5 号，10 号之后的区间不该命中")
        # 同月 01-20：结案 5 号在区间内，应命中
        code, out, _ = run(
            fx.a,
            "history",
            "--since",
            f"{ym}01",
            "--until",
            f"{ym}20",
            env=NOSYNC,
        )
        self.assertEqual(code, 0)
        self.assertIn("精筛任务", out)

    def test_thirteen_files_allowed(self):
        fx = self.fx
        # 上限卡的是「文件数」：恰好 13 个文件要放行，14 个才拒
        code, _, err = run(fx.a, "history", "--months", "13", env=NOSYNC)
        self.assertEqual(code, 0, f"13 个文件应放行：{err}")

    def test_default_is_last_three_months(self):
        fx = self.fx
        tid = new_task(fx.a, "四月前结案", env=NOSYNC)
        code, _, err = run(
            fx.a,
            "close",
            "--id",
            tid,
            "--summary",
            "老任务",
            "--finished",
            _shift_months(-4),
            env=NOSYNC,
        )
        self.assertEqual(code, 0, err)
        code, out, _ = run(fx.a, "history", env=NOSYNC)
        self.assertEqual(code, 0)
        self.assertNotIn("四月前结案", out, "默认只查近 3 个月")
        code, out, _ = run(fx.a, "history", "--months", "6", env=NOSYNC)
        self.assertEqual(code, 0)
        self.assertIn("四月前结案", out, "--months 6 覆盖到 4 个月前")

    def test_over_13_months_rejected(self):
        fx = self.fx
        code, _, err = run(fx.a, "history", "--months", "14", env=NOSYNC)
        self.assertNotEqual(code, 0, "超过 13 个月必须报错")
        self.assertIn("13", err)
        code, _, err = run(
            fx.a,
            "history",
            "--since",
            _shift_months(-14),
            "--until",
            _shift_months(0),
            env=NOSYNC,
        )
        self.assertNotEqual(code, 0, "跨 15 个月的区间必须报错")
        self.assertIn("13", err)

    def test_missing_month_is_skipped(self):
        fx = self.fx
        month = _shift_months(-6)[:8]
        code, out, err = run(
            fx.a,
            "history",
            "--since",
            month + "01",
            "--until",
            month + "28",
            env=NOSYNC,
        )
        self.assertEqual(code, 0, f"缺月应跳过、不报错：{err}")
        self.assertIn("没有符合条件", out, "缺月应视为没记录，不报错")

    def test_months_conflicts_with_since(self):
        fx = self.fx
        code, _, err = run(
            fx.a, "history", "--months", "3", "--since", "2026-01-01", env=NOSYNC
        )
        self.assertNotEqual(code, 0, "--months 与 --since 同时用应报错")
        self.assertIn("不能同时用", err)


class ValidateDepthTest(ScenarioCase):
    """validate 两档：默认浅度只查格式，`--deep` 才读全部历史与过程文档正文（2026-10-24）。"""

    def test_shallow_does_not_read_bodies(self):
        """浅度不碰正文：骨架文档不提示；深度才提示。"""
        fx = self.fx
        new_task(fx.a, "只有骨架", env=NOSYNC)
        code, out, err = run(fx.a, "validate", env=NOSYNC)
        self.assertEqual(code, 0, err)
        self.assertNotIn("骨架", out + err, "浅度不该判骨架（那要读正文）")
        code, out, err = run(fx.a, "validate", "--deep", env=NOSYNC)
        self.assertEqual(code, 0, err)
        self.assertIn("骨架", err, "深度要提示骨架文档")

    def test_deep_reads_older_history_months(self):
        """浅度只读当月历史文件，深度把更早的月份也读进来。"""
        fx = self.fx
        tid = new_task(fx.a, "四月前结案", env=NOSYNC)
        code, _, err = run(
            fx.a,
            "close",
            "--id",
            tid,
            "--summary",
            "老任务",
            "--finished",
            _shift_months(-4),
            env=NOSYNC,
        )
        self.assertEqual(code, 0, err)
        _, out, _ = run(fx.a, "validate", "--json", env=NOSYNC)
        shallow = json.loads(out)["checked_files"]
        _, out, _ = run(fx.a, "validate", "--json", "--deep", env=NOSYNC)
        deep = json.loads(out)["checked_files"]
        self.assertGreater(deep, shallow, "深度要多读历史月份文件")


class RerunConvergesTest(ScenarioCase):
    """崩在半途 ⇒ 重跑一次收敛（写序表的「重跑怎么收敛」逐条验）。"""

    def test_release_twice(self):
        fx = self.fx
        tid = new_task(fx.a, "释放两次")
        self.assertEqual(run(fx.a, "set", "--id", tid, "--release")[0], 0)
        code, out, err = run(fx.a, "set", "--id", tid, "--release")
        self.assertEqual(code, 0, "重复释放不算失败")
        self.assertIn("已经在公共池里", out + err)
        self.assertIsNone(merged(fx.a)[tid]["owner"])
        self.assertEqual(merged(fx.a)[tid]["status"], "open")

    def test_close_twice(self):
        fx = self.fx
        tid = new_task(fx.a, "结案两次")
        self.assertEqual(run(fx.a, "close", "--id", tid, "--summary", "第一次")[0], 0)
        code, out, err = run(fx.a, "close", "--id", tid, "--summary", "第二次")
        self.assertEqual(code, 0, "重复结案不算失败")
        self.assertIn("已经结过案", out + err)
        history = list((fx.a / "ledger" / "history").glob("*.md"))
        self.assertEqual(len(history), 1, "历史只该有一个月文件")
        self.assertEqual(
            history[0].read_text(encoding="utf-8").count("\n| 2"), 1, "历史只该有一行"
        )

    def test_claim_twice(self):
        fx = self.fx
        tid = new_task(fx.a, "认领两次", mine=False)
        self.assertEqual(run(fx.a, "claim", "--id", tid)[0], 0)
        code, out, err = run(fx.a, "claim", "--id", tid)
        self.assertEqual(code, 0, "已在分片里再认领不算失败")
        self.assertIn("已经在我的分片里", out + err)

    def test_crash_mid_write_then_rerun(self):
        """半途崩：分片改了、过程文档没记 —— 重跑把剩下一步补齐。"""
        fx = self.fx
        tid = new_task(fx.a, "崩在半途", env=NOSYNC)
        fx.push(fx.a)
        log_path = fx.a / "ledger" / merged(fx.a)[tid]["worklog"]
        kept = [
            ln
            for ln in log_path.read_text(encoding="utf-8").splitlines()
            if "创建任务" not in ln
        ]
        log_path.write_text("\n".join(kept) + "\n", encoding="utf-8")
        code, _, err = run(fx.a, "log", "--id", tid, "--note", "补一条")
        self.assertEqual(code, 0, f"重跑应成功：{err}")
        self.assertIn("补一条", log_path.read_text(encoding="utf-8"))


class CrossMonthCloseTest(ScenarioCase):
    """跨月结案：历史落当月文件，只刷真要写的那一个月。"""

    def test_close_into_old_month(self):
        fx = self.fx
        tid = new_task(fx.a, "跨月结案任务", env=NOSYNC)
        fx.push(fx.a)
        code, _, err = run(
            fx.a,
            "close",
            "--id",
            tid,
            "--summary",
            "夹具：结案到旧月份",
            "--finished",
            "2020-01-15 10:00",
        )
        self.assertEqual(code, 0, err)
        self.assertTrue(
            (fx.a / "ledger" / "history" / "202001.md").exists(), "历史应落 202001.md"
        )
        self.assertFalse(
            (fx.a / "ledger" / "history" / "202610.md").exists(),
            "不该顺带建当月历史文件",
        )


class ReuseClosedIdTest(ScenarioCase):
    """复用已结案的任务号：同月要挡（撞同一篇文档），跨月不挡（落在不同月份目录）。"""

    def _close(self, fx, tid):
        code, _, err = run(
            fx.a, "close", "--id", tid, "--summary", "夹具结案", env=NOSYNC
        )
        self.assertEqual(code, 0, err)

    def test_same_month_reuse_is_rejected(self):
        fx = self.fx
        tid = new_task(fx.a, "同月复用", env=NOSYNC)
        self._close(fx, tid)
        code, _, err = run(fx.a, "new", "--title", "同月再来", "--id", tid, env=NOSYNC)
        self.assertEqual(code, 1, "同月复用已结案的号必须挡住：会撞同一篇文档")
        self.assertIn("过程文档已经存在", err)

    def test_cross_month_reuse_is_allowed(self):
        fx = self.fx
        tid = "20260915-1200-跨月复用-aaaa"
        code, _, err = run(
            fx.a,
            "new",
            "--title",
            "跨月复用",
            "--id",
            tid,
            "--created",
            _shift_months(-1),
            "--self",
            env=NOSYNC,
        )
        self.assertEqual(code, 0, err)
        self._close(fx, tid)  # 结案时间 = 现在 ⇒ 历史行落在**当月**文件里
        code, _, err = run(
            fx.a,
            "new",
            "--title",
            "跨月再来",
            "--id",
            tid,
            "--created",
            _shift_months(0),
            "--self",
            env=NOSYNC,
        )
        self.assertEqual(code, 0, err + "｜跨月同号落在不同月份目录，不该挡")
        docs = sorted(
            p.parent.name for p in (fx.a / "ledger" / "worklog").rglob("*aaaa.md")
        )
        self.assertEqual(len(docs), 2, f"两篇文档都在，只是分处两个月目录：{docs}")


class ReadOnlyNoGitTest(ScenarioCase):
    """只读命令一个字都不碰 git：不 fetch、不提交、不改工作树。"""

    def test_read_commands_do_not_fetch(self):
        fx = self.fx
        tid = new_task(fx.a, "只读用例任务")
        fx.push(fx.a)
        fx.pull(fx.b)
        new_task(fx.b, "b 侧新任务")
        fx.push(fx.b)
        branch = git(fx.a, "rev-parse", "--abbrev-ref", "HEAD")
        before = git(fx.a, "rev-parse", f"origin/{branch}")
        for args in (
            ("list",),
            ("show", "--id", tid),
            ("history",),
            ("validate",),
        ):
            self.assertEqual(run(fx.a, *args)[0], 0, f"{args} 应成功")
        self.assertEqual(
            git(fx.a, "rev-parse", f"origin/{branch}"), before, "只读命令不该 fetch"
        )
        self.assertEqual(
            git(fx.a, "status", "--porcelain", "ledger"), "", "只读命令不该留下任何改动"
        )


class ByteContractTest(unittest.TestCase):
    """写盘格式：一条一行 + 键排序（与旧实现逐字节一致，存量文件不翻面）。"""

    def test_dump_matches_sorted_layout(self):
        data = {
            "identity": {"email": "a@b.c", "name": "A"},
            "version": "20261022000000",
            "tasks": {"t2": {"title": "后"}, "t1": {"title": "前"}},
        }
        text = dump_ledger_json(data)
        self.assertEqual(
            text.splitlines(),
            [
                "{",
                '  "identity": {"email": "a@b.c", "name": "A"},',
                '  "tasks": {',
                '    "t1": {"title": "前"},',
                '    "t2": {"title": "后"}',
                "  },",
                '  "version": "20261022000000"',
                "}",
            ],
        )
        self.assertEqual(json.loads(text)["tasks"]["t1"]["title"], "前")

    def test_conflict_marker_keeps_both_sides(self):
        text, marked = merge.conflict_marked(
            "ledger/owners/x.json",
            base='{\n  "version": "v",\n  "tasks": {\n    "t1": {"a": 1}\n  }\n}\n',
            ours='{\n  "version": "v",\n  "tasks": {\n    "t1": {"a": 2}\n  }\n}\n',
            theirs='{\n  "version": "v",\n  "tasks": {\n    "t1": {"a": 3}\n  }\n}\n',
        )
        self.assertEqual(marked, ["t1"])
        self.assertIn("<<<<<<< 远端", text)
        self.assertIn(">>>>>>> 本地", text)
        self.assertIn('"a": 2', text)
        self.assertIn('"a": 3', text)


class GitTimeoutTest(unittest.TestCase):
    """`_git` 超时必须折成返回码 124，不许抛出去。

    抛出去会被 runner 兜底成「未预期错误」（退出码 3），把 `sync_down` 里
    「写前拉取失败、按本地最新写」那条降级路径整条跳过 —— 触发场景是弱网 / 网络黑洞，
    fetch 一直挂到超时。这里用极短超时直接压出这条路，不真等 30 秒。
    """

    def test_timeout_becomes_returncode_124(self):
        # 不靠真实耗时（机器快时 `git --version` 能在超时判定前跑完），直接把
        # subprocess.run 换成必抛 TimeoutExpired 的桩，确定性地压到那个 except 分支上。
        import subprocess

        from ledgerkit.shell import gitops

        original = subprocess.run

        def boom(cmd: list[str], timeout: float | None = None, **_rest: object) -> None:
            raise subprocess.TimeoutExpired(cmd, timeout or 0.0)

        subprocess.run = boom
        try:
            proc = gitops._git("git", "status")
        finally:
            subprocess.run = original
        self.assertEqual(proc.returncode, 124)
        self.assertIn("timed out", proc.stderr)

    def test_missing_git_is_not_crash(self):
        from ledgerkit.shell.gitops import _git

        proc = _git("definitely-not-a-git-binary", "status")
        self.assertEqual(proc.returncode, 127)


if __name__ == "__main__":
    unittest.main(verbosity=2)
