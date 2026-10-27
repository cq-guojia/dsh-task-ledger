package shell

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/cq-guojia/dsh-task-ledger/skill/internal/actions"
	"github.com/cq-guojia/dsh-task-ledger/skill/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/internal/notices"
)

// 全仓唯一跑 git 的地方。业务层、数据层、core 都不许碰 git（读身份归 env）。
//
// 四个动作之外没有别的入口：写前硬拦、取最新、提交、推送（被拒时 rebase 重试）。

const gitTimeout = 30 * time.Second

// SyncEntry 取最新刷过的文件 + 刷之前的字节（had=false 表示刷之前不存在）。
type SyncEntry struct {
	Path   string
	Before []byte
	Had    bool
}

// gitResult 一条 git 的返回码与输出。
type gitResult struct {
	Code   int
	Stdout string
	Stderr string
}

func (r gitResult) detail() string {
	if strings.TrimSpace(r.Stderr) != "" {
		return strings.TrimSpace(r.Stderr)
	}
	return strings.TrimSpace(r.Stdout)
}

// gitRun 跑一条 git。没装 git 不当崩溃：返回 127，由调用方按返回码处理。
//
// **超时也折成返回码 124**，不许抛出去：SyncDown 的 fetch 分支、Push 的重试、
// rebaseRetry 全按返回码判「远端不通」，抛异常会被 runner 兜底成「未预期错误」
// （退出码 3），把「拉取失败、按本地最新写」这条既定降级路径整条跳过。触发场景是
// 弱网 / 网络黑洞 / 代理挂住 —— 远端不立刻拒绝，fetch 一直挂到超时（2026-10-25 修）。
func gitRun(args ...string) gitResult {
	ctx, cancel := context.WithTimeout(context.Background(), gitTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", args...)
	var outBuf, errBuf bytes.Buffer
	cmd.Stdout = &outBuf
	cmd.Stderr = &errBuf
	err := cmd.Run()
	if err == nil {
		return gitResult{Code: 0, Stdout: outBuf.String(), Stderr: errBuf.String()}
	}
	if errors.Is(err, exec.ErrNotFound) || errors.Is(err, os.ErrNotExist) {
		return gitResult{Code: 127, Stderr: "git: command not found"}
	}
	if ctx.Err() == context.DeadlineExceeded {
		return gitResult{Code: 124, Stderr: fmt.Sprintf("git: timed out after %ds", int(gitTimeout.Seconds()))}
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return gitResult{Code: exitErr.ExitCode(), Stdout: outBuf.String(), Stderr: errBuf.String()}
	}
	return gitResult{Code: 127, Stderr: err.Error()}
}

// GitRepo 一个仓库的 git 操作面。构造不跑 git，也不收 no-sync（调不调由 runner 定）。
type GitRepo struct {
	Repo         string
	upstream     string
	upstreamDone bool
	isRepo       bool
	isRepoDone   bool
}

func (g *GitRepo) run(args ...string) gitResult {
	return gitRun(append([]string{"-C", g.Repo}, args...)...)
}

// IsGitRepo 所在目录是不是一个 git 仓库（工作树内）。
// 不是 ⇒ 同步整体跳过、台账照写（2026-10-24 用户拍板：没有 git 也必须能用）。
func (g *GitRepo) IsGitRepo() bool {
	if !g.isRepoDone {
		res := g.run("rev-parse", "--is-inside-work-tree")
		g.isRepo = res.Code == 0 && strings.TrimSpace(res.Stdout) == "true"
		g.isRepoDone = true
	}
	return g.isRepo
}

// Upstream 上游分支（@{u}）；没有就空串（此时同步整体静默跳过）。
func (g *GitRepo) Upstream() string {
	if !g.upstreamDone {
		res := g.run("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}")
		if res.Code == 0 {
			g.upstream = strings.TrimSpace(res.Stdout)
		}
		g.upstreamDone = true
	}
	return g.upstream
}

// state rebase / merge 中间态（返回说明文字），正常返回空串。
func (g *GitRepo) state() string {
	root := g.run("rev-parse", "--show-toplevel")
	if root.Code != 0 {
		return ""
	}
	gitDir := filepath.Join(strings.TrimSpace(root.Stdout), ".git")
	for _, item := range []struct{ name, hint string }{
		{"rebase-merge", "rebase 交互待办"},
		{"rebase-apply", "rebase 正在应用"},
		{"MERGE_HEAD", "merge 未结束"},
	} {
		if _, err := os.Stat(filepath.Join(gitDir, item.name)); err == nil {
			return item.hint
		}
	}
	return ""
}

func (g *GitRepo) dirty(rels []string) []string {
	return g.lines(append([]string{"status", "--porcelain", "--"}, rels...)...)
}

func (g *GitRepo) unpushed(rels []string) []string {
	upstream := g.Upstream()
	if upstream == "" {
		return nil
	}
	return g.lines(append([]string{"log", upstream + "..HEAD", "--oneline", "--"}, rels...)...)
}

func (g *GitRepo) untracked(rels []string) []string {
	return g.lines(append([]string{"ls-files", "--others", "--exclude-standard", "--"}, rels...)...)
}

// lines 跑一条 git，按行取非空输出；失败当没有。
func (g *GitRepo) lines(args ...string) []string {
	res := g.run(args...)
	if res.Code != 0 {
		return nil
	}
	var out []string
	for _, line := range strings.Split(res.Stdout, "\n") {
		if strings.TrimSpace(line) != "" {
			out = append(out, line)
		}
	}
	return out
}

// CheckRepoState 中间态 ⇒ 业务错误。这是**全局前提**，必须早于任何读台账的动作。
//
// 冲突标记下的台账不是合法 JSON，PresyncScope / paramsOf 一读就炸，
// 命令会以「未预期错误」（退出码 3）崩掉，而不是给人话。
func (g *GitRepo) CheckRepoState() error {
	if state := g.state(); state != "" {
		return core.Failf("仓库处于中间态（%s）：先跑 git status 看提示，"+
			"完成或中止它（git rebase --abort / git merge --abort）再跑本命令。", state)
	}
	return nil
}

// GuardBeforeWrite 本地有未提交的台账改动 / 有未推送的台账提交 / 有未入库的同名文件 /
// 处于 rebase 中间态 ⇒ 业务错误并说明怎么处理。在 SyncDown 之前调。
func (g *GitRepo) GuardBeforeWrite(scope actions.Scope) error {
	rels := g.rels(scope)
	if len(rels) == 0 {
		return nil
	}
	if g.Upstream() == "" {
		// 没有上游：不存在"远端内容会盖掉本地"这回事，未提交 / 未入库都不拦
		return nil
	}
	if err := g.CheckRepoState(); err != nil {
		return err
	}
	// 手写的过程文档不算「本地脏」：它走 SyncDown 的 stash → 快进 → 叠回，不硬拦
	var dirty []string
	for _, line := range g.dirty(rels) {
		if !isWorklogPath(porcelainPath(line)) {
			dirty = append(dirty, line)
		}
	}
	if len(dirty) > 0 {
		return core.Failf("本地有未提交的台账改动：\n  %s\n  处理：先提交它们（git add <文件> && git commit），再跑本命令。",
			strings.Join(head(dirty, 10), "\n  "))
	}
	if unpushed := g.unpushed(rels); len(unpushed) > 0 {
		return core.Failf("本地有未推送的台账提交：\n  %s\n  处理：先 git push；或者加 --no-sync 只写本地（之后要记得推）。",
			strings.Join(head(unpushed, 10), "\n  "))
	}
	if untracked := g.untracked(rels); len(untracked) > 0 {
		return core.Failf("有还没入库的同名台账文件（提交会被它们挡住）：\n  %s\n  处理：先 git add 它们再跑本命令。",
			strings.Join(head(untracked, 10), "\n  "))
	}
	return nil
}

// SyncDown 取最新：先整体快进，再按这个动作要碰的文件逐个刷（连"刷之前"的字节一起返回）。
//
// 快进是必须的：只刷工作树的话，「远端新增的内容」会被本次提交原样重放一遍，
// 推送必被拒、rebase 必冲突（2026-10-21 实测）。快进不了（工作树有未提交改动）
// 才退回逐个刷。
func (g *GitRepo) SyncDown(scope actions.Scope) ([]SyncEntry, error) {
	upstream := g.Upstream()
	if upstream == "" {
		return nil, nil
	}
	fetch := g.run("fetch", "--quiet")
	if fetch.Code != 0 {
		// 远端连不上（离线 / 没网）：不中止 —— 台账照样写，只是这次拿不到远端最新。
		// 提示必须给，否则用户以为同步过了（2026-10-21 红队结论）。
		notices.Note("提示：写前拉取失败（远端连不上），本次按本地最新内容写；" +
			"推送也可能失败，留意稍后的提示。")
		return nil, nil
	}
	ahead, behind := g.revCount(upstream+"..HEAD"), g.revCount("HEAD.."+upstream)
	if ahead == 0 && behind > 0 {
		// 写前 guard 已经保证本地没有未推送的台账提交 ⇒ 落后就只是"慢了一步"，快进安全
		ff := g.run("merge", "--ff-only", "-q", upstream)
		if ff.Code == 0 {
			notices.Note(fmt.Sprintf("提示：写前把本地快进到 %s（%d 个提交，仅 fast-forward）。", upstream, behind))
		} else {
			// 工作树有未提交改动（手写的 worklog / 用户自己的代码）：ff 必然失败
			notices.Note(fmt.Sprintf("提示：写前快进到 %s 没成功（工作树有未提交改动），"+
				"改为只刷新本次要写的台账文件。", upstream))
		}
	}
	var out []SyncEntry
	stashed := map[string]SyncEntry{}
	var stashOrder []string
	for _, path := range g.paths(scope) {
		rel := relTo(g.Repo, path)
		if exists := g.run("cat-file", "-e", upstream+":"+rel); exists.Code != 0 {
			continue // 上游还没有这个文件：本地留着，不覆盖也不报错
		}
		// 「刷之前」的字节先记：手写的那版也算（叠回失败 / 命令失败时要能原样放回）
		before := readMaybe(path)
		entry := SyncEntry{Path: path, Before: before, Had: before != nil}
		// 手写的过程文档：stash → 取远端最新 → 叠回（合不上就留冲突标记，绝不静默丢弃）
		if isWorklogPath(rel) && g.isDirty(rel) {
			g.run("stash", "push", "--quiet", "--", rel)
			stashed[rel] = entry
			stashOrder = append(stashOrder, rel)
		}
		if proc := g.run("checkout", upstream, "--", rel); proc.Code != 0 {
			continue
		}
		if _, stacked := stashed[rel]; stacked {
			// 索引必须与工作树一致（都是上游版本），否则紧接着的 stash pop
			// 会以「本地改动会被覆盖」直接失败，冲突标记根本留不下来
			continue
		}
		// checkout 会把上游版本一并写进索引；失败回滚只按字节还原工作树，
		// 索引里那份脏会让下一条写命令被写前 guard 拦死 ⇒ 取完立刻把索引还原到 HEAD
		// （只动这一个路径，用户自己暂存的别的东西不受影响）。
		g.run("reset", "--quiet", "--", rel)
		if changedBytes(path, before) {
			out = append(out, entry)
		}
	}
	for _, rel := range stashOrder {
		entry := stashed[rel]
		if pop := g.run("stash", "pop", "--quiet"); pop.Code != 0 {
			// 冲突标记留在工作树里让人合；手写那段同时在 stash 里，一个都没丢
			return nil, core.Failf("%s 的手写改动与 %s 的最新版本冲突，冲突标记已留在工作树里。\n"+
				"  处理：逐个编辑解决冲突 → git add <文件> → git stash drop，然后重跑这条命令。\n"+
				"  顺序不能反：先 drop 再解决，手写的那段就没了。", rel, upstream)
		}
		// 叠回去了：索引里那份上游版本也该收干净（工作树已是「上游 + 手写」）
		g.run("reset", "--quiet", "--", rel)
		if changedBytes(entry.Path, entry.Before) {
			out = append(out, entry)
		}
	}
	return out, nil
}

// revCount 数提交个数；数不出来返回 -1（按"可能有"处理，宁可不动）。
func (g *GitRepo) revCount(spec string) int {
	res := g.run("rev-list", "--count", spec)
	n, err := strconv.Atoi(strings.TrimSpace(res.Stdout))
	if err != nil {
		return -1
	}
	return n
}

func (g *GitRepo) isDirty(rel string) bool {
	res := g.run("status", "--porcelain", "--", rel)
	return strings.TrimSpace(res.Stdout) != ""
}

// Commit 只提交台账那几个文件（不带 pathspec 会把用户自己暂存的别的东西一起卷进来）。
func (g *GitRepo) Commit(files []string, message string) error {
	rels := make([]string, 0, len(files))
	for _, file := range files {
		rels = append(rels, relTo(g.Repo, file))
	}
	if len(rels) == 0 {
		return nil
	}
	if add := g.run(append([]string{"add", "--"}, rels...)...); add.Code != 0 {
		return core.Failf("git add 失败：%s\n  处理：文件还在磁盘上（本次改动没丢），按提示处理后重跑。", add.detail())
	}
	// 一个字节都没变（重跑幂等：写下去的与 HEAD 相同）⇒ 没有可提交的内容，这不是错误。
	// 不跳的话 git commit 会以 "nothing added to commit" 失败，把一条本该成功的重跑判红。
	if staged := g.run(append([]string{"diff", "--cached", "--quiet", "--"}, rels...)...); staged.Code == 0 {
		return nil
	}
	commit := g.run(append([]string{"commit", "--no-verify", "-m", message, "--"}, rels...)...)
	if commit.Code != 0 {
		return core.Failf("git commit 失败：%s\n  处理：文件已暂存、本次改动没丢；按提示处理（常见：commit 检查钩子拒了消息）后重跑。", commit.detail())
	}
	return nil
}

// Push 推送；被拒（远端有新提交）就 rebase 后重试，循环到成功或遇到真冲突。
//
// 跨 clone 并发推同一 origin 时，单次「rebase + 再 push」会被别的 clone 在空档里
// 又推一次击穿——留下未推送提交、后续写命令被 guard 拦掉、雪崩式拖垮同 clone 写入。
// 所以改成有上限的 rebase+push 循环：每轮都 fetch 最新 origin 再 rebase，把别人的新
// 推送吸收掉，直到真正推上去；只有遇到「无上游 / 本地混了非台账提交 / 真冲突（已留标记）
// / 次数耗尽或超时」才停，绝不静默丢数据。
//
// **任何失败都只提示、不抛**：提交已经落下去了，抛业务错误会让 runner 走失败收尾，
// 把已提交的内容从工作树里抹掉，那才是真丢数据。git 的原话必须带出去。
func (g *GitRepo) Push(maxAttempts int, deadline time.Time) {
	lastReason := ""
	for attempt := 0; attempt < maxAttempts; attempt++ {
		if !time.Now().Before(deadline) {
			break
		}
		push := g.run("push")
		lastReason = push.detail()
		if push.Code == 0 {
			return
		}
		if g.Upstream() == "" {
			notices.Note(fmt.Sprintf("提示：没有上游分支，本地提交已保留、未推送：%s\n"+
				"  处理：给分支设上游（git push -u origin <分支>）后重跑即可推走。", lastReason))
			return
		}
		if g.hasForeignCommits() {
			titles := g.foreignTitles()
			detail := ""
			if len(titles) > 0 {
				detail = "：" + strings.Join(head(titles, 5), "；")
			}
			notices.Note(fmt.Sprintf("提示：推送被拒（远端有新提交）：%s\n"+
				"且本地还有你自己的提交%s ⇒ 不自动 rebase（那会改写提交号）。"+
				"手动跑 git pull --rebase && git push 即可；重推时它们会被一并推上去，请自行确认。\n"+
				"  本次台账改动已提交在本地，不会丢。", lastReason, detail))
			return
		}
		if !g.rebaseRetry() {
			// 真冲突已留标记（或 fetch 失败）：交给人工，不再重试
			return
		}
		// rebase 成功 ⇒ 循环再 push（已基于最新 origin）
	}
	notices.Note(fmt.Sprintf("提示：推送多次被拒，本次台账改动已提交在本地、未推送：%s\n"+
		"  处理：手动 git pull --rebase && git push（冲突自己解；"+
		"脚本的「按任务号合并」只在它自动重试时发生）。", lastReason))
}

// rebaseRetry 重放本机的台账提交；撞冲突时按语义接管（不同任务自动合、同任务留标记）。
//
// --autostash：把工作树里用户未提交的改动临时收走，rebase 完自动放回 ——
// 不这样做，只要仓库里有一处未提交改动，自动合并就永久失效。
func (g *GitRepo) rebaseRetry() bool {
	if fetch := g.run("fetch", "--quiet"); fetch.Code != 0 {
		return false // 离线 / 凭据过期：不自动合并，由 Push 的提示说明
	}
	rebase := g.run("rebase", "--autostash", "@{upstream}")
	if rebase.Code == 0 {
		// rebase 本身成功，冲突只可能来自 autostash 放回：文件带着 <<<<<<< 标记，
		// 不点名就会有人把冲突标记当成品提交上去。
		if conflicted := g.conflicts(); len(conflicted) > 0 {
			notices.Note("提示：rebase 成功，但把你的未提交改动放回工作树时冲突了 —— " +
				"这些文件现在带着 `<<<<<<<` 标记，别当成品提交：\n  " +
				strings.Join(conflicted, "\n  ") +
				"\n  改动同时还在 stash 里（git stash list）；解完冲突、" +
				"确认内容没错再 git stash drop。")
		}
		return true
	}
	return g.ResolveConflicts()
}

// ResolveConflicts 接管 rebase 冲突。返回 false 时要么已 abort（干净失败），要么留着标记等人。
func (g *GitRepo) ResolveConflicts() bool {
	conflicts := g.conflicts()
	if len(conflicts) == 0 {
		g.abortRebase()
		return false
	}
	type triple struct{ Base, Ours, Theirs string }
	stages := map[string]triple{}
	for _, rel := range conflicts {
		base, _ := g.stage(rel, 1)
		ours, oursOK := g.stage(rel, 2)
		theirs, theirsOK := g.stage(rel, 3)
		if !oursOK || !theirsOK {
			g.abortRebase() // 拿不到三路内容：交给人工
			return false
		}
		stages[rel] = triple{Base: base, Ours: ours, Theirs: theirs}
	}
	for rel := range stages {
		if !Owns(rel) {
			// 混进业务文件：整体退回原路径，不由脚本代劳
			g.abortRebase()
			return false
		}
	}

	var notes, hard []string
	for rel, stage := range stages {
		if IsAppendOnly(rel) {
			text := UnionMerge(stage.Base, stage.Ours, stage.Theirs)
			if !ResolveLedgerConflict(filepath.Join(g.Repo, rel), text) {
				g.abortRebase()
				return false
			}
			notes = append(notes, RenderConflictText(rel, stage.Base, stage.Ours, stage.Theirs))
			continue
		}
		text, marked, ok := ConflictMarked(rel, stage.Base, stage.Ours, stage.Theirs)
		if !ok {
			g.abortRebase()
			return false
		}
		if !ResolveLedgerConflict(filepath.Join(g.Repo, rel), text) {
			g.abortRebase()
			return false
		}
		notes = append(notes, RenderConflictText(rel, stage.Base, stage.Ours, stage.Theirs))
		hard = append(hard, marked...)
	}

	if len(hard) > 0 {
		// 同一个任务被两边改：不替用户选，标记留着让人定，rebase 留在原地好继续
		notices.Note("提示：推送被拒后 rebase 撞上冲突，台账里有任务被两边同时改过，" +
			"已按任务逐个标出冲突（标记里左边是远端、右边是本机），没有替你选任何一个。\n  " +
			strings.Join(hard, "\n  ") +
			"\n  处理：编辑该文件保留你要的版本 → git add → git rebase --continue；" +
			"不想合就 git rebase --abort 回到写之前。\n" +
			"  你的台账改动已提交在本地，不会丢。\n  " + strings.Join(notes, "\n  "))
		return false
	}

	add := g.run(append([]string{"add", "--"}, conflicts...)...)
	cont := g.run("-c", "core.editor=true", "rebase", "--continue")
	if add.Code != 0 || cont.Code != 0 {
		g.abortRebase()
		return false
	}
	notices.Note("提示：推送被拒后 rebase 撞上冲突，已按任务号对账合并" +
		"（不同任务互不影响，追加式正文一行没丢）：\n  " + strings.Join(notes, "\n  "))
	return true
}

// abortRebase 干净失败：退回 rebase 之前，绝不把仓库留在中间态。
func (g *GitRepo) abortRebase() {
	abort := g.run("rebase", "--abort")
	if abort.Code != 0 {
		// abort 也失败：仓库真的停在中间态，必须把真实状态原样交出去。
		// 谎称「已回滚」最坏 —— 那时台账文件可能带着冲突标记，继续写会全盘读坏。
		status := g.run("status", "--short", "--branch")
		notices.Note("错误：自动 rebase 后回滚也失败了，仓库可能停在 rebase 中间态。" +
			"在收拾干净之前不要再跑台账命令。\n" +
			"  当前状态：" + strings.TrimSpace(status.Stdout) + "\n" +
			"  处理：在仓库根执行 git rebase --abort；仍失败就先 git status " +
			"看清残留文件（必要时删掉 .git/rebase-merge 或 .git/rebase-apply）再重试。")
	}
}

// hasForeignCommits 上游之上是否还有**非台账**的本地提交（有就不自动 rebase）。
func (g *GitRepo) hasForeignCommits() bool {
	upstream := g.Upstream()
	if upstream == "" {
		return true
	}
	total := len(g.lines("log", upstream+"..HEAD", "--oneline"))
	ours := len(g.lines("log", upstream+"..HEAD", "--oneline", "--", "ledger"))
	return total > ours
}

// foreignTitles 上游之上、且不碰 ledger/ 的本地提交标题（提示里点名用）。
func (g *GitRepo) foreignTitles() []string {
	upstream := g.Upstream()
	if upstream == "" {
		return nil
	}
	return g.lines("log", upstream+"..HEAD", "--format=%s", "--", ".", ":!ledger")
}

// stage 取 rebase 冲突的三路内容（:1 base / :2 ours / :3 theirs）。
func (g *GitRepo) stage(rel string, stage int) (string, bool) {
	res := g.run("show", fmt.Sprintf(":%d:%s", stage, rel))
	if res.Code != 0 {
		return "", false
	}
	return res.Stdout, true
}

// conflicts 冲突文件列表。
// `-z`：非 ASCII 路径不做引号 / 八进制转义。中文任务名的过程文档一抓一个准，
// 不加 -z 时拿到的路径带引号，git show :1:<path> 取不到内容、owns() 也判否，
// 冲突接管会整个放弃（2026-10-23 场景测试抓到的真 bug）。
func (g *GitRepo) conflicts() []string {
	res := g.run("diff", "--name-only", "--diff-filter=U", "-z")
	if res.Code != 0 {
		return nil
	}
	var out []string
	for _, rel := range strings.Split(res.Stdout, "\x00") {
		if rel != "" {
			out = append(out, rel)
		}
	}
	return out
}

// porcelainPath `git status --porcelain` 的一行 → 路径（去掉状态位、剥引号、还原非 ASCII 转义）。
func porcelainPath(line string) string {
	if len(line) < 3 {
		return strings.TrimSpace(line)
	}
	raw := strings.TrimSpace(line[3:])
	return unquoteGitPath(raw)
}

// unquoteGitPath 还原 git 的 C 风格路径转义（core.quotePath 打开时的八进制字节）。
func unquoteGitPath(raw string) string {
	if len(raw) < 2 || raw[0] != '"' || raw[len(raw)-1] != '"' {
		return raw
	}
	body := raw[1 : len(raw)-1]
	var buf []byte
	for i := 0; i < len(body); i++ {
		c := body[i]
		if c != '\\' || i+1 >= len(body) {
			buf = append(buf, c)
			continue
		}
		i++
		switch body[i] {
		case 'n':
			buf = append(buf, '\n')
		case 't':
			buf = append(buf, '\t')
		case 'r':
			buf = append(buf, '\r')
		case 'a':
			buf = append(buf, 7)
		case 'b':
			buf = append(buf, 8)
		case 'f':
			buf = append(buf, 12)
		case 'v':
			buf = append(buf, 11)
		case '"', '\\':
			buf = append(buf, body[i])
		default:
			if body[i] >= '0' && body[i] <= '7' && i+2 < len(body) {
				if v, err := strconv.ParseUint(body[i:i+3], 8, 8); err == nil {
					buf = append(buf, byte(v))
					i += 2
					continue
				}
			}
			buf = append(buf, body[i])
		}
	}
	return string(buf)
}

// isWorklogPath 是不是手写的过程文档（与台账文件区分：台账硬拦、过程文档放行叠回）。
func isWorklogPath(rel string) bool {
	return strings.HasPrefix(filepath.ToSlash(rel), core.WorklogDir+"/")
}

// changedBytes 取最新之后这个文件的内容是否真变了（没变就不该进记账本：重跑幂等时提交空改动必失败）。
func changedBytes(path string, before []byte) bool {
	after := readMaybe(path)
	if before == nil || after == nil {
		return !(before == nil && after == nil)
	}
	return !bytes.Equal(before, after)
}

func readMaybe(path string) []byte {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	return data
}

// relTo 绝对路径 → 相对 repo 的斜杠路径（出不了 repo 就原样返回）。
func relTo(repo, path string) string {
	absRepo, err := filepath.Abs(repo)
	if err != nil {
		return path
	}
	absPath, err := filepath.Abs(path)
	if err != nil {
		return path
	}
	if real, err := filepath.EvalSymlinks(absRepo); err == nil {
		absRepo = real
	}
	if real, err := filepath.EvalSymlinks(absPath); err == nil {
		absPath = real
	}
	rel, err := filepath.Rel(absRepo, absPath)
	if err != nil {
		return path
	}
	return filepath.ToSlash(rel)
}

// paths Scope.Files + Scope.Dirs 展开后的已存在文件（目录只刷、不加锁）。
// Scope 里的路径相对 ledger/，换算只在 core.ToRepoRel 一处做。
func (g *GitRepo) paths(scope actions.Scope) []string {
	var out []string
	for _, rel := range scope.Files {
		out = append(out, filepath.Join(g.Repo, core.ToRepoRel(rel)))
	}
	for _, dir := range scope.Dirs {
		base := filepath.Join(g.Repo, core.ToRepoRel(dir))
		info, err := os.Stat(base)
		if err != nil || !info.IsDir() {
			continue
		}
		var found []string
		_ = filepath.WalkDir(base, func(path string, entry fs.DirEntry, walkErr error) error {
			if walkErr != nil || entry.IsDir() {
				return nil
			}
			found = append(found, path)
			return nil
		})
		sort.Strings(found)
		out = append(out, found...)
	}
	seen := map[string]bool{}
	uniq := make([]string, 0, len(out))
	for _, path := range out {
		if !seen[path] {
			seen[path] = true
			uniq = append(uniq, path)
		}
	}
	return uniq
}

func (g *GitRepo) rels(scope actions.Scope) []string {
	paths := g.paths(scope)
	rels := make([]string, 0, len(paths))
	for _, path := range paths {
		rels = append(rels, relTo(g.Repo, path))
	}
	return rels
}

// pushDeadline 推送的整体时限：超时后不再 rebase 重试，把选择权交回用户。
func pushDeadline() time.Time { return time.Now().Add(45 * time.Second) }

func head(list []string, n int) []string {
	if len(list) <= n {
		return list
	}
	return list[:n]
}
