/**
 * 列表视图的筛选 / 分区 / 排序（**唯一**实现，纯函数、不碰网络）：页面只渲染，不各写一份过滤。
 * 定稿见 docs/design/features/board-home.md §二.3：两区结构（我的待办平铺 / 按工作区分组），
 * 已结案**不在首页**（去统计 tab）。
 *
 * 单独成文件是为了能被冒烟直测（store.ts 引 api.ts，Node 剥类型解析不了无扩展名相对导入）。
 */
import type { BoardPayload, BoardTask, HistoryRecord } from './types'
import type { Query } from './store'

/** 列表行：在办与已结案两套形状，行件按 kind 分支（不做「统一成一个假结构」的归一化）。 */
export type Row =
  | { kind: 'task'; key: string; task: BoardTask; mine: boolean }
  | { kind: 'closed'; key: string; record: HistoryRecord }

/** 一个工作区分组（计数口径：待认领 / 进行中 / 阻塞 / 停滞 / 总，供「其他待办」段头统计）。 */
export interface WorkspaceGroup {
  readonly workspaceId: string
  readonly title: string
  readonly doingCount: number
  readonly blockedCount: number
  readonly staleCount: number
  readonly openCount: number
  readonly total: number
  readonly rows: readonly Row[]
}

/** 两区视图：第一区我的待办 + 第二区按工作区分组（两者不重复）。 */
export interface BoardView {
  readonly mine: readonly Row[]
  readonly groups: readonly WorkspaceGroup[]
  readonly total: number
  /** 第二区全量计数（**不受状态过滤影响**，供 segmented 角标；停滞是独立标记）。 */
  readonly othersCounts: {
    readonly total: number
    readonly doing: number
    readonly open: number
    readonly blocked: number
    readonly stale: number
  }
}

/** 关键字命中（标题 / 任务号 / 人 / 分类 / 标签；已结案另含「完成了什么」）。 */
function hitKeyword(keyword: string, parts: readonly (string | null | undefined)[]): boolean {
  const needle = keyword.trim().toLowerCase()
  if (needle === '') return true
  return parts.some(part => part?.toLowerCase().includes(needle) === true)
}

/** 「我的」判定：owner = 该工作区的当前 git 身份，且状态是 doing / blocked（与 host 统计同口径）。 */
export function isMine(task: BoardTask, board: BoardPayload | null): boolean {
  if (board === null) return false
  const identity = board.identities[task.workspace.id] ?? null
  if (identity === null || identity === '') return false
  return task.owner === identity && (task.status === 'doing' || task.status === 'blocked')
}

/** 状态档命中（停滞由 host 标记，前端不判阈值）——只作用于「其他待办」。 */
function statusHit(task: BoardTask, status: Query['status']): boolean {
  if (status === 'all') return true
  if (status === 'active') return task.status === 'doing' || task.status === 'blocked'
  if (status === 'open') return task.status === 'open'
  if (status === 'blocked') return task.status === 'blocked'
  return task.stale === true
}

/** 组内排序：别人的 doing/blocked 在前、待认领在后；各自按创建 / 开始时间倒序。 */
function inGroupOrder(a: Row, b: Row): number {
  if (a.kind !== 'task' || b.kind !== 'task') return 0
  const rank = (task: BoardTask): number => (task.status === 'open' ? 1 : 0)
  if (rank(a.task) !== rank(b.task)) return rank(a.task) - rank(b.task)
  return String(b.task.created ?? b.task.started ?? '').localeCompare(String(a.task.created ?? a.task.started ?? ''))
}

/**
 * 当前筛选下的两区视图（用户 2026-10-17 定稿）：
 *  - 第一区「我的待办」= 我名下 doing/blocked，吃工作区下拉 + 标题搜索，按创建时间倒序；
 *  - 第二区「其他待办」= 其余任务按工作区分组，吃**状态档**（segmented）+
 *    **标题 / 执行人搜索**（usersKeyword）；一个整表（外框连着），不是一块一块的。
 */
export function selectView(current: { board: BoardPayload | null; query: Query }): BoardView {
  const { board, query } = current
  if (board === null) {
    return { mine: [], groups: [], total: 0, othersCounts: { total: 0, doing: 0, open: 0, blocked: 0, stale: 0 } }
  }
  const othersAll = board.tasks.filter((task) => !isMine(task, board))
  const othersCounts = {
    total: othersAll.length,
    doing: othersAll.filter((task) => task.status === 'doing').length,
    open: othersAll.filter((task) => task.status === 'open').length,
    blocked: othersAll.filter((task) => task.status === 'blocked').length,
    stale: othersAll.filter((task) => task.stale === true).length,
  }
  const mineRows: Row[] = board.tasks
    .filter((task) => isMine(task, board))
    .filter((task) => query.workspace === '' || task.workspace.id === query.workspace)
    .filter((task) => hitKeyword(query.keyword, [task.title, task.id, task.owner, task.creator, task.category, ...(task.tags ?? [])]))
    .sort((a, b) => String(b.created ?? b.started ?? '').localeCompare(String(a.created ?? a.started ?? '')))
    .map((task): Row => ({ kind: 'task', key: `${task.workspace.id}:${task.id}`, task, mine: true }))
  const rest = query.scope === 'mine'
    ? []
    : board.tasks
      .filter((task) => !isMine(task, board))
      .filter((task) => statusHit(task, query.status))
      .filter((task) => hitKeyword(query.othersKeyword, [task.title, task.owner]))
  const byWorkspace = new Map<string, { title: string; rows: Row[] }>()
  for (const task of rest) {
    const entry = byWorkspace.get(task.workspace.id) ?? { title: task.workspace.title, rows: [] }
    entry.rows.push({ kind: 'task', key: `${task.workspace.id}:${task.id}`, task, mine: false })
    byWorkspace.set(task.workspace.id, entry)
  }
  const groups: WorkspaceGroup[] = [...byWorkspace.entries()]
    .map(([workspaceId, entry]) => ({
      workspaceId,
      title: entry.title,
      doingCount: entry.rows.filter((row) => row.kind === 'task' && row.task.status === 'doing').length,
      blockedCount: entry.rows.filter((row) => row.kind === 'task' && row.task.status === 'blocked').length,
      staleCount: entry.rows.filter((row) => row.kind === 'task' && row.task.stale === true).length,
      openCount: entry.rows.filter((row) => row.kind === 'task' && row.task.status === 'open').length,
      total: entry.rows.length,
      rows: entry.rows.sort(inGroupOrder),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
  return { mine: mineRows, groups, total: mineRows.length + groups.reduce((sum, group) => sum + group.rows.length, 0), othersCounts }
}

/**
 * 已结案列表（统计 tab 用；首页不渲染已结案 ⇒ 这里只留数据面，供后续统计 tab 复用同一套筛选口径）。
 */
export function selectClosed(current: { history: readonly HistoryRecord[]; query: Query }): Row[] {
  return current.history
    .filter((record) => hitKeyword(current.query.keyword, [record.summary, record.workpackage, record.owner, record.category, ...(record.tags ?? [])]))
    .map((record, index) => ({ kind: 'closed', key: `${record.src ?? ''}:${record.time ?? ''}:${index}`, record }))
}
