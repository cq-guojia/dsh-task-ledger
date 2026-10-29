/**
 * 趋势面取数：近 8 周的「完成 / 未结 / 新增」，**整段桶序列一次拿回**（skill `stats --trend`）。
 *
 * 为什么不再拼现有方法：`history --count-only` 只给单窗口总数、且按**结案时间**过滤（新增取不到）；
 * 插件侧拉全量明细再聚合已被实测否决（20 万条 3s+、30MB 过进程边界）。
 * 桶边界（周一起算 / 本机时区）与「未结 = 该周末仍未结案」的倒推算法全在 skill，
 * 本文件只做形状校验 —— 与 stats 同一条纪律：数字真源只有 skill 一份。
 *
 * 形状不符一律抛 {@link LedgerDataError}（不拿 0 充数）。
 */
import { LedgerDataError } from "../errors.js";
import { cached, cacheKey } from "./cache.js";
import { runLedgerScript } from "./runner.js";
/** 趋势图的窗口（周数）：与首页右侧卡位一致（2026-10-17 定稿「近 8 周」）。 */
export const TREND_WEEKS = 8;
const TREND_LAST = `${String(TREND_WEEKS)}w`;
function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function num(source, key, where) {
    const value = source[key];
    if (typeof value !== "number" || !Number.isFinite(value))
        throw new LedgerDataError(where, `${where}: stats --trend 输出缺少数字字段 ${key}，格式可能已变`);
    return value;
}
function day(source, key, where) {
    const value = source[key];
    if (typeof value !== "string" || value === "")
        throw new LedgerDataError(where, `${where}: stats --trend 输出缺少日期字段 ${key}，格式可能已变`);
    return value;
}
/** 按人明细：没有这个字段（没要 --by-owner）返回 undefined；有就必须是合法的三数对象。 */
function parseOwners(raw, where) {
    if (raw === undefined)
        return undefined;
    if (!isPlainObject(raw))
        throw new LedgerDataError(where, `${where}: stats --trend 的 owners 不是对象，格式可能已变`);
    const out = {};
    for (const [uuid, cell] of Object.entries(raw)) {
        if (!isPlainObject(cell))
            throw new LedgerDataError(where, `${where}: stats --trend 里 ${uuid} 的按人明细不是对象`);
        out[uuid] = {
            added: num(cell, "added", where),
            done: num(cell, "done", where),
            open: num(cell, "open", where),
        };
    }
    return out;
}
/** 单工作区趋势（skill `stats --trend week --last 8w --by-owner`；过 1.5s 读缓存）。 */
export async function readTrend(workspace) {
    // 缓存 op 仍记 "stats"（脚本子命令就是 stats），detail 里写清是哪个窗口的趋势
    return await cached(cacheKey(workspace.id, "stats", `trend:${TREND_LAST}`), async () => {
        // 趋势自带 JSON 输出，**不能**再传 --json（skill 那边是用法错）
        const result = await runLedgerScript("stats", 
        // --by-owner：一次就把「全部」与「按人」两套数都拿回来 ⇒ 勾「只看我的」零请求
        ["--repo", workspace.path, "--trend", "week", "--last", TREND_LAST, "--by-owner"], 
        // 8 周窗口最坏要读 3 个历史文件，比单月读重：给到 20s 再判超时
        { timeoutMs: 20_000 });
        if (!result.ok)
            throw new Error(`${workspace.title}: ${result.error}`);
        return parseTrend(result.data, workspace.title);
    });
}
/** `stats --trend` → {@link WorkspaceTrend}（容器级严格：缺字段即坏，不当 0）。 */
export function parseTrend(raw, where) {
    if (!isPlainObject(raw))
        throw new LedgerDataError(where, `${where}: stats --trend 输出不是对象，格式可能已变`);
    const coverage = raw.coverage;
    if (!isPlainObject(coverage))
        throw new LedgerDataError(where, `${where}: stats --trend 输出缺 coverage，无法判断数据从哪天起有效`);
    if (!Array.isArray(raw.buckets))
        throw new LedgerDataError(where, `${where}: stats --trend 输出缺 buckets 数组，格式可能已变`);
    const buckets = raw.buckets.map((item) => {
        if (!isPlainObject(item))
            throw new LedgerDataError(where, `${where}: stats --trend 的桶不是对象`);
        const owners = parseOwners(item.owners, where);
        return {
            from: day(item, "from", where),
            to: day(item, "to", where),
            added: num(item, "added", where),
            done: num(item, "done", where),
            open: num(item, "open", where),
            ...(owners === undefined ? {} : { owners }),
        };
    });
    return {
        buckets,
        coverageFrom: day(coverage, "from", where),
        coverageTo: day(coverage, "to", where),
    };
}
