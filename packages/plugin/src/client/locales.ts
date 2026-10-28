/**
 * 文案唯一真源：命名空间 `dsh-task-ledger`，zh / en 两档。
 *
 * 规矩（docs/design/ui-style.md §五）：
 *  - 两档**键必须完全对齐**（冒烟有断言），漏一种语言界面就露键名；
 *  - 界面上不许出现未登记的硬编码中文；
 *  - 占位符一律 `{name}`，由 `interpolateTranslate` 自己替换（不依赖宿主是否支持 params）；
 *  - 语言切换**跟随宿主**：插件不自备语言开关（注册字典 + 注册项声明 `locale:` ⇒ 宿主渲染器合成 `t` 席位）。
 */

/** 文案键全集（增删键必须同时改 zh / en）。 */
export type LocaleKey =
	| "backToConversation"
	| "panelTitle"
	| "refresh"
	| "refreshing"
	| "loading"
	| "retry"
	| "loadFailed"
	| "dataLoading"
	| "degradedTitle"
	| "degradedItem"
	// 统计卡
	| "statMyActive"
	| "statOpen"
	| "statOpenHint"
	| "statDoing"
	| "statDoingHint"
	| "statDoingAllMine"
	| "statBacklog"
	| "statOverdue"
	| "statStale"
	| "statMyOverdueHint"
	| "statMyStaleHint"
	| "statBacklogHint"
	| "statOverdueHint"
	| "statStaleHint"
	| "statStaleTitle"
	| "statOverdueTitle"
	| "statBacklogTitle"
	| "statWeekDone"
	| "statLastWeekDone"
	| "daysNone"
	| "daysValue"
	// 趋势图
	| "chartNotReady"
	| "periodRange"
	// 筛选行
	| "statusLabel"
	| "statusActive"
	| "statusOpen"
	| "statusBacklog"
	| "statusOverdue"
	| "statusStale"
	| "tipOpen"
	| "tipBacklog"
	| "tipDoing"
	| "tipOverdue"
	| "tipStale"
	| "workspaceLabel"
	| "workspaceAll"
	| "searchPlaceholder"
	// 列表分区
	| "regionMine"
	| "regionAll"
	| "ownerLabel"
	| "ownerAll"
	| "listEmpty"
	| "listEmptyHint"
	| "listLimitHint"
	| "ownerUnclaimed"
	| "timeUnknown"
	// 相对时间（GitHub 口径）
	| "relJustNow"
	| "relMinutes"
	| "relHours"
	| "relDays"
	| "relMonths"
	| "relYears"
	| "whenSubmitted"
	// 行内点选 = 改筛选（人名 / 工作区 / 标签）
	| "filterByOwner"
	| "filterByWorkspace"
	| "filterByTag"
	| "copyTaskId"
	| "copiedTaskId"
	| "copyFailed"
	| "actionClaim"
	| "actionResume"
	| "actionFinish"
	| "actionRelease"
	| "tipClaim"
	| "tipResume"
	| "tipFinish"
	| "tipRelease"
	| "viewDetail"
	| "fieldCreatorStamp"
	// 空态
	// 浮标入口

/** 中文（默认档）。 */
export const zh: Record<LocaleKey, string> = {
	backToConversation: "返回会话",
	panelTitle: "任务台账",
	refresh: "刷新",
	refreshing: "刷新中",
	loading: "读取中…",
	retry: "重试",
	loadFailed: "读取失败",
	dataLoading: "数据正在初始化中，请稍后。",
	degradedTitle: "部分工作区读取失败",
	degradedItem: "{title}：{message}",

	statMyActive: "我的待办",
	statMyOverdueHint: "逾期 {n}",
	statMyStaleHint: "停滞 {n}",
	statOpen: "待认领",
	statOpenHint: "最长等待 {n} 天",
	statDoing: "进行中",
	statDoingHint: "他人在办 {n}",
	statDoingAllMine: "均为我负责",
	statBacklog: "积压",
	statOverdue: "逾期",
	statStale: "停滞",
	statBacklogHint: "占待认领 {n}%",
	statOverdueHint: "占进行中 {n}%",
	statStaleHint: "占进行中 {n}%",
	statStaleTitle: "停滞 = 进行中满 {n} 天没更新",
	statOverdueTitle: "逾期 = 认领后满 {n} 天还没结案",
	statBacklogTitle: "积压 = 待认领满 {n} 天没人接",
	statWeekDone: "本周完成",
	statLastWeekDone: "上周完成",
	daysNone: "—",
	daysValue: "{n} 天",

	chartNotReady: "趋势图待接：skill 还没有按周汇总的方法",
	periodRange: "{from} ~ {to}",

	statusLabel: "状态",
	statusActive: "进行中",
	statusOpen: "待认领",
	statusBacklog: "积压",
	statusOverdue: "逾期",
	statusStale: "停滞",
	tipOpen: "任务创建于 {created}\n尚未有人认领",
	tipBacklog: "任务创建于 {created}\n无人认领已满 {d}",
	tipDoing: "{who}\n开始执行：{started}\n最后更新：{updated}",
	tipOverdue: "{who}\n开始执行：{started}\n最后更新：{updated}\n已逾期 {d}",
	tipStale: "{who}\n开始执行：{started}\n最后更新：{updated}\n已停滞 {d}",
	workspaceLabel: "工作区",
	workspaceAll: "全部工作区",
	searchPlaceholder: "搜索",

	regionMine: "我的待办",
	regionAll: "全部",
	ownerLabel: "执行人",
	ownerAll: "全部执行人",
	listEmpty: "未找到匹配的任务记录",
	listEmptyHint: "可切换状态或工作区，查看其他记录。",
	listLimitHint: "仅显示前 {n} 条查询结果",

	ownerUnclaimed: "待认领",
	timeUnknown: "时间未知",
	relJustNow: "刚刚",
	relMinutes: "{n} 分钟前",
	relHours: "{n} 小时前",
	relDays: "{n} 天前",
	relMonths: "{n} 个月前",
	relYears: "{n} 年前",
	whenSubmitted: "更新于 {time}",
	filterByOwner: "只看 @{name} 的任务",
	filterByWorkspace: "只看工作区 {name}",
	filterByTag: "搜索标签 #{tag}",
	copyTaskId: "点击复制任务 ID",
	copiedTaskId: "已复制任务 ID",
	copyFailed: "复制失败",
	actionClaim: "认领",
	actionResume: "继续",
	actionFinish: "结束",
	actionRelease: "释放",
	tipClaim: "把这个任务认领到自己名下",
	tipResume: "继续推进这个任务",
	tipFinish: "结案并写入历史",
	tipRelease: "释放认领，让别人接手",
	viewDetail: "查看详情",
	fieldCreatorStamp: "创建于 {age}",


};

