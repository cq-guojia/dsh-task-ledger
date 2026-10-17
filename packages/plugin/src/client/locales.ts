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
  | 'statsPlaceholder'
  // 统计卡
  | 'statMyActive' | 'statMyActiveHint' | 'statOpen' | 'statOpenHint'
  | 'statDoing' | 'statDoingHint' | 'statBlockedStale' | 'statStaleWord' | 'statStaleHint'
  | 'statWeekDone' | 'statLastWeekDone' | 'statMonthDone' | 'statLastMonthDone' | 'statCreatedHint'
  | 'daysNone' | 'daysValue'
  // 趋势图
  | 'chartTitle' | 'chartCaption' | 'chartBucket' | 'chartEmpty'
  | 'chartScopeAll' | 'chartScopeMine' | 'chartLegendDone' | 'chartLegendCreated' | 'chartAvg'
  | 'periodRange'
  // 筛选行
  | 'scopeLabel' | 'scopeMine' | 'scopeAll'
  | 'statusLabel' | 'statusAll' | 'statusActive' | 'statusOpen' | 'statusBlocked' | 'statusStale'
  | 'workspaceLabel' | 'workspaceAll'
  | 'searchPlaceholder'
  // 列表分区
  | 'regionMine' | 'regionMineHint' | 'regionWorkspaces' | 'groupHint' | 'showingCount'
  | 'expandAria' | 'collapseAria'
  | 'ownerUnclaimed' | 'fieldCreated' | 'fieldStarted' | 'fieldFinished' | 'timeUnknown'
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
  statsPlaceholder: '统计报表尚未开建（另立任务）：这里以后放分类分布、按人完成数、时间线。',

  statMyActive: '我的待办',
  statMyActiveHint: '其中阻塞 {n}',
  statOpen: '待认领',
  statOpenHint: '最老一条躺了 {n}',
  statDoing: '进行中',
  statDoingHint: '别人在做 {n}',
  statBlockedStale: '阻塞 · 停滞',
  statStaleWord: '停滞',
  statStaleHint: '{n} 条',
  statWeekDone: '本周完成',
  statLastWeekDone: '上周完成',
  statMonthDone: '本月完成',
  statLastMonthDone: '上月完成',
  statCreatedHint: '新增 {n} 条',
  daysNone: '—',
  daysValue: '{n} 天',

  chartTitle: '近 8 周',
  chartCaption: '完成（按结案时间）/ 新增（按创建时间），周一起桶；我的 = owner 是我',
  chartBucket: '{week} 那一周：完成 {done} 条，新增 {created} 条',
  chartEmpty: '近 8 周没有记录',
  chartScopeAll: '所有',
  chartScopeMine: '我的',
  chartLegendDone: '完成',
  chartLegendCreated: '新增',
  chartAvg: '周均 {n}',
  periodRange: '{from} ~ {to}',

  scopeLabel: '范围',
  scopeMine: '我的',
  scopeAll: '全部工作区',
  statusLabel: '状态',
  statusAll: '全部',
  statusActive: '进行中',
  statusOpen: '待认领',
  statusBlocked: '阻塞',
  statusStale: '停滞',
  workspaceLabel: '工作区',
  workspaceAll: '全部工作区',
  searchPlaceholder: '搜索标题 / 任务号 / 人 / 分类 / 标签',

  regionMine: '我的待办',
  regionMineHint: '跨工作区，按创建时间倒序',
  regionWorkspaces: '按工作区',
  groupHint: '进行中 {doing} ｜ 待认领 {open}',
  showingCount: '显示 {n} 条',
  expandAria: '展开过程文档',
  collapseAria: '收起',

  ownerUnclaimed: '待认领',
  fieldCreated: '创建',
  fieldStarted: '开始',
  fieldFinished: '结案',
  timeUnknown: '时间未知',
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
  statsPlaceholder: 'Stats reports are not built yet (separate task): category breakdown, completions by person, timeline.',

  statMyActive: 'My todos',
  statMyActiveHint: '{n} blocked',
  statOpen: 'Unclaimed',
  statOpenHint: 'oldest waiting {n}',
  statDoing: 'In progress',
  statDoingHint: '{n} by others',
  statBlockedStale: 'Blocked · Stale',
  statStaleWord: 'Stale',
  statStaleHint: '{n}',
  statWeekDone: 'Done this week',
  statLastWeekDone: 'Done last week',
  statMonthDone: 'Done this month',
  statLastMonthDone: 'Done last month',
  statCreatedHint: '{n} created',
  daysNone: '—',
  daysValue: '{n}d',

  chartTitle: 'Last 8 weeks',
  chartCaption: 'done (by close time) / created (by create time), weeks start Monday; mine = owner is me',
  chartBucket: 'week of {week}: {done} done, {created} created',
  chartEmpty: 'Nothing in the last 8 weeks',
  chartScopeAll: 'All',
  chartScopeMine: 'Mine',
  chartLegendDone: 'Done',
  chartLegendCreated: 'Created',
  chartAvg: 'avg {n}/wk',
  periodRange: '{from} ~ {to}',

  scopeLabel: 'Scope',
  scopeMine: 'Mine',
  scopeAll: 'All workspaces',
  statusLabel: 'Status',
  statusAll: 'All',
  statusActive: 'Active',
  statusOpen: 'Unclaimed',
  statusBlocked: 'Blocked',
  statusStale: 'Stale',
  workspaceLabel: 'Workspace',
  workspaceAll: 'All workspaces',
  searchPlaceholder: 'Search title / id / person / category / tag',

  regionMine: 'My todos',
  regionMineHint: 'across workspaces, newest first',
  regionWorkspaces: 'By workspace',
  groupHint: '{doing} active ｜ {open} unclaimed',
  showingCount: '{n} shown',
  expandAria: 'Expand worklog',
  collapseAria: 'Collapse',

  ownerUnclaimed: 'unclaimed',
  fieldCreated: 'created',
  fieldStarted: 'started',
  fieldFinished: 'closed',
  timeUnknown: 'unknown time',
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
