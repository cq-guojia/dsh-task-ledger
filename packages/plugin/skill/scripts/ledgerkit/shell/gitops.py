"""全仓唯一跑 git 的地方。业务层、数据层、core 都不许碰 git（读身份归 `env.py`）。

四个动作之外没有别的入口：写前硬拦、取最新、提交、推送（被拒时 rebase 重试）。
"""

from __future__ import annotations

import contextlib
import os
import subprocess
import time
from collections.abc import Iterator
from pathlib import Path

from .. import notices
from ..actions.atom import Scope
from ..core.paths import to_repo_rel
from ..errors import Fail

try:  # pragma: no cover
    import fcntl
except ImportError:  # pragma: no cover
    fcntl = None  # type: ignore[assignment]
try:  # pragma: no cover
    import msvcrt
except ImportError:  # pragma: no cover
    msvcrt = None  # type: ignore[assignment]

GIT_TIMEOUT = 30


def _git(*args: str, timeout: int | None = GIT_TIMEOUT) -> subprocess.CompletedProcess:
    """跑一条 git。没装 git 不当崩溃：返回 127 的空结果，由调用方按返回码处理。"""
    try:
        return subprocess.run(
            list(args), capture_output=True, text=True, timeout=timeout, check=False
        )
    except FileNotFoundError:
        return subprocess.CompletedProcess(
            list(args), 127, stdout="", stderr="git: command not found"
        )


@contextlib.contextmanager
def repo_sync_lock(git_dir: Path, timeout: float = 60.0) -> Iterator[None]:
    """整条命令的进程级互斥：写前同步 → 命令写入 → 提交推送，同一 clone 只允许一个。

    `progress_lock` 只管单文件的读改写，盖不住「检查本地干净 → 覆盖文件」这两步之间的缝。
    锁文件放 git 目录里（不进仓库、不被 git 状态看见）。
    """
    if fcntl is None and msvcrt is None:
        yield
        return
    lock_path = Path(git_dir) / "dsh-task-ledger.sync.lock"
    try:
        fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o644)
    except OSError as exc:
        raise Fail(
            f"拿不到同步锁 {lock_path}（{exc}），本次未做任何写入。\n"
            "  处理：确认 git 目录可写；只需写本地文件可加 --no-sync，之后手动提交。"
        ) from exc
    acquired = False
    try:
        deadline = time.monotonic() + timeout
        while True:
            try:
                if fcntl is not None:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                elif msvcrt is not None:
                    os.lseek(fd, 0, os.SEEK_SET)
                    msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)  # type: ignore[attr-defined]
                acquired = True
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise Fail(
                        f"另一个会话正在同步同一份台账（已等 {int(timeout)} 秒），请稍后重试。"
                    ) from None
                time.sleep(0.1)
        yield
    finally:
        if acquired:
            try:
                if fcntl is not None:
                    fcntl.flock(fd, fcntl.LOCK_UN)
                elif msvcrt is not None:
                    os.lseek(fd, 0, os.SEEK_SET)
                    msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)  # type: ignore[attr-defined]
            except OSError:
                pass
        os.close(fd)


