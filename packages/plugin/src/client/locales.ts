/**
 * 看板文案字典（zh / en）。命名空间 = 'dsh-task-ledger'，经 ctx.locale.register 注册；
 * slot 注册项声明 `locale:` 后，宿主渲染器把 `t` 席位合成进组件 props ⇒ **切宿主语言即切界面语言**，
 * 插件不自备语言开关（与姊妹仓 dsh-task-dispatch-table 同款：界面语言跟随宿主）。
 *
 * ⚠️ 界面上**不许出现未登记的硬编码中文**：新增文案先在此加键，两档都要写。
 */
export type LocaleKey =
  // 头部
  | 'panelTitle' | 'backToConversation' | 'tabTasks' | 'tabStats' | 'statsPlaceholder'
  // 统计卡
  | 'statMyActive' | 'statOpen' | 'statWeekDone' | 'statYearDone' | 'countCapped'
  // 筛选行
  | 'bucketLabel' | 'bucketAll' | 'bucketMine' | 'bucketOpen' | 'bucketClosed'
  | 'rangeLabel' | 'rangeAll' | 'rangeWeek' | 'rangeMonth' | 'rangeYear'
  | 'tagAll' | 'searchPlaceholder'
  // 状态与按钮
  | 'refresh' | 'refreshing' | 'loading' | 'retry' | 'loadFailed'
  // 空态三分
  | 'emptyNoWorkspace' | 'emptyNoWorkspaceHint' | 'emptyNoTask' | 'emptyNoTaskHint' | 'emptyFiltered'
  // 列表
  | 'showingCount' | 'loadMore' | 'noMore' | 'expandAria' | 'collapseAria'
  | 'fieldOwner' | 'fieldCreator' | 'fieldCreated' | 'fieldStarted' | 'fieldFinished'
  | 'fieldWorkspace' | 'fieldCategory' | 'ownerUnclaimed' | 'timeUnknown'
  | 'statusOpen' | 'statusDoing' | 'statusBlocked' | 'statusClosed'
  // 过程文档
  | 'worklogTitle' | 'worklogMissing' | 'worklogPath'
  // 浮标入口
  | 'badgeTitle' | 'openBoard'
  // markdown 正文（官方 MarkdownText 的文案席位）
  | 'mdCopy' | 'mdCopied' | 'mdFootnotes'

/** 翻译席位：`{name}` 占位符由 {@link interpolateTranslate} 自己替换（不依赖宿主是否支持 params）。 */
export type Translate = (key: LocaleKey, params?: Record<string, string | number>) => string

/** 把宿主给的无参 t 包成带占位符替换的 t（官方模板一律 `{name}`）。 */
export function interpolateTranslate(base: Translate): Translate {
  return (key, params) => {
    const raw = base(key)
    if (params === undefined) return raw
    return raw.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
  }
}

