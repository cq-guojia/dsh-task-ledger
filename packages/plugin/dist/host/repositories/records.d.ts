import type { HistoryRecord, LedgerWorkspace, TaskRow } from "../types.js";
/** `list --json`（任务号为键的对象）→ TaskRow[]（打上 id 与 workspace）。 */
export declare function parseTaskList(raw: unknown, workspace: LedgerWorkspace): TaskRow[];
/**
 * `history --json`（`{count, filters, records, warnings}`）→ 记录 + 脚本警告（都打上 workspace）。
 *
 * ⚠️ `warnings` **必须带出去**：脚本只认十一列历史，列数不对 / 时间不合法的行会被
 * **整行跳过**（不是少几个字段）。丢掉 warnings 就是「趋势图少算一截还装作没发生」。
 */
export declare function parseHistoryRecords(raw: unknown, workspace: LedgerWorkspace): {
    records: HistoryRecord[];
    warnings: string[];
};
