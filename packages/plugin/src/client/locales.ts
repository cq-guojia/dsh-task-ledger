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
	| "degradedToastTitle"
	| "degradedItem"
	// 身份与设置页
	| "settingsEntry"
	| "settingsTitle"
	| "settingsBack"
	| "settingsSwitchUser"
	| "settingsRenameUser"
	| "settingsRenamePartial"
	| "settingsRenameFailedTitle"
	| "settingsGoCreate"
	| "settingsUserModalTitle"
	| "settingsNoIdentityTitle"
	| "settingsNoIdentityHint"
	| "settingsNamePlaceholder"
	| "settingsCreate"
	| "settingsCreateUser"
	| "settingsSharedUsers"
	| "settingsUserModalConfirm"
	| "settingsColWorkspace"
	| "settingsColName"
	| "settingsColAction"
	| "settingsDeleteUser"
	| "settingsUseConfirmTitle"
	| "settingsUseConfirmBody"
	| "settingsUseConfirmOk"
	| "settingsDeleteConfirmTitle"
	| "settingsDeleteConfirmBody"
	| "settingsDeleteConfirmOk"
	| "settingsForgetKeptRow"
	| "settingsForgetFailedRow"
	| "settingsForgetDone"
	| "settingsForgetDoneCount"
	| "settingsForgetPartialTitle"
	| "settingsForgetFailedTitle"
	| "settingsForgetStep"
	| "settingsCreateDone"
	| "settingsSwitchDone"
	| "settingsRosterEmpty"
	| "settingsFailed"
	| "settingsUseThis"
	// 设置页 · 台账目录块
	| "settingsDirsTitle"
	| "settingsDirsHint"
	| "settingsDirsEmpty"
	| "settingsDirsAdd"
	| "settingsDirsFilterAll"
	| "settingsDirsFilterShown"
	| "settingsDirsFilterHidden"
	| "settingsDirsFilterEmpty"
	| "settingsDirVisible"
	| "settingsDirRename"
	| "settingsDirRemove"
	| "settingsDirRemoveConfirmTitle"
	| "settingsDirRemoveConfirmBody"
	| "settingsDirRemoveConfirmOk"
	| "settingsDirOpFailed"
	| "settingsRenamePlaceholder"
	| "settingsSave"
	| "settingsCancel"
	| "settingsPathCopied"
	| "settingsPathCopy"
	| "settingsAddInvalid"
	| "settingsAddInvalidBody"
	| "settingsAddExisted"
	| "settingsAddExistedBody"
	| "settingsAddDone"
	| "settingsAddDoneBody"
	| "settingsAddDoneMany"
	| "settingsAddDoneManyBody"
	| "settingsListSep"
	// 设置页 · 流程小图与表格表头
	| "settingsFlow1"
	| "settingsFlow1Lead"
	| "settingsFlow1Sub"
	| "settingsFlow2"
	| "settingsFlow2Create"
	| "settingsFlow2Exec"
	| "settingsFlow2Close"
	| "settingsFlow3"
	| "settingsFlow3Todo"
	| "settingsFlow3History"
	| "settingsFlow3Stats"
	| "settingsColDir"
	| "settingsColPath"
	| "settingsColActions"
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
	| "statWeekSplit"
	| "daysNone"
	| "daysValue"
	// 趋势图 / 历史图：三个口径的正式名 —— 浮卡与图例共用一套（用户 2026-11-02 统一）
	| "chartDone"
	| "chartClosed"
	| "chartFinished"
	| "chartCancelled"
	| "chartOpen"
	| "chartCreatedTasks"
	| "chartEmpty"
	| "chartPartial"
	| "chartMine"
	| "chartDoing"
	| "chartWaiting"
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
	| "wsLimitHint"
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
	| "copyTaskId"
	| "copiedTaskId"
	| "copyFailed"
	| "actionClaim"
	| "actionResume"
	| "actionFinish"
	| "actionRelease"
	| "actionCancel"
	| "claimConfirmTitle"
	| "claimConfirmBody"
	| "claimConfirmOk"
	| "releaseConfirmTitle"
	| "releaseConfirmBody"
	| "releaseConfirmOk"
	| "cancelModalTitle"
	| "cancelModalBody"
	| "cancelModalPlaceholder"
	| "cancelModalOk"
	| "actionCancelDone"
	| "deleteModalTitle"
	| "deleteModalBody"
	| "deleteModalPlaceholder"
	| "deleteModalOk"
	| "actionDeleteDone"
	| "actionDelete"
	| "actionClaimDone"
	| "actionReleaseDone"
	| "actionFailed"
	| "actionSyncing"
	// 写命令的分步进度（skill 每进一个阶段推一行，弹窗底栏跟着翻）
	| "actionStepCheck"
	| "actionStepSync"
	| "actionStepWrite"
	| "actionStepCommit"
	| "actionStepPush"
	// 「继续」：非 DSH 工作区的警告（标题 + 描述两行；描述分「已复制」/「复制失败」两版）+ 建好会话的提示
	| "continueNotDshTitle"
	| "continueNotDshBody"
	| "continueNotDshCopyFailedBody"
	| "closeNotDshTitle"
	| "closeNotDshBody"
	| "closeNotDshCopyFailedBody"
	| "continueStarted"
	// 「完成」：结案弹窗 + 交给 Agent 后的各种结果
	| "closeModalTitle"
	| "closeModalHintAgent"
	| "closeModalHintManual"
	| "closeModalHintManualOnly"
	| "closeModeManual"
	| "closeModeAgent"
	| "closeModalMode"
	| "closeModalNotePlaceholder"
	| "closeModalSummaryPlaceholder"
	| "closeModalOkAgent"
	| "closeModalOkManual"
	| "closeViewSession"
	| "tipViewSession"
	| "closeSessionTitle"
	| "continueSessionTitle"
	| "closeStarted"
	| "closeDone"
	| "closeNotClosed"
	| "closeNotClosedDesc"
	| "closeAgentFailed"
	| "closeNoSessions"
	| "actionOpenSession"
	| "closeInProgress"
	| "tipClaim"
	| "tipResume"
	| "tipFinish"
	| "tipRelease"
	| "tipCancel"
	| "tipDeleteTask"
	| "tipDelete"
	| "viewDetail"
	| "fieldCreatorStamp"
	// 视图切换（在办 / 历史）
	| "viewModeLabel"
	| "viewActive"
	| "viewHistory"
	/** 快捷工具栏（核心 QuickToolbar）：回顶部按钮 + 工具栏无障碍名。 */
	| "backToTop"
	| "quickToolbarAria"
	// 历史页顶部 6 数显 + 空态
	| "historyToday"
	| "historyYesterday"
	| "historyWeek"
	| "historyLastWeek"
	| "historyMonth"
	| "historyLastMonth"
	| "historyQuarter"
	| "historyLastQuarter"
	| "historyEmpty"
	// 历史柱图：粒度切换（日 / 周 / 月）+ 翻页（步长随粒度：10 日 / 4 周 / 3 月）
	| "historyGranLabel"
	| "historyGranDay"
	| "historyGranWeek"
	| "historyGranMonth"
	| "historyPrev"
	| "historyNext"
	// 历史列表（表格）
	| "historyCancelled"
	| "histColTask"
	| "histColDate"
	| "histColCreator"
	| "histColOwner"
	| "histColStart"
	| "histColEnd"
	| "histColTime"
	| "histListLabel"
	| "weekdaySun"
	| "weekdayMon"
	| "weekdayTue"
	| "weekdayWed"
	| "weekdayThu"
	| "weekdayFri"
	| "weekdaySat"
	| "histYearLabel"
	| "histMonthLabel"
	| "month1"
	| "month2"
	| "month3"
	| "month4"
	| "month5"
	| "month6"
	| "month7"
	| "month8"
	| "month9"
	| "month10"
	| "month11"
	| "month12"
	// 空态
	// 浮标入口

