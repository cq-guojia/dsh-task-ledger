/**
 * 入口校验（纯函数）：skill 脚本 JSON → 领域对象。
 *
 * 口径：**容器级严格、元素级宽松**。
 * - 容器：`list --json` 顶层必须是 plain object（任务号为键）；
 * - 元素：是 object 就收，字段缺失一律放行（TaskRecord 全字段可选是脚本既有契约）。
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
        rows.push(toTaskRow(value, id, workspace));
    }
    return rows;
}
/**
 * 脚本的 snake_case 派生字段 → 领域 camelCase。
 *
 * `stale` / `overdue` / `backlog` / `mine` 与三个天数**都是 skill 算好的**（阈值判定、
 * 身份比较都在脚本侧），插件只搬字段，不重算一遍。缺字段一律 null / false（不编 0）。
 */
function toTaskRow(source, id, workspace) {
    const days = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
    return {
        ...source,
        id,
        workspace,
        ageDays: days(source.age_days),
        idleDays: days(source.idle_days),
        waitingDays: days(source.waiting_days),
        stale: source.stale === true,
        overdue: source.overdue === true,
        backlog: source.backlog === true,
        mine: source.mine === true,
    };
}
