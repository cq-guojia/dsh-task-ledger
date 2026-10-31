import type { HistoryRecord, LedgerWorkspace } from "../types.js";
/**
 * 历史明细（skill `history --json`）：按**结案时间**过滤，新→旧。
 *
 * 分页口径：skill 没有 offset，只有时间窗 + `--limit` ⇒ 下一页用「本页最后一条的
 * `finished`」当新的 `--until`（含边界，跨页会重叠几条，由上层按 key 去重）。
 */
export interface HistoryQueryOptions {
    /** `YYYY-MM-DD HH:MM:SS`（与存盘同形的串，脚本直接字符串比较）。 */
    readonly since: string;
    readonly until: string;
    readonly limit: number;
    /** 执行人 uuid；不给 = 不限。 */
    readonly owner?: string;
}
export declare function readHistory(workspace: LedgerWorkspace, options: HistoryQueryOptions): Promise<{
    records: HistoryRecord[];
    capped: boolean;
}>;
