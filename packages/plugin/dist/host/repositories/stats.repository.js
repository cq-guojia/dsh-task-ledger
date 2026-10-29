/**
 * 统计面取数：8 个卡片的数字**全部**来自 skill 方法，插件不自己数。
 *
 * - 在办各面（待认领 / 进行中 / 积压 / 逾期 / 停滞 / 我的）→ `stats --json`；
 *   阈值、mine 判定、最老待认领天数都由 skill 算好回显。
 * - 本周 / 上周完成 → **不再单独查 history**（2026-10-29）：由趋势（`stats --trend week`）
 *   的最后两个桶直接给出，少两次脚本调用、口径也跟图表完全一致。
 *
 * 形状不符一律抛 {@link LedgerDataError}（不拿 0 充数）。
 */
import { LedgerDataError } from "../errors.js";
import { cached, cacheKey } from "./cache.js";
import { runLedgerScript } from "./runner.js";
function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function num(source, key, where) {
    const value = source[key];
    if (typeof value !== "number" || !Number.isFinite(value))
        throw new LedgerDataError(where, `${where}: stats 输出缺少数字字段 ${key}，格式可能已变`);
    return value;
}
/** 单工作区在办统计（skill `stats --json`；过 1.5s 读缓存，同屏多端点复用）。 */
export async function readStats(workspace) {
    return await cached(cacheKey(workspace.id, "stats", ""), async () => {
        const result = await runLedgerScript("stats", [
            "--repo",
            workspace.path,
            "--json",
        ]);
        if (!result.ok)
            throw new Error(`${workspace.title}: ${result.error}`);
        return parseStats(result.data, workspace.title);
    });
}
/** `stats --json` → {@link WorkspaceStats}（容器级严格：缺字段即坏，不当 0）。 */
export function parseStats(raw, where) {
    if (!isPlainObject(raw))
        throw new LedgerDataError(where, `${where}: stats 输出不是对象，格式可能已变`);
    const thresholds = raw.thresholds;
    if (!isPlainObject(thresholds))
        throw new LedgerDataError(where, `${where}: stats 输出缺 thresholds，阈值不许由插件硬编码`);
    const oldest = raw.oldest_open_days;
    if (oldest !== null && typeof oldest !== "number")
        throw new LedgerDataError(where, `${where}: stats 的 oldest_open_days 既不是数字也不是 null`);
    return {
        total: num(raw, "total", where),
        open: num(raw, "open", where),
        doing: num(raw, "doing", where),
        stale: num(raw, "stale", where),
        overdue: num(raw, "overdue", where),
        backlog: num(raw, "backlog", where),
        mine: num(raw, "mine", where),
        myDoing: num(raw, "my_doing", where),
        myStale: num(raw, "my_stale", where),
        myOverdue: num(raw, "my_overdue", where),
        oldestOpenDays: oldest,
        staleDays: num(thresholds, "stale_days", where),
        overdueDays: num(thresholds, "overdue_days", where),
        backlogDays: num(thresholds, "backlog_days", where),
    };
}
