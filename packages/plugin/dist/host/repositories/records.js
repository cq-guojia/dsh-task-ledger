/**
 * 入口校验（纯函数）：skill 脚本 JSON → 领域对象。
 *
 * 口径：**容器级严格、元素级宽松**。
 * - 容器：`list --json` 顶层必须是 plain object（任务号为键）；`history --json` 的 `records`
 *   必须存在且为数组（现状 `records ?? []` 的容忍在脚本回归时会静默产出空历史 = 撒谎）；
 * - 元素：是 object 就收，字段缺失一律放行（TaskRecord 全字段可选是脚本既有契约，
 *   旧 8 列 history 不因此被误杀）。
 * 失败抛 {@link LedgerDataError}——由 service 层捕获进 degraded，不静默。
 */
import { LedgerDataError } from "../errors.js";
function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
/** `list --json`（任务号为键的对象）→ TaskRow[]（打上 id 与 workspace）。 */
export function parseTaskList(raw, workspace) {
    if (!isPlainObject(raw)) {
        throw new LedgerDataError(workspace.id, `${workspace.title}: 台账 list 输出不是「任务号为键的对象」，拒绝当成空列表`);
    }
    const rows = [];
    for (const [id, value] of Object.entries(raw)) {
        if (!isPlainObject(value)) {
            throw new LedgerDataError(workspace.id, `${workspace.title}: 任务 ${id} 不是对象，台账格式可能已变`);
        }
        if (id === "") {
            throw new LedgerDataError(workspace.id, `${workspace.title}: 台账存在空任务号，格式可能已变`);
        }
        rows.push({ ...value, id, workspace });
    }
    return rows;
}
/** `history --json`（`{count, filters, records}`）→ HistoryRecord[]（打上 workspace）。 */
export function parseHistoryRecords(raw, workspace) {
    if (!isPlainObject(raw)) {
        throw new LedgerDataError(workspace.id, `${workspace.title}: 台账 history 输出不是对象，拒绝当成空历史`);
    }
    const records = raw.records;
    if (!Array.isArray(records)) {
        throw new LedgerDataError(workspace.id, `${workspace.title}: 台账 history 输出缺 records 数组，格式可能已变`);
    }
    const rows = [];
    for (const record of records) {
        if (!isPlainObject(record))
            continue; // 元素级宽松：坏行跳过，不整板炸
        rows.push({ ...record, workspace });
    }
    return rows;
}
