/**
 * 历史页顶部日趋势的数据源：跑 skill `history --json`，只取"结案时间 + 结果"两列。
 * 按天 / 按工作区的聚合留给 service（这一层只管拿原始记录，口径全在 skill）。
 */
import { LedgerDataError } from "../errors.js";
import { cached, cacheKey } from "./cache.js";
import { runLedgerScript } from "./runner.js";
/** 默认回看月数：skill 单次最多读 13 个月文件，留一档余量。 */
export const HISTORY_MONTHS = 12;
/**
 * 一个工作区最近 N 个月的结案记录（已完成 / 已取消）。
 * 失败抛 {@link LedgerDataError}，由 service 的 fan-out 收进 degraded。
 */
export async function readHistoryRecords(workspace, months = HISTORY_MONTHS) {
    return await cached(cacheKey(workspace.id, "history", String(months)), async () => {
        const result = await runLedgerScript("history", [
            "--repo",
            workspace.path,
            "--months",
            String(months),
            "--json",
        ]);
        if (!result.ok) {
            throw new LedgerDataError(workspace.id, `${workspace.title}: 历史读取失败：${result.error}`);
        }
        const raw = result.data.records;
        if (!Array.isArray(raw)) {
            throw new LedgerDataError(workspace.id, `${workspace.title}: history 输出缺 records 数组，格式可能已变`);
        }
        const out = [];
        for (const item of raw) {
            if (item === null || typeof item !== "object")
                continue;
            const record = item;
            if (typeof record.finished !== "string" || typeof record.result !== "string")
                continue;
            out.push({ finished: record.finished, result: record.result });
        }
        return out;
    });
}
