import type { LedgerWorkspace } from "../types.js";
/** 默认回看月数：skill 单次最多读 13 个月文件，留一档余量。 */
export declare const HISTORY_MONTHS = 12;
export interface HistoryRecord {
    /** 结案时间 `YYYY-MM-DD HH:MM:SS`（skill 原样下发）。 */
    readonly finished: string;
    /** done / cancelled。 */
    readonly result: string;
}
/**
 * 一个工作区最近 N 个月的结案记录（已完成 / 已取消）。
 * 失败抛 {@link LedgerDataError}，由 service 的 fan-out 收进 degraded。
 */
export declare function readHistoryRecords(workspace: LedgerWorkspace, months?: number): Promise<HistoryRecord[]>;