/** 中文（默认档）。 */
export const zh: Record<LocaleKey, string> = {
	backToConversation: "返回会话",
	panelTitle: "蓝鲸任务台账",
	refresh: "刷新",
	refreshing: "刷新中",
	loading: "读取中…",
	retry: "重试",
	loadFailed: "读取失败",
	degradedToastTitle: "部分台账读取失败（{n} 个）",
	degradedItem: "{title}：{message}",

	settingsEntry: "身份与设置",
	settingsTitle: "身份与设置",
	settingsBack: "返回看板",
	settingsSwitchUser: "切换身份",
	settingsRenameUser: "修改昵称",
	settingsRenamePartial: "部分台账没改通",
	settingsRenameFailedTitle: "改昵称失败",
	settingsGoCreate: "创建身份",
	settingsUserModalTitle: "台账用户管理",
	settingsNoIdentityTitle: "未创建身份",
	settingsNoIdentityHint: "创建后，任务的认领、执行与结案均记入该身份。",
	settingsNamePlaceholder: "昵称",
	settingsCreate: "创建身份",
	settingsCreateUser: "创建新用户",
	settingsSharedUsers: "通用用户",
	settingsUserModalConfirm: "确定",
	settingsColWorkspace: "工作区",
	settingsColName: "名字",
	settingsColAction: "使用",
	settingsDeleteUser: "删除",
	settingsUseConfirmTitle: "切换台账用户",
	settingsUseConfirmBody:
		"确定使用 @{name} 作为你的台账用户吗？切换后，任务的认领、推进与结案都将记录在该用户名下。",
	settingsUseConfirmOk: "确定使用",
	settingsDeleteConfirmTitle: "从台账移除用户",
	settingsDeleteConfirmBody:
		"确定移除 @{name} 吗？该用户在各台账名册中的登记会一并删除；若某个台账里他名下仍有任务，那本台账不会删。已结案的历史记录不受影响。",
	settingsDeleteConfirmOk: "移除",
	settingsForgetKeptRow: "{workspace}：名下尚有 {tasks} 个未结任务，已保留",
	settingsForgetFailedRow: "{workspace}：{error}",
	settingsForgetDone: "@{name} 已从全部台账移除",
	settingsForgetDoneCount: "已移除 {count} 本台账",
	settingsForgetPartialTitle: "@{name} 移除未完成",
	settingsForgetFailedTitle: "@{name} 移除失败",
	settingsForgetStep: "{step}（{workspace}）",
	settingsCreateDone: "已创建身份 @{name}",
	settingsSwitchDone: "已切换到 @{name}",
	settingsRosterEmpty: "所列台账中暂无已创建的身份。",
	settingsFailed: "操作未成功：{message}",
	settingsUseThis: "使用",

	settingsDirsTitle: "台账目录",
	settingsDirsHint:
		"看板仅汇总下列目录中的台账。关闭「显示」后，该目录的数据不再出现在看板的统计与筛选中；台账数据本身不受影响。",
	settingsDirsEmpty: "尚未登记任何台账目录。",
	settingsDirsAdd: "添加目录",
	settingsDirsFilterAll: "所有",
	settingsDirsFilterShown: "显示",
	settingsDirsFilterHidden: "隐藏",
	settingsDirsFilterEmpty: "该筛选下没有台账目录。",
	settingsDirVisible: "显示",
	settingsDirRename: "重命名",
	settingsDirRemove: "移除",
	settingsDirRemoveConfirmTitle: "从看板移除「{name}」？",
	settingsDirRemoveConfirmBody:
		"本次操作仅将该台账从看板的管理与查看列表中移除，不会删除或改动该目录下的任何文件与台账数据；如需重新纳入看板，可通过「添加目录」再次登记。",
	settingsDirRemoveConfirmOk: "确认移除",
	settingsDirOpFailed: "台账目录未更新",
	settingsRenamePlaceholder: "新名称（留空则沿用目录名）",
	settingsSave: "保存",
	settingsCancel: "取消",
	settingsPathCopied: "复制完成",
	settingsPathCopy: "复制路径",
	settingsAddInvalid: "所选目录不含台账",
	settingsAddInvalidBody:
		"该目录不是台账根目录，其直接下级目录中也未发现台账根。请选择台账根目录，或包含台账的上级目录。",
	settingsAddExisted: "该目录已在监控清单中",
	settingsAddExistedBody: "无需重复添加，台账监控范围未发生变化。",
	settingsAddDone: "已添加台账目录",
	settingsAddDoneBody: "「{name}」已纳入台账监控。",
	settingsAddDoneMany: "添加成功",
	settingsAddDoneManyBody: "已添加 {count} 个台账目录：{names}",
	settingsListSep: "、",

	settingsFlow1: "安装 Skill",
	settingsFlow1Lead: "DeepSeek-harness 无需安装，插件已自带。",
	settingsFlow1Sub: "在其他 Agent 上安装",
	settingsFlow2: "工作区操作",
	settingsFlow2Create: "新建：说「建一个新任务：xxx」。",
	settingsFlow2Exec: "执行：Agent 进度自动写进台账。",
	settingsFlow2Close: "结束：说「这个任务结束」，Agent 收尾结案。",
	settingsFlow3: "面板查询",
	settingsFlow3Todo: "在办：执行中的任务与待认领项",
	settingsFlow3History: "历史：本项目已结案的任务数量",
	settingsFlow3Stats: "设置：多 Agent 安装、台账目录管理",
	settingsColDir: "台账名",
	settingsColPath: "路径",
	settingsColActions: "操作",

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
	statWeekDone: "本周结案",
	statLastWeekDone: "上周结案",
	statWeekSplit: "完成 {done} · 取消 {cancelled}",
	daysNone: "—",
	daysValue: "{n} 天",

	// 术语（2026-10-29 用户拍板）：结案 = 完成 + 取消（上位词），完成 = 正常结案，取消 = 作废
	chartDone: "结案",
	// 已结 / 未结的正式名：两张图的浮卡与图例都用这两个（用户 2026-11-02 统一口径）
	chartClosed: "已结任务",
	chartFinished: "完成",
	chartCancelled: "取消",
	chartOpen: "未结任务",
	chartCreatedTasks: "新建任务",
	chartEmpty: "还没有可统计的记录",
	chartPartial: "{from} 起才有台账数据",
	chartMine: "只看我的",
	chartDoing: "进行中",
	chartWaiting: "待认领",
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
	workspaceLabel: "台账",
	workspaceAll: "全部台账",
	searchPlaceholder: "搜索",

	regionMine: "我的待办",
	regionAll: "全部",
	ownerLabel: "执行人",
	ownerAll: "全部执行人",
	listEmpty: "未找到匹配的任务记录",
	listEmptyHint: "可切换状态或台账，查看其他记录。",
	wsLimitHint: "本台账记录较多，此处仅列出前 {n} 条；其余记录未予显示，如需查阅请缩小筛选范围。",

	ownerUnclaimed: "待认领",
	timeUnknown: "时间未知",
	relJustNow: "刚刚",
	relMinutes: "{n} 分钟前",
	relHours: "{n} 小时前",
	relDays: "{n} 天前",
	relMonths: "{n} 个月前",
	relYears: "{n} 年前",
	whenSubmitted: "更新于 {time}",
	copyTaskId: "点击复制任务 ID",
	copiedTaskId: "已复制任务 ID",
	copyFailed: "复制失败",
	actionClaim: "认领",
	actionResume: "继续",
	actionFinish: "完成",
	actionRelease: "释放",
	actionCancel: "取消",
	claimConfirmTitle: "认领任务",
	claimConfirmBody: "确定认领「{title}」吗？认领后任务归到你名下，状态改为进行中。",
	claimConfirmOk: "确定认领",
	releaseConfirmTitle: "释放任务",
	releaseConfirmBody: "确定释放「{title}」吗？任务会退回公共池，状态回到待认领。",
	releaseConfirmOk: "确定释放",
	cancelModalTitle: "取消任务",
	cancelModalBody: "确定取消「{title}」并归档吗？取消的任务不计入完成，会进历史记录。",
	cancelModalPlaceholder: "写一句取消的理由（可留空）",
	cancelModalOk: "确定取消",
	actionCancelDone: "已取消归档：{title}",
	deleteModalTitle: "删除任务",
	deleteModalBody: "确定删除「{title}」吗？删除后所有台账统计都不再计入这条记录，且不能恢复。",
	deleteModalPlaceholder: "写一句删除留言（可留空）",
	deleteModalOk: "确定删除",
	actionDeleteDone: "已删除：{title}",
	actionDelete: "删除任务",
	tipDeleteTask: "删除任务",
	tipDelete: "删除",
	actionClaimDone: "已认领：{title}",
	actionReleaseDone: "已释放：{title}",
	actionFailed: "操作失败：{error}",
	actionSyncing: "正在同步台账并提交…",
	actionStepCheck: "正在检查本地台账改动…",
	actionStepSync: "正在拉取最新台账…",
	actionStepWrite: "正在写入台账…",
	actionStepCommit: "正在提交改动…",
	actionStepPush: "正在推送到远端…",
	continueNotDshTitle: "此任务不属于 DeepSeek Harness 工作区",
	continueNotDshBody: "相关提示词已复制，请打开对应的 Agent 粘贴继续任务",
	continueNotDshCopyFailedBody: "提示词复制失败，请重试或手动复制后到对应的 Agent 继续任务",
	// 标题与「继续」同一句；正文多一句「也可以选直接结案」—— 结案有这条退路，继续没有
	closeNotDshTitle: "此任务不属于 DeepSeek Harness 工作区",
	closeNotDshBody:
		"相关提示词已复制，请打开对应的 Agent 粘贴完成结案，也可以选「直接结案」",
	closeNotDshCopyFailedBody: "结案提示词复制失败，请重试或手动复制后到对应的 Agent 粘贴完成结案",
	continueStarted: "已新建会话：{title}",
	closeModalTitle: "结案任务",
	closeModalHintAgent: "Agent 会读完当前进度、写出结论与遗留项，然后结案。",
	closeModalHintManual: "用这句摘要直接结案。",
	closeModalHintManualOnly: "此台账不在本环境内，无法交给 Agent，请写一句结案摘要。",
	closeModeManual: "直接结案",
	closeModeAgent: "交给 Agent 结案",
	closeModalMode: "结案方式",
	closeModalNotePlaceholder: "给 Agent 留句话（可留空）",
	closeModalSummaryPlaceholder: "结案摘要（必填，一句话）",
	closeModalOkAgent: "交给 Agent",
	closeModalOkManual: "直接结案",
	closeViewSession: "Agent 会话中",
	tipViewSession: "查看会话",
	closeSessionTitle: "完成：{title}",
	continueSessionTitle: "继续：{title}",
	closeStarted: "已交给 Agent 结案：{title}",
	closeDone: "已结案：{title}",
	closeNotClosed: "这轮跑完了，但任务没结",
	closeNotClosedDesc: "去会话里看看它停在哪儿",
	closeAgentFailed: "Agent 这轮没跑成：{error}",
	closeNoSessions: "宿主没有提供会话服务，只能手动结案",
	actionOpenSession: "查看会话",
	closeInProgress: "Agent 正在结案，完成前不能再点",
	tipClaim: "将该任务归入本人名下，状态置为进行中",
	tipResume: "恢复对该任务的推进",
	tipFinish: "将该任务标记为完成，并归档入历史",
	tipRelease: "解除本人认领，任务退回公共池",
	tipCancel: "将该任务标记为取消并归档，不计入完成",
	viewDetail: "查看详情",
	fieldCreatorStamp: "创建于 {age}",
	viewModeLabel: "视图",
	viewActive: "在办",
	viewHistory: "历史",
	backToTop: "回到顶部",
	quickToolbarAria: "快捷工具栏",
	historyToday: "今日",
	historyYesterday: "昨日",
	historyWeek: "本周",
	historyLastWeek: "上周",
	historyMonth: "本月",
	historyLastMonth: "上月",
	historyQuarter: "本季度",
	historyLastQuarter: "上季度",
	historyEmpty: "所选区间内没有结案记录",
	historyGranLabel: "粒度",
	historyGranDay: "日",
	historyGranWeek: "周",
	historyGranMonth: "月",
	historyPrev: "前 {n} {unit}",
	historyNext: "后 {n} {unit}",
	historyCancelled: "取消",
	histColTask: "任务",
	histColDate: "日期",
	histColCreator: "创建人",
	histColOwner: "执行人",
	histColStart: "开始时间",
	histColEnd: "结束时间",
	histColTime: "执行时间",
	histListLabel: "结案记录",
	weekdaySun: "星期日",
	weekdayMon: "星期一",
	weekdayTue: "星期二",
	weekdayWed: "星期三",
	weekdayThu: "星期四",
	weekdayFri: "星期五",
	weekdaySat: "星期六",
	histYearLabel: "年份",
	histMonthLabel: "月份",
	month1: "一月",
	month2: "二月",
	month3: "三月",
	month4: "四月",
	month5: "五月",
	month6: "六月",
	month7: "七月",
	month8: "八月",
	month9: "九月",
	month10: "十月",
	month11: "十一月",
	month12: "十二月",


};