/** English（与 zh 键完全对齐）。 */
export const en: Record<LocaleKey, string> = {
	backToConversation: "Back to chat",
	panelTitle: "Task ledger",
	refresh: "Refresh",
	refreshing: "Refreshing",
	loading: "Loading…",
	retry: "Retry",
	loadFailed: "Load failed",
	dataLoading: "Loading data, please wait…",
	degradedTitle: "Some workspaces failed to load",
	degradedItem: "{title}: {message}",

	statMyActive: "My todos",
	statMyOverdueHint: "overdue {n}",
	statMyStaleHint: "stale {n}",
	statOpen: "Unclaimed",
	statOpenHint: "longest waiting {n} days",
	statDoing: "In progress",
	statDoingHint: "others: {n}",
	statDoingAllMine: "all mine",
	statBacklog: "Backlog",
	statOverdue: "Overdue",
	statStale: "Stale",
	statBacklogHint: "{n}% of unclaimed",
	statOverdueHint: "{n}% of active",
	statStaleHint: "{n}% of active",
	statStaleTitle: "stale = active with no update for {n}+ days",
	statOverdueTitle: "overdue = claimed {n}+ days ago and still open",
	statBacklogTitle: "backlog = unclaimed for {n}+ days",
	statWeekDone: "Done this week",
	statLastWeekDone: "Done last week",
	daysNone: "—",
	daysValue: "{n}d",

	chartNotReady: "Trend chart pending: the skill has no weekly roll-up method yet",
	periodRange: "{from} ~ {to}",

	statusLabel: "Status",
	statusActive: "Active",
	statusOpen: "Unclaimed",
	statusBacklog: "Backlog",
	statusOverdue: "Overdue",
	statusStale: "Stale",
	tipOpen: "Created on {created}\nNot claimed yet",
	tipBacklog: "Created on {created}\nUnclaimed for {d}",
	tipDoing: "{who}\nStarted: {started}\nLast updated: {updated}",
	tipOverdue:
		"{who}\nStarted: {started}\nLast updated: {updated}\nOverdue by {d}",
	tipStale:
		"{who}\nStarted: {started}\nLast updated: {updated}\nStalled for {d}",
	workspaceLabel: "Workspace",
	workspaceAll: "All workspaces",
	searchPlaceholder: "Search",

	regionMine: "My todos",
	regionAll: "All",
	ownerLabel: "Owner",
	ownerAll: "Anyone",
	listEmpty: "No matching task records",
	listEmptyHint: "Switch status or workspace to see other records.",
	listLimitHint: "Only the first {n} results are shown",

	ownerUnclaimed: "unclaimed",
	timeUnknown: "unknown time",
	relJustNow: "just now",
	relMinutes: "{n} min ago",
	relHours: "{n} h ago",
	relDays: "{n} d ago",
	relMonths: "{n} mo ago",
	relYears: "{n} y ago",
	whenSubmitted: "updated {time}",
	filterByOwner: "Only tasks owned by @{name}",
	filterByWorkspace: "Only workspace {name}",
	filterByTag: "Search tag #{tag}",
	copyTaskId: "Click to copy task ID",
	copiedTaskId: "Task ID copied",
	copyFailed: "Copy failed",
	actionClaim: "Claim",
	actionResume: "Resume",
	actionFinish: "Close",
	actionRelease: "Release",
	tipClaim: "claim this task as mine",
	tipResume: "keep working on this task",
	tipFinish: "close and archive it",
	tipRelease: "release the claim for others",
	viewDetail: "View details",
	fieldCreatorStamp: "created {age}",


};

/** 翻译函数类型（宿主渲染器按 `locale:` 声明合成的 `t` 席位同形）。 */
export type Translate = (
	key: LocaleKey,
	params?: Record<string, string | number>,
) => string;

/** 把宿主给的无参 t 包成带占位符替换的 t（模板一律 `{name}`，不依赖宿主是否支持 params）。 */
export function interpolateTranslate(base: Translate): Translate {
	return (key, params) => {
		const raw = base(key);
		if (params === undefined) return raw;
		return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
			name in params ? String(params[name]) : match,
		);
	};
}

/** 键名兜底：宿主没给 t 席位时用（键名绝不上界面）。 */
export function fallbackTranslate(
	key: LocaleKey,
	params?: Record<string, string | number>,
): string {
	return interpolateTranslate((name) => zh[name] ?? name)(key, params);
}
