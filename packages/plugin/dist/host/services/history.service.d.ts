import type { HistoryGran, HistoryListPayload, HistoryTrendPayload, LedgerWorkspace } from "../types.js";
export declare function getHistoryTrend(workspaces: readonly LedgerWorkspace[], gran?: HistoryGran): Promise<HistoryTrendPayload>;
/** 历史列表的查询：**只取选中的那个月**（2026-11-01 用户拍板：取数按月，不再取一年再前端过滤）。 */
export interface HistoryListQuery {
    /** `YYYY-MM`；缺省或格式不对 ⇒ 当月。 */
    readonly ym?: string;
    /** 执行人 uuid。 */
    readonly owner?: string;
}
/**
 * 历史明细跨工作区合并：按结案时间倒序、按 `key` 去重，整月一次下发。
 * 分页不在这里做 —— 整月都在前端内存里，滚动由前端按行号开窗（不再按天切片翻页）。
 */
export declare function getHistoryList(workspaces: readonly LedgerWorkspace[], query: HistoryListQuery): Promise<HistoryListPayload>;
