/**
 * 历史页顶部日趋势：把各工作区的结案记录按 **天 + 工作区** 聚合。
 * 只返回"有记录的天"（中间空白天由前端补空并做首尾裁剪），并带上工作区色表。
 */
import { settleWorkspaces } from "../errors.js";
import { HISTORY_MONTHS, readHistoryRecords, } from "../repositories/history.repository.js";
import { readTrendByDay } from "../repositories/trend.repository.js";
export async function getHistoryTrend(workspaces, months = HISTORY_MONTHS) {
    const settled = await settleWorkspaces(workspaces, "history", async (workspace) => ({
        workspace,
        records: await readHistoryRecords(workspace, months),
    }), (rows) => rows);
    const byDate = new Map();
    for (const { workspace, records } of settled.data) {
        for (const record of records) {
            const date = record.finished.slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
                continue;
            let cell = byDate.get(date);
            if (cell === undefined) {
                cell = { done: 0, cancelled: 0, byWorkspace: {} };
                byDate.set(date, cell);
            }
            const cancelled = record.result === "cancelled";
            if (cancelled)
                cell.cancelled += 1;
            else
                cell.done += 1;
            let ws = cell.byWorkspace[workspace.id];
            if (ws === undefined) {
                ws = { done: 0, cancelled: 0 };
                cell.byWorkspace[workspace.id] = ws;
            }
            if (cancelled)
                ws.cancelled += 1;
            else
                ws.done += 1;
        }
    }
    const days = [...byDate.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([date, cell]) => ({
        date,
        done: cell.done,
        cancelled: cell.cancelled,
        byWorkspace: cell.byWorkspace,
    }));
    const from = days[0]?.date ?? "";
    const to = days[days.length - 1]?.date ?? "";
    // 新增量曲线（叠加在柱图上的折线，**一条线、不分工作区**）：与柱图同窗口逐日取
    // `stats --trend day`，跨工作区求和。曲线只是柱图的附加物 —— 读挂（含 day 粒度
    // 365 桶上限这类 skill 拒算）就整条不下发、不进 degraded，柱图照常。
    let addedByDay;
    if (from !== "" && to !== "") {
        const settledAdded = await Promise.allSettled(workspaces.map((workspace) => readTrendByDay(workspace, from, to)));
        const merged = {};
        let any = false;
        for (const result of settledAdded) {
            if (result.status !== "fulfilled")
                continue;
            any = true;
            for (const bucket of result.value.buckets) {
                // day 粒度桶 from === to，按天归并即逐日新增
                merged[bucket.from] = (merged[bucket.from] ?? 0) + bucket.added;
            }
        }
        if (any)
            addedByDay = merged;
    }
    return {
        workspaces: workspaces.map((workspace) => ({
            id: workspace.id,
            title: workspace.title,
        })),
        days,
        from,
        to,
        ...(addedByDay === undefined ? {} : { addedByDay }),
        degraded: settled.degraded,
    };
}
