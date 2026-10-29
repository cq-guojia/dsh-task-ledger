import type { LedgerWorkspace } from "../types.js";
/** 趋势图的窗口（周数）：与首页右侧卡位一致（2026-10-17 定稿「近 8 周」）。 */
export declare const TREND_WEEKS = 8;
/** 一个人在一个周桶里的三个数（skill 口径：新增按 creator、完成 / 未结按 owner）。 */
export interface OwnerCounts {
    readonly added: number;
    readonly done: number;
    readonly cancelled: number;
    readonly open: number;
}
/** 一个周桶；`from` / `to` 是**本机时区**的日期（含边界）。 */
export interface TrendBucket {
    readonly from: string;
    readonly to: string;
    /** 该周新建。 */
    readonly added: number;
    /** 该周结案（全部人合计）。 */
    readonly done: number;
    /** 该周取消（全部人合计）。 */
    readonly cancelled: number;
    /** 该周结束时仍未结案（全部人合计，含窗口前遗留）。 */
    readonly open: number;
    /** uuid → 按人明细（「只看我的」用；没要 / 该人该周没数据则没有这个 key）。 */
    readonly owners?: Readonly<Record<string, OwnerCounts>>;
}
/** 单工作区的趋势。 */
export interface WorkspaceTrend {
    readonly buckets: readonly TrendBucket[];
    /** 实际有数据的第一天（早于窗口起点则等于窗口起点）。 */
    readonly coverageFrom: string;
    readonly coverageTo: string;
}
/** 单工作区趋势（skill `stats --trend week --last 8w --by-owner`；过 1.5s 读缓存）。 */
export declare function readTrend(workspace: LedgerWorkspace): Promise<WorkspaceTrend>;
/** `stats --trend` → {@link WorkspaceTrend}（容器级严格：缺字段即坏，不当 0）。 */
export declare function parseTrend(raw: unknown, where: string): WorkspaceTrend;
