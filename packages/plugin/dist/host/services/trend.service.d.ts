import { type DegradedInfo } from '../errors.js';
import type { ClosedSummary, LedgerFilter, LedgerWorkspace, TrendPeriods, TrendScope } from '../types.js';
/** 历史窗口：只读最近 13 个月的文件（2026-10-17 拍板；脚本默认读全部，窗口由插件显式传）。 */
export declare const RECENT_MONTHS = 13;
/** 趋势图桶数：近 8 周（2026-10-17 定稿）。 */
export declare const WEEKLY_WEEKS = 8;
/** 慢路径读法：单工作区 readTasks + readHistory(months) + git 身份（并行；供 settle 逐工作区调）。 */
export declare function readTrendScope(workspace: LedgerWorkspace): Promise<TrendScope>;
/**
 * 近 N 周分组桶（完成按结案时间、新增按创建时间）× 所有 / 我的（纯函数）。
 *
 * 新增必须**合并两个来源**：已结案的任务被 close 移出 progress.json，只在 history 里；
 * 在办的只在 progress.json 里。两者不相交（close 是移动），合并即全集、不会重复计。
 * remaining：某任务在「第 i 周截止时」仍未完成 ⇔ 创建 ≤ weekEnd_i 且（未结案 或 结案 > weekEnd_i）。
 */
export declare function computeClosedSummary(scopes: readonly TrendScope[], now: Date): ClosedSummary;
/** 四个自然周期（只算「全部工作区」范围；图表切换不带动卡片）——纯函数。 */
export declare function computeTrendPeriods(scopes: readonly TrendScope[], now: Date): TrendPeriods;
/** 慢路径端点：趋势 + 周期（读 history）。异步加载，首屏不等。单工作区坏 ⇒ 进 degraded。 */
export declare function getTrend(workspaces: readonly LedgerWorkspace[]): Promise<{
    closed: ClosedSummary;
    trend: TrendPeriods;
    degraded: readonly DegradedInfo[];
}>;
/** 趋势端点用的历史 filter（窗口由本模块策略决定，repository 零默认值注入）。 */
export declare function trendHistoryFilter(extra?: LedgerFilter): LedgerFilter;
