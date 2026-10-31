import { invalidate } from "./repositories/cache.js";
import { getBoardHome } from "./services/stats.service.js";
import { getHistoryList, getHistoryTrend } from "./services/history.service.js";
import { resolveWorkspaces } from "./workspace.js";
/** API 前缀（唯一真源就在这一处）。 */
const API_PREFIX = "/api/task-ledger";
function sendJson(res, status, body) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
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
