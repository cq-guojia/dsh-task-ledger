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
/**
 * `history --json`（`{count, filters, records, warnings}`）→ 记录 + 脚本警告（都打上 workspace）。
 *
 * ⚠️ `warnings` **必须带出去**：脚本只认十一列历史，列数不对 / 时间不合法的行会被
 * **整行跳过**（不是少几个字段）。丢掉 warnings 就是「趋势图少算一截还装作没发生」。
 */
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
        rows.push(toHistoryRecord(record, workspace));
    }
    const rawWarnings = raw.warnings;
    const warnings = Array.isArray(rawWarnings)
        ? rawWarnings.filter((item) => typeof item === "string")
        : [];
    return { records: rows, warnings };
}
/**
 * 脚本 9 列的键 → 领域字段名。
 *
 * 脚本（`history --json`）吐的是**列名**：`finished` / `title` / `worklog`；
 * 领域层用的是 `time` / `workpackage` / `log`。两个名字都得能用：
 * 不映射的话结案时间会落到 `created`、标题落到摘要、趋势图的「完成数」恒 0（`dayOf(undefined)`）。
 * 两边都给：脚本将来改回列名以外的实现也不会炸。
 */
function toHistoryRecord(source, workspace) {
    const text = (value) => typeof value === "string" && value !== "" ? value : undefined;
    return {
        ...source,
        // 脚本里的列名是真源；领域字段名作为兼容保留
        time: text(source.finished) ?? text(source.time),
        workpackage: text(source.title) ?? text(source.workpackage),
        log: text(source.worklog) ?? text(source.log),
        workspace,
    };
}
