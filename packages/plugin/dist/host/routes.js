import { gzipSync } from "node:zlib";
import { codeOf, messageOf } from "./errors.js";
import { invalidate } from "./repositories/cache.js";
import { scriptPath } from "./repositories/runner.js";
import { getIdentity, getRoster, forgetOwner, switchIdentity, } from "./services/identity.service.js";
import { getBoardHome } from "./services/stats.service.js";
import { listDirs, writeDirs } from "./services/dirs.service.js";
import { getHistoryList, getHistoryTrend } from "./services/history.service.js";
import { actOnTask } from "./services/task.service.js";
import { continueTask, resolveWorkspace, } from "./services/continue.service.js";
import { resolveWorkspaces } from "./services/workspaces.service.js";
import { readSettings, writeSettings } from "./services/rules-injection.service.js";
/** API 前缀（唯一真源就在这一处）。 */
const API_PREFIX = "/api/task-ledger";
/** 核心 explorer 的只读文件路由（`serveFsRoute` 挂这里，client 的 `connectFs` 用同一个值）。 */
export const FS_ROUTE = `${API_PREFIX}/fs`;
/**
 * JSON 响应出口（全仓唯一）：客户端声明收 gzip 且响应够大就压。
 * 宿主的压缩默认关闭（`DEFAULT_COMPRESSION = "none"`），趋势页那份 166KB 原样发出去太贵 ——
 * 由路由自己压，插件侧一行配置都不需要（浏览器 / fetch 自动解压）。小响应压完反而更大，故留门槛。
 */
function sendJson(res, status, body) {
    const raw = Buffer.from(JSON.stringify(body), "utf8");
    if (raw.length > GZIP_MIN_BYTES && acceptsGzip(res)) {
        const zipped = gzipSync(raw);
        res.writeHead(status, {
            "content-type": "application/json; charset=utf-8",
            "content-encoding": "gzip",
            // 同一 URL 可能回压过 / 没压过两种字节，缓存要按这个头分开
            vary: "accept-encoding",
            "content-length": String(zipped.length),
        });
        res.end(zipped);
        return;
    }
    res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "content-length": String(raw.length),
    });
    res.end(raw);
}
/** 压缩门槛：比这还小，gzip 头 + 字典开销反倒让线上字节变多。 */
const GZIP_MIN_BYTES = 1024;
function acceptsGzip(res) {
    // res.req 是 Node 自带的引用（ServerResponse.req），不用把 req 逐层传进 20 多个调用点
    const header = res.req?.headers["accept-encoding"];
    return String(header ?? "").includes("gzip");
}
/**
 * 失败统一出口：500 + 人话 + **机器可读码**。
 * 界面靠 `code` 分流（`LEDGER_IDENTITY_MISSING` ⇒ 整页切身份页），不去匹配中文。
 */
function sendFailure(res, error) {
    sendJson(res, 500, { error: messageOf(error), code: codeOf(error) });
}
/** 请求体上限：身份写入只带一个名字 / 一个 uuid，8 KB 富余。 */
const MAX_BODY_BYTES = 8 * 1024;
/** 读原始请求体（宿主给的 handler 是裸 Node req，没有解析过的 body）。 */
function readBody(req) {
    return new Promise((resolve, reject) => {
        let text = "";
        req.on("data", (chunk) => {
            text += chunk.toString();
            if (text.length > MAX_BODY_BYTES) {
                reject(new Error("参数：请求体过大"));
                req.destroy();
            }
        });
        req.on("end", () => resolve(text));
        req.on("error", reject);
    });
}
/** 400 与 500 靠这个前缀区分：参数类错误一律在文案前加「参数：」。 */
const BAD_REQUEST = "参数：";
/** 写端点的失败出口：参数类错误 400（去掉前缀），其余照 500 + 机器可读码。 */
function sendWriteFailure(res, error) {
    const message = messageOf(error);
    if (message.startsWith(BAD_REQUEST)) {
        sendJson(res, 400, { error: message.slice(BAD_REQUEST.length) });
        return;
    }
    sendFailure(res, error);
}
/** 界面上给用户复制到终端的 init 命令（有工作区就带上 --repo，否则脚本找不到台账）。
 *  Windows 上 scriptPath() 已经是 bin 下的 exe，不能加 `sh ` 前缀。 */