export const zh: Record<LocaleKey, string> = {
  panelTitle: '任务台账',
  backToConversation: '返回会话',
  tabTasks: '任务',
  tabStats: '统计',
  statsPlaceholder: '统计报表尚未开建（本版只有任务首页）',

  statMyActive: '我的待办',
  statOpen: '待认领',
  statWeekDone: '本周已完成',
  statYearDone: '近一年完成',
  countCapped: '1万+',

  bucketLabel: '状态档',
  bucketAll: '全部',
  bucketMine: '我的待办',
  bucketOpen: '待认领',
  bucketClosed: '已结案',
  rangeLabel: '时间',
  rangeAll: '全部时间',
  rangeWeek: '本周',
  rangeMonth: '本月',
  rangeYear: '近一年',
  tagAll: '全部标签',
  searchPlaceholder: '搜索标题 / 负责人 / 任务号',

  refresh: '刷新',
  refreshing: '读取中…',
  loading: '加载中…',
  retry: '重试',
  loadFailed: '读取失败',

  emptyNoWorkspace: '没有检测到台账工作区',
  emptyNoWorkspaceHint: '宿主已添加的工作区里，还没有含 ledger/progress.json 的目录。',
  emptyNoTask: '还没有任务',
  emptyNoTaskHint: '在任一工作区里用 task-ledger skill 建任务（/ledger），这里就会看到它。',
  emptyFiltered: '当前筛选下没有任务',

  showingCount: '显示 {n} 条',
  loadMore: '加载更多',
  noMore: '没有更多了',
  expandAria: '展开详情',
  collapseAria: '收起详情',

  fieldOwner: '负责人',
  fieldCreator: '创建人',
  fieldCreated: '创建',
  fieldStarted: '开始',
  fieldFinished: '结案',
  fieldWorkspace: '工作区',
  fieldCategory: '分类',
  ownerUnclaimed: '未认领',
  timeUnknown: '时间未知',
  statusOpen: '待认领',
  statusDoing: '进行中',
  statusBlocked: '受阻',
  statusClosed: '已结案',

  worklogTitle: '过程文档',
  worklogMissing: '过程文档缺失（文件已不在盘上）',
  worklogPath: '路径',

  badgeTitle: '我名下进行中 + 受阻的任务数',
  openBoard: '打开任务台账',

  mdCopy: '复制',
  mdCopied: '已复制',
  mdFootnotes: '脚注',
}

export const en: Record<LocaleKey, string> = {
  panelTitle: 'Task ledger',
  backToConversation: 'Back to conversation',
  tabTasks: 'Tasks',
  tabStats: 'Stats',
  statsPlaceholder: 'The stats report is not built yet (this release ships the task home only)',

  statMyActive: 'My active',
  statOpen: 'Unclaimed',
  statWeekDone: 'Closed this week',
  statYearDone: 'Closed in the last year',
  countCapped: '10k+',

  bucketLabel: 'Status',
  bucketAll: 'All',
  bucketMine: 'My active',
  bucketOpen: 'Unclaimed',
  bucketClosed: 'Closed',
  rangeLabel: 'Time',
  rangeAll: 'Any time',
  rangeWeek: 'This week',
  rangeMonth: 'This month',
  rangeYear: 'Last year',
  tagAll: 'All tags',
  searchPlaceholder: 'Search title / owner / task id',

  refresh: 'Refresh',
  refreshing: 'Loading…',
  loading: 'Loading…',
  retry: 'Retry',
  loadFailed: 'Failed to load',

  emptyNoWorkspace: 'No ledger workspace detected',
  emptyNoWorkspaceHint: 'None of the workspaces added to the host contains ledger/progress.json.',
  emptyNoTask: 'No tasks yet',
  emptyNoTaskHint: 'Create one with the task-ledger skill (/ledger) in any workspace and it shows up here.',
  emptyFiltered: 'No task matches the current filters',

  showingCount: 'Showing {n}',
  loadMore: 'Load more',
  noMore: 'No more',
  expandAria: 'Expand details',
  collapseAria: 'Collapse details',

  fieldOwner: 'Owner',
  fieldCreator: 'Creator',
  fieldCreated: 'Created',
  fieldStarted: 'Started',
  fieldFinished: 'Closed',
  fieldWorkspace: 'Workspace',
  fieldCategory: 'Category',
  ownerUnclaimed: 'unclaimed',
  timeUnknown: 'unknown time',
  statusOpen: 'Unclaimed',
  statusDoing: 'In progress',
  statusBlocked: 'Blocked',
  statusClosed: 'Closed',

  worklogTitle: 'Process log',
  worklogMissing: 'Process log is missing (the file is no longer on disk)',
  worklogPath: 'Path',

  badgeTitle: 'Tasks I own that are in progress or blocked',
  openBoard: 'Open the task ledger',

  mdCopy: 'Copy',
  mdCopied: 'Copied',
  mdFootnotes: 'Footnotes',
}

/** 宿主未提供 t 时的兜底（保持中文：宿主语言服务缺席不该让界面变键名）。 */
export const fallbackTranslate: Translate = (key, params) => {
  const raw = zh[key]
  if (params === undefined) return raw
  return raw.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}
