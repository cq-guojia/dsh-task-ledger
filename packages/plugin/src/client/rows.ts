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

/** 一个工作区分组。 */
export interface WorkspaceGroup {
  readonly workspaceId: string
  readonly title: string
  readonly doingCount: number
  readonly openCount: number
  readonly rows: readonly Row[]
}

/** 两区视图：第一区我的待办 + 第二区按工作区分组（两者不重复）。 */
export interface BoardView {
  readonly mine: readonly Row[]
  readonly groups: readonly WorkspaceGroup[]
  readonly total: number
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

/** 组内排序：别人的 doing/blocked 在前、待认领在后；各自按创建 / 开始时间倒序。 */
function inGroupOrder(a: Row, b: Row): number {
  if (a.kind !== 'task' || b.kind !== 'task') return 0
  const rank = (task: BoardTask): number => (task.status === 'open' ? 1 : 0)
  if (rank(a.task) !== rank(b.task)) return rank(a.task) - rank(b.task)
  return String(b.task.created ?? b.task.started ?? '').localeCompare(String(a.task.created ?? a.task.started ?? ''))
}

/**
 * 当前筛选下的两区视图（用户 2026-10-17 二次定稿）：
 *  - 第一区「我的待办」= 我名下 doing/blocked，**吃标题搜索**（标题行那个搜索框只归它管），
 *    按创建时间倒序；空了给引导卡；
 *  - 第二区「按工作区」= 其余任务按工作区分组，**暂不过滤**——它的状态 / 工作区 / 搜索
 *    等过滤归「第三区（所有任务）」改造，未建之前不装。
 */
export function selectView(current: { board: BoardPayload | null; query: Query }): BoardView {
  const { board, query } = current
  if (board === null) return { mine: [], groups: [], total: 0 }
  const mineRows: Row[] = board.tasks
    .filter((task) => isMine(task, board))
    .filter((task) => hitKeyword(query.keyword, [task.title, task.id, task.owner, task.creator, task.category, ...(task.tags ?? [])]))
    .sort((a, b) => String(b.created ?? b.started ?? '').localeCompare(String(a.created ?? a.started ?? '')))
    .map((task): Row => ({ kind: 'task', key: `${task.workspace.id}:${task.id}`, task, mine: true }))
  const rest = query.scope === 'mine'
    ? []
    : board.tasks.filter((task) => !isMine(task, board))
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
      doingCount: entry.rows.filter((row) => row.kind === 'task' && row.task.status !== 'open').length,
      openCount: entry.rows.filter((row) => row.kind === 'task' && row.task.status === 'open').length,
      rows: entry.rows.sort(inGroupOrder),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
  return { mine: mineRows, groups, total: mineRows.length + groups.reduce((sum, group) => sum + group.rows.length, 0) }
}

/**
 * 已结案列表（统计 tab 用；首页不渲染已结案 ⇒ 这里只留数据面，供后续统计 tab 复用同一套筛选口径）。
 */
export function selectClosed(current: { history: readonly HistoryRecord[]; query: Query }): Row[] {
  return current.history
    .filter((record) => hitKeyword(current.query.keyword, [record.summary, record.workpackage, record.owner, record.category, ...(record.tags ?? [])]))
    .map((record, index) => ({ kind: 'closed', key: `${record.src ?? ''}:${record.time ?? ''}:${index}`, record }))
}
