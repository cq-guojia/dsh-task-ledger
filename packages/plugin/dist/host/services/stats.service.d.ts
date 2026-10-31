import type { BoardHomePayload, LedgerWorkspace, StatsPayload, TrendView } from "../types.js";
/** 本周 / 上周结案总数 = 趋势最后两个桶的 done + cancelled（后者为上周）。 */
export interface WeekDone {
    readonly weekDone: number | null;
    readonly lastWeekDone: number | null;
    readonly weekCancelled: number | null;
    readonly lastWeekCancelled: number | null;
    readonly weekFrom: string;
    readonly weekTo: string;
    readonly lastWeekFrom: string;
    readonly lastWeekTo: string;
}
/**
 * 从趋势桶里取「本周 / 上周完成」。
 * 趋势为空（全挂）⇒ 两个数都给 null（界面留 —，不拿 0 充数）。
 */
export declare function weekDoneFromTrend(trend: TrendView, fallback: {
    readonly from: string;
    readonly to: string;
}, fallbackLast: {
    readonly from: string;
    readonly to: string;
}): WeekDone;
/**
 * 首屏一次拿全：8 卡 + 在办列表 + 工作区 + 身份 + 各工作区花名册 + 趋势两档（周 / 日）。
 * 四路并行（`stats` / `list` / `owners` / 趋势），各自缓存；一个工作区坏只进 degraded，其余照常。
 */
export declare function getBoardHome(workspaces: readonly LedgerWorkspace[], now?: Date): Promise<BoardHomePayload>;
export declare function getBoardStats(workspaces: readonly LedgerWorkspace[], now?: Date): Promise<StatsPayload>;
