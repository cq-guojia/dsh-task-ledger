package shell

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/actions"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/env"
	"github.com/cq-guojia/dsh-task-ledger/skill/src/internal/store"
)

// 命令行：只做解析与装配，不碰文件。
//
// - TASK_LEDGER_NO_SYNC **只在这里读一次**，折成 args.NoSync 往下传。

// NoSyncEnv 只写本地、不取最新 / 不提交 / 不推送。
const NoSyncEnv = "TASK_LEDGER_NO_SYNC"

const usageText = `用法：progress <命令> [选项]

命令：new / claim / set / log / close / list / stats / owners / show / history / validate / root / whoami / init
公共选项：
  --repo <工作区根>   --no-sync   -h, --help`

// Args 解析后的命令行（字段与 SKILL.md 的选项一一对应）。
type Args struct {
	Command   string
	Repo      string
	NoSync    bool
	JSON      bool

	Title     string
	TID       string
	Created   string
	Category  string
	Tags      []string
	Mine      bool
	Pool      bool
	Owner     *string
	OwnerName *string
	Status    string
	Tag       *string
	Since     *string
	Until     *string
	Limit     *int
	Months    *int
	// 年龄阈值（天）：不传用内置默认，传了覆盖（list / stats 同一套）
	StaleDays   *int
	OverdueDays *int
	BacklogDays *int
	Trend       string // stats --trend <粒度>：走趋势统计，不走在办计数
	Last        string // stats --trend 的 --last <N><d|w|m|y>
	ByOwner     bool   // stats --trend 的 --by-owner
	Dir         string // root：要检测的目录（不给 = 当前目录）
	Deep        bool
	Note        string
	Summary     string
	Finished    string
	Release     bool
	Claim       *string
	NewID       bool
	Name        string
	Yes         bool

	Query        *actions.ListQuery
	HistoryQuery *actions.HistoryQuery
	TrendQuery   *actions.TrendQuery
}

func usageErr(format string, a ...any) error { return fmt.Errorf(format, a...) }

var commandFlags = map[string]map[string]bool{
	"new":      setOf("--title", "--id", "--created", "--category", "--tags", "--self", "--repo"),
	"claim":    setOf("--id", "--repo"),
	"set":      setOf("--id", "--owner", "--release", "--tags", "--repo"),
	"log":      setOf("--id", "--note", "--repo"),
	"close":    setOf("--id", "--summary", "--finished", "--tags", "--repo"),
	"list":     setOf("--pool", "--mine", "--owner", "--owner-name", "--status", "--category", "--tag", "--since", "--until", "--stale-days", "--overdue-days", "--backlog-days", "--json", "--repo"),
	"stats":    setOf("--pool", "--mine", "--owner", "--owner-name", "--status", "--category", "--tag", "--since", "--until", "--stale-days", "--overdue-days", "--backlog-days", "--trend", "--last", "--by-owner", "--json", "--repo"),
	"owners":   setOf("--json", "--repo"),
	"show":     setOf("--id", "--json", "--repo"),
	"history":  setOf("--owner", "--owner-name", "--mine", "--category", "--tag", "--since", "--until", "--limit", "--months", "--json", "--repo"),
	"validate": setOf("--deep", "--json", "--repo"),
	"root":     setOf("--dir", "--json"),
	"whoami":   setOf("--json", "--repo"),
	"init":     setOf("--claim", "--new", "--name", "--yes", "--repo"),
}

func setOf(items ...string) map[string]bool {
	out := make(map[string]bool, len(items))
	for _, item := range items {
		out[item] = true
	}
	return out
}

func takesValue(name string) bool {
	switch name {
	case "--repo", "--title", "--id", "--created", "--category", "--tags",
		"--note", "--summary", "--finished", "--owner", "--owner-name",
		"--status", "--tag", "--since", "--until", "--limit", "--months",
		"--stale-days", "--overdue-days", "--backlog-days", "--trend", "--last", "--dir",
		"--claim", "--name":
		return true
	}
	return false
}

// splitFlag `--k=v` / `--k` → (名称, 值, 是否带值)。
func splitFlag(tok string) (string, string, bool) {
	if idx := strings.Index(tok, "="); idx > 0 {
		return tok[:idx], tok[idx+1:], true
	}
	return tok, "", false
}

