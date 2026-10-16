import { spawn } from 'node:child_process';
import { readHistory, readTasks } from './ledger-read.js';
import { runLedgerScript } from './script.js';
/** 历史窗口：只读最近 13 个月的文件（2026-10-17 拍板；脚本默认读全部，窗口由插件显式传）。 */
const RECENT_MONTHS = 13;
/** 已结案列表默认分页大小（「加载更多」= 调用方加大 limit 重取）。 */
export const DEFAULT_HISTORY_LIMIT = 500;
/** 完成类统计的封顶值：超出显示「1万+」（2026-10-17 拍板，显示级封顶，精确值走搜索）。 */
const COUNT_CAP = 10_000;
/** 周一所在日期（YYYY-MM-DD）。skill 的 --since 只给日期按当天 00:00 解析。 */
function mondayDateString(now) {
    const date = new Date(now);
    const mondayOffset = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - mondayOffset);
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
/**
 * 当前 git 身份（cwd = 该工作区）——「我的待办」判定源。
 * 与 agent 在会话里跑 skill 时的取值环境一致；取不到回 null（非 git 目录 / 没配身份），
 * 该工作区的「我的」统计按 0 计（不谎报）。
 */
export function getCurrentIdentity(workspace) {
    return new Promise((resolve) => {
        const child = spawn('git', ['config', 'user.name'], { cwd: workspace.path, stdio: ['ignore', 'pipe', 'ignore'] });
        let stdout = '';
        child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        child.on('error', () => { resolve(null); });
        child.on('close', (code) => {
            const name = stdout.trim();
            resolve(code === 0 && name !== '' ? name : null);
        });
    });
}
/**
 * 首页快照（在办路径）：并发跑全部工作区的 list + 身份解析。
 * 与历史量彻底无关——progress.json 只装没结案的任务（close 会移走），永远有界。
 */
export async function getBoardSnapshot(workspaces) {
    const perWorkspace = await Promise.all(workspaces.map(async (workspace) => ({
        workspace,
        tasks: await readTasks(workspace),
        identity: await getCurrentIdentity(workspace),
    })));
    const tasks = perWorkspace.flatMap((entry) => entry.tasks);
    const myActive = perWorkspace.reduce((sum, entry) => sum + entry.tasks.filter((task) => task.owner === entry.identity && (task.status === 'doing' || task.status === 'blocked')).length, 0);
    const open = tasks.filter((task) => task.status === 'open').length;
    return { at: new Date().toISOString(), workspaces, tasks, stats: { myActive, open } };
}
/**
 * 完成类统计（数行封顶，与总量脱钩）：本周 = 最近 2 个月文件 + 创建时间落在本周；
 * 近一年 = 最近 13 个月文件行数。任一工作区失败即抛（聚合数部分失败 = 错数，不兜）。
 */
export async function getClosedCounts(workspaces) {
    const monday = mondayDateString(new Date());
    const perWorkspace = await Promise.all(workspaces.map(async (workspace) => {
        const [week, year] = await Promise.all([
            runLedgerScript('history', ['--repo', workspace.path, '--json', '--count-only', '--months', '2', '--since', monday]),
            runLedgerScript('history', ['--repo', workspace.path, '--json', '--count-only', '--months', String(RECENT_MONTHS)]),
        ]);
        if (!week.ok)
            throw new Error(`${workspace.title}: ${week.error}`);
        if (!year.ok)
            throw new Error(`${workspace.title}: ${year.error}`);
        return { week: week.data.count ?? 0, year: year.data.count ?? 0, yearCapped: year.data.capped === true };
    }));
    const yearCapped = perWorkspace.some((entry) => entry.yearCapped);
    return {
        weekDone: perWorkspace.reduce((sum, entry) => sum + entry.week, 0),
        yearDone: yearCapped ? COUNT_CAP : perWorkspace.reduce((sum, entry) => sum + entry.year, 0),
        yearCapped,
    };
}
/**
 * 已结案列表：默认近 13 个月 + limit 500，跨工作区合并后按创建时间倒序。
 * shortcut: 分页用「加大 limit 重取」的笨办法（skill 脚本无 offset）；
 * 单工作区内 limit 已生效，合并边界的全局精确排序暂不保证（500 条一页无感）。
 * 要全量老数据：调用方显式传 months: undefined（不拼 --months，脚本读全部，按秒计）。
 */
export async function queryClosed(workspaces, filter = {}) {
    const windowed = { months: RECENT_MONTHS, ...filter };
    const perWorkspace = await Promise.all(workspaces.map((workspace) => readHistory(workspace, windowed)));
    return perWorkspace.flat()
        .sort((a, b) => String(b.created ?? b.time ?? '').localeCompare(String(a.created ?? a.time ?? '')))
        .slice(0, filter.limit ?? DEFAULT_HISTORY_LIMIT);
}
/**
 * 筛选项候选：在办（全量）+ 近 13 个月历史的去重值（owner / category / tag）。
 * 按需调用（/filters 路由），非首屏——历史侧在极端量级下是百毫秒级。
 */
export async function getFilterOptions(workspaces) {
    const perWorkspace = await Promise.all(workspaces.map(async (workspace) => ({
        tasks: await readTasks(workspace),
        history: await readHistory(workspace, { months: RECENT_MONTHS }),
    })));
    const owners = new Set();
    const categories = new Set();
    const tags = new Set();
    const addTask = (task) => {
        if (task.owner !== undefined && task.owner !== null && task.owner !== '')
            owners.add(task.owner);
        if (task.creator !== undefined && task.creator !== null && task.creator !== '')
            owners.add(task.creator);
        if (task.category !== undefined && task.category !== null && task.category !== '')
            categories.add(task.category);
        for (const tag of task.tags ?? [])
            tags.add(tag);
    };
    const addRecord = (record) => {
        if (record.owner !== undefined && record.owner !== '')
            owners.add(record.owner);
        if (record.category !== undefined && record.category !== null && record.category !== '')
            categories.add(record.category);
        for (const tag of record.tags ?? [])
            tags.add(tag);
    };
    for (const entry of perWorkspace) {
        for (const task of entry.tasks)
            addTask(task);
        for (const record of entry.history)
            addRecord(record);
    }
    const sorted = (values) => [...values].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
    return { owners: sorted(owners), categories: sorted(categories), tags: sorted(tags) };
}
