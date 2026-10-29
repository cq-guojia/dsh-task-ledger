/**
 * 8 个统计卡的用例（首屏唯一端点 `/board/stats`）。
 *
 * 数字真源全在 skill：每工作区跑 `stats --json`（在办各面），本文件只做跨工作区求和与降级归集。
 * 「本周 / 上周完成」不再单独查 history —— 直接取趋势桶（`stats --trend week`）的最后两个，
 * 少两次脚本调用，口径也跟图表一致（2026-10-29）。
 */
import { settleWorkspaces } from "../errors.js";
import { getCurrentIdentity } from "../repositories/identity.repository.js";
import { getBoardTrend } from "./trend.service.js";
import { readOwners, readTasks } from "../repositories/ledger.repository.js";
import { readStats } from "../repositories/stats.repository.js";
import { weekWindow } from "./dates.js";
/**
 * 从趋势桶里取「本周 / 上周完成」。
 * 趋势为空（全挂）⇒ 两个数都给 null（界面留 —，不拿 0 充数）。
 */
export function weekDoneFromTrend(trend, fallback, fallbackLast) {
    const buckets = trend.buckets;
    const thisWeek = buckets[buckets.length - 1];
    const lastWeek = buckets[buckets.length - 2];
    return {
        weekDone: thisWeek === undefined ? null : thisWeek.done + thisWeek.cancelled,
        lastWeekDone: lastWeek === undefined ? null : lastWeek.done + lastWeek.cancelled,
        weekCancelled: thisWeek === undefined ? null : thisWeek.cancelled,
        lastWeekCancelled: lastWeek === undefined ? null : lastWeek.cancelled,
        weekFrom: thisWeek?.from ?? fallback.from,
        weekTo: thisWeek?.to ?? fallback.to,
        lastWeekFrom: lastWeek?.from ?? fallbackLast.from,
        lastWeekTo: lastWeek?.to ?? fallbackLast.to,
    };
}
/** 单工作区在办列表 + 本机身份（都经 skill：`list --json` / `whoami --json`）。 */
async function readTaskScope(workspace) {
    const [tasks, identity] = await Promise.all([
        readTasks(workspace),
        getCurrentIdentity(workspace),
    ]);
    return { workspace, tasks, identity };
}
/** 降级条目去重：stats 与 list 都挂时同一个工作区会报两遍。 */
function dedupe(rows) {
    const seen = new Set();
    return rows.filter((row) => {
        const key = `${row.workspaceId}\u0001${row.code}\u0001${row.message}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
/**
 * 首屏一次拿全：8 卡 + 在办列表 + 工作区 + 身份 + 各工作区花名册。
 * 三条读并行（`stats` / `list` / `owners`），各自缓存；一个工作区坏只进 degraded，其余照常。
 */
export async function getBoardHome(workspaces, now = new Date()) {
    const [statsPayload, taskScope, ownerScope, trend] = await Promise.all([
        getBoardStats(workspaces, now),
        settleWorkspaces(workspaces, "list", readTaskScope, (rows) => rows),
        settleWorkspaces(workspaces, "owners", readOwners, (rows) => rows),
        getBoardTrend(workspaces),
    ]);
    const identities = {};
    const tasks = [];
    for (const scope of taskScope.data) {
        identities[scope.workspace.id] = scope.identity;
        tasks.push(...scope.tasks);
    }
    const weeks = weekDoneFromTrend(trend, weekWindow(0, now), weekWindow(-1, now));
    return {
        ...statsPayload,
        stats: { ...statsPayload.stats, ...weeks },
        trend: { buckets: trend.buckets, coverageFrom: trend.coverageFrom, coverageTo: trend.coverageTo },
        workspaces,
        tasks,
        identities,
        workspaceOwners: ownerScope.data,
        degraded: dedupe([
            ...statsPayload.degraded,
            ...taskScope.degraded,
            ...ownerScope.degraded,
            ...trend.degraded,
        ]),
    };
}
export async function getBoardStats(workspaces, now = new Date()) {
    const thisWeek = weekWindow(0, now);
    const lastWeek = weekWindow(-1, now);
    const perWorkspace = await settleWorkspaces(workspaces, "list", readStats, (rows) => rows);
    const sum = (pick) => perWorkspace.data.reduce((total, stats) => total + pick(stats), 0);
    // 阈值由 skill 回显；没传过覆盖值 ⇒ 各工作区一致，取首个即可。
    // 一个工作区都没有时给 0——那时所有计数也是 0，阈值文案没有实际含义。
    const first = perWorkspace.data[0];
    const stats = {
        myActive: sum((item) => item.myDoing),
        myOverdue: sum((item) => item.myOverdue),
        myStale: sum((item) => item.myStale),
        open: sum((item) => item.open),
        doing: sum((item) => item.doing),
        overdue: sum((item) => item.overdue),
        stale: sum((item) => item.stale),
        backlog: sum((item) => item.backlog),
        staleDays: first?.staleDays ?? 0,
        overdueDays: first?.overdueDays ?? 0,
        backlogDays: first?.backlogDays ?? 0,
        oldestOpenDays: perWorkspace.data.length === 0
            ? null
            : perWorkspace.data.reduce((max, item) => item.oldestOpenDays === null
                ? max
                : max === null
                    ? item.oldestOpenDays
                    : Math.max(max, item.oldestOpenDays), null),
        // 这四个数由 getBoardHome 从趋势桶回填（趋势全挂时保持 null ⇒ 界面留 —）
        weekDone: null,
        lastWeekDone: null,
        weekCancelled: null,
        lastWeekCancelled: null,
        weekFrom: thisWeek.from,
        weekTo: thisWeek.to,
        lastWeekFrom: lastWeek.from,
        lastWeekTo: lastWeek.to,
    };
    return {
        at: now.toISOString(),
        stats,
        degraded: perWorkspace.degraded,
    };
}