func takeValue(name, inline string, hasInline bool, argv []string, pos int) (string, int, error) {
	if hasInline {
		return inline, pos + 1, nil
	}
	if pos+1 >= len(argv) {
		return "", pos, usageErr("%s 缺少取值", name)
	}
	return argv[pos+1], pos + 2, nil
}

// topLevelFlags 命令名之前认的选项。
var topLevelFlags = setOf("--repo", "--no-sync", "-h", "--help")

// resolveLongFlag argparse 的 allow_abbrev：`--owner-n` 能唯一匹配 `--owner-name`；
// 匹配到多个就报歧义（精确同名优先）。
func resolveLongFlag(name string, allowed map[string]bool) (string, error) {
	if allowed[name] || !strings.HasPrefix(name, "--") {
		return name, nil
	}
	var matched []string
	for flag := range allowed {
		if flag != name && strings.HasPrefix(flag, name) {
			matched = append(matched, flag)
		}
	}
	switch len(matched) {
	case 0:
		return name, nil
	case 1:
		return matched[0], nil
	default:
		sort.Strings(matched)
		return "", usageErr("%s 有歧义（可能是 %s）", name, strings.Join(matched, "、"))
	}
}

// ParseArgs 解析命令行；返回 *helpRequest 表示要看帮助。
func ParseArgs(argv []string) (*Args, error) {
	a := &Args{}
	pos := 0
	for pos < len(argv) && strings.HasPrefix(argv[pos], "-") {
		tok := argv[pos]
		name, inline, hasInline := splitFlag(tok)
		resolved, err := resolveLongFlag(name, topLevelFlags)
		if err != nil {
			return nil, err
		}
		switch resolved {
		case "-h", "--help":
			return nil, &helpRequest{}
		case "--repo":
			value, next, err := takeValue(name, inline, hasInline, argv, pos)
			if err != nil {
				return nil, err
			}
			a.Repo, pos = value, next
		case "--no-sync":
			if hasInline {
				return nil, usageErr("%s 不接受取值", name)
			}
			a.NoSync = true
			pos++
		default:
			return nil, usageErr("无法识别的参数：%s", tok)
		}
	}
	if pos >= len(argv) {
		return nil, usageErr("缺少命令")
	}
	a.Command = argv[pos]
	pos++
	allowed, known := commandFlags[a.Command]
	if !known {
		return nil, usageErr("未知命令：%s", a.Command)
	}
	for pos < len(argv) {
		tok := argv[pos]
		if !strings.HasPrefix(tok, "-") {
			return nil, usageErr("多余的参数：%s", tok)
		}
		name, inline, hasInline := splitFlag(tok)
		if name == "-h" || name == "--help" {
			return nil, &helpRequest{command: a.Command}
		}
		resolved, err := resolveLongFlag(name, allowed)
		if err != nil {
			return nil, err
		}
		if !allowed[resolved] {
			return nil, usageErr("%s 不认这个参数：%s", a.Command, name)
		}
		name = resolved
		value := ""
		next := pos + 1
		if takesValue(name) {
			parsed, after, err := takeValue(name, inline, hasInline, argv, pos)
			if err != nil {
				return nil, err
			}
			value, next = parsed, after
		} else if hasInline {
			return nil, usageErr("%s 不接受取值", name)
		}
		if err := applyFlag(a, name, value); err != nil {
			return nil, err
		}
		pos = next
	}
	if err := requireFlags(a); err != nil {
		return nil, err
	}
	return a, nil
}

