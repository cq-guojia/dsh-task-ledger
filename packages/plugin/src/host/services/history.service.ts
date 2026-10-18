/**
 * 已结案列表 / 筛选项候选用例（history tab 与筛选控件用；非首屏，按需调用）。
 */
import { readHistory, readTasks } from '../repositories/ledger.repository.js'
import { settleWorkspaces, type DegradedInfo } from '../errors.js'
import { RECENT_MONTHS, readTrendScope } from './trend.service.js'
import type { FilterOptions, HistoryRecord, LedgerFilter, LedgerWorkspace, TaskRow, TrendScope } from '../types.js'

/** 已结案列表默认分页大小（「加载更多」= 调用方加大 limit 重取）。 */
export const DEFAULT_HISTORY_LIMIT = 500

/**
 * 已结案列表：默认近 13 个月 + limit 500，跨工作区合并后按创建时间倒序。
 * shortcut: 分页用「加大 limit 重取」的笨办法（skill 脚本无 offset）；
 * 单工作区内 limit 已生效，合并边界的全局精确排序暂不保证（500 条一页无感）。
 * 要全量老数据：调用方显式传 months: undefined（不拼 --months，脚本读全部，按秒计）。
 */
export async function queryClosed(workspaces: readonly LedgerWorkspace[], filter: LedgerFilter = {}): Promise<{
  records: HistoryRecord[]
  degraded: readonly DegradedInfo[]
}> {
  const windowed: LedgerFilter = { months: RECENT_MONTHS, ...filter }
  const { data, degraded } = await settleWorkspaces(
    workspaces, 'history', (workspace) => readHistory(workspace, windowed),
    (rows) => rows.flat()
      .sort((a, b) => String(b.created ?? b.time ?? '').localeCompare(String(a.created ?? a.time ?? '')))
      .slice(0, filter.limit ?? DEFAULT_HISTORY_LIMIT),
  )
  return { records: data, degraded }
}

/** 候选值收集（纯函数）：owner/category/tag 去重 + 排序。 */
export function collectFilterOptions(scopes: readonly TrendScope[]): FilterOptions {
  const owners = new Set<string>()
  const categories = new Set<string>()
  const tags = new Set<string>()
  const addTask = (task: TaskRow): void => {
    if (task.owner !== undefined && task.owner !== null && task.owner !== '') owners.add(task.owner)
    if (task.creator !== undefined && task.creator !== null && task.creator !== '') owners.add(task.creator)
    if (task.category !== undefined && task.category !== null && task.category !== '') categories.add(task.category)
    for (const tag of task.tags ?? []) tags.add(tag)
  }
  const addRecord = (record: HistoryRecord): void => {
    if (record.owner !== undefined && record.owner !== '') owners.add(record.owner)
    if (record.category !== undefined && record.category !== null && record.category !== '') categories.add(record.category)
    for (const tag of record.tags ?? []) tags.add(tag)
  }
  for (const scope of scopes) {
    for (const task of scope.tasks) addTask(task)
    for (const record of scope.history) addRecord(record)
  }
  const sorted = (values: Set<string>): string[] => [...values].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  return { owners: sorted(owners), categories: sorted(categories), tags: sorted(tags) }
}

/**
 * 筛选项候选：在办（全量）+ 近 13 个月历史的去重值（owner / category / tag）。
 * 按需调用（/filters 路由），非首屏——历史侧在极端量级下是百毫秒级。单工作区坏 ⇒ 进 degraded。
 */
export async function getFilterOptions(workspaces: readonly LedgerWorkspace[]): Promise<{
  options: FilterOptions
  degraded: readonly DegradedInfo[]
}> {
  const { data, degraded } = await settleWorkspaces(workspaces, 'history', readTrendScope, collectFilterOptions)
  return { options: data, degraded }
}
