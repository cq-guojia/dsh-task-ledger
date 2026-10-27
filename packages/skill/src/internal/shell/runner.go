package shell

import (
	"errors"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/actions"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/notices"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// 七步的执行顺序：唯一创建记账本、唯一决定退出码、唯一统一回滚的地方。
//
// 七步：绑记账本 → 取最新 → 自举 → 调动作 → 打印 → 提交 → 推送。
// （仓库定位在更前面，见 Main。）
//
// - already_done **不**跳过提交与推送（写没写只看记账本）。
// - 记账本为空 ⇒ 提交与推送都跳过（没脏文件就没得提交）。

// 退出码：与 SKILL.md 的约定一致。
const (
	ExitOK          = 0
	ExitBusiness    = 1 // 业务错：任务不存在、不是你的、参数不合法
	ExitUsage       = 2 // 用法错
	ExitUnexpected  = 3 // 未预期异常
	ExitInterrupted = 130
)

// Run 跑一条命令，返回退出码。
func Run(command string, args *Args) int {
	log := &store.WriteLog{}
	unbind := store.Bound(log)
	defer unbind()

	stop := watchInterrupt(log)
	defer stop()

	code, err := runCommand(command, args, log)
	if err == nil {
		return code
	}
	title, status := "错误", ExitBusiness
	var fail *core.Fail
	if !errors.As(err, &fail) {
		title, status = "未预期错误", ExitUnexpected
	}
	if !log.CommitStarted {
		// 提交阶段才失败时数据已落盘，回滚 = 吃掉刚写的台账（2026-10-24 修）
		log.RollbackPresync()
		log.DiscardCreated()
	}
	FailMessage(title, err.Error())
	return status
}

// watchInterrupt Ctrl-C：提交开始前回滚，开始后原样退出（数据已落盘）。
func watchInterrupt(log *store.WriteLog) func() {
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, os.Interrupt)
	done := make(chan struct{})
	go func() {
		select {
		case <-ch:
			if !log.CommitStarted {
				log.RollbackPresync()
				log.DiscardCreated()
			}
			FlushNotices()
			os.Exit(ExitInterrupted)
		case <-done:
		}
	}()
	return func() {
		signal.Stop(ch)
		close(done)
	}
}

func runCommand(command string, args *Args, log *store.WriteLog) (int, error) {
	spec, err := actions.SpecOf(command)
	if err != nil {
		return 0, err
	}
	repo := args.Repo
	me, err := actions.CurrentIdentity(repo)
	if err != nil {
		return 0, err
	}
	syncing := !args.NoSync

	g := &GitRepo{Repo: repo}
	if syncing {
		// 中间态是**全局前提**，必须早于下面任何读台账的动作（paramsOf 的 new 快照、
		// PresyncScope 的锁集都要读台账）：冲突标记下的台账不是合法 JSON，读它就抛
		// 「未预期错误」（退出码 3），而文档要的是「仓库处于中间态」这句人话。
		if err := g.CheckRepoState(); err != nil {
			return 0, err
		}
	}

	params, err := paramsOf(command, args, repo, me)
	if err != nil {
		return 0, err
	}

	// 只读：不建 GitRepo、不进事务、不提交
	if spec.ReadOnly {
		value, err := spec.Run(repo, me, params)
		if err != nil {
			return 0, err
		}
		// 先自报读的是哪个台账：--repo 指错目录时输出会变成一片「没有任务」，不带这一行
		// 就完全看不出读错了地方。--count-only 也出 JSON，同样不打（2026-10-25 改）
		RepoBanner(repo, args.JSON || args.CountOnly)
		if err := renderOf(spec, value, args, args.JSON); err != nil {
			return 0, err
		}
		if problemsOf(value) {
			return ExitBusiness, nil // validate 有 problems ⇒ 退出码 1
		}
		return ExitOK, nil
	}

	lockAction := spec.LockAction
	if lockAction == "" {
		lockAction = command
	}
	bootScope, actScope, err := PresyncScope(repo, me, lockAction, lockParams(params))
	if err != nil {
		return 0, err
	}
	scope := bootScope.Or(actScope)

	if syncing {
		if err := g.GuardBeforeWrite(scope); err != nil {
			return 0, err
		}
		entries, err := g.SyncDown(scope)
		if err != nil {
			return 0, err
		}
		for _, entry := range entries {
			log.RecordPresync(entry.Path, entry.Before, entry.Had)
		}
	}

	// 自举会登记自己（改 owners.json、缺文件时建池与分片）。它碰过的文件按「命令前的字节」
	// 记进记账本：成功时照常提交（登记必须进仓），失败时由 RollbackPresync 一起还回去 ——
	// 否则一条失败的命令会把台账留在「已写未提交」，下一条写命令被写前 guard 拦死。
	// 登记是幂等的，还回去下次再登记，没有损失。
	// 快照范围取 scope（boot ∪ act）：过程文档被 SyncDown 跳过时不会产出 SyncEntry，
	// 只能在这里补字节，否则命令失败时 RollbackPresync 无内容可还。
	for _, rel := range scope.Files {
		path := filepath.Join(repo, core.ToRepoRel(rel))
		before, had, err := store.Snapshot(path)
		if err != nil {
			return 0, err
		}
		log.RecordPresync(path, before, had)
	}

	var value any
	if err := withAtom(repo, bootScope.Files, func() error {
		var bootErr error
		me, bootErr = actions.Bootstrap(repo, me)
		return bootErr
	}); err != nil {
		return 0, err
	}

	if err := withAtom(repo, actScope.Files, func() error {
		var runErr error
		value, runErr = spec.Run(repo, me, params)
		return runErr
	}); err != nil {
		return 0, err
	}

	if err := renderOf(spec, value, args, args.JSON); err != nil {
		return 0, err
	}
	if err := finalize(command, args, log, messageOf(value)); err != nil {
		return 0, err
	}
	return ExitOK, nil
}

