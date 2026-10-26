/**
 * 首页**慢路径**用例：近 8 周趋势 + 四个自然周期。
 * 读 history（months=RECENT_MONTHS）+ 在办 + 本机身份——首屏不等它（异步/按需拉）。
 *
 * ⚠️ 窗口必须是 13 个月而不是 2：8 周桶在月初会横跨 3 个自然月（如 10 月第 1 周回溯到 8 月），
 * `--months` 是**文件级**过滤，缩到 2 会静默漏掉 8 月结案记录、趋势少算（2026-10-18 架构评审结论）。
 */
import { type DegradedInfo } from "../errors.js";
import type { ClosedSummary, LedgerFilter, LedgerWorkspace, TrendPeriods, TrendScope } from "../types.js";
/** 历史窗口：只读最近 13 个月的文件（2026-10-17 拍板；脚本默认读全部，窗口由插件显式传）。 */
export declare const RECENT_MONTHS = 13;
/** 趋势图桶数：近 8 周（2026-10-17 定稿）。 */
export declare const WEEKLY_WEEKS = 8;
/** 慢路径读法：单工作区 readTasks + readHistory(months) + 本机身份（并行；供 settle 逐工作区调）。 */
export declare function readTrendScope(workspace: LedgerWorkspace): Promise<TrendScope & {
    warnings: readonly string[];
}>;
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
    warnings: readonly string[];
}>;
/** 趋势端点用的历史 filter（窗口由本模块策略决定，repository 零默认值注入）。 */
export declare function trendHistoryFilter(extra?: LedgerFilter): LedgerFilter;