class GitRepo:
    """一个仓库的 git 操作面。构造不跑 git，也不收 `no_sync`（调不调由 runner 定）。"""

    def __init__(self, repo: Path):
        self.repo = Path(repo)
        self._upstream: str | None = None

    # ---- 查 ----

    def upstream(self) -> str | None:
        """上游分支（`@{u}`）；没有就 None（此时同步整体静默跳过）。"""
        if self._upstream is None:
            proc = _git(
                "git",
                "-C",
                str(self.repo),
                "rev-parse",
                "--abbrev-ref",
                "--symbolic-full-name",
                "@{u}",
            )
            self._upstream = (
                proc.stdout.strip()
                if proc.returncode == 0 and proc.stdout.strip()
                else ""
            )
        return self._upstream or None

    def _state(self) -> str | None:
        """rebase / merge 中间态（返回说明文字），正常返回 None。"""
        root = _git("git", "-C", str(self.repo), "rev-parse", "--show-toplevel")
        if root.returncode != 0:
            return None
        git_dir = root.stdout.strip() + "/.git"
        for name, hint in (
            ("rebase-merge", "rebase 交互待办"),
            ("rebase-apply", "rebase 正在应用"),
            ("MERGE_HEAD", "merge 未结束"),
        ):
            if os.path.exists(os.path.join(git_dir, name)):
                return hint
        return None

    def _dirty(self, rels: list[str]) -> list[str]:
        proc = _git("git", "-C", str(self.repo), "status", "--porcelain", "--", *rels)
        if proc.returncode != 0:
            return []
        return [line for line in proc.stdout.splitlines() if line.strip()]

    def _unpushed(self, rels: list[str]) -> list[str]:
        upstream = self.upstream()
        if not upstream:
            return []
        proc = _git(
            "git",
            "-C",
            str(self.repo),
            "log",
            f"{upstream}..HEAD",
            "--oneline",
            "--",
            *rels,
        )
        if proc.returncode != 0:
            return []
        return [line for line in proc.stdout.splitlines() if line.strip()]

    def _untracked(self, rels: list[str]) -> list[str]:
        proc = _git(
            "git",
            "-C",
            str(self.repo),
            "ls-files",
            "--others",
            "--exclude-standard",
            "--",
            *rels,
        )
        if proc.returncode != 0:
            return []
        return [line for line in proc.stdout.splitlines() if line.strip()]

    # ---- 写前硬拦 ----

    def check_repo_state(self) -> None:
        """rebase / merge 中间态 ⇒ Fail。这是**全局前提**，必须早于任何读台账的动作。

        冲突标记下的台账不是合法 JSON，`presync_scope` / `_params` 一读就抛，
        命令会以「未预期错误」（退出码 3）崩掉，而不是给人话。
        """
        state = self._state()
        if state:
            raise Fail(
                f"仓库处于中间态（{state}）：先跑 git status 看提示，"
                "完成或中止它（git rebase --abort / git merge --abort）再跑本命令。"
            )

    def guard_before_write(self, scope: Scope) -> None:
        """本地有未提交的台账改动 / 有未推送的台账提交 / 有未入库的同名文件 /
        处于 rebase 中间态 ⇒ Fail 并说明怎么处理。在 `sync_down` 之前调。
        """
        rels = _rels(self.repo, scope)
        if not rels:
            return
        if not self.upstream():
            # 没有上游：不存在"远端内容会盖掉本地"这回事，未提交 / 未入库都不拦
            return
        self.check_repo_state()
        # 手写的过程文档不算「本地脏」：它走 sync_down 的 stash → 快进 → 叠回，不硬拦
        dirty = [
            line for line in self._dirty(rels) if not _is_worklog(_porcelain_path(line))
        ]
        if dirty:
            raise Fail(
                "本地有未提交的台账改动：\n  "
                + "\n  ".join(dirty[:10])
                + "\n  处理：先提交它们（git add <文件> && git commit），再跑本命令。"
            )
        unpushed = self._unpushed(rels)
        if unpushed:
            raise Fail(
                "本地有未推送的台账提交：\n  "
                + "\n  ".join(unpushed[:10])
                + "\n  处理：先 git push；或者加 --no-sync 只写本地（之后要记得推）。"
            )
        untracked = self._untracked(rels)
        if untracked:
            raise Fail(
                "有还没入库的同名台账文件（提交会被它们挡住）：\n  "
                + "\n  ".join(untracked[:10])
                + "\n  处理：先 git add 它们再跑本命令。"
            )

    # ---- 取最新 ----

    def sync_down(self, scope: Scope) -> list[tuple[Path, bytes | None]]:
        """取最新：先整体快进，再按这个动作要碰的文件逐个刷（连"刷之前"的字节一起返回）。

        快进是必须的：只刷工作树的话，「远端新增的内容」会被本次提交原样重放一遍，
        推送必被拒、rebase 必冲突（2026-10-21 实测）。快进不了（工作树有未提交改动）
        才退回逐个刷。
        """
        upstream = self.upstream()
        if not upstream:
            return []
        fetch = _git("git", "-C", str(self.repo), "fetch", "--quiet")
        if fetch.returncode != 0:
            # 远端连不上（离线 / 没网）：不中止 —— 台账照样写，只是这次拿不到远端最新。
            # 提示必须给，否则用户以为同步过了（2026-10-21 红队结论）。
            notices.note(
                "提示：写前拉取失败（远端连不上），本次按本地最新内容写；"
                "推送也可能失败，留意稍后的提示。"
            )
            return []
        ahead, behind = (
            self._rev_count(f"{upstream}..HEAD"),
            self._rev_count(f"HEAD..{upstream}"),
        )
        if ahead == 0 and behind > 0:
            # 写前 guard 已经保证本地没有未推送的台账提交 ⇒ 落后就只是"慢了一步"，快进安全
            ff = _git("git", "-C", str(self.repo), "merge", "--ff-only", "-q", upstream)
            if ff.returncode == 0:
                notices.note(
                    f"提示：写前把本地快进到 {upstream}（{behind} 个提交，仅 fast-forward）。"
                )
            else:
                # 工作树有未提交改动（手写的 worklog / 用户自己的代码）：ff 必然失败
                notices.note(
                    f"提示：写前快进到 {upstream} 没成功（工作树有未提交改动），"
                    "改为只刷新本次要写的台账文件。"
                )
        out: list[tuple[Path, bytes | None]] = []
        stashed: dict[str, tuple[Path, bytes | None]] = {}
        for path in _paths(self.repo, scope):
            rel = _rel(self.repo, path)
            exists = _git(
                "git", "-C", str(self.repo), "cat-file", "-e", f"{upstream}:{rel}"
            )
            if exists.returncode != 0:
                continue  # 上游还没有这个文件：本地留着，不覆盖也不报错
            # 「刷之前」的字节先记：手写的那版也算（叠回失败 / 命令失败时要能原样放回）
            before = path.read_bytes() if path.exists() else None
            entry = (path, before)
            # 手写的过程文档：stash → 取远端最新 → 叠回（合不上就留冲突标记，绝不静默丢弃）
            if _is_worklog(rel) and self._is_dirty(rel):
                _git("git", "-C", str(self.repo), "stash", "push", "--quiet", "--", rel)
                stashed[rel] = entry
            proc = _git("git", "-C", str(self.repo), "checkout", upstream, "--", rel)
            if proc.returncode != 0:
                continue
            if rel in stashed:
                # 索引必须与工作树一致（都是上游版本），否则紧接着的 stash pop
                # 会以「本地改动会被覆盖」直接失败，冲突标记根本留不下来
                continue
            # checkout 会把上游版本一并写进索引；失败回滚只按字节还原工作树，
            # 索引里那份脏会让下一条写命令被写前 guard 拦死 ⇒ 取完立刻把索引还原到 HEAD
            # （只动这一个路径，用户自己暂存的别的东西不受影响）。
            _git("git", "-C", str(self.repo), "reset", "--quiet", "--", rel)
            if _changed(path, before):
                out.append(entry)
        for rel, entry in stashed.items():
            pop = _git("git", "-C", str(self.repo), "stash", "pop", "--quiet")
            if pop.returncode != 0:
                # 冲突标记留在工作树里让人合；手写那段同时在 stash 里，一个都没丢
                raise Fail(
                    f"{rel} 的手写改动与 {upstream} 的最新版本冲突，冲突标记已留在工作树里。\n"
                    "  处理：逐个编辑解决冲突 → git add <文件> → git stash drop，然后重跑这条命令。\n"
                    "  顺序不能反：先 drop 再解决，手写的那段就没了。"
                )
            # 叠回去了：索引里那份上游版本也该收干净（工作树已是「上游 + 手写」）
            _git("git", "-C", str(self.repo), "reset", "--quiet", "--", rel)
            if _changed(entry[0], entry[1]):
                out.append(entry)
        return out

    def _rev_count(self, spec: str) -> int:
        """数提交个数；数不出来返回 -1（按"可能有"处理，宁可不动）。"""
        proc = _git("git", "-C", str(self.repo), "rev-list", "--count", spec)
        try:
            return int(proc.stdout.strip())
        except ValueError:
            return -1

    def _is_dirty(self, rel: str) -> bool:
        proc = _git("git", "-C", str(self.repo), "status", "--porcelain", "--", rel)
        return bool(proc.stdout.strip())

    # ---- 提交 / 推送 ----

    def commit(self, files: list[Path], message: str) -> None:
        rels = [_rel(self.repo, p) for p in files]
        if not rels:
            return
        add = _git("git", "-C", str(self.repo), "add", "--", *rels)
        if add.returncode != 0:
            raise Fail(
                f"git add 失败：{(add.stderr or '').strip()}\n"
                "  处理：文件还在磁盘上（本次改动没丢），按提示处理后重跑。"
            )
        # 一个字节都没变（重跑幂等：写下去的与 HEAD 相同）⇒ 没有可提交的内容，这不是错误。
        # 不跳的话 git commit 会以 "nothing added to commit" 失败，把一条本该成功的重跑判红。
        staged = _git(
            "git", "-C", str(self.repo), "diff", "--cached", "--quiet", "--", *rels
        )
        if staged.returncode == 0:
            return
        # 只提交台账那几个文件：不带 pathspec 会把用户自己暂存的别的东西一起卷进来
        commit = _git(
            "git",
            "-C",
            str(self.repo),
            "commit",
            "--no-verify",
            "-m",
            message,
            "--",
            *rels,
        )
        if commit.returncode != 0:
            raise Fail(
                f"git commit 失败：{(commit.stderr or commit.stdout or '').strip()}\n"
                "  处理：文件已暂存、本次改动没丢；按提示处理（常见：commit 检查钩子拒了消息）后重跑。"
            )

    def push(self) -> None:
        """推送；被拒（远端有新提交）就 rebase 重试一次，冲突由 `merge` 解。

        **任何失败都只提示、不抛**：提交已经落下去了，抛 Fail 会让 runner 走失败收尾，
        把已提交的内容从工作树里抹掉，那才是真丢数据。git 的原话必须带出去。
        """
        first = _git("git", "-C", str(self.repo), "push")
        if first.returncode == 0:
            return
        reason = (first.stderr or first.stdout or "").strip()
        if not self.upstream():
            notices.note(
                f"提示：没有上游分支，本地提交已保留、未推送：{reason}\n"
                "  处理：给分支设上游（git push -u origin <分支>）后重跑即可推走。"
            )
            return
        if self._has_foreign_commits():
            titles = self._foreign_titles()
            detail = f"：{'；'.join(titles[:5])}" if titles else ""
            notices.note(
                f"提示：推送被拒（远端有新提交）：{reason}\n"
                f"且本地还有你自己的提交{detail} ⇒ 不自动 rebase（那会改写提交号）。"
                "手动跑 git pull --rebase && git push 即可；重推时它们会被一并推上去，请自行确认。\n"
                "  本次台账改动已提交在本地，不会丢。"
            )
            return
        if self._rebase_retry():
            again = _git("git", "-C", str(self.repo), "push")
            if again.returncode == 0:
                return
            reason = (again.stderr or again.stdout or "").strip()
        notices.note(
            f"提示：推送被拒，本次台账改动已提交在本地、未推送：{reason}\n"
            "  处理：手动 git pull --rebase && git push（冲突按任务号合并，见 merge）。"
        )

    def _rebase_retry(self) -> bool:
        """重放本机的台账提交；撞冲突时按语义接管（不同任务自动合、同任务留标记）。

        `--autostash`：把工作树里用户未提交的改动临时收走，rebase 完自动放回 ——
        不这样做，只要仓库里有一处未提交改动，自动合并就永久失效。
        """
        fetch = _git("git", "-C", str(self.repo), "fetch", "--quiet")
        if fetch.returncode != 0:
            return False  # 离线 / 凭据过期：不自动合并，由 push 的提示说明
        rebase = _git(
            "git", "-C", str(self.repo), "rebase", "--autostash", "@{upstream}"
        )
        if rebase.returncode == 0:
            # rebase 本身成功，冲突只可能来自 autostash 放回：文件带着 `<<<<<<<`
            # 标记，不点名就会有人把冲突标记当成品提交上去。
            conflicted = self._conflicts()
            if conflicted:
                notices.note(
                    "提示：rebase 成功，但把你的未提交改动放回工作树时冲突了 —— "
                    "这些文件现在带着 `<<<<<<<` 标记，别当成品提交：\n  "
                    + "\n  ".join(conflicted)
                    + "\n  改动同时还在 stash 里（git stash list）；解完冲突、"
                    "确认内容没错再 git stash drop。"
                )
            return True
        return self.resolve_conflicts()

    def resolve_conflicts(self) -> bool:
        """接管 rebase 冲突。返回 False 时要么已 abort（干净失败），要么留着标记等人。"""
        from . import merge

        conflicts = self._conflicts()
        if not conflicts:
            self._abort_rebase()
            return False
        stages: dict[str, tuple[str, str, str]] = {}
        for rel in conflicts:
            triple = tuple(self._stage(rel, n) for n in (1, 2, 3))  # type: ignore[assignment]
            if triple[1] is None or triple[2] is None:
                self._abort_rebase()  # 拿不到三路内容：交给人工
                return False
            stages[rel] = (triple[0] or "", triple[1], triple[2])
        if not all(merge.owns(rel) for rel in stages):
            # 混进业务文件：整体退回原路径，不由脚本代劳
            self._abort_rebase()
            return False

        notes: list[str] = []
        hard: list[str] = []
        for rel, (base, ours, theirs) in stages.items():
            if merge.is_append_only(rel):
                text = merge.union_merge(base, ours, theirs)
                if merge.resolve_ledger_conflict(self.repo / rel, text) is None:
                    self._abort_rebase()
                    return False
                notes.append(merge.render_conflict_text(rel, base, ours, theirs))
                continue
            out = merge.conflict_marked(rel, base, ours, theirs)
            if out is None:
                self._abort_rebase()
                return False
            text, marked = out
            if merge.resolve_ledger_conflict(self.repo / rel, text) is None:
                self._abort_rebase()
                return False
            notes.append(merge.render_conflict_text(rel, base, ours, theirs))
            hard.extend(marked)

        if hard:
            # 同一个任务被两边改：不替用户选，标记留着让人定，rebase 留在原地好继续
            notices.note(
                "提示：推送被拒后 rebase 撞上冲突，台账里有任务被两边同时改过，"
                "已按任务逐个标出冲突（标记里左边是远端、右边是本机），没有替你选任何一个。\n  "
                + "\n  ".join(hard)
                + "\n  处理：编辑该文件保留你要的版本 → git add → git rebase --continue；"
                "不想合就 git rebase --abort 回到写之前。\n"
                "  你的台账改动已提交在本地，不会丢。\n  " + "\n  ".join(notes)
            )
            return False

        add = _git("git", "-C", str(self.repo), "add", "--", *conflicts)
        cont = _git(
            "git",
            "-C",
            str(self.repo),
            "-c",
            "core.editor=true",
            "rebase",
            "--continue",
        )
        if add.returncode != 0 or cont.returncode != 0:
            self._abort_rebase()
            return False
        notices.note(
            "提示：推送被拒后 rebase 撞上冲突，已按任务号对账合并"
            "（不同任务互不影响，追加式正文一行没丢）：\n  " + "\n  ".join(notes)
        )
        return True

    def _abort_rebase(self) -> None:
        """干净失败：退回 rebase 之前，绝不把仓库留在中间态。"""
        abort = _git("git", "-C", str(self.repo), "rebase", "--abort")
        if abort.returncode != 0:
            # abort 也失败：仓库真的停在中间态，必须把真实状态原样交出去。
            # 谎称「已回滚」最坏 —— 那时台账文件可能带着冲突标记，继续写会全盘读坏。
            status = _git("git", "-C", str(self.repo), "status", "--short", "--branch")
            notices.note(
                "错误：自动 rebase 后回滚也失败了，仓库可能停在 rebase 中间态。"
                "在收拾干净之前不要再跑台账命令。\n"
                f"  当前状态：{(status.stdout or '').strip()}\n"
                "  处理：在仓库根执行 git rebase --abort；仍失败就先 git status "
                "看清残留文件（必要时删掉 .git/rebase-merge 或 .git/rebase-apply）再重试。"
            )

    def _has_foreign_commits(self) -> bool:
        """上游之上是否还有**非台账**的本地提交（有就不自动 rebase）。"""
        upstream = self.upstream()
        if not upstream:
            return True
        allproc = _git(
            "git", "-C", str(self.repo), "log", f"{upstream}..HEAD", "--oneline"
        )
        ledger = _git(
            "git",
            "-C",
            str(self.repo),
            "log",
            f"{upstream}..HEAD",
            "--oneline",
            "--",
            "ledger",
        )
        total = len([x for x in allproc.stdout.splitlines() if x.strip()])
        ours = len([x for x in ledger.stdout.splitlines() if x.strip()])
        return total > ours

    def _foreign_titles(self) -> list[str]:
        """上游之上、且不碰 `ledger/` 的本地提交标题（提示里点名用）。"""
        upstream = self.upstream()
        if not upstream:
            return []
        proc = _git(
            "git",
            "-C",
            str(self.repo),
            "log",
            f"{upstream}..HEAD",
            "--format=%s",
            "--",
            ".",
            ":!ledger",
        )
        if proc.returncode != 0:
            return []
        return [line for line in proc.stdout.splitlines() if line.strip()]

    def _stage(self, rel: str, stage: int) -> str | None:
        """取 rebase 冲突的三路内容（`:1` base / `:2` ours / `:3` theirs）。"""
        proc = _git("git", "-C", str(self.repo), "show", f":{stage}:{rel}")
        return proc.stdout if proc.returncode == 0 else None

    def _conflicts(self) -> list[str]:
        # `-z`：非 ASCII 路径不做引号 / 八进制转义。中文任务名的过程文档一抓一个准，
        # 不加 -z 时拿到的路径带引号，`git show :1:<path>` 取不到内容、owns() 也判否，
        # 冲突接管会整个放弃（2026-10-23 场景测试抓到的真 bug）。
        proc = _git(
            "git",
            "-C",
            str(self.repo),
            "diff",
            "--name-only",
            "--diff-filter=U",
            "-z",
        )
        if proc.returncode != 0:
            return []
        return [line for line in proc.stdout.split("\0") if line]