func applyFlag(a *Args, name, value string) error {
	switch name {
	case "--repo":
		a.Repo = value
	case "--no-sync":
		a.NoSync = true
	case "--title":
		a.Title = value
	case "--id":
		a.TID = value
	case "--created":
		a.Created = value
	case "--category":
		a.Category = value
	case "--tags":
		a.Tags = splitTags(value)
	case "--self", "--mine":
		a.Mine = true
	case "--pool":
		a.Pool = true
	case "--owner":
		// 空串也算「给了」：
		// `--owner ""` 必须报「只收身份 uuid」，不能当没给悄悄放过。
		a.Owner = &value
	case "--owner-name":
		a.OwnerName = nonEmptyPtr(value)
	case "--status":
		a.Status = value
	case "--tag":
		a.Tag = nonEmptyPtr(value)
	case "--since":
		a.Since = nonEmptyPtr(value)
	case "--until":
		a.Until = nonEmptyPtr(value)
	case "--limit":
		n, err := strconv.Atoi(value)
		if err != nil {
			return usageErr("--limit 需要整数：%s", value)
		}
		a.Limit = &n
	case "--months":
		n, err := strconv.Atoi(value)
		if err != nil {
			return usageErr("--months 需要整数：%s", value)
		}
		a.Months = &n
	case "--stale-days", "--overdue-days", "--backlog-days":
		n, err := strconv.Atoi(value)
		if err != nil {
			return usageErr("%s 需要整数：%s", name, value)
		}
		if n < 0 {
			return usageErr("%s 不能为负数：%s", name, value)
		}
		switch name {
		case "--stale-days":
			a.StaleDays = &n
		case "--overdue-days":
			a.OverdueDays = &n
		case "--backlog-days":
			a.BacklogDays = &n
		}
	case "--trend":
		a.Trend = value
	case "--last":
		a.Last = value
	case "--by-owner":
		a.ByOwner = true
	case "--dir":
		a.Dir = value
	case "--json":
		a.JSON = true
	case "--deep":
		a.Deep = true
	case "--note":
		a.Note = value
	case "--summary":
		a.Summary = value
	case "--finished":
		a.Finished = value
	case "--release":
		a.Release = true
	case "--claim":
		a.Claim = nonEmptyPtr(value)
	case "--new":
		a.NewID = true
	case "--name":
		a.Name = value
	case "--yes":
		a.Yes = true
	default:
		return usageErr("无法识别的参数：%s", name)
	}
	return nil
}

// requireFlags 必填项（与 argparse 的 required=True 同义）。
func requireFlags(a *Args) error {
	switch a.Command {
	case "new":
		if a.Title == "" {
			return usageErr("new 缺少 --title")
		}
	case "claim", "set", "log", "close", "show":
		if a.TID == "" {
			return usageErr("%s 缺少 --id", a.Command)
		}
	}
	switch a.Command {
	case "log":
		if a.Note == "" {
			return usageErr("log 缺少 --note")
		}
	case "close":
		if a.Summary == "" {
			return usageErr("close 缺少 --summary")
		}
	}
	return nil
}

