/**
 * 首页**组合入口**（`/board` 兼容全量端点用）：一次读全（tasks + history + git 身份），
 * 喂快 / 慢两条纯计算——**读一次算两样，不重复 IO**。
 *
 * 拆端点后（host-data-plane §五 A）首屏走 `services/home.service.ts::getSnapshot()`（不碰 history），
 * 本组合归「兼容期全量 `/board`」；新端点在 routes 层直接调 service，不过本文件。
 */
import { settleWorkspaces } from "./errors.js";
import { computeSnapshot } from "./services/home.service.js";
import { computeClosedSummary, computeTrendPeriods, readTrendScope, } from "./services/trend.service.js";
/**
 * 首页一次拿全：在办快照（含停滞 / 天数 / 身份）+ 近 8 周趋势（完成 / 新增 × 所有 / 我的）
 * + 四个自然周期计数。**每个工作区只读一次**（list + history + git 身份），
 * 避免「快照读一遍、统计再读一遍」把 5 万行级工作区的 history 解析翻倍。
 * 单工作区坏 ⇒ 进 degraded（其余照常）；全坏 ⇒ 抛（路由转 500 + 人话）。
 */
export async function getHomeAggregate(workspaces) {
    const now = new Date();
    const { data: scopes, degraded } = await settleWorkspaces(workspaces, "history", readTrendScope, (rows) => rows);
    return {
        snapshot: computeSnapshot(scopes, now),
        closed: computeClosedSummary(scopes, now),
        trend: computeTrendPeriods(scopes, now),
        degraded,
    };
}
export { getFilterOptions, queryClosed } from "./services/history.service.js";
// 单路径用例直接透传 service（调用方按快 / 慢自己选，不必经过组合）：
export { getSnapshot as getBoardSnapshot } from "./services/home.service.js";
