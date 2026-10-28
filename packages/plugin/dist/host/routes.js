import { invalidate } from "./repositories/cache.js";
import { getBoardHome } from "./services/stats.service.js";
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
    // 首屏一次拿全：8 卡（skill `stats` + 两次 `history --count-only`）+ 在办列表（`list --json`）。
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
}
