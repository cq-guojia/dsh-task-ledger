/**
 * 首页**快路径**用例：在办快照 + 统计卡。
 * 只读 progress.json（list）+ git 身份，**不碰 history**——首屏耗时与历史总量解耦
 * （20 万条量级实测：527ms vs 合并端点 4.4s，见 docs/design/host-data-plane.md §四）。
 * 慢路径（趋势）在 ./trend.service.ts；组合入口（/board 兼容全量）在 ../board.ts。
 */
import { readTasks } from '../repositories/ledger.repository.js';
import { getCurrentIdentity } from '../repositories/identity.repository.js';
import { settleWorkspaces } from '../errors.js';
import { daysSince } from './dates.js';
/** 停滞阈值：进行中且 updated 至今满这么多天没更新（2026-10-19 拍板，显示级）。 */
export const STALE_DAYS = 3;
/** 超期阈值：进行中且 started 至今满这么多天还没做完——中途更新不影响（2026-10-19 拍板 7 → 14 天）。 */
export const OVERDUE_DAYS = 14;
/** 积压阈值：待认领且 created 至今满这么多天还没人接（2026-10-19 拍板）。 */
export const BACKLOG_DAYS = 30;
/** 快路径读法：单工作区 readTasks + git 身份（并行；供 settle 逐工作区调）。 */
export async function readTaskScope(workspace) {
    const [tasks, identity] = await Promise.all([readTasks(workspace), getCurrentIdentity(workspace)]);
    return { workspace, tasks, identity };
}
/** 在办行加工 + 六个统计面 + identities（纯函数；`now` 显式传入）。 */
export function computeSnapshot(scopes, now) {
    const withMeta = scopes.flatMap((scope) => scope.tasks.map((task) => {
        // blocked 只是旧数据（新任务不可能再有）；读侧一律当进行中
        const working = task.status === 'doing' || task.status === 'blocked';
        const ageDays = working ? daysSince(task.started ?? task.created, now) : null;
        // 停滞看「最后更新」，超期看「接任务至今」，积压看「创建至今还没人认领」——三个不同的问题，互不覆盖
        const idleDays = working ? daysSince(task.updated ?? task.started ?? task.created, now) : null;
        const idleOpen = task.status === 'open' ? daysSince(task.created, now) : null;
        return {
            ...task,
            ageDays,
            // 两个天数只供悬停提示说人话（「已进行 N 天」「已停滞 N 天」「已等待 N 天」），不参与判定
            idleDays,
            waitingDays: idleOpen,
            stale: idleDays !== null && idleDays >= STALE_DAYS,
            overdue: ageDays !== null && ageDays >= OVERDUE_DAYS,
            backlog: idleOpen !== null && idleOpen >= BACKLOG_DAYS,
        };
    }));
    const openTasks = withMeta.filter((task) => task.status === 'open');
    const myActive = scopes.reduce((sum, scope) => sum + scope.tasks.filter((task) => task.owner === scope.identity && (task.status === 'doing' || task.status === 'blocked')).length, 0);
    const identities = {};
    for (const scope of scopes)
        identities[scope.workspace.id] = scope.identity;
    const myOverdue = withMeta.filter((task) => task.overdue && task.owner != null && task.owner === identities[task.workspace.id]).length;
    const stats = {
        myActive,
        myOverdue,
        open: openTasks.length,
        doing: withMeta.filter((task) => task.status === 'doing' || task.status === 'blocked').length,
        overdue: withMeta.filter((task) => task.overdue).length,
        stale: withMeta.filter((task) => task.stale).length,
        backlog: withMeta.filter((task) => task.backlog).length,
        staleDays: STALE_DAYS,
        overdueDays: OVERDUE_DAYS,
        backlogDays: BACKLOG_DAYS,
        oldestOpenDays: openTasks.length === 0
            ? null
            : openTasks.reduce((max, task) => Math.max(max, daysSince(task.created, now) ?? 0), 0),
    };
    return { at: now.toISOString(), workspaces: scopes.map((scope) => scope.workspace), tasks: withMeta, stats, identities };
}
/** 快路径端点：在办快照（统计卡 + 身份 + 行加工）。单工作区坏 ⇒ 进 degraded，其余照常。 */
export async function getSnapshot(workspaces) {
    const { data: scopes, degraded } = await settleWorkspaces(workspaces, 'list', readTaskScope, (rows) => rows);
    return { snapshot: computeSnapshot(scopes, new Date()), degraded };
}