func nonEmptyPtr(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

// splitTags 分隔符与 core/labels 的分割保持一致：少一个「、」就会把「甲、乙」静默合成一个标签。
func splitTags(value string) []string {
	if value == "" {
		return nil
	}
	value = strings.ReplaceAll(value, "，", ",")
	value = strings.ReplaceAll(value, "、", ",")
	var out []string
	for _, item := range strings.Split(value, ",") {
		if trimmed := strings.TrimSpace(item); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

// buildQuery 装配查询条件（参数 → 查询对象的装配只此一处）。
func buildQuery(a *Args) error {
	// list 与 stats 共用同一套在办查询条件（stats 只是不吐行，筛选与阈值完全一致）
	switch a.Command {
	case "list", "stats":
		if a.Trend != "" {
			return buildTrendQuery(a)
		}
		if a.Last != "" || a.ByOwner {
			return usageErr("--last / --by-owner 只能配 --trend <day|week|month|quarter|year> 用。")
		}
		scope := "all"
		// 范围优先级：mine → pool → owner。空串的 --owner 不算范围
		// （falsy 落到 all），但仍会传给业务层并报「只收身份 uuid」。
		switch {
		case a.Mine:
			scope = "mine"
		case a.Pool:
			scope = "pool"
		case a.Owner != nil && *a.Owner != "":
			scope = "owner"
		}
		var statuses []string
		for _, item := range strings.Split(a.Status, ",") {
			if trimmed := strings.TrimSpace(item); trimmed != "" {
				statuses = append(statuses, trimmed)
			}
		}
		since, err := utcOf(a.Since, "--since", "")
		if err != nil {
			return err
		}
		until, err := utcOf(a.Until, "--until", "23:59:59")
		if err != nil {
			return err
		}
		a.Query = &actions.ListQuery{
			Scope:       scope,
			Owner:       a.Owner,
			OwnerName:   a.OwnerName,
			Statuses:    statuses,
			Category:    nonEmptyPtr(a.Category),
			Tag:         a.Tag,
			Since:       since,
			Until:       until,
			StaleDays:   a.StaleDays,
			OverdueDays: a.OverdueDays,
			BacklogDays: a.BacklogDays,
		}
	case "history":
		since, err := utcOf(a.Since, "--since", "")
		if err != nil {
			return err
		}
		until, err := utcOf(a.Until, "--until", "23:59:59")
		if err != nil {
			return err
		}
		a.HistoryQuery = &actions.HistoryQuery{
			Owner:     a.Owner,
			OwnerName: a.OwnerName,
			Mine:      a.Mine,
			Category:  nonEmptyPtr(a.Category),
			Tag:       a.Tag,
			Since:     since,
			Until:     until,
			Limit:     a.Limit,
			Months:    a.Months,
		}
	}
	return nil
}

// buildTrendQuery stats --trend：只认趋势用得上的参数。别的筛选参数直接报用法错 ——
// 静默忽略会让人以为筛过了（趋势按时间 + 人统计，不按状态 / 分类 / 标签）。
func buildTrendQuery(a *Args) error {
	conflicts := []struct {
		flag  string
		given bool
	}{
		{"--pool", a.Pool},
		{"--owner-name", a.OwnerName != nil},
		{"--status", a.Status != ""},
		{"--category", a.Category != ""},
		{"--tag", a.Tag != nil},
		{"--stale-days", a.StaleDays != nil},
		{"--overdue-days", a.OverdueDays != nil},
		{"--backlog-days", a.BacklogDays != nil},
		{"--json", a.JSON}, // 趋势自带 JSON，不给第二套形状
	}
	for _, item := range conflicts {
		if item.given {
			return usageErr("stats --trend 不认 %s：趋势只按时间 + 人统计。", item.flag)
		}
	}
	q := &actions.TrendQuery{
		Granularity: a.Trend,
		Since:       a.Since,
		Until:       a.Until,
		Last:        a.Last,
		Mine:        a.Mine,
		ByOwner:     a.ByOwner,
	}
	if a.Owner != nil {
		for _, item := range strings.Split(*a.Owner, ",") {
			if trimmed := strings.TrimSpace(item); trimmed != "" {
				q.Owners = append(q.Owners, trimmed)
			}
		}
	}
	a.TrendQuery = q
	return nil
}

func utcOf(value *string, field, dateOnlyRef string) (*string, error) {
	if value == nil || *value == "" {
		return nil, nil
	}
	stamp, err := core.ToUTC(*value, field, "", dateOnlyRef)
	if err != nil {
		return nil, err
	}
	return &stamp, nil
}

// ResolveRepo --repo 给了就校验后用；没给就从当前目录往上找。
//
// 找不到 ⇒ 业务错误：绝不在当前目录自作主张建台账（2026-10-22 设计定稿）。
// 建台账是第一条写命令的事，不需要、也没有 init 子命令。
func ResolveRepo(arg string) (string, error) {
	if arg != "" {
		return core.AsRoot(arg, "--repo")
	}
	cwd, err := os.Getwd()
	if err != nil {
		return "", core.Failf("拿不到当前目录：%v", err)
	}
	if root := core.RootOf(cwd); root != "" {
		return root, nil
	}
	return "", core.Failf("找不到台账：从当前目录往上都没有 ledger/ 目录。\n" +
		"  处理：用 --repo <工作区根> 指定（根是直接含 ledger/ 的那个目录，不是 ledger/ 本身）；\n" +
		"  或先 cd 到项目根再跑。第一条写命令会自动把 ledger/ 建出来，不用先初始化。")
}

// lockDir 整命令锁放 **git 公共目录**里（不进仓库、不被 git status 看见；worktree 之间共享）。
//
// repo/.git 是目录 ⇒ 就是它；是文件 ⇒ 链接 worktree，按 gitdir: 指针反推公共目录；
// 两者都不成 ⇒ 不是 git 仓库，锁文件放系统临时目录（按仓库绝对路径哈希）——
// 落用户工作区会被日后 git init && git add -A 误提交（2026-10-24 修）。
func lockDir(repo string) string {
	dot := filepath.Join(repo, ".git")
	if info, err := os.Stat(dot); err == nil {
		if info.IsDir() {
			return dot
		}
		if raw, readErr := os.ReadFile(dot); readErr == nil {
			text := strings.TrimSpace(string(raw))
			if strings.HasPrefix(text, "gitdir:") {
				pointer := strings.TrimSpace(strings.TrimPrefix(text, "gitdir:"))
				common := filepath.Dir(filepath.Dir(pointer))
				if info, statErr := os.Stat(common); statErr == nil && info.IsDir() {
					return common
				}
			}
		}
	}
	abs, err := filepath.Abs(repo)
	if err != nil {
		abs = repo
	}
	sum := sha256.Sum256([]byte(abs))
	dir := filepath.Join(os.TempDir(), "dsh-task-ledger-"+hex.EncodeToString(sum[:])[:16])
	_ = os.MkdirAll(dir, 0o777)
	return dir
}

// Main 进程入口：解析 → 定位 → 拿锁 → 跑 → 收尾。
func Main(argv []string) int {
	IgnoreSIGPIPE()
	defer FlushNotices()

	a, err := ParseArgs(argv)
	if err != nil {
		var hr *helpRequest
		if errors.As(err, &hr) {
			printHelp(hr.command) // --help 是「要看用法」，不是用法错：退出码 0
			return ExitOK
		}
		errOut("用法错误：" + err.Error())
		errOut(usageText)
		return ExitUsage
	}
	if os.Getenv(NoSyncEnv) != "" {
		a.NoSync = true
	}
	if err := buildQuery(a); err != nil {
		FailMessage("错误", err.Error())
		return ExitBusiness
	}
	if a.Command == "whoami" {
		return runWhoami(a)
	}
	if a.Command == "init" {
		return runInit(a)
	}
	// root 与 whoami / init 同类：在定位仓库**之前**就要能问
	// （「这个目录有没有台账」不能要求先有台账），不进 runner、不看 --repo
	if a.Command == "root" {
		return runRoot(a)
	}
	// 定位只做一次：解析好的工作区根挂回 Args，runner 与整命令锁都拿它
	repo, err := ResolveRepo(a.Repo)
	if err != nil {
		FailMessage("错误", err.Error())
		return ExitBusiness
	}
	a.Repo = repo
	if actions.IsReadOnly(a.Command) {
		return Run(a.Command, a) // 只读不碰 git ⇒ 不拿同步锁
	}
	unlock, err := store.SyncLock(lockDir(repo), 60*time.Second)
	if err != nil {
		FailMessage("错误", err.Error())
		return ExitBusiness
	}
	code := Run(a.Command, a)
	unlock()
	return code
}

func runWhoami(a *Args) int {
	// 只读机器身份：不解析台账、不碰 git、不看 --repo。
	// 未初始化**不是错误**：照常回答（uuid / name 双 null），由调用方据此引导 init。
	identity, ok, err := env.ReadIdentity()
	if err != nil {
		FailMessage("错误", err.Error())
		return ExitBusiness
	}
	var ptr *core.Identity
	if ok {
		ptr = &identity
	}
	RenderWhoami(ptr, a.JSON)
	return ExitOK
}

// runRoot 台账根检测：给一个目录，回答它是不是已初始化的台账根。
// 不给 --dir 就用当前目录；判定不依赖身份、不碰 git、不读台账内容（只看结构）。
func runRoot(a *Args) int {
	dir := a.Dir
	if dir == "" {
		cwd, err := os.Getwd()
		if err != nil {
			FailMessage("错误", "拿不到当前目录："+err.Error())
			return ExitBusiness
		}
		dir = cwd
	}
	if a.Repo != "" {
		// 顶层的 --repo 谁都认，root 偏偏不看它：静默忽略会让人以为指定生效了
		errOut("提示：root 不看 --repo（它跑在定位仓库之前），本次判定的是 " + dir)
	}
	res, err := actions.DetectRoot(dir)
	if err != nil {
		FailMessage("错误", err.Error())
		return ExitBusiness
	}
	RenderRoot(res, a.JSON)
	return ExitOK
}

func isTTY() bool { return isTerminal(int(os.Stdin.Fd())) }

func runInit(a *Args) int {
	// init 不进 runner、不解析台账、不碰 git：只写机器身份文件。
	repo := ""
	if a.Repo != "" {
		if root, err := core.AsRoot(a.Repo, "--repo"); err == nil {
			repo = root
		}
	} else if cwd, err := os.Getwd(); err == nil {
		repo = core.RootOf(cwd)
	}
	tty := isTTY()

	if a.Yes {
		FailMessage("错误", "--yes 已禁用：身份写入只能在真终端交互完成，Agent 不得代写或重建身份。\n"+
			"  处理：请用户在自己的终端运行 `progress init --repo <工作区根>`。")
		return ExitBusiness
	}
	_, existing, err := env.ReadIdentity()
	if err != nil {
		FailMessage("错误", err.Error())
		return ExitBusiness
	}

	var res map[string]any
	switch {
	case existing:
		// 已初始化：幂等空转（带不带 flag 都一样，零写）
		res, err = actions.InitIdentity(repo, actions.InitParams{Claim: a.Claim, New: a.NewID, Name: a.Name})
	case a.Claim != nil || a.NewID || a.Name != "":
		// 身份写入只能由用户在真终端交互完成；非终端（agent）一律拒绝（2026-10-26 事故）
		if !tty {
			FailMessage("错误", "身份写入只能在真终端交互完成；Agent 不得代写或代为重建身份。\n"+
				"  处理：请用户在自己的终端运行 `progress init --repo <工作区根>`，\n"+
				"  由 ta 亲自选择/新建并确认。")
			return ExitBusiness
		}
		res, err = actions.InitIdentity(repo, actions.InitParams{Claim: a.Claim, New: a.NewID, Name: a.Name})
	default:
		// 裸 init：先看名册
		res, err = actions.InitIdentity(repo, actions.InitParams{})
		if err == nil {
			if need, _ := res["need_choose"].(bool); need {
				options := optionsOf(res)
				if !tty {
					printCandidates(options)
					out("请重跑：init --claim=<uuid>  认领，或  init --new --name=<名字>  新建")
					return ExitOK
				}
				for {
					choice := selectIdentity(options, "这台机器还没初始化。选择你的身份，或新建一个：")
					if choice.kind == "cancel" {
						errOut(dim("✕ 已取消初始化。随时可重跑 init 重新开始。"))
						return ExitOK
					}
					if choice.kind == "new" {
						typed, inRes := promptLine("输入用户名：", "输入名字后按 Enter 确认 · Backspace 退格 · ESC 返回身份选择")
						if inRes == lineBack {
							continue // ESC：回选择菜单重来（这一块已抹掉，屏幕上不留残迹）
						}
						if inRes != lineOK {
							errOut(dim("✕ 已取消初始化。随时可重跑 init 重新开始。"))
							return ExitOK
						}
						typed = strings.TrimSpace(typed)
						if typed == "" {
							errOut(dim("✕ 未输入用户名，已取消。"))
							return ExitOK
						}
						if !confirm(fmt.Sprintf("您确认要用「%s」这个名称新建账户吗？", typed)) {
							continue // N：回到选择菜单重来
						}
						res, err = actions.InitIdentity(repo, actions.InitParams{New: true, Name: typed})
						break
					}
					chosen := options[choice.idx]
					if !confirm(fmt.Sprintf("您确认是要使用「@%s」这个身份吗？", strOf(chosen["name"]))) {
						continue // N：回到选择菜单重来
					}
					uuid := strOf(chosen["uuid"])
					res, err = actions.InitIdentity(repo, actions.InitParams{Claim: &uuid})
					break
				}
			} else if need, _ := res["need_name"].(bool); need {
				// 名册为空：没有可认领的人，只能问名字
				if !tty {
					out("名册为空：当前仓库里还没有任何用户。")
					out("  处理：请用户在自己的终端运行 init 新建一个身份（真终端里会提示输入名字）。")
					return ExitOK
				}
				name, inRes := promptLine("输入用户名：", "输入名字后按 Enter 确认 · Backspace 退格 · ESC 取消初始化")
				if inRes != lineOK {
					errOut(dim("✕ 已取消初始化。随时可重跑 init 重新开始。"))
					return ExitOK
				}
				res, err = actions.InitIdentity(repo, actions.InitParams{New: true, Name: strings.TrimSpace(name)})
			} else {
				// 名册空：非终端不写，交给用户去真终端跑
				out("名册为空：当前仓库里还没有任何用户。")
				out("  处理：请用户在自己的终端运行 init 新建一个身份。")
				return ExitOK
			}
		}
	}
	if err != nil {
		FailMessage("错误", err.Error())
		return ExitBusiness
	}
	printInitResult(res)
	return ExitOK
}

// optionsOf 把 init 的候选列表摊成有序数组。
func optionsOf(res map[string]any) []map[string]any {
	raw, _ := res["options"].([]any)
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		if record, ok := item.(map[string]any); ok {
			out = append(out, record)
		}
	}
	return out
}

func printCandidates(options []map[string]any) {
	out("这台机器还没初始化。当前仓库里已有的用户：")
	for i, opt := range options {
		name, _ := opt["name"].(string)
		uuid, _ := opt["uuid"].(string)
		out(fmt.Sprintf("  %d. @%s   %s", i+1, name, uuid))
	}
}

// identityChoice 选择菜单的结论：claim（认领第 idx 个）/ new（新建）/ cancel。
type identityChoice struct {
	kind string
	idx  int
}

// selectIdentity 交互式选身份：↑/↓ 移动、Enter 确认、ESC / Ctrl-C 取消，末尾「+ 新建身份」。
//
// raw 模式、隐藏光标；整块自己画（重画 / 收尾都按画布记账），退出时整块抹掉 ——
// 屏幕上不留选择框的残迹。拿不到终端（agent / 管道）或 raw 失败时退回编号输入。
func selectIdentity(options []map[string]any, title string) identityChoice {
	fd := int(os.Stdin.Fd())
	state, err := makeRaw(fd)
	if err != nil {
		return selectIdentityByNumber(options, title)
	}
	defer state.restore()

	entries := len(options) + 1
	sel := 0
	drawn := false

	writeRaw(os.Stdout, "\x1b[?25l") // 隐藏光标
	defer func() {
		writeRaw(os.Stdout, "\x1b[?25h") // 显示光标
		if drawn {
			screen.eraseBlock()
		}
	}()

	for {
		if drawn {
			screen.redraw() // 回到块顶重画
		} else {
			screen.beginBlock()
			drawn = true
		}
		screen.drawRows(identityFrame(title, options, sel))

		switch state.readKey() {
		case keyUp:
			sel = (sel - 1 + entries) % entries
		case keyDown:
			sel = (sel + 1) % entries
		case keyEnter:
			if sel == len(options) {
				return identityChoice{kind: "new"}
			}
			return identityChoice{kind: "claim", idx: sel}
		case keyCancel:
			return identityChoice{kind: "cancel"}
		}
	}
}

// identityFrame 一屏内容（行序：标题、空行、n 个选项、空行、提示）。
func identityFrame(title string, options []map[string]any, sel int) []string {
	rows := []string{"\x1b[1;36m" + title + "\x1b[0m", ""}
	for i, opt := range options {
		rows = append(rows, identityRow("@"+strOf(opt["name"])+"   "+strOf(opt["uuid"]), i == sel))
	}
	rows = append(rows,
		identityRow("+ 新建身份（自己输入名字）", sel == len(options)),
		"",
		"\x1b[2m  ↑/↓ 移动     Enter 确认     ESC / Ctrl-C 退出\x1b[0m",
	)
	return rows
}

func identityRow(label string, selected bool) string {
	if selected {
		return "\x1b[7m  ❯ " + label + "  \x1b[0m"
	}
	return "    " + label
}

// selectIdentityByNumber 非终端兜底：编号输入（末尾是「+ 新建身份」）。
func selectIdentityByNumber(options []map[string]any, title string) identityChoice {
	printCandidates2(title, options)
	n := len(options) + 1
	out(fmt.Sprintf("  %d. + 新建身份", n))
	for {
		answer, res := promptLine(fmt.Sprintf("选编号(1-%d)：", n), "输入编号后按 Enter 确认 · ESC 取消")
		if res != lineOK {
			return identityChoice{kind: "cancel"}
		}
		answer = strings.ToLower(answer)
		if answer == "n" || answer == "new" {
			return identityChoice{kind: "new"}
		}
		idx, convErr := strconv.Atoi(answer)
		if convErr != nil {
			continue
		}
		idx-- // 屏幕显示的编号从 1 起
		if idx == len(options) {
			return identityChoice{kind: "new"}
		}
		if idx >= 0 && idx < len(options) {
			return identityChoice{kind: "claim", idx: idx}
		}
	}
}

func printCandidates2(title string, options []map[string]any) {
	out(title)
	for i, opt := range options {
		out(fmt.Sprintf("  %d. @%s   %s", i+1, strOf(opt["name"]), strOf(opt["uuid"])))
	}
}

// confirm Y/N 确认：Y 返回 true，N 返回 false；ESC / EOF 当作取消。
//
// Y / N 确认后把确认框整块抹掉（退回菜单时屏幕干净，不留残迹）；输入非法或 ESC / EOF 同样抹掉重来。
func confirm(question string) bool {
	for {
		ans, res, editor, handled := promptLineEdit(question+" [Y/N]：", "按 Y 确认 · 按 N 取消 · ESC 返回身份选择")
		if !handled {
			ans, res = promptLinePlain(question + " [Y/N]：")
			editor = nil
		}
		if res != lineOK {
			return false
		}
		switch strings.ToLower(strings.TrimSpace(ans)) {
		case "y", "yes":
			if editor != nil {
				editor.wipe()
			}
			return true
		case "n", "no":
			if editor != nil {
				editor.wipe()
			}
			return false
		}
		if editor != nil {
			editor.wipe()
		}
		out("请输入 Y 或 N。")
	}
}

var stdinReader = bufio.NewReader(os.Stdin)

// lineResult 读一行的结果。
type lineResult int

const (
	lineOK   lineResult = iota // 读到一行
	lineBack                   // ESC：回上一步
	lineEOF                    // 没输入（Ctrl-D / EOF）
)

// promptLine 打提示（不换行，与 input() 同形）再读一行；hint 是输入框下面那行灰色帮助。
// 终端里走 raw 逐键读（ESC 回上一步、Backspace 退格）；拿不到 raw 终端才退回普通行读。
func promptLine(prompt, hint string) (string, lineResult) {
	line, res, editor, handled := promptLineEdit(prompt, hint)
	if handled {
		if res == lineOK && editor != nil {
			editor.wipe() // 确认后不留输入记录，退回菜单时不留残迹
		}
		return line, res
	}
	return promptLinePlain(prompt)
}

// promptLinePlain 普通行读（非 raw 终端兜底）：打完提示，读到换行为止。
func promptLinePlain(prompt string) (string, lineResult) {
	writeRaw(os.Stdout, prompt)
	line, err := stdinReader.ReadString('\n')
	if err != nil && line == "" {
		writeRaw(os.Stdout, "\n")
		return "", lineEOF
	}
	return strings.TrimSpace(stripControl(line)), lineOK
}

// stripControl 去掉控制字符：普通行读里 ESC 之类会被当内容带进来。
func stripControl(s string) string {
	return strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, s)
}

func dim(text string) string { return "\x1b[2m" + text + "\x1b[0m" }

func printInitResult(res map[string]any) {
	uuid, _ := res["uuid"].(string)
	name, _ := res["name"].(string)
	nameDisp := name
	if nameDisp == "" && len(uuid) >= 8 {
		nameDisp = uuid[:8]
	}
	path, _ := res["path"].(string)
	if already, _ := res["already"].(bool); already {
		out(fmt.Sprintf("已经初始化过，未做改动：@%s   %s", nameDisp, uuid))
		out("文件：" + path)
		return
	}
	out("\x1b[32m✓ 已初始化：\x1b[0m@" + nameDisp + "   " + uuid)
	out("文件：" + path)
}
