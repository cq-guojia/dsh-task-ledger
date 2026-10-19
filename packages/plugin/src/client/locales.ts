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
  | 'backToConversation' | 'panelTitle' | 'tabTasks' | 'tabStats'
  | 'refresh' | 'refreshing' | 'loading' | 'retry' | 'loadFailed'
  | 'degradedTitle' | 'degradedItem'
  | 'statsPlaceholder'
  // 统计卡
  | 'statMyActive' | 'statOpen' | 'statOpenHint' | 'statDoing' | 'statDoingHint' | 'statDoingAllMine'
  | 'statBacklog' | 'statOverdue' | 'statStale'
  | 'statMyOverdueHint' | 'statMyStaleHint' | 'statBacklogHint' | 'statOverdueHint' | 'statStaleHint'
  | 'statStaleTitle' | 'statOverdueTitle' | 'statBacklogTitle'
  | 'statWeekDone' | 'statLastWeekDone' | 'statCreatedHint'
  | 'daysNone' | 'daysValue'
  // 趋势图
  | 'chartTitle' | 'chartCaption' | 'chartBucket' | 'chartEmpty' | 'chartLoading' | 'chartUnavailable'
  | 'chartScopeAll' | 'chartScopeMine' | 'chartOnlyMine' | 'chartLegendDone' | 'chartLegendCreated' | 'chartLegendRemaining' | 'chartAvg'
  | 'periodRange'
  // 筛选行
  | 'scopeLabel' | 'scopeMine' | 'scopeAll'
  | 'statusLabel' | 'statusAll' | 'statusActive' | 'statusOpen' | 'statusBacklog' | 'statusOverdue' | 'statusStale'
  | 'tipOpen' | 'tipBacklog' | 'tipDoing' | 'tipOverdue' | 'tipStale'
  | 'workspaceLabel' | 'workspaceAll'
  | 'searchPlaceholder'
  // 列表分区
  | 'regionMine' | 'regionAll' | 'showingCount'
  | 'groupTotal' | 'groupOpen' | 'groupDoing' | 'groupBacklog' | 'groupOverdue' | 'groupStale'
  | 'colTask' | 'colCreator' | 'colOwner' | 'colStatus' | 'colTime'
  | 'allEmptyTitle' | 'allEmptyHint' | 'allEmptyAction'
  | 'expandAria' | 'collapseAria'
  | 'ownerUnclaimed' | 'fieldCreator' | 'fieldOwner' | 'fieldCreated' | 'fieldStarted' | 'fieldFinished' | 'timeUnknown'
  | 'ageDaysText' | 'ageToday'
  | 'startedAt'
  | 'actionResume' | 'actionFinish' | 'actionRelease' | 'actionClaim'
  | 'tipResume' | 'tipFinish' | 'tipRelease' | 'tipClaim' | 'viewDetail'
  | 'createdAt'
  | 'fieldCreatedStamp' | 'mineEmpty' | 'mineEmptyHint' | 'mineCount'
  | 'worklogTitle' | 'worklogPath' | 'worklogMissing'
  | 'mdCopy' | 'mdCopied' | 'mdFootnotes'
  // 空态
  | 'emptyNoWorkspace' | 'emptyNoWorkspaceHint' | 'emptyNoTask' | 'emptyNoTaskHint' | 'emptyFiltered'
  // 浮标入口
  | 'badgeTitle' | 'openBoard'

