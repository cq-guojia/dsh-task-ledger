import type { HistoryGran, HistoryListPayload, HistoryTrendPayload, LedgerWorkspace } from "../types.js";
export declare function getHistoryTrend(workspaces: readonly LedgerWorkspace[], gran?: HistoryGran): Promise<HistoryTrendPayload>;
/** 历史列表的查询：日期窗固定近一年，只剩执行人一个筛选（工作区在路由层收窄）。 */
export interface HistoryListQuery {
    /** 执行人 uuid。 */
    readonly owner?: string;
}
/**
 * 历史明细跨工作区合并：按结案时间倒序、按 `key` 去重，**一次下发整窗**。
 * 分页不在这里做 —— 前端按「整天凑够 20 条」切片，切页零请求。
 */
export declare function getHistoryList(workspaces: readonly LedgerWorkspace[], query: HistoryListQuery): Promise<HistoryListPayload>;
