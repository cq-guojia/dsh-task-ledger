import type { LedgerWorkspace } from "../types.js";
/** 趋势图的窗口（周数）：与首页右侧卡位一致（2026-10-17 定稿「近 8 周」）。 */
export declare const TREND_WEEKS = 8;
/** 一个周桶；`from` / `to` 是**本机时区**的日期（含边界）。 */
export interface TrendBucket {
    readonly from: string;
    readonly to: string;
    /** 该周新建。 */
    readonly added: number;
    /** 该周结案。 */
    readonly done: number;
    /** 该周结束时仍未结案。 */
    readonly open: number;
}
/** 单工作区的趋势。 */
export interface WorkspaceTrend {
    readonly buckets: readonly TrendBucket[];
    /** 实际有数据的第一天（早于窗口起点则等于窗口起点）。 */
    readonly coverageFrom: string;
    readonly coverageTo: string;
}
/** 单工作区趋势（skill `stats --trend week --last 8w`；过 1.5s 读缓存）。 */
export declare function readTrend(workspace: LedgerWorkspace): Promise<WorkspaceTrend>;
/** `stats --trend` → {@link WorkspaceTrend}（容器级严格：缺字段即坏，不当 0）。 */
export declare function parseTrend(raw: unknown, where: string): WorkspaceTrend;
