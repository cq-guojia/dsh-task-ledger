import { getFilterOptions, getHomeAggregate, queryClosed } from "./board.js";
import { invalidate } from "./repositories/cache.js";
import { getTask, readTasks, readWorklog, } from "./repositories/ledger.repository.js";
import { getSnapshot } from "./services/home.service.js";
import { claimTask, releaseTask } from "./services/ledger-write.service.js";
import { HandoffError, startCloseSession, } from "./services/session.service.js";
import { getTrend } from "./services/trend.service.js";
import { resolveWorkspaces } from "./workspace.js";
/** API 前缀（唯一真源就在这一处）。 */
const API_PREFIX = "/api/task-ledger";
function sendJson(res, status, body) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
}
/** URL query → LedgerFilter（只认白名单键；limit/months 非正数忽略）。 */
function filterFromQuery(url) {
    const filter = {};
    const str = (key) => {
        const value = url.searchParams.get(key);
        return value !== null && value !== "" ? value : null;
    };
    const int = (key) => {
        const raw = str(key);
        if (raw === null)
            return undefined;
        const value = Number.parseInt(raw, 10);
        return Number.isFinite(value) && value > 0 ? value : undefined;
    };
    const status = str("status");
    if (status !== null)
        filter.status = status;
    const owner = str("owner");
    if (owner !== null)
        filter.owner = owner;
    const category = str("category");
    if (category !== null)
        filter.category = category;
    const tag = str("tag");
    if (tag !== null)
        filter.tag = tag;
    const since = str("since");
    if (since !== null)
        filter.since = since;
    const until = str("until");
    if (until !== null)
        filter.until = until;
    const limit = int("limit");
    if (limit !== undefined)
        filter.limit = limit;
    const months = int("months");
    if (months !== undefined)
        filter.months = months;
    return filter;
}
/** 每请求重新解析工作区（registry 可能刚变；探测走 hasLedger()，微秒级，不缓存）。 */
function workspacesOf(deps) {
    return resolveWorkspaces(deps.registry.list());
}
export function registerRoutes(webServer, deps) {
    /**
     * 注册一个**读**端点：统一先看 `?fresh=1`（手动刷新 = 清缓存再算，别让用户按了刷新还看旧数）。
     * 缓存 TTL 只有 1.5s，正常浏览照样吃缓存；写端点将来自己走写路径 + `invalidate()`，不走这里。
     */
    const registerRead = (path, handler) => {
        webServer.register({
            kind: "exact",
            path: `${API_PREFIX}${path}`,
            handler: async (req, res) => {
                if (new URL(req.url ?? "/", "http://localhost").searchParams.get("fresh") === "1")
                    invalidate();
                await handler(req, res);
            },
        });
    };
    registerRead("/workspaces", (_req, res) => {
        sendJson(res, 200, { workspaces: workspacesOf(deps) });
    });
    // 首页一次拿全：在办快照 + 近 8 周趋势 + 四个自然周期计数（host 每个工作区只读一次）。
    registerRead("/board", async (_req, res) => {
        try {
            const home = await getHomeAggregate(workspacesOf(deps));
            sendJson(res, 200, {
                ...home.snapshot,
                closed: home.closed,
                trend: home.trend,
                degraded: home.degraded,
            });
        }
        catch (error) {
            sendJson(res, 500, {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });
    // ── 拆端点（2026-10-18 步骤 4a：纯加法，旧 /board 全量原样保留）──
    // 快路径：首屏。只读 progress.json + git 身份，**不碰 history** ⇒ 耗时与历史总量解耦
    // （20 万条量级实测 527ms vs 合并端点 4.4s）。
    registerRead("/board/snapshot", async (_req, res) => {
        try {
            const result = await getSnapshot(workspacesOf(deps));
            sendJson(res, 200, { ...result.snapshot, degraded: result.degraded });
        }
        catch (error) {
            sendJson(res, 500, {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });
    // 慢路径：趋势（近 8 周 + 四个自然周期）。读 history ⇒ 异步/按需拉，首屏不等它。
    registerRead("/board/trend", async (_req, res) => {
        try {
            const result = await getTrend(workspacesOf(deps));
            sendJson(res, 200, {
                closed: result.closed,
                trend: result.trend,
                degraded: result.degraded,
            });
        }
        catch (error) {
            sendJson(res, 500, {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });
    registerRead("/tasks", async (req, res) => {
        try {
            const filter = filterFromQuery(new URL(req.url ?? "/", "http://localhost"));
            const perWorkspace = await Promise.all(workspacesOf(deps).map((workspace) => readTasks(workspace, filter)));
            sendJson(res, 200, { tasks: perWorkspace.flat() });
        }
        catch (error) {
            sendJson(res, 500, {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });
    // 任务详情 + 过程文档正文（query 传 ws/id，不做路径段解析——任务号含中文和连字符）。
    registerRead("/task", async (req, res) => {
        try {
            const url = new URL(req.url ?? "/", "http://localhost");
            const workspace = workspacesOf(deps).find((item) => item.id === url.searchParams.get("ws"));
            const taskId = url.searchParams.get("id");
            if (workspace === undefined || taskId === null) {
                sendJson(res, 400, { error: "缺少 ws / id 参数" });
                return;
            }
            const task = await getTask(workspace, taskId);
            if (task === null) {
                sendJson(res, 404, { error: "任务不存在" });
                return;
            }
            sendJson(res, 200, { task, worklog: await readWorklog(workspace, task) });
        }
        catch (error) {
            sendJson(res, 500, {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });
    registerRead("/history", async (req, res) => {
        try {
            const filter = filterFromQuery(new URL(req.url ?? "/", "http://localhost"));
            const result = await queryClosed(workspacesOf(deps), filter);
            sendJson(res, 200, {
                records: result.records,
                degraded: result.degraded,
            });
        }
        catch (error) {
            sendJson(res, 500, {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });
    registerRead("/filters", async (_req, res) => {
        try {
            const result = await getFilterOptions(workspacesOf(deps));
            sendJson(res, 200, { ...result.options, degraded: result.degraded });
        }
        catch (error) {
            sendJson(res, 500, {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });
}
// ───────────────────────── 台账写端点（host 直写 · 不开会话） ─────────────────────────
/**
 * 注册认领 / 释放端点（2026-10-18 B 混合制：没有判断量的动作由 host 直跑脚本）。
 *
 * 这两条**会改磁盘上的台账文件**，所以和 `/close` 一样必须过同源守卫；
 * 成功后就地清该工作区读缓存，避免按钮点完还看到上一屏的 owner。
 */
export function registerWriteRoutes(webServer, deps) {
    const registerWrite = (path, action) => {
        webServer.register({
            kind: "exact",
            path: `${API_PREFIX}${path}`,
            handler: async (req, res) => {
                if (req.method !== "POST") {
                    sendJson(res, 405, { error: "只支持 POST" });
                    return;
                }
                if (!isTrustedRequest(req)) {
                    sendJson(res, 403, { error: "只接受同源请求" });
                    return;
                }
                let body;
                try {
                    body = await readJsonBody(req);
                }
                catch (error) {
                    const tooLarge = error instanceof Error && error.message === "body-too-large";
                    sendJson(res, tooLarge ? 413 : 400, {
                        error: tooLarge ? "请求体过大" : "请求体不是合法 JSON",
                    });
                    return;
                }
                const fields = typeof body === "object" && body !== null
                    ? body
                    : {};
                const str = (key) => typeof fields[key] === "string" ? fields[key] : "";
                const workspaceId = str("ws");
                const taskId = str("id");
                if (workspaceId === "" || taskId === "") {
                    sendJson(res, 400, { error: "缺少 ws / id 参数" });
                    return;
                }
                const workspace = workspacesOf(deps).find((item) => item.id === workspaceId);
                if (workspace === undefined) {
                    sendJson(res, 404, { error: "工作区不存在或不含台账" });
                    return;
                }
                try {
                    const notice = await action(workspace, taskId);
                    invalidate(workspace.id);
                    // notice = 写成功但同步失败的人话：必须让界面看见，不能当成功静默吞掉
                    sendJson(res, 200, notice ? { ok: true, notice } : { ok: true });
                }
                catch (error) {
                    sendJson(res, 500, {
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            },
        });
    };
    registerWrite("/claim", claimTask);
    registerWrite("/release", releaseTask);
}
// ───────────────────────── 会话交接（按钮侧 · 写类端点） ─────────────────────────
/** 写端点请求体上限：只收一小段用户留言，别让人往这塞文件。 */
const BODY_LIMIT = 64 * 1024;
/** 读请求体（宿主 handler 收原始 req，没有 body parser；超上限直接拒，不缓冲垃圾）。 */
async function readJsonBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = chunk;
        size += buffer.length;
        if (size > BODY_LIMIT)
            throw new Error("body-too-large");
        chunks.push(buffer);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (text.trim() === "")
        return {};
    return JSON.parse(text);
}
/**
 * 同源守卫（architecture 不变量 6 的落地）：浏览器 fetch 必带与 Host 同源的 `Origin`；
 * 没有 `Origin` 的（本机脚本 / Desktop IPC）只放行回环地址。
 * 读端点保持现状（只读无副作用）；**会起会话的写端点必须过这道**。
 */
function isTrustedRequest(req) {
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
    const host = typeof req.headers.host === "string" ? req.headers.host : undefined;
    if (origin === undefined) {
        const address = req.socket.remoteAddress;
        return (address === "127.0.0.1" ||
            address === "::1" ||
            address === "::ffff:127.0.0.1");
    }
    if (host === undefined)
        return false;
    try {
        return new URL(origin).host === host;
    }
    catch {
        return false;
    }
}
/**
 * 注册「结束任务」端点：`POST /close`。
 *
 * 为什么只有这一条走会话（2026-10-18 用户拍板）：认领 / 释放没有判断量，host 直写即可；
 * **结束**要带用户留言、要模型读过程文档后写真摘要 —— 只能交给会话里的 Agent 做。
 *
 * 请求体：`{ ws, id, message?, provider?, model? }`；响应：`{ sessionId, warning? }`。
 */
export function registerSessionRoutes(webServer, deps) {
    webServer.register({
        kind: "exact",
        path: `${API_PREFIX}/close`,
        handler: async (req, res) => {
            if (req.method !== "POST") {
                sendJson(res, 405, { error: "「结束任务」只支持 POST" });
                return;
            }
            if (!isTrustedRequest(req)) {
                sendJson(res, 403, { error: "只接受同源请求" });
                return;
            }
            let body;
            try {
                body = await readJsonBody(req);
            }
            catch (error) {
                const tooLarge = error instanceof Error && error.message === "body-too-large";
                sendJson(res, tooLarge ? 413 : 400, {
                    error: tooLarge ? "请求体过大" : "请求体不是合法 JSON",
                });
                return;
            }
            const fields = typeof body === "object" && body !== null
                ? body
                : {};
            const str = (key) => typeof fields[key] === "string" ? fields[key] : "";
            const workspaceId = str("ws");
            const taskId = str("id");
            if (workspaceId === "" || taskId === "") {
                sendJson(res, 400, { error: "缺少 ws / id 参数" });
                return;
            }
            const provider = str("provider");
            const model = str("model");
            if ((provider === "") !== (model === "")) {
                sendJson(res, 400, { error: "provider 与 model 必须成对给出" });
                return;
            }
            const workspace = workspacesOf(deps).find((item) => item.id === workspaceId);
            if (workspace === undefined) {
                sendJson(res, 404, { error: "工作区不存在或不含台账" });
                return;
            }
            try {
                const result = await startCloseSession({
                    agents: deps.agents,
                    presets: deps.getService("agentPresets"),
                    defaultModel: deps.getService("agentDefaultModel"),
                }, {
                    workspace,
                    taskId,
                    message: str("message"),
                    model: provider === "" ? undefined : { provider, model },
                });
                const warning = (await attachSession(deps, workspaceId, result.sessionId)) ??
                    result.warning;
                sendJson(res, 200, warning === undefined
                    ? { sessionId: result.sessionId }
                    : { sessionId: result.sessionId, warning });
            }
            catch (error) {
                if (error instanceof HandoffError) {
                    const status = error.code === "task-missing"
                        ? 404
                        : error.code === "no-agents" ||
                            error.code === "no-preset" ||
                            error.code === "no-model"
                            ? 503
                            : 500;
                    sendJson(res, status, { error: error.message, code: error.code });
                    return;
                }
                sendJson(res, 500, {
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        },
    });
}
/**
 * 会话归组（best effort）：登记进工作区 `sessionIds`，否则侧栏里找不到这个会话。
 * 缺失 / 失败都不算致命——会话本身已经建好、跳转可用，只如实回一条 warning。
 */
async function attachSession(deps, workspaceId, sessionId) {
    const entity = deps.registry.list().find((item) => item.id === workspaceId);
    if (entity === undefined || typeof entity.attachSession !== "function") {
        return "会话已建，但宿主该工作区没有 attachSession 面：会话不会出现在工作区列表里";
    }
    try {
        await entity.attachSession(sessionId);
        return undefined;
    }
    catch (error) {
        return `会话已建，但没能挂进工作区列表：${error instanceof Error ? error.message : String(error)}`;
    }
}