/** 中文（默认档）。 */
export const zh: Record<LocaleKey, string> = {
  backToConversation: '返回会话',
  panelTitle: '任务台账',
  tabTasks: '任务',
  tabStats: '统计',
  refresh: '刷新',
  refreshing: '刷新中',
  loading: '读取中…',
  retry: '重试',
  loadFailed: '读取失败',
  degradedTitle: '部分工作区读取失败',
  degradedItem: '{title}：{message}',
  statsPlaceholder: '统计报表尚未开建（另立任务）：这里以后放分类分布、按人完成数、时间线。',

  statMyActive: '我的待办',
  statMyOverdueHint: '逾期 {n}',
  statMyStaleHint: '停滞 {n}',
  statOpen: '待认领',
  statOpenHint: '最长等待 {n} 天',
  statDoing: '进行中',
  statDoingHint: '他人在办 {n}',
  statDoingAllMine: '均为我负责',
  statBacklog: '积压',
  statOverdue: '逾期',
  statStale: '停滞',
  statBacklogHint: '占待认领 {n}%',
  statOverdueHint: '最长 {n} 天未结',
  statStaleHint: '最长 {n} 天未更新',
  statStaleTitle: '停滞 = 进行中满 {n} 天没更新',
  statOverdueTitle: '逾期 = 认领后满 {n} 天还没结案',
  statBacklogTitle: '积压 = 待认领满 {n} 天没人接',
  statWeekDone: '本周完成',
  statLastWeekDone: '上周完成',
  statCreatedHint: '新增 {n}',
  daysNone: '—',
  daysValue: '{n} 天',

  chartTitle: '近 8 周',
  chartCaption: '完成（按结案时间）/ 新增（按创建时间），周一起桶；我的 = owner 是我',
  chartBucket: '{week} 当周：完成 {done} 条，新增 {created} 条',
  chartEmpty: '近 8 周没有记录',
  chartLoading: '趋势读取中…（列表已就绪，统计稍后到）',
  chartUnavailable: '趋势暂时读不到（不影响上面的任务列表）',
  chartScopeAll: '所有',
  chartScopeMine: '我的',
  chartOnlyMine: '只看我的',
  chartLegendDone: '完成',
  chartLegendCreated: '新增',
  chartLegendRemaining: '未结',
  chartAvg: '周均 {n}',
  periodRange: '{from} ~ {to}',

  scopeLabel: '范围',
  scopeMine: '我的',
  scopeAll: '全部工作区',
  statusLabel: '状态',
  statusAll: '全部',
  statusActive: '进行中',
  statusOpen: '待认领',
  statusBacklog: '积压',
  statusOverdue: '逾期',
  statusStale: '停滞',
  tipOpen: '任务创建于 {created}\n尚未有人认领',
  tipBacklog: '任务创建于 {created}\n无人认领已满 {d}',
  tipDoing: '{who}\n开始执行：{started}\n最后更新：{updated}',
  tipOverdue: '{who}\n开始执行：{started}\n最后更新：{updated}\n已逾期 {d}',
  tipStale: '{who}\n开始执行：{started}\n最后更新：{updated}\n已停滞 {d}',
  workspaceLabel: '工作区',
  workspaceAll: '全部工作区',
  searchPlaceholder: '搜索',

  regionMine: '我的待办',
  regionAll: '全部待办',
  showingCount: '显示 {n} 条',
  groupTotal: '共 {n} 条',
  groupOpen: '待办 {n} 条',
  groupDoing: '进行中 {n} 条',
  groupBacklog: '积压 {n} 条',
  groupOverdue: '逾期 {n} 条',
  groupStale: '停滞 {n} 条',
  colTask: '任务',
  colCreator: '创建人',
  colOwner: '执行人',
  colStatus: '状态',
  colTime: '时长',
  allEmptyTitle: '没有可显示的事项',
  allEmptyHint: '切换上面的状态过滤试试，或新建一个任务。',
  allEmptyAction: '新建任务',
  expandAria: '展开过程文档',
  collapseAria: '收起',

  ownerUnclaimed: '待认领',
  fieldCreator: '创建',
  fieldOwner: '执行',
  fieldCreated: '创建',
  fieldStarted: '开始',
  fieldFinished: '结案',
  timeUnknown: '时间未知',
  ageDaysText: '已进行 {n} 天',
  ageToday: '今天',
  actionResume: '继续',
  actionFinish: '结束',
  actionRelease: '释放',
  tipResume: '继续推进这个任务',
  tipFinish: '结案并写入历史',
  tipRelease: '释放认领，让别人接手',
  actionClaim: '认领',
  tipClaim: '认领这个任务，变成我在做',
  createdAt: '{who} 创建于 {when}',
  startedAt: '{who} 开始于 {when}',
  viewDetail: '查看详情',
  fieldCreatedStamp: '{day} 创建',
  mineEmpty: '您现在没有正在进行的工作',
  mineEmptyHint: '在某个工作区 new 一个任务，或到下面认领一条待认领任务，这里就会出现。',
  mineCount: '{n} 条',
  worklogTitle: '过程文档',
  worklogPath: '路径',
  worklogMissing: '（缺失）',
  mdCopy: '复制',
  mdCopied: '已复制',
  mdFootnotes: '脚注',

  emptyNoWorkspace: '还没有台账工作区',
  emptyNoWorkspaceHint: '在某个项目里跑 task-ledger skill 的 init 建档（生成 ledger/progress.json），这里就会出现它。',
  emptyNoTask: '一条任务都没有',
  emptyNoTaskHint: '用 task-ledger skill 的 new 开一个任务，或让别人开在这里等你认领。',
  emptyFiltered: '没有符合当前筛选的任务',

  badgeTitle: '我名下待办',
  openBoard: '打开任务台账',
}

