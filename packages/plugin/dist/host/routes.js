import { getHomeAggregate, getFilterOptions, queryClosed } from './board.js';
import { getTask, readTasks, readWorklog } from './repositories/ledger.repository.js';
import { resolveWorkspaces } from './workspace.js';
/** API 前缀（唯一真源就在这一处）。 */
const API_PREFIX = '/api/task-ledger';
function sendJson(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
}
/** URL query → LedgerFilter（只认白名单键；limit/months 非正数忽略）。 */
function filterFromQuery(url) {
    const filter = {};
    const str = (key) => {
        const value = url.searchParams.get(key);
        return value !== null && value !== '' ? value : null;
    };
    const int = (key) => {
        const raw = str(key);
        if (raw === null)
            return undefined;
        const value = Number.parseInt(raw, 10);
        return Number.isFinite(value) && value > 0 ? value : undefined;
    };
    const status = str('status');
    if (status !== null)
        filter.status = status;
    const owner = str('owner');
    if (owner !== null)
        filter.owner = owner;
    const category = str('category');
    if (category !== null)
        filter.category = category;
    const tag = str('tag');
    if (tag !== null)
        filter.tag = tag;
    const since = str('since');
    if (since !== null)
        filter.since = since;
    const until = str('until');
    if (until !== null)
        filter.until = until;
    const limit = int('limit');
    if (limit !== undefined)
        filter.limit = limit;
    const months = int('months');
    if (months !== undefined)
        filter.months = months;
    return filter;
}
/** 每请求重新解析工作区（registry 可能刚变；探测走 hasLedger()，微秒级，不缓存）。 */
function workspacesOf(deps) {
    return resolveWorkspaces(deps.registry.list());
}
export function registerRoutes(webServer, deps) {
    webServer.register({
        kind: 'exact',
        path: `${API_PREFIX}/workspaces`,
        handler: (_req, res) => { sendJson(res, 200, { workspaces: workspacesOf(deps) }); },
    });
    // 首页一次拿全：在办快照 + 近 8 周趋势 + 四个自然周期计数（host 每个工作区只读一次）。
    webServer.register({
        kind: 'exact',
        path: `${API_PREFIX}/board`,
        handler: async (_req, res) => {
            try {
                const home = await getHomeAggregate(workspacesOf(deps));
                sendJson(res, 200, { ...home.snapshot, closed: home.closed, trend: home.trend, degraded: home.degraded });
            }
            catch (error) {
                sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
            }
        },
    });
    webServer.register({
        kind: 'exact',
        path: `${API_PREFIX}/tasks`,
        handler: async (req, res) => {
            try {
                const filter = filterFromQuery(new URL(req.url ?? '/', 'http://localhost'));
                const perWorkspace = await Promise.all(workspacesOf(deps).map((workspace) => readTasks(workspace, filter)));
                sendJson(res, 200, { tasks: perWorkspace.flat() });
            }
            catch (error) {
                sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
            }
        },
    });
    // 任务详情 + 过程文档正文（query 传 ws/id，不做路径段解析——任务号含中文和连字符）。
    webServer.register({
        kind: 'exact',
        path: `${API_PREFIX}/task`,
        handler: async (req, res) => {
            try {
                const url = new URL(req.url ?? '/', 'http://localhost');
                const workspace = workspacesOf(deps).find((item) => item.id === url.searchParams.get('ws'));
                const taskId = url.searchParams.get('id');
                if (workspace === undefined || taskId === null) {
                    sendJson(res, 400, { error: '缺少 ws / id 参数' });
                    return;
                }
                const task = await getTask(workspace, taskId);
                if (task === null) {
                    sendJson(res, 404, { error: '任务不存在' });
                    return;
                }
                sendJson(res, 200, { task, worklog: await readWorklog(workspace, task) });
            }
            catch (error) {
                sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
            }
        },
    });
    webServer.register({
        kind: 'exact',
        path: `${API_PREFIX}/history`,
        handler: async (req, res) => {
            try {
                const filter = filterFromQuery(new URL(req.url ?? '/', 'http://localhost'));
                const result = await queryClosed(workspacesOf(deps), filter);
                sendJson(res, 200, { records: result.records, degraded: result.degraded });
            }
            catch (error) {
                sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
            }
        },
    });
    webServer.register({
        kind: 'exact',
        path: `${API_PREFIX}/filters`,
        handler: async (_req, res) => {
            try {
                const result = await getFilterOptions(workspacesOf(deps));
                sendJson(res, 200, { ...result.options, degraded: result.degraded });
            }
            catch (error) {
                sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
            }
        },
    });
    // POST /sessions（按钮会话交接）归「任务按钮与会话交接」任务——写入路径 A/B 拍板后再接。
}