def _porcelain_path(line: str) -> str:
    """`git status --porcelain` 的一行 → 路径（去掉状态位、剥引号、还原非 ASCII 转义）。"""
    raw = line[3:].strip()
    if len(raw) >= 2 and raw.startswith('"') and raw.endswith('"'):
        raw = raw[1:-1]
    if "\\" in raw:
        try:
            raw = raw.encode("latin-1", "backslashreplace").decode("unicode_escape")
            raw = raw.encode("latin-1", "backslashreplace").decode("utf-8", "replace")
        except (UnicodeError, LookupError):
            pass
    return raw


def _is_worklog(rel: str) -> bool:
    """是不是手写的过程文档（与台账文件区分：台账硬拦、过程文档放行叠回）。"""
    return rel.replace("\\", "/").startswith("ledger/worklog/")


def _changed(path: Path, before: bytes | None) -> bool:
    """取最新之后这个文件的内容是否真变了（没变就不该进记账本：重跑幂等时提交空改动必失败）。"""
    try:
        after = path.read_bytes()
    except OSError:
        after = None
    return after != before


def _rel(repo: Path, path: Path) -> str:
    try:
        return str(Path(path).resolve().relative_to(Path(repo).resolve()))
    except ValueError:
        return str(path)


def _paths(repo: Path, scope: Scope) -> list[Path]:
    """`Scope.files` + `Scope.dirs` 展开后的已存在文件（目录只刷、不加锁）。

    `Scope` 里的路径相对 `ledger/`，换算只在 `core/paths.to_repo_rel` 一处做。
    """
    out: list[Path] = []
    for rel in scope.files:
        out.append(repo / to_repo_rel(rel))
    for directory in scope.dirs:
        base = repo / to_repo_rel(directory)
        if base.is_dir():
            out.extend(sorted(p for p in base.rglob("*") if p.is_file()))
    seen: set[Path] = set()
    uniq: list[Path] = []
    for path in out:
        if path not in seen:
            seen.add(path)
            uniq.append(path)
    return uniq


def _rels(repo: Path, scope: Scope) -> list[str]:
    return [_rel(repo, p) for p in _paths(repo, scope)]
