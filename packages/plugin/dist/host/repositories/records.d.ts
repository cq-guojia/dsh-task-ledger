import type { LedgerWorkspace, TaskRow } from "../types.js";
/** `list --json`（任务号为键的对象）→ TaskRow[]（打上 id 与 workspace）。 */
export declare function parseTaskList(raw: unknown, workspace: LedgerWorkspace): TaskRow[];
