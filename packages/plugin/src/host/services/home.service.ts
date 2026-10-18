/**
 * 首页**快路径**用例：在办快照 + 统计卡。
 * 只读 progress.json（list）+ git 身份，**不碰 history**——首屏耗时与历史总量解耦
 * （20 万条量级实测：527ms vs 合并端点 4.4s，见 docs/design/host-data-plane.md §四）。
 * 慢路径（趋势）在 ./trend.service.ts；组合入口（/board 兼容全量）在 ../board.ts。
 */
import { readTasks } from '../repositories/ledger.repository.js'
import { getCurrentIdentity } from '../repositories/identity.repository.js'
import { settleWorkspaces, type DegradedInfo } from '../errors.js'
import { daysSince } from './dates.js'
import type { BoardSnapshot, BoardStats, BoardTask, LedgerWorkspace, TaskRow, TaskScope } from '../types.js'

/** 停滞判定阈值：doing / blocked 且 created 至今超过这么多天（2026-10-17 拍板，显示级）。 */
export const STALE_DAYS = 14

/** 快路径读法：单工作区 readTasks + git 身份（并行；供 settle 逐工作区调）。 */
export async function readTaskScope(workspace: LedgerWorkspace): Promise<TaskScope> {
  const [tasks, identity] = await Promise.all([readTasks(workspace), getCurrentIdentity(workspace)])
  return { workspace, tasks, identity }
}

/** 在办行加工 + 六个统计面 + identities（纯函数；`now` 显式传入）。 */
export function computeSnapshot(scopes: readonly TaskScope[], now: Date): BoardSnapshot {
  const withMeta = scopes.flatMap((scope) => scope.tasks.map((task): BoardTask => {
    const working = task.status === 'doing' || task.status === 'blocked'
    const ageDays = working ? daysSince(task.started ?? task.created, now) : null
    return { ...task, ageDays, stale: ageDays !== null && ageDays > STALE_DAYS }
  }))
  const openTasks = withMeta.filter((task) => task.status === 'open')
  const blockedTasks = withMeta.filter((task) => task.status === 'blocked')
  const myActive = scopes.reduce((sum, scope) => sum + scope.tasks.filter(
    (task) => task.owner === scope.identity && (task.status === 'doing' || task.status === 'blocked'),
  ).length, 0)
  const myBlocked = scopes.reduce((sum, scope) => sum + scope.tasks.filter(
    (task) => task.owner === scope.identity && task.status === 'blocked',
  ).length, 0)
  const identities: Record<string, string | null> = {}
  for (const scope of scopes) identities[scope.workspace.id] = scope.identity
  const stats: BoardStats = {
    myActive,
    myBlocked,
    open: openTasks.length,
    doing: withMeta.filter((task) => task.status === 'doing').length,
    blocked: blockedTasks.length,
    stale: withMeta.filter((task) => task.stale).length,
    staleDays: STALE_DAYS,
    oldestOpenDays: openTasks.length === 0
      ? null
      : openTasks.reduce((max, task) => Math.max(max, daysSince(task.created, now) ?? 0), 0),
  }
  return { at: now.toISOString(), workspaces: scopes.map((scope) => scope.workspace), tasks: withMeta, stats, identities }
}

/** 快路径端点：在办快照（统计卡 + 身份 + 行加工）。单工作区坏 ⇒ 进 degraded，其余照常。 */
export async function getSnapshot(workspaces: readonly LedgerWorkspace[]): Promise<{
  snapshot: BoardSnapshot
  degraded: readonly DegradedInfo[]
}> {
  const { data: scopes, degraded } = await settleWorkspaces(workspaces, 'list', readTaskScope, (rows) => rows)
  return { snapshot: computeSnapshot(scopes, new Date()), degraded }
}
