package shell

// 子命令级帮助：`progress <子命令> --help` 打这张表（退出码 0，与 argparse 同口径）。
// 文案与 SKILL.md 的参数表保持一致 —— 文档教人「看 --help」，这里就不能糊弄。

// helpRequest 「要看帮助」：`-h` / `--help`。command 为空 = 顶层。
type helpRequest struct{ command string }

func (h *helpRequest) Error() string { return "help" }

type helpOption struct {
	flag string
	text string
}

type helpDoc struct {
	usage   string
	options []helpOption
}

var commandHelp = map[string]helpDoc{
	"": {
		usage: "progress <命令> [选项]",
		options: []helpOption{
			{"--repo <工作区根>", "直接含 ledger/ 的那个目录（默认从当前目录往上找）"},
			{"--no-sync", "只写本地：不取最新 / 不提交 / 不推送"},
			{"-h, --help", "看帮助"},
		},
	},
	"new": {
		usage: "progress new --title <标题> [选项]",
		options: []helpOption{
			{"--title <标题>", "任务标题（必填）"},
			{"--id <任务号>", "指定任务号（默认按标题 + 时间生成）"},
			{"--created <时间>", "建任务时间（默认现在；YYYY-MM-DD[ HH:MM[:SS]]，本机时区）"},
			{"--category <分类>", "分类（建任务时定死，之后没有改分类的入口）"},
			{"--tags <a、b>", "标签（顿号 / 逗号分隔，最多 5 个）"},
			{"--self", "建在自己名下（默认进公共池）"},
			{"--repo <工作区根>", "同上"},
		},
	},
	"claim": {
		usage: "progress claim --id <任务号>",
		options: []helpOption{
			{"--id <任务号>", "认领哪条（必填；只能认领公共池里的）"},
			{"--repo <工作区根>", "同上"},
		},
	},
	"set": {
		usage: "progress set --id <任务号> (--release | --owner <uuid> | --tags <a、b>)",
		options: []helpOption{
			{"--id <任务号>", "哪条任务（必填）"},
			{"--release", "释放回公共池（改归属；与 --owner 二选一）"},
			{"--owner <uuid>", "转交给别人（只收 uuid；agent 不用）"},
			{"--tags <a、b>", "改标签（整组替换；只改自己名下在办任务）"},
			{"--repo <工作区根>", "同上"},
		},
	},
	"log": {
		usage: "progress log --id <任务号> --note <一句话>",
		options: []helpOption{
			{"--id <任务号>", "哪条任务（必填；只能给自己名下的记）"},
			{"--note <一句话>", "这条记录说什么（必填）"},
			{"--repo <工作区根>", "同上"},
		},
	},
	"close": {
		usage: "progress close --id <任务号> --summary <摘要> [选项]",
		options: []helpOption{
			{"--id <任务号>", "结哪条（必填）"},
			{"--summary <摘要>", "结案摘要（必填；放弃写「放弃：原因」）"},
			{"--finished <时间>", "补录实际结案时间（YYYY-MM-DD[ HH:MM[:SS]]）"},
			{"--tags <a、b>", "覆盖标签终值"},
			{"--repo <工作区根>", "同上"},
		},
	},
	"list": {
		usage: "progress list [选项]",
		options: []helpOption{
			{"--mine", "只看自己名下的"},
			{"--pool", "只看公共池（没人认领的）"},
			{"--owner <uuid>", "看某个人的（只收 uuid，精确匹配）"},
			{"--owner-name <片段>", "按显示名模糊筛（子串、不分大小写）"},
			{"--status <状态>", "按状态筛（open / doing，逗号分隔可多选）"},
			{"--category <分类>", "按分类精确筛"},
			{"--tag <标签>", "按标签包含筛"},
			{"--since <日期>", "按创建时间下限（只给日期含当天）"},
			{"--until <日期>", "按创建时间上限（只给日期含当天）"},
			{"--stale-days <N>", "停滞阈值（默认 3 天：进行中、最后更新至今；给 0 = 关掉这条判据）"},
			{"--overdue-days <N>", "逾期阈值（默认 14 天：进行中、接任务至今）"},
			{"--backlog-days <N>", "积压阈值（默认 30 天：待认领、创建至今）"},
			{"--json", "输出 JSON（{任务号: 任务对象}，每条带 mine 与年龄派生值）"},
			{"--repo <工作区根>", "同上"},
		},
	},
	"stats": {
		usage: "progress stats [选项]",
		options: []helpOption{
			{"--mine", "只数自己名下的"},
			{"--pool", "只数公共池（没人认领的）"},
			{"--owner <uuid>", "只数某个人的（只收 uuid，精确匹配）"},
			{"--owner-name <片段>", "按显示名模糊筛（子串、不分大小写）"},
			{"--status <状态>", "按状态筛（open / doing，逗号分隔可多选）"},
			{"--category <分类>", "按分类精确筛"},
			{"--tag <标签>", "按标签包含筛"},
			{"--since <日期>", "按创建时间下限（只给日期含当天）"},
			{"--until <日期>", "按创建时间上限（只给日期含当天）"},
			{"--stale-days <N>", "停滞阈值（默认 3 天：进行中、最后更新至今）"},
			{"--overdue-days <N>", "逾期阈值（默认 14 天：进行中、接任务至今）"},
			{"--backlog-days <N>", "积压阈值（默认 30 天：待认领、创建至今）"},
			{"--json", "输出各面计数（含 thresholds 回显）"},
			{"--trend <粒度>", "改出趋势：day / week / month / quarter / year（按本机时区，周一起算）"},
			{"--last <N><d|w|m|y>", "趋势区间：最近 N 个日 / 周 / 月 / 年（默认 8w；与 --since / --until 二选一）"},
			{"--by-owner", "趋势额外带按人明细（added 按 creator、done / open 按 owner）"},
			{"--repo <工作区根>", "同上"},
		},
	},
	"owners": {
		usage: "progress owners [--json]",
		options: []helpOption{
			{"--json", "{count, owners}：花名册全量（含当前没任务的人，每条带 mine）"},
			{"--repo <工作区根>", "同上"},
		},
	},
	"show": {
		usage: "progress show --id <任务号> [--json]",
		options: []helpOption{
			{"--id <任务号>", "看哪条（必填；在办 / 已结案都能看）"},
			{"--json", "任务字段 + 过程文档全文一起给"},
			{"--repo <工作区根>", "同上"},
		},
	},
	"history": {
		usage: "progress history [选项]",
		options: []helpOption{
			{"--owner <uuid>", "按 owner 筛（只收 uuid；与 --mine 二选一）"},
			{"--owner-name <片段>", "按显示名模糊筛（子串、不分大小写）"},
			{"--mine", "只看自己结的"},
			{"--category <分类>", "按分类精确筛"},
			{"--tag <标签>", "按标签包含筛"},
			{"--since <日期>", "按结案时间下限（只给日期含当天）"},
			{"--until <日期>", "按结案时间上限（只给日期含当天）"},
			{"--months <N>", "最近 N 个自然月（与 --since / --until 互斥；最多 13）"},
			{"--limit <N>", "最近 N 条"},
			{"--count-only", "只出 {count, capped}（与 --json / --limit 互斥）"},
			{"--json", "JSON 输出；每条带 mine"},
			{"--repo <工作区根>", "同上"},
		},
	},
	"validate": {
		usage: "progress validate [--deep] [--json]",
		options: []helpOption{
			{"--deep", "历史读全部月份（默认只读当月那个月文件）"},
			{"--json", "{problems, notices, checked_files, total_tasks, deep}"},
			{"--repo <工作区根>", "同上"},
		},
	},
	"root": {
		usage: "progress root [--dir <目录>] [--json]",
		options: []helpOption{
			{"--dir <目录>", "检测哪个目录（不给 = 当前目录）"},
			{"--json", "{dir, root, repo, ledger, reason}：是不是已初始化的台账根"},
		},
	},
	"whoami": {
		usage: "progress whoami [--json]",
		options: []helpOption{
			{"--json", "{uuid, name}；未初始化为双 null（照常退 0）"},
		},
	},
	"init": {
		usage: "progress init [--claim <uuid> | --new --name <名字>]",
		options: []helpOption{
			{"--claim <uuid>", "认领名册里已有的身份"},
			{"--new", "新建身份（配 --name）"},
			{"--name <名字>", "新建身份时的显示名字"},
			{"--yes", "已禁用：身份写入只能在真终端交互完成"},
			{"--repo <工作区根>", "同上"},
		},
	},
}

// printHelp 打某个命令（空串 = 顶层）的帮助。
func printHelp(command string) {
	doc, ok := commandHelp[command]
	if !ok {
		doc = commandHelp[""]
	}
	out("用法：" + doc.usage)
	out("")
	out("选项：")
	for _, opt := range doc.options {
		out("  " + padRight(opt.flag, 22) + opt.text)
	}
	if command != "" {
		out("")
		out("公共选项 --no-sync 挂在顶层：progress --no-sync " + command + " …")
	}
}
