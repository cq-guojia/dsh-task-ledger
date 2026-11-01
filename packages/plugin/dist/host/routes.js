import { invalidate } from "./repositories/cache.js";
import { scriptPath } from "./repositories/runner.js";
import { getIdentity, getRoster, switchIdentity, } from "./services/identity.service.js";
import { getBoardHome } from "./services/stats.service.js";
import { getHistoryList, getHistoryTrend } from "./services/history.service.js";
import { resolveWorkspaces } from "./workspace.js";
/** API 前缀（唯一真源就在这一处）。 */
const API_PREFIX = "/api/task-ledger";
function sendJson(res, status, body) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
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
/** 界面上给用户复制到终端的 init 命令（有工作区就带上 --repo，否则脚本找不到台账）。 */
function initCommandOf(repoPath) {
    const head = `sh "${scriptPath()}" init`;
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
    throw new Error(`${BAD_REQUEST}action 只能是 new / claim`);
}
/** 每请求重新解析工作区（registry 可能刚变；`root` 探测是本地结构判定，微秒级）。 */
function workspacesOf(deps) {
    return resolveWorkspaces(deps.registry.list());
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
            sendJson(res, 500, {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });
    // 可以认领的人：各工作区名册（没身份也能读；读挂的工作区直接跳过）。
    registerRead("/identity/roster", async (_req, res) => {
        try {
            sendJson(res, 200, await getRoster(await workspacesOf(deps)));
        }
        catch (error) {
            sendJson(res, 500, {
                error: error instanceof Error ? error.message : String(error),
            });
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
                const message = error instanceof Error ? error.message : String(error);
                sendJson(res, message.startsWith("参数：") ? 400 : 500, {
                    error: message.replace(/^参数：/, ""),
                });
            }
        },
    });
    registerRead("/workspaces", async (_req, res) => {
        try {
            sendJson(res, 200, { workspaces: await workspacesOf(deps) });
        }
        catch (error) {
            sendJson(res, 500, {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });
    // 首屏一次拿全：8 卡（skill `stats`；本周/上周完成取趋势最后两个桶）+ 在办列表（`list --json`）+ 趋势。
    registerRead("/board/snapshot", async (_req, res) => {
        try {
            sendJson(res, 200, await getBoardHome(await workspacesOf(deps)));
        }
        catch (error) {
            sendJson(res, 500, {
                error: error instanceof Error ? error.message : String(error),
            });
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
            sendJson(res, 500, {
                error: error instanceof Error ? error.message : String(error),
            });
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
            sendJson(res, 500, {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });
}
