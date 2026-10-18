/**
 * 首页**组合入口**（`/board` 兼容全量端点用）：一次读全（tasks + history + git 身份），
 * 喂快 / 慢两条纯计算——**读一次算两样，不重复 IO**。
 *
 * 拆端点后（host-data-plane §五 A）首屏走 `services/home.service.ts::getSnapshot()`（不碰 history），
 * 本组合归「兼容期全量 `/board`」；新端点在 routes 层直接调 service，不过本文件。
 */
import { readHistory, readTasks } from './repositories/ledger.repository.js'
import { getCurrentIdentity } from './repositories/identity.repository.js'
import { computeSnapshot } from './services/home.service.js'
import { computeClosedSummary, computeTrendPeriods, RECENT_MONTHS } from './services/trend.service.js'
import { getFilterOptions, queryClosed } from './services/history.service.js'
import type { HomeAggregate, LedgerWorkspace, TrendScope } from './types.js'

/** 组合读法：每工作区一次 list + history(months) + git 身份（首页所有数字的共同原料）。 */
async function readTrendScopes(workspaces: readonly LedgerWorkspace[]): Promise<TrendScope[]> {
  return Promise.all(workspaces.map(async (workspace) => ({
    workspace,
    tasks: await readTasks(workspace),
    history: await readHistory(workspace, { months: RECENT_MONTHS }),
    identity: await getCurrentIdentity(workspace),
  })))
}

/**
 * 首页一次拿全：在办快照（含停滞 / 天数 / 身份）+ 近 8 周趋势（完成 / 新增 × 所有 / 我的）
 * + 四个自然周期计数。**每个工作区只读一次**（list + history + git 身份），
 * 避免「快照读一遍、统计再读一遍」把 5 万行级工作区的 history 解析翻倍。
 */
export async function getHomeAggregate(workspaces: readonly LedgerWorkspace[]): Promise<HomeAggregate> {
  const now = new Date()
  const scopes = await readTrendScopes(workspaces)
  return {
    snapshot: computeSnapshot(scopes, now),
    closed: computeClosedSummary(scopes, now),
    trend: computeTrendPeriods(scopes, now),
  }
}

// 单路径用例直接透传 service（调用方按快 / 慢自己选，不必经过组合）：
export { getSnapshot as getBoardSnapshot } from './services/home.service.js'
export { getFilterOptions, queryClosed } from './services/history.service.js'
