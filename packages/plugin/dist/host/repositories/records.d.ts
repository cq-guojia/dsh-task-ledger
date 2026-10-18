import type { HistoryRecord, LedgerWorkspace, TaskRow } from '../types.js';
/** `list --json`（任务号为键的对象）→ TaskRow[]（打上 id 与 workspace）。 */
export declare function parseTaskList(raw: unknown, workspace: LedgerWorkspace): TaskRow[];
/** `history --json`（`{count, filters, records}`）→ HistoryRecord[]（打上 workspace）。 */
export declare function parseHistoryRecords(raw: unknown, workspace: LedgerWorkspace): HistoryRecord[];