// withAtom 拿锁 → 干活 → 放锁。失败也要放锁。
func withAtom(repo string, rels []string, fn func() error) error {
	unlock, err := actions.Atom(repo, rels...)
	if err != nil {
		return err
	}
	defer unlock()
	return fn()
}

// finalize 提交 + 推送：要不要做只看记账本（与 already_done 无关，只有 --no-sync 才整段跳过）。
func finalize(command string, args *Args, log *store.WriteLog, message *string) error {
	if args.NoSync {
		if log.HasWrites() {
			// 以前这条路径一个字都不打，「已写未提交」就此静默腐烂
			notices.Note("提示：--no-sync 本次只写了本地文件、未签入 git（也未推送）。\n" +
				"  处理：确认后自行 git add ledger && git commit && git push；" +
				"留着不提交的话，下一条写命令会被「本地有未提交的台账改动」拦住。")
		}
		log.Clear()
		return nil
	}
	if !log.HasWrites() {
		log.Clear()
		return nil
	}
	g := &GitRepo{Repo: args.Repo}
	if !g.IsGitRepo() {
		// 没有 git 也能用：台账照写，只不做同步（2026-10-24 用户拍板）。
		notices.Note("提示：当前目录不是 git 仓库，台账只写了本地文件（未提交、未推送）。\n" +
			"  处理：想纳入版本管理就 git init；否则继续本地写也行 —— " +
			"多人各写各的，后写覆盖先写。")
		log.Clear()
		return nil
	}
	log.CommitStarted = true
	msg := fmt.Sprintf("chore(ledger): %s", command)
	if message != nil && *message != "" {
		msg = *message
	}
	if err := g.Commit(log.CommitSet(), msg); err != nil {
		return err
	}
	g.Push(8, pushDeadline())
	log.Clear()
	return nil
}