function initCommandOf(repoPath) {
    const entry = scriptPath();
    const head = process.platform === "win32" ? `"${entry}" init` : `sh "${entry}" init`;
    return repoPath === "" ? head : `${head} --repo "${repoPath}"`;
}
/** 换身份请求体 → 动作参数（名字 / uuid 的合法性由 skill 再判一次，这里只挡形状）。 */
async function switchInputOf(req, deps) {
    let raw;
    try {
        raw = JSON.parse(await readBody(req));
    }
    catch {
        throw new Error(`${BAD_REQUEST}请求体不是合法 JSON`);
    }
    const body = (raw ?? {});
    if (body.action === "new") {
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (name === "")
            throw new Error(`${BAD_REQUEST}新建身份必须填名字`);
        return { action: "new", name };
    }
    if (body.action === "claim") {
        const uuid = typeof body.uuid === "string" ? body.uuid.trim() : "";
        if (uuid === "")
            throw new Error(`${BAD_REQUEST}认领身份必须给 uuid`);
        const workspaceId = typeof body.workspace === "string" ? body.workspace : "";
        const workspace = (await workspacesOf(deps)).find((item) => item.id === workspaceId);
        if (workspace === undefined)
            throw new Error(`${BAD_REQUEST}找不到这个工作区，读不了名册`);
        return { action: "claim", uuid, repo: workspace.path };
    }
    if (body.action === "rename") {
        const name = typeof body.name === "string" ? body.name.trim() : "";
        if (name === "")
            throw new Error(`${BAD_REQUEST}改昵称必须填新昵称`);
        return { action: "rename", name };
    }
    throw new Error(`${BAD_REQUEST}action 只能是 new / claim / rename`);
}
/**
 * 解析工作区。`sync` 只在「进看板 / 手动刷新」时为 true —— 只有这一次才去宿主工作区补登记，
 * 其余请求（名册、趋势、名册写动作…）一律只读清单，不起进程、不写盘。
 */