/** English（与 zh 键完全对齐）。 */
export const en: Record<LocaleKey, string> = {
  backToConversation: 'Back to chat',
  panelTitle: 'Task ledger',
  tabTasks: 'Tasks',
  tabStats: 'Stats',
  refresh: 'Refresh',
  refreshing: 'Refreshing',
  loading: 'Loading…',
  retry: 'Retry',
  loadFailed: 'Load failed',
  degradedTitle: 'Some workspaces failed to load',
  degradedItem: '{title}: {message}',
  statsPlaceholder: 'Stats reports are not built yet (separate task): category breakdown, completions by person, timeline.',

  statMyActive: 'My todos',
  statMyOverdueHint: 'overdue {n}',
  statMyStaleHint: 'stale {n}',
  statOpen: 'Unclaimed',
  statOpenHint: 'longest waiting {n} days',
  statDoing: 'In progress',
  statDoingHint: 'others: {n}',
  statDoingAllMine: 'all mine',
  statBacklog: 'Backlog',
  statOverdue: 'Overdue',
  statStale: 'Stale',
  statBacklogHint: '{n}% of unclaimed',
  statOverdueHint: 'longest {n} days open',
  statStaleHint: 'longest {n} days idle',
  statStaleTitle: 'stale = active with no update for {n}+ days',
  statOverdueTitle: 'overdue = claimed {n}+ days ago and still open',
  statBacklogTitle: 'backlog = unclaimed for {n}+ days',
  statWeekDone: 'Done this week',
  statLastWeekDone: 'Done last week',
  statCreatedHint: '{n} created',
  daysNone: '—',
  daysValue: '{n}d',

  chartTitle: 'Last 8 weeks',
  chartCaption: 'done (by close time) / created (by create time), weeks start Monday; mine = owner is me',
  chartBucket: 'week of {week}: {done} done, {created} created',
  chartEmpty: 'Nothing in the last 8 weeks',
  chartLoading: 'Loading trend… (list is ready, stats will follow)',
  chartUnavailable: 'Trend is unavailable right now (the task lists above are unaffected)',
  chartScopeAll: 'All',
  chartScopeMine: 'Mine',
  chartOnlyMine: 'Mine only',
  chartLegendDone: 'Done',
  chartLegendCreated: 'Created',
  chartLegendRemaining: 'Outstanding',
  chartAvg: 'avg {n}/wk',
  periodRange: '{from} ~ {to}',

  scopeLabel: 'Scope',
  scopeMine: 'Mine',
  scopeAll: 'All workspaces',
  statusLabel: 'Status',
  statusAll: 'All',
  statusActive: 'Active',
  statusOpen: 'Unclaimed',
  statusBacklog: 'Backlog',
  statusOverdue: 'Overdue',
  statusStale: 'Stale',
  tipOpen: 'Created on {created}\nNot claimed yet',
  tipBacklog: 'Created on {created}\nUnclaimed for {d}',
  tipDoing: '{who}\nStarted: {started}\nLast updated: {updated}',
  tipOverdue: '{who}\nStarted: {started}\nLast updated: {updated}\nOverdue by {d}',
  tipStale: '{who}\nStarted: {started}\nLast updated: {updated}\nStalled for {d}',
  workspaceLabel: 'Workspace',
  workspaceAll: 'All workspaces',
  searchPlaceholder: 'Search',

  regionMine: 'My todos',
  regionAll: 'All tasks',
  showingCount: '{n} shown',
  groupTotal: '{n} total',
  groupOpen: '{n} open',
  groupDoing: '{n} active',
  groupBacklog: '{n} backlog',
  groupOverdue: '{n} overdue',
  groupStale: '{n} stale',
  colTask: 'Task',
  colCreator: 'Created by',
  colOwner: 'Owner',
  colStatus: 'Status',
  colTime: 'Duration',
  allEmptyTitle: 'Nothing to show',
  allEmptyHint: 'Try another status filter above, or create a task.',
  allEmptyAction: 'New task',
  expandAria: 'Expand worklog',
  collapseAria: 'Collapse',

  ownerUnclaimed: 'unclaimed',
  fieldCreator: 'created by',
  fieldOwner: 'owner',
  fieldCreated: 'created',
  fieldStarted: 'started',
  fieldFinished: 'closed',
  timeUnknown: 'unknown time',
  ageDaysText: 'active {n}d',
  ageToday: 'today',
  actionResume: 'Resume',
  actionFinish: 'Close',
  actionRelease: 'Release',
  tipResume: 'keep working on this task',
  tipFinish: 'close and archive it',
  tipRelease: 'release the claim for others',
  actionClaim: 'Claim',
  tipClaim: 'claim this task for yourself',
  createdAt: 'created by {who} on {when}',
  startedAt: '{who} started on {when}',
  viewDetail: 'View details',
  fieldCreatedStamp: 'created {day}',
  mineEmpty: 'Nothing in progress right now',
  mineEmptyHint: 'Create a task in a workspace or claim one below, and it shows up here.',
  mineCount: '{n} items',
  worklogTitle: 'Worklog',
  worklogPath: 'path',
  worklogMissing: '(missing)',
  mdCopy: 'Copy',
  mdCopied: 'Copied',
  mdFootnotes: 'Footnotes',

  emptyNoWorkspace: 'No ledger workspace yet',
  emptyNoWorkspaceHint: 'Run the task-ledger skill init in a project (creates ledger/progress.json) and it shows up here.',
  emptyNoTask: 'No tasks yet',
  emptyNoTaskHint: 'Create one with the task-ledger skill new, or leave one here for others to claim.',
  emptyFiltered: 'No tasks match the current filters',

  badgeTitle: 'my todos',
  openBoard: 'Open task ledger',
}

/** 翻译函数类型（宿主渲染器按 `locale:` 声明合成的 `t` 席位同形）。 */
export type Translate = (key: LocaleKey, params?: Record<string, string | number>) => string

/** 把宿主给的无参 t 包成带占位符替换的 t（模板一律 `{name}`，不依赖宿主是否支持 params）。 */
export function interpolateTranslate(base: Translate): Translate {
  return (key, params) => {
    const raw = base(key)
    if (params === undefined) return raw
    return raw.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
  }
}

/** 键名兜底：宿主没给 t 席位时用（键名绝不上界面）。 */
export function fallbackTranslate(key: LocaleKey, params?: Record<string, string | number>): string {
  return interpolateTranslate((name) => zh[name] ?? name)(key, params)
}
