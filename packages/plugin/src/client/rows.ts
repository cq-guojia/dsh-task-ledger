/**
 * 列表行的筛选 / 排序（**唯一**实现，纯函数、不碰网络）：页面只渲染，不各写一份过滤。
 *
 * 单独成文件是为了能被冒烟直测（store.ts 引 api.ts，Node 剥类型解析不了无扩展名相对导入）。
 */
// ⚠️ 相对导入一律带 `.ts` 扩展名：client 侧 tsconfig 开 `allowImportingTsExtensions`，
// tsdown 单文件打包认得，Node 原生剥类型也认得 —— 冒烟才能直测本文件的纯筛选逻辑
// （不带扩展名的话 Node 的 ESM 解析器找不到模块）。
import { rangeToDates, withinRange } from './format.ts'
import type { BoardPayload, HistoryRecord, TaskRow } from './types.ts'
import type { Query } from './store.ts'

/** 列表行：在办与已结案两套形状，行件按 kind 分支（不做「统一成一个假结构」的归一化）。 */
export type Row =
  | { kind: 'task'; key: string; task: TaskRow; mine: boolean }
  | { kind: 'closed'; key: string; record: HistoryRecord }

/** 关键字命中（标题 / 任务号 / 人 / 分类 / 标签；已结案另含「完成了什么」）。 */
function hitKeyword(keyword: string, parts: readonly (string | null | undefined)[]): boolean {
  const needle = keyword.trim().toLowerCase()
  if (needle === '') return true
  return parts.some(part => part?.toLowerCase().includes(needle) === true)
}

/**
 * 当前筛选下的列表行：
 *  - 已结案档：history 由服务端按窗口 / 标签 / 分页过滤，浏览器只补关键字；
 *  - 在办三档：快照已含全部在办 ⇒ 全在浏览器里筛（档位 / 时间 / 标签 / 关键字）。
 */
export function selectRows(current: { board: BoardPayload | null; history: readonly HistoryRecord[]; query: Query }): Row[] {
  const { board, history, query } = current
  if (query.bucket === 'closed') {
    return history
      .filter(record => hitKeyword(query.keyword, [record.summary, record.workpackage, record.owner, record.category, ...(record.tags ?? [])]))
      .map((record, index) => ({ kind: 'closed', key: `${record.src ?? ''}:${record.time ?? ''}:${index}`, record }))
  }
  const dates = rangeToDates(query.range)
  const tasks = board?.tasks ?? []
  return tasks
    .filter((task) => {
      if (query.bucket === 'open' && task.status !== 'open') return false
      if (query.bucket === 'mine' && !isMine(task, board)) return false
      if (!withinRange(task.created, dates.since, dates.until)) return false
      if (query.tag !== '' && !(task.tags ?? []).includes(query.tag)) return false
      return hitKeyword(query.keyword, [task.title, task.id, task.owner, task.creator, task.category, ...(task.tags ?? [])])
    })
    // 按创建 / 开始时间倒序（最新的在上）
    .sort((a, b) => String(b.created ?? b.started ?? '').localeCompare(String(a.created ?? a.started ?? '')))
    .map((task): Row => ({ kind: 'task', key: `${task.workspace.id}:${task.id}`, task, mine: isMine(task, board) }))
}

/** 「我的」判定：owner = 该工作区的当前 git 身份，且状态是 doing / blocked（与 host 统计同口径）。 */
export function isMine(task: TaskRow, board: BoardPayload | null): boolean {
  if (board === null) return false
  const identity = board.identities[task.workspace.id] ?? null
  if (identity === null || identity === '') return false
  return task.owner === identity && (task.status === 'doing' || task.status === 'blocked')
}