function workspacesOf(deps, sync = false) {
    return resolveWorkspaces(deps.registry.list(), sync);
}
export function registerRoutes(webServer, deps) {
    /**
     * 注册一个**读**端点：统一先看 `?fresh=1`（手动刷新 = 清缓存再算，别让用户按了刷新还看旧数）。
     * 缓存 TTL 只有 1.5s，正常浏览照样吃缓存。
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
    // 本机身份：`{uuid, name}`，未初始化双 null（退 0，不是错误）。界面进页面的第一件事就是它 ——
    // 没身份时后续的快照请求根本不会发（身份闸门在 skill 侧挡着，快照会 500）。
    registerRead("/identity", async (_req, res) => {
        try {
            const identity = await getIdentity();
            sendJson(res, 200, {
                ...identity,
                // 界面上要直接给用户复制到终端的命令（绝对路径 —— PATH 里没有 progress）
                initCommand: initCommandOf((await workspacesOf(deps))[0]?.path ?? ""),
            });
        }
        catch (error) {
            sendFailure(res, error);
        }
    });
    // 可以认领的人：各工作区名册（没身份也能读；读挂的工作区直接跳过）。
    registerRead("/identity/roster", async (_req, res) => {
        try {
            sendJson(res, 200, await getRoster(await workspacesOf(deps)));
        }
        catch (error) {
            sendFailure(res, error);
        }
    });
    // 换身份（建新的 / 认领名册里的）。宿主路由不区分 method ⇒ 自己判；写操作必须 POST。
    webServer.register({
        kind: "exact",
        path: `${API_PREFIX}/identity/switch`,
        handler: async (req, res) => {
            if (req.method !== "POST") {
                sendJson(res, 405, { error: "身份写入只接受 POST" });
                return;
            }
            try {
                sendJson(res, 200, await switchIdentity(await switchInputOf(req, deps)));
            }
            catch (error) {
                sendWriteFailure(res, error);
            }
        },
    });
    // 从名册摘人（设置页每行的小叉）：逐本台账各删各的，分片还有任务的那本不删。
    //
    // **响应是 NDJSON 流**（2026-11-05）：每本台账各跑一条 skill 写命令，逐本走
    // 「检查 → 拉取 → 写 → 提交 → 推送」好几秒，攒完再回只能给界面一句固定提示。
    // 行形状：{"type":"step","step","workspace"} / {"type":"done","report"} / {"type":"error","error","code"}。
    // ⚠️ 头一旦发出去，后面的失败只能进流（状态码改不了）⇒ 参数类错误必须在发头之前挡掉。
    webServer.register({
        kind: "exact",
        path: `${API_PREFIX}/identity/forget`,
        handler: async (req, res) => {
            if (req.method !== "POST") {
                sendJson(res, 405, { error: "身份写入只接受 POST" });
                return;
            }
            let uuid;
            let workspaces;
            try {
                let raw;
                try {
                    raw = JSON.parse(await readBody(req));
                }
                catch {
                    throw new Error(`${BAD_REQUEST}请求体不是合法 JSON`);
                }
                const body = (raw ?? {});
                uuid = typeof body.uuid === "string" ? body.uuid.trim() : "";
                if (uuid === "")
                    throw new Error(`${BAD_REQUEST}摘人必须给 uuid`);
                workspaces = await workspacesOf(deps);
            }
            catch (error) {
                sendWriteFailure(res, error);
                return;
            }
            res.writeHead(200, {
                "content-type": "application/x-ndjson; charset=utf-8",
                "cache-control": "no-store",
            });
            const send = (event) => {
                res.write(`${JSON.stringify(event)}\n`);
            };
            try {
                const report = await forgetOwner(workspaces, uuid, (step) => send({ type: "step", step: step.step, workspace: step.workspace }));
                send({ type: "done", report });
            }
            catch (error) {
                send({ type: "error", error: messageOf(error), code: codeOf(error) });
            }
            res.end();
        },
    });
    registerRead("/workspaces", async (_req, res) => {
        try {
            sendJson(res, 200, { workspaces: await workspacesOf(deps) });
        }
        catch (error) {
            sendFailure(res, error);
        }
    });
    // 台账目录清单（设置页「台账目录」块）：GET 读全量（含隐藏项），POST 是写动作（显示 / 不显示 /
    // 改名 / 从看板移除，全部转给 skill，插件不写那个文件）。
    // ⚠️ 同一个 path 只能注册一次（宿主对重复 path 直接拒绝）⇒ 读写合成这一条，按 method 分流。
    webServer.register({
        kind: "exact",
        path: `${API_PREFIX}/dirs`,
        handler: async (req, res) => {
            if (req.method !== "POST") {
                try {
                    // 与 registerRead 同一口径：manual refresh 先清读缓存再算
                    if (new URL(req.url ?? "/", "http://localhost").searchParams.get("fresh") === "1")
                        invalidate();
                    sendJson(res, 200, await listDirs());
                }
                catch (error) {
                    sendFailure(res, error);
                }
                return;
            }
            try {
                let raw;
                try {
                    raw = JSON.parse(await readBody(req));
                }
                catch {
                    throw new Error(`${BAD_REQUEST}请求体不是合法 JSON`);
                }
                const body = (raw ?? {});
                const path = typeof body.path === "string" ? body.path.trim() : "";
                if (path === "")
                    throw new Error(`${BAD_REQUEST}必须给台账目录路径`);
                if (body.action === "add") {
                    sendJson(res, 200, await writeDirs({ action: "add", path }));
                    return;
                }
                if (body.action === "hide" || body.action === "unhide" || body.action === "remove") {
                    sendJson(res, 200, await writeDirs({ action: body.action, path }));
                    return;
                }
                if (body.action === "rename") {
                    const name = typeof body.name === "string" ? body.name.trim() : "";
                    sendJson(res, 200, await writeDirs({ action: "rename", path, name }));
                    return;
                }
                throw new Error(`${BAD_REQUEST}action 只能是 add / hide / unhide / rename / remove`);
            }
            catch (error) {
                sendWriteFailure(res, error);
            }
        },
    });
    // 会话规则注入设置（插件自有文件，非宿主配置区）：GET 读、POST 保存 / 恢复默认。
    webServer.register({
        kind: "exact",
        path: `${API_PREFIX}/rules-injection`,
        handler: async (req, res) => {
            if (req.method !== "POST") {
                try {
                    sendJson(res, 200, readSettings());
                }
                catch (error) {
                    sendFailure(res, error);
                }
                return;
            }
            try {
                let raw;
                try {
                    raw = JSON.parse(await readBody(req));
                }
                catch {
                    throw new Error(`${BAD_REQUEST}请求体不是合法 JSON`);
                }
                const body = (raw ?? {});
                const input = {};
                if (typeof body.enabled === "boolean")
                    input.enabled = body.enabled;
                if (body.lang === "zh" || body.lang === "en")
                    input.lang = body.lang;
                if (typeof body.text === "string")
                    input.text = body.text;
                if (body.action === "reset")
                    input.reset = true;
                sendJson(res, 200, writeSettings(input));
            }
            catch (error) {
                sendWriteFailure(res, error);
            }
        },
    });
    // 任务动作（在办行内的按钮）：认领 / 释放 / 取消 / 结案。前端只给工作区 id + 任务号，
    // 台账根由 host 解析，改台账一律交给 skill（claim / set --release / close），插件不碰文件。
    //
    // **响应是 NDJSON 流**（2026-11-04）：一条写命令要跑「检查 → 拉取 → 写 → 提交 → 推送」好几秒，
    // 攒完再回只能给界面一句固定提示。skill 每进一个阶段在 stderr 打 `#step <key>`，
    // host 原样转成一行 JSON 推出去，界面据此翻进度文案：
    //   {"type":"step","step":"sync"} / {"type":"done"} / {"type":"error","error":"…","code":"…"}
    // ⚠️ 头一旦发出去，后面的失败只能进流（状态码改不了）⇒ 参数类错误必须在发头之前挡掉。
    webServer.register({
        kind: "exact",
        path: `${API_PREFIX}/task/action`,
        handler: async (req, res) => {
            if (req.method !== "POST") {
                sendJson(res, 405, { error: "任务动作只接受 POST" });
                return;
            }
            let input;
            try {
                let raw;
                try {
                    raw = JSON.parse(await readBody(req));
                }
                catch {
                    throw new Error(`${BAD_REQUEST}请求体不是合法 JSON`);
                }
                const body = (raw ?? {});
                const action = body.action;
                if (action !== "claim" &&
                    action !== "release" &&
                    action !== "cancel" &&
                    action !== "close" &&
                    action !== "delete")
                    throw new Error(`${BAD_REQUEST}action 只能是 claim / release / cancel / close / delete`);
                // 摘要 / 留言：一句话就够，超长的截掉（历史行不该被一段小作文撑开）
                const summary = typeof body.summary === "string" ? body.summary.trim().slice(0, 200) : "";
                // 正常结案必须有摘要（取消 / 删除可以没有）：空着也要在界面先挡住，这里兜一层
                if (action === "close" && summary === "")
                    throw new Error(`${BAD_REQUEST}结案必须填一句摘要`);
                const id = typeof body.id === "string" ? body.id.trim() : "";
                // 删历史行不用任务号，改用 skill 的 delete --src/--line 定位（src 相对 ledger/）
                const src = typeof body.src === "string" ? body.src.trim() : "";
                const line = typeof body.line === "number" &&
                    Number.isInteger(body.line) &&
                    body.line > 0
                    ? body.line
                    : 0;
                // 行指纹（skill `history --json` 的 fingerprint）：删历史行必须带 ——
                // 行号只是坐标，只有整行指纹能证明「要删的还是用户看到的那一条」。
                const fingerprint = typeof body.fingerprint === "string" ? body.fingerprint.trim() : "";
                const historyDelete = action === "delete" && src !== "";
                if (historyDelete) {
                    if (!src.startsWith("history/") ||
                        !src.endsWith(".md") ||
                        src.includes(".."))
                        throw new Error(`${BAD_REQUEST}历史文件路径不合法`);
                    if (line === 0)
                        throw new Error(`${BAD_REQUEST}历史行号不合法`);
                    if (!/^[0-9a-f]{12}$/.test(fingerprint))
                        throw new Error(`${BAD_REQUEST}历史行指纹不合法（缺少行身份，删除已拒绝）`);
                }
                else if (id === "") {
                    throw new Error(`${BAD_REQUEST}必须给任务号`);
                }
                const workspaceId = typeof body.workspace === "string" ? body.workspace : "";
                const workspace = (await workspacesOf(deps)).find((item) => item.id === workspaceId);
                if (workspace === undefined)
                    throw new Error(`${BAD_REQUEST}找不到这个工作区，改不了任务`);
                input = {
                    action,
                    repo: workspace.path,
                    id,
                    summary,
                    ...(historyDelete ? { src, line, fingerprint } : {}),
                };
            }
            catch (error) {
                sendWriteFailure(res, error);
                return;
            }
            res.writeHead(200, {
                "content-type": "application/x-ndjson; charset=utf-8",
                "cache-control": "no-store",
            });
            const send = (event) => {
                res.write(`${JSON.stringify(event)}\n`);
            };
            try {
                await actOnTask(input, (step) => send({ type: "step", step }));
                send({ type: "done" });
            }
            catch (error) {
                send({ type: "error", error: messageOf(error), code: codeOf(error) });
            }
            res.end();
        },
    });
    // 工作区归属探测（2026-11-03）：非 DSH 工作区**起不了会话**，「继续」与「完成」都先问这一下，
    // 判据与「继续」完全同一条（`resolveWorkspace`，含 realpath 归一），不各写一份。
    webServer.register({
        kind: "exact",
        path: `${API_PREFIX}/workspace/kind`,
        handler: (req, res) => {
            try {
                const path = new URL(req.url ?? "/", "http://localhost").searchParams.get("path") ?? "";
                if (path.trim() === "")
                    throw new Error(`${BAD_REQUEST}必须给台账目录路径`);
                const resolved = resolveWorkspace(deps.registry, path);
                sendJson(res, 200, resolved.kind === "dsh"
                    ? { kind: "dsh", workspaceId: resolved.workspace.id }
                    : { kind: "not-dsh" });
            }
            catch (error) {
                sendFailure(res, error);
            }
        },
    });
    // 「继续」：在该台账所属的 DSH 工作区里起会话 + 注入只读提示词（2026-11-03）。
    // 非 DSH 工作区**不是错误** ⇒ 200 + `kind: "not-dsh"`，界面据此先复制任务号再弹警告。
    webServer.register({
        kind: "exact",
        path: `${API_PREFIX}/task/continue`,
        handler: async (req, res) => {
            if (req.method !== "POST") {
                sendJson(res, 405, { error: "继续任务只接受 POST" });
                return;
            }
            try {
                let raw;
                try {
                    raw = JSON.parse(await readBody(req));
                }
                catch {
                    throw new Error(`${BAD_REQUEST}请求体不是合法 JSON`);
                }
                const body = (raw ?? {});
                const id = typeof body.id === "string" ? body.id.trim() : "";
                if (id === "")
                    throw new Error(`${BAD_REQUEST}必须给任务号`);
                const workspaceId = typeof body.workspace === "string" ? body.workspace : "";
                if (workspaceId === "")
                    throw new Error(`${BAD_REQUEST}必须给工作区`);
                // 提示词 / 标题都由客户端拼（要跟界面语言走），host 只负责注入原文
                const prompt = typeof body.prompt === "string" ? body.prompt : "";
                if (prompt.trim() === "")
                    throw new Error(`${BAD_REQUEST}必须给提示词`);
                const title = typeof body.title === "string" && body.title.trim() !== ""
                    ? body.title
                    : `继续任务 ${id}`;
                sendJson(res, 200, await continueTask({
                    registry: deps.registry,
                    agents: deps.agents?.(),
                    presets: deps.presets?.(),
                    defaultModel: deps.defaultModel?.(),
                    sessionTitle: deps.sessionTitle?.(),
                }, { workspaceId, id, title, prompt }));
            }
            catch (error) {
                sendWriteFailure(res, error);
            }
        },
    });
    // 首屏一次拿全：8 卡（skill `stats`；本周/上周完成取趋势最后两个桶）+ 在办列表（`list --json`）+ 趋势。
    // `?sync=1` 才去宿主工作区补登记（用户 2026-11-03：只在进看板与手动刷新时同步，别的时候一次都不跑）。
    registerRead("/board/snapshot", async (req, res) => {
        try {
            const sync = new URL(req.url ?? "/", "http://localhost").searchParams.get("sync") === "1";
            sendJson(res, 200, await getBoardHome(await workspacesOf(deps, sync)));
        }
        catch (error) {
            sendFailure(res, error);
        }
    });
    // 历史页顶部趋势（粒度 day/week/month，桶全在 skill）：切粒度 = 重新请求，host 有读缓存。
    registerRead("/history/trend", async (req, res) => {
        try {
            const raw = new URL(req.url ?? "/", "http://localhost").searchParams.get("gran");
            const gran = raw === "week" || raw === "month" ? raw : "day";
            sendJson(res, 200, await getHistoryTrend(await workspacesOf(deps), gran));
        }
        catch (error) {
            sendFailure(res, error);
        }
    });
    // 历史页列表：**只取选中的那个月**（工作区 / 执行人 / 年月筛都在 host）。
    registerRead("/history/list", async (req, res) => {
        try {
            const params = new URL(req.url ?? "/", "http://localhost").searchParams;
            const all = await workspacesOf(deps);
            const workspaceId = params.get("workspace") ?? "";
            const scoped = workspaceId === ""
                ? all
                : all.filter((workspace) => workspace.id === workspaceId);
            const owner = params.get("owner") ?? "";
            const ym = params.get("ym") ?? "";
            sendJson(res, 200, await getHistoryList(scoped, {
                ym,
                ...(owner === "" ? {} : { owner }),
            }));
        }
        catch (error) {
            sendFailure(res, error);
        }
    });
}
