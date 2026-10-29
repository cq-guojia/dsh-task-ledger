package actions

import "github.com/cq-guojia/dsh-task-ledger/skill/src/internal/core"

// 动作名册：命令写法 → ActionSpec。只有 shell 层会用它。
// 渲染函数**只存名字**，不 import shell/render —— 否则 actions → shell 的依赖就反了。

// Params 外壳把命令行装成它，动作各取所需。
type Params struct {
	Title    string
	Tid      string
	Created  string
	Category *string
	Tags     []string
	Mine     bool
	Owner    *string
	Release  bool
	Note     string
	Summary  string
	Finished string
	Cancel   bool
	Deep     bool
	List     *ListQuery
	History  *HistoryQuery
	Trend    *TrendQuery
}

// ActionSpec 一条命令的定义。
type ActionSpec struct {
	Render     string // 渲染函数名：result / list_view / show_view / history_view / validate_view
	ReadOnly   bool
	LockAction string   // 交给 LockScope 的动作名；默认同命令名
	Params     []string // 从参数里挑哪些键传给动作
	Run        func(repo string, me core.Identity, p Params) (any, error)
}

// ACTIONS 命令名册。
var ACTIONS = map[string]ActionSpec{
	"new": {
		Render: "result",
		Params: []string{"title", "tid", "created", "category", "tags", "mine"},
		Run: func(repo string, me core.Identity, p Params) (any, error) {
			return NewTask(repo, me, NewTaskParams{Title: p.Title, Tid: p.Tid, Created: p.Created, Category: p.Category, Tags: p.Tags, Mine: p.Mine})
		},
	},
	"claim": {
		Render: "result",
		Params: []string{"tid"},
		Run: func(repo string, me core.Identity, p Params) (any, error) {
			return Claim(repo, me, p.Tid)
		},
	},
	"set": {
		Render:     "result",
		LockAction: "set",
		Params:     []string{"tid", "owner", "release", "tags"},
		Run: func(repo string, me core.Identity, p Params) (any, error) {
			return SetTask(repo, me, p.Tid, SetParams{Owner: p.Owner, Release: p.Release, Tags: p.Tags})
		},
	},
	"log": {
		Render: "result",
		Params: []string{"tid", "note"},
		Run: func(repo string, me core.Identity, p Params) (any, error) {
			return LogProgress(repo, me, p.Tid, p.Note)
		},
	},
	"close": {
		Render: "result",
		Params: []string{"tid", "summary", "finished", "tags", "cancel"},
		Run: func(repo string, me core.Identity, p Params) (any, error) {
			return CloseTask(repo, me, p.Tid, CloseTaskParams{Summary: p.Summary, Finished: p.Finished, Tags: p.Tags, Cancel: p.Cancel})
		},
	},
	"list": {
		Render:   "list_view",
		ReadOnly: true,
		Params:   []string{"q"},
		Run: func(repo string, me core.Identity, p Params) (any, error) {
			q := ListQuery{}
			if p.List != nil {
				q = *p.List
			}
			return ListTasks(repo, me, q)
		},
	},
	"stats": {
		// 默认与 list 共用同一套 ListQuery（含阈值覆盖）：只数数、不吐行；
		// 带 --trend 时换成按周期分桶的趋势（两条路共用 stats 这个入口）
		Render:   "stats_view",
		ReadOnly: true,
		Params:   []string{"q"},
		Run: func(repo string, me core.Identity, p Params) (any, error) {
			if p.Trend != nil {
				return TrendStats(repo, me, *p.Trend)
			}
			q := ListQuery{}
			if p.List != nil {
				q = *p.List
			}
			return StatsTasks(repo, me, q)
		},
	},
	"owners": {
		Render:   "owners_view",
		ReadOnly: true,
		Run: func(repo string, me core.Identity, p Params) (any, error) {
			return ListOwners(repo, me)
		},
	},
	"show": {
		Render:   "show_view",
		ReadOnly: true,
		Params:   []string{"tid"},
		Run: func(repo string, me core.Identity, p Params) (any, error) {
			return ShowTask(repo, me, p.Tid)
		},
	},
	"history": {
		Render:   "history_view",
		ReadOnly: true,
		Params:   []string{"q"},
		Run: func(repo string, me core.Identity, p Params) (any, error) {
			q := HistoryQuery{}
			if p.History != nil {
				q = *p.History
			}
			return QueryHistory(repo, me, q)
		},
	},
	"validate": {
		Render:   "validate_view",
		ReadOnly: true,
		Params:   []string{"deep"},
		Run: func(repo string, me core.Identity, p Params) (any, error) {
			return Validate(repo, p.Deep)
		},
	},
}

// SpecOf 按命令写法取名册项；不在名册里就是用法错。
func SpecOf(command string) (ActionSpec, error) {
	spec, ok := ACTIONS[command]
	if !ok {
		return ActionSpec{}, core.Failf("未知命令：%s", command)
	}
	return spec, nil
}

// IsReadOnly 这条命令是不是只读。
func IsReadOnly(command string) bool {
	spec, ok := ACTIONS[command]
	return ok && spec.ReadOnly
}
