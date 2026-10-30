/**
 * 历史页顶部趋势：**数字真源是 skill `stats --trend <gran>`**，本文件只做两件事 ——
 * ① 每工作区拉「当前粒度 + day」两套桶（day 服务 4 数显与窗口锚点）；
 * ② 跨工作区**求和**。周期切分、新增口径、补空桶全在 skill
 * （用户 2026-10-30 定：聚合算法不自己写，本地只加总，免得与核心口径漂移）。
 */
import { settleWorkspaces } from "../errors.js";
import { readTrendGran } from "../repositories/trend.repository.js";
function pad2(n) {
    return String(n).padStart(2, "0");
}
function ymdOf(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
function addDays(value, delta) {
    const date = new Date(`${value}T00:00:00`);
    date.setDate(date.getDate() + delta);
    return ymdOf(date);
}
/** 本周一（周一为一周之始，与 skill 同口径）。 */
function mondayOf(value) {
    const date = new Date(`${value}T00:00:00`);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return ymdOf(date);
}
function monthStart(value) {
    return `${value.slice(0, 7)}-01`;
}
function prevMonthStart(value) {
    const date = new Date(`${monthStart(value)}T00:00:00`);
    date.setMonth(date.getMonth() - 1);
    return ymdOf(date);
}
export async function getHistoryTrend(workspaces, gran = "day") {
    const today = ymdOf(new Date());
    // 窗口 = 最近 365 个自然日：day 粒度恰好顶满 skill 的 365 桶上限又不越线；周 / 月桶更少
    const since = addDays(today, -364);
    const settled = await settleWorkspaces(workspaces, "history", async (workspace) => {
        // gran = day 时两套是同一份（同 cacheKey）⇒ 共用一个 Promise，不跑两遍脚本
        const granRun = readTrendGran(workspace, gran, since, today);
        const dayRun = gran === "day" ? granRun : readTrendGran(workspace, "day", since, today);
        const [granTrend, dayTrend] = await Promise.all([granRun, dayRun]);
        return { workspace, granTrend, dayTrend };
    }, (rows) => rows);
    // ① 柱 / 曲线：当前粒度，按桶起始日跨工作区求和 —— 本地唯一的「算法」就是加法
    const merged = new Map();
    for (const { workspace, granTrend } of settled.data) {
        for (const bucket of granTrend.buckets) {
            const acc = merged.get(bucket.from) ?? {
                to: bucket.to,
                done: 0,
                cancelled: 0,
                added: 0,
                byWorkspace: {},
            };
            acc.to = bucket.to;
            acc.done += bucket.done;
            acc.cancelled += bucket.cancelled;
            acc.added += bucket.added;
            const ws = acc.byWorkspace[workspace.id] ?? { done: 0, cancelled: 0 };
            ws.done += bucket.done;
            ws.cancelled += bucket.cancelled;
            acc.byWorkspace[workspace.id] = ws;
            merged.set(bucket.from, acc);
        }
    }
    // ② day 桶：4 数显求和
    const dayMap = new Map();
    for (const { dayTrend } of settled.data) {
        for (const bucket of dayTrend.buckets) {
            const acc = dayMap.get(bucket.from) ?? { done: 0, cancelled: 0, added: 0 };
            acc.done += bucket.done;
            acc.cancelled += bucket.cancelled;
            acc.added += bucket.added;
            dayMap.set(bucket.from, acc);
        }
    }
    const sumIn = (rangeFrom, rangeTo) => {
        let sum = 0;
        for (const [key, cell] of dayMap) {
            if (key >= rangeFrom && key <= rangeTo)
                sum += cell.done + cell.cancelled;
        }
        return sum;
    };
    const totals = {
        today: sumIn(today, today),
        week: sumIn(mondayOf(today), today),
        month: sumIn(monthStart(today), today),
        lastMonth: sumIn(prevMonthStart(today), addDays(monthStart(today), -1)),
    };
    // 整段窗口直接下发（不按有数据范围裁剪）：翻页边界交给前端按 key 补空槽，
    // 免得「正好显示完就不能翻、中间空一大段反而能翻」这种判断（用户 2026-10-30）
    const buckets = [...merged.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([key, cell]) => ({
        key,
        to: cell.to,
        done: cell.done,
        cancelled: cell.cancelled,
        added: cell.added,
        byWorkspace: cell.byWorkspace,
    }));
    return {
        workspaces: workspaces.map((workspace) => ({
            id: workspace.id,
            title: workspace.title,
        })),
        buckets,
        totals,
        degraded: settled.degraded,
    };
}
