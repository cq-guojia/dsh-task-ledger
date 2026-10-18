import type { HomeAggregate, LedgerWorkspace } from './types.js';
/**
 * 首页一次拿全：在办快照（含停滞 / 天数 / 身份）+ 近 8 周趋势（完成 / 新增 × 所有 / 我的）
 * + 四个自然周期计数。**每个工作区只读一次**（list + history + git 身份），
 * 避免「快照读一遍、统计再读一遍」把 5 万行级工作区的 history 解析翻倍。
 */
export declare function getHomeAggregate(workspaces: readonly LedgerWorkspace[]): Promise<HomeAggregate>;
export { getSnapshot as getBoardSnapshot } from './services/home.service.js';
export { getFilterOptions, queryClosed } from './services/history.service.js';