/** English（与 zh 键完全对齐）。 */
export const en: Record<LocaleKey, string> = {
	backToConversation: "Back to chat",
	panelTitle: "Whale Ledger",
	refresh: "Refresh",
	refreshing: "Refreshing",
	loading: "Loading…",
	retry: "Retry",
	loadFailed: "Load failed",
	degradedToastTitle: "{n} ledger(s) failed to load",
	degradedItem: "{title}: {message}",

	settingsEntry: "Identity & settings",
	settingsTitle: "Identity & settings",
	settingsBack: "Back to board",
	settingsSwitchUser: "Switch identity",
	settingsRenameUser: "Change nickname",
	settingsRenamePartial: "Some ledgers were not updated",
	settingsRenameFailedTitle: "Failed to change nickname",
	settingsGoCreate: "Create identity",
	settingsUserModalTitle: "Ledger users",
	settingsNoIdentityTitle: "No identity created",
	settingsNoIdentityHint:
		"Once created, claiming, executing and closing a task are recorded under this identity.",
	settingsNamePlaceholder: "Nickname",
	settingsCreate: "Create identity",
	settingsCreateUser: "New user",
	settingsSharedUsers: "Shared users",
	settingsUserModalConfirm: "OK",
	settingsColWorkspace: "Workspace",
	settingsColName: "Name",
	settingsColAction: "Use",
	settingsDeleteUser: "Remove",
	settingsUseConfirmTitle: "Switch ledger user",
	settingsUseConfirmBody:
		"Use @{name} as your ledger user? Claiming, progressing and closing tasks will be recorded under this user.",
	settingsUseConfirmOk: "Use this user",
	settingsDeleteConfirmTitle: "Remove user from ledgers",
	settingsDeleteConfirmBody:
		"Remove @{name}? The user is dropped from every ledger roster; a ledger where this user still owns tasks is kept. Closed history is untouched.",
	settingsDeleteConfirmOk: "Remove",
	settingsForgetKeptRow: "{workspace}: {tasks} open task(s) — entry kept",
	settingsForgetFailedRow: "{workspace}: {error}",
	settingsForgetDone: "Identity @{name} removed from all ledgers",
	settingsForgetDoneCount: "Removed from {count} ledger(s)",
	settingsForgetPartialTitle: "Identity @{name} partially removed",
	settingsForgetFailedTitle: "Failed to remove identity @{name}",
	settingsForgetStep: "{step} ({workspace})",
	settingsCreateDone: "Created identity @{name}",
	settingsSwitchDone: "Switched to @{name}",
	settingsRosterEmpty: "No identity has been created in the listed ledgers.",
	settingsFailed: "Operation failed: {message}",
	settingsUseThis: "Use",

	settingsDirsTitle: "Ledger folders",
	settingsDirsHint:
		"Only ledgers in the following folders are summarized. Turning \"Show\" off hides that folder's data from every statistic and filter on the board; the ledger data itself is unaffected.",
	settingsDirsEmpty: "No ledger folder has been registered.",
	settingsDirsAdd: "Add folder",
	settingsDirsFilterAll: "All",
	settingsDirsFilterShown: "Shown",
	settingsDirsFilterHidden: "Hidden",
	settingsDirsFilterEmpty: "No ledger folder matches this filter.",
	settingsDirVisible: "Show",
	settingsDirRename: "Rename",
	settingsDirRemove: "Remove",
	settingsDirRemoveConfirmTitle: "Remove \"{name}\" from the board?",
	settingsDirRemoveConfirmBody:
		"This only takes the ledger out of the board's management and viewing list. No file or ledger data in that folder is deleted or changed; register it again with \"Add folder\" to put it back on the board.",
	settingsDirRemoveConfirmOk: "Remove",
	settingsDirOpFailed: "Ledger folders were not updated",
	settingsRenamePlaceholder: "New name (empty keeps the folder name)",
	settingsSave: "Save",
	settingsCancel: "Cancel",
	settingsPathCopied: "Copied",
	settingsPathCopy: "Copy path",
	settingsAddInvalid: "No ledger in this folder",
	settingsAddInvalidBody:
		"This folder is not a ledger root, and none of its direct subfolders is one. Choose a ledger root folder, or the folder that contains it.",
	settingsAddExisted: "Folder already monitored",
	settingsAddExistedBody:
		"No need to add it again; the monitored range is unchanged.",
	settingsAddDone: "Ledger folder added",
	settingsAddDoneBody: "“{name}” is now monitored.",
	settingsAddDoneMany: "Ledger folders added",
	settingsAddDoneManyBody: "{count} ledger folders were added: {names}",
	settingsListSep: ", ",

	settingsFlow1: "Install Skill",
	settingsFlow1Lead: "DeepSeek-harness needs no install — it ships with the plugin.",
	settingsFlow1Sub: "Install on other agents",
	settingsFlow2: "Workspace Operations",
	settingsFlow2Create: "New: say \"create a new task: xxx\".",
	settingsFlow2Exec: "Run: the agent writes progress to the ledger itself.",
	settingsFlow2Close: "Finish: say \"this task is done\" and the agent closes it out.",
	settingsFlow3: "Panel Query",
	settingsFlow3Todo: "In flight: running tasks and unclaimed items",
	settingsFlow3History: "History: closed task count for this project",
	settingsFlow3Stats: "Settings: multi-agent install, ledger folder management",
	settingsColDir: "Ledger name",
	settingsColPath: "Path",
	settingsColActions: "Actions",

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
	statWeekDone: "Closed this week",
	statLastWeekDone: "Closed last week",
	statWeekSplit: "Done {done} · Cancelled {cancelled}",
	daysNone: "—",
	daysValue: "{n}d",

	chartDone: "Closed",
	chartClosed: "Closed tasks",
	chartFinished: "Done",
	chartCancelled: "Cancelled",
	chartOpen: "Open tasks",
	chartCreatedTasks: "Created tasks",
	chartEmpty: "No records to chart yet",
	chartPartial: "Ledger data starts {from}",
	chartMine: "Only mine",
	chartDoing: "In progress",
	chartWaiting: "Unclaimed",
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
	workspaceLabel: "Ledger",
	workspaceAll: "All ledgers",
	searchPlaceholder: "Search",

	regionMine: "My todos",
	regionAll: "All",
	ownerLabel: "Owner",
	ownerAll: "Anyone",
	listEmpty: "No matching task records",
	listEmptyHint: "Switch status or ledger to see other records.",
	wsLimitHint: "This ledger has more records than shown; only the first {n} are listed. Narrow the filters to see the rest.",

	ownerUnclaimed: "unclaimed",
	timeUnknown: "unknown time",
	relJustNow: "just now",
	relMinutes: "{n} min ago",
	relHours: "{n} h ago",
	relDays: "{n} d ago",
	relMonths: "{n} mo ago",
	relYears: "{n} y ago",
	whenSubmitted: "updated {time}",
	copyTaskId: "Click to copy task ID",
	copiedTaskId: "Task ID copied",
	copyFailed: "Copy failed",
	actionClaim: "Claim",
	actionResume: "Resume",
	actionFinish: "Finish",
	actionRelease: "Release",
	actionCancel: "Cancel",
	claimConfirmTitle: "Claim task",
	claimConfirmBody:
		"Claim “{title}”? It moves the task under your name and sets it to in progress.",
	claimConfirmOk: "Claim it",
	releaseConfirmTitle: "Release task",
	releaseConfirmBody:
		"Release “{title}”? It goes back to the public pool and returns to unclaimed.",
	releaseConfirmOk: "Release it",
	cancelModalTitle: "Cancel task",
	cancelModalBody:
		"Cancel “{title}” and archive it? Cancelled tasks don't count as done; they go to history.",
	cancelModalPlaceholder: "One line on why (optional)",
	cancelModalOk: "Cancel it",
	actionCancelDone: "Cancelled: {title}",
	deleteModalTitle: "Delete task",
	deleteModalBody:
		"Delete “{title}”? This record will be excluded from all ledger statistics and cannot be restored.",
	deleteModalPlaceholder: "One line as a note (optional)",
	deleteModalOk: "Delete it",
	actionDeleteDone: "Deleted: {title}",
	actionDelete: "Delete task",
	tipDeleteTask: "Delete task",
	tipDelete: "Delete",
	actionClaimDone: "Claimed: {title}",
	actionReleaseDone: "Released: {title}",
	actionFailed: "Action failed: {error}",
	actionSyncing: "Syncing the ledger and committing…",
	actionStepCheck: "Checking local ledger changes…",
	actionStepSync: "Pulling the latest ledger…",
	actionStepWrite: "Writing the ledger…",
	actionStepCommit: "Committing changes…",
	actionStepPush: "Pushing to the remote…",
	continueNotDshTitle: "This task does not belong to a DeepSeek Harness workspace",
	continueNotDshBody:
		"The prompt has been copied — please open the matching agent and paste it to continue.",
	continueNotDshCopyFailedBody:
		"Copying the prompt failed — copy it manually, then paste it into the matching agent.",
	closeNotDshTitle: "This task does not belong to a DeepSeek Harness workspace",
	closeNotDshBody:
		"The prompt has been copied — please open the matching agent and paste it to close the task, or pick “Close now”.",
	closeNotDshCopyFailedBody:
		"Copying the closing prompt failed — copy it manually, then paste it into the matching agent to close the task.",
	continueStarted: "Session started: {title}",
	closeModalTitle: "Close task",
	closeModalHintAgent:
		"An agent reads the current progress, writes the conclusion and leftovers, then closes.",
	closeModalHintManual: "Close right away with this summary.",
	closeModalHintManualOnly:
		"This ledger is outside this environment, so no agent is available — write a one-line summary.",
	closeModeManual: "Close now",
	closeModeAgent: "Hand to agent",
	closeModalMode: "Close mode",
	closeModalNotePlaceholder: "Leave a note for the agent (optional)",
	closeModalSummaryPlaceholder: "Closing summary (required, one line)",
	closeModalOkAgent: "Hand to agent",
	closeModalOkManual: "Close now",
	closeViewSession: "Agent running",
	tipViewSession: "View session",
	closeSessionTitle: "Close: {title}",
	continueSessionTitle: "Continue: {title}",
	closeStarted: "Handed to an agent: {title}",
	closeDone: "Task closed: {title}",
	closeNotClosed: "The turn finished, but the task is still open",
	closeNotClosedDesc: "Open the session to see where it stopped",
	closeAgentFailed: "The agent turn failed: {error}",
	closeNoSessions: "This host exposes no session service — close it manually",
	actionOpenSession: "Open session",
	closeInProgress: "An agent is closing this task; wait for it to finish",
	tipClaim: "assign this task to me and set it to in progress",
	tipResume: "resume work on this task",
	tipFinish: "mark this task as done and archive it",
	tipRelease: "drop my claim and return the task to the public pool",
	tipCancel: "mark this task as cancelled and archive it; not counted as done",
	viewDetail: "View details",
	fieldCreatorStamp: "created {age}",
	viewModeLabel: "View",
	viewActive: "Active",
	viewHistory: "History",
	backToTop: "Back to top",
	quickToolbarAria: "Quick toolbar",
	historyToday: "Today",
	historyYesterday: "Yesterday",
	historyWeek: "This week",
	historyLastWeek: "Last week",
	historyMonth: "This month",
	historyLastMonth: "Last month",
	historyQuarter: "This quarter",
	historyLastQuarter: "Last quarter",
	historyEmpty: "No closed tasks in the selected range",
	historyGranLabel: "Granularity",
	historyGranDay: "Day",
	historyGranWeek: "Week",
	historyGranMonth: "Month",
	historyPrev: "Previous {n} {unit}s",
	historyNext: "Next {n} {unit}s",
	historyCancelled: "Cancelled",
	histColTask: "Task",
	histColDate: "Date",
	histColCreator: "Creator",
	histColOwner: "Owner",
	histColStart: "Started",
	histColEnd: "Closed",
	histColTime: "Execution",
	histListLabel: "Closed tasks",
	weekdaySun: "Sunday",
	weekdayMon: "Monday",
	weekdayTue: "Tuesday",
	weekdayWed: "Wednesday",
	weekdayThu: "Thursday",
	weekdayFri: "Friday",
	weekdaySat: "Saturday",
	histYearLabel: "Year",
	histMonthLabel: "Month",
	month1: "Jan",
	month2: "Feb",
	month3: "Mar",
	month4: "Apr",
	month5: "May",
	month6: "Jun",
	month7: "Jul",
	month8: "Aug",
	month9: "Sep",
	month10: "Oct",
	month11: "Nov",
	month12: "Dec",


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