func renderOf(spec actions.ActionSpec, value any, args *Args, asJSON bool) error {
	switch spec.Render {
	case "result":
		res, ok := value.(*actions.Result)
		if !ok {
			return core.Failf("内部错误：%s 的返回类型不是 Result", spec.Render)
		}
		RenderResult(res)
	case "list_view":
		res, ok := value.(*actions.ListResult)
		if !ok {
			return core.Failf("内部错误：%s 的返回类型不是 ListResult", spec.Render)
		}
		RenderList(res, asJSON)
	case "stats_view":
		res, ok := value.(*actions.StatsResult)
		if !ok {
			return core.Failf("内部错误：%s 的返回类型不是 StatsResult", spec.Render)
		}
		RenderStats(res, asJSON)
	case "owners_view":
		res, ok := value.(*actions.OwnersResult)
		if !ok {
			return core.Failf("内部错误：%s 的返回类型不是 OwnersResult", spec.Render)
		}
		RenderOwners(res, asJSON)
	case "show_view":
		res, ok := value.(*actions.ShowResult)
		if !ok {
			return core.Failf("内部错误：%s 的返回类型不是 ShowResult", spec.Render)
		}
		RenderShow(res, asJSON)
	case "history_view":
		res, ok := value.(*actions.HistoryResult)
		if !ok {
			return core.Failf("内部错误：%s 的返回类型不是 HistoryResult", spec.Render)
		}
		RenderHistory(res, args.HistoryQuery, asJSON)
	case "validate_view":
		res, ok := value.(*actions.ValidationReport)
		if !ok {
			return core.Failf("内部错误：%s 的返回类型不是 ValidationReport", spec.Render)
		}
		RenderValidate(res, asJSON)
	default:
		return core.Failf("内部错误：名册里的渲染函数 %q 没有实现", spec.Render)
	}
	return nil
}

func problemsOf(value any) bool {
	res, ok := value.(*actions.ValidationReport)
	return ok && len(res.Problems) > 0
}

func messageOf(value any) *string {
	if res, ok := value.(*actions.Result); ok {
		return res.Message
	}
	return nil
}

// paramsOf 按名册挑参数；**不许把整个 Args 透传进业务层**。
func paramsOf(command string, a *Args, repo string, me core.Identity) (actions.Params, error) {
	p := actions.Params{
		Title:    a.Title,
		Tid:      a.TID,
		Created:  a.Created,
		Category: nonEmptyPtr(a.Category),
		Tags:     a.Tags,
		Mine:     a.Mine,
		Owner:    a.Owner,
		Release:  a.Release,
		Note:     a.Note,
		Summary:  a.Summary,
		Finished: a.Finished,
		Deep:     a.Deep,
		List:     a.Query,
		History:  a.HistoryQuery,
	}
	switch command {
	case "new":
		created := core.Now()
		if a.Created != "" {
			value, err := core.ToUTC(a.Created, "--created", "", "")
			if err != nil {
				return p, err
			}
			created = value
		}
		p.Created = created
		if p.Tid == "" {
			tasks, err := taskSnapshot(repo, me)
			if err != nil {
				return p, err
			}
			tid, err := core.MakeID(p.Title, tasks, created)
			if err != nil {
				return p, err
			}
			p.Tid = tid
		}
		p.Tags = nonNil(p.Tags)
	case "close":
		finished := core.Now()
		if a.Finished != "" {
			value, err := core.ToUTC(a.Finished, "--finished", "", "")
			if err != nil {
				return p, err
			}
			finished = value
		}
		p.Finished = finished
		p.Tags = nonNil(p.Tags)
	}
	return p, nil
}

// taskSnapshot 建任务查重要用的在办任务快照（**锁外**只读，只用于生成不撞的号）。
func taskSnapshot(repo string, me core.Identity) (map[string]struct{}, error) {
	tasks := map[string]struct{}{}
	for _, rel := range []string{core.PoolRel, core.ShardRel(me.UUID)} {
		all, err := store.NewTaskStore(repo, rel, nil).All()
		if err != nil {
			return nil, err
		}
		for tid := range all {
			tasks[tid] = struct{}{}
		}
	}
	return tasks, nil
}

// lockParams 交给 LockScope 的参数（只给算锁集用得上的那几个键）。
func lockParams(p actions.Params) map[string]any {
	return map[string]any{
		"tid":      p.Tid,
		"created":  p.Created,
		"mine":     p.Mine,
		"finished": p.Finished,
	}
}

func nonNil(tags []string) []string {
	if tags == nil {
		return []string{}
	}
	return tags
}
