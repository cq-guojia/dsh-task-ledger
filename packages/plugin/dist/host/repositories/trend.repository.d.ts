import type { BoardTrendGran, LedgerWorkspace } from "../types.js";
/**
 * 趋势图的窗口（周数）：近半年。
 * 2026-10-30 由 8 周放宽 —— 卡片按宽度能放几周就放几周（宽屏 12~14 周），
 * 8 周不够铺满，也没得翻页；26 周 ≈ 4 屏，左右箭头一次翻 4 周。
 */
export declare const TREND_WEEKS = 26;
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
/** 单工作区趋势（skill `stats --trend <gran> --last <N> --by-owner`；过 1.5s 读缓存）。 */
export declare function readBoardTrend(workspace: LedgerWorkspace, gran: BoardTrendGran): Promise<WorkspaceTrend>;
/**
 * 历史页趋势的取数：`stats --trend <gran> --since --until`（明确窗口 ⇒ 不受
 * day 粒度 365 桶上限的 --last 换算影响）。桶的切分 / 新增口径 / 补空桶全在 skill
 * （用户 2026-10-30 定：聚合算法不自己写，host 只做跨工作区求和）。
 */
export declare function readTrendGran(workspace: LedgerWorkspace, gran: "day" | "week" | "month", since: string, until: string): Promise<WorkspaceTrend>;
/** `stats --trend` → {@link WorkspaceTrend}（容器级严格：缺字段即坏，不当 0）。 */
export declare function parseTrend(raw: unknown, where: string): WorkspaceTrend;
