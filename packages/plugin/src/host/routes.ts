/**
 * 数据面路由薄壳：只做协议（参数解析 + JSON 响应 + 错误转 500），
 * 一行业务逻辑都不多写——全部调 service（2026-10-17 定稿）。
 * 宿主事实（handler = 原始 Node req/res、发头后不抛错、重复 path 注册直接 throw）
 * 见 external/host-webserver.md。
 *
 * 2026-10-28 收敛：界面只有 8 个统计卡 + 在办列表 ⇒ 只注册 `/workspaces` 与 `/board/snapshot`。
 * 详情 / 历史 / 筛选项 / 趋势 / 写动作的端点与实现已删除（要接回按 skill 方法重写，不复用旧直读逻辑）。
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { invalidate } from "./repositories/cache.js";
import { getBoardHome } from "./services/stats.service.js";
import { getHistoryTrend } from "./services/history.service.js";
import { type RegistryWorkspace, resolveWorkspaces } from "./workspace.js";

/** 宿主 webServer.register 的最小面（WebRoute 形状见 external/host-webserver.md）。 */
export interface WebServerLike {
	register(route: {
		kind: "exact" | "prefix";
		path: string;
		handler: (
			req: IncomingMessage,
			res: ServerResponse,
		) => void | Promise<void>;
	}): unknown;
}

/** 宿主 workspaceRegistry 的最小面（事实见 external/dsh-workspace-registry.md）。 */
export interface WorkspaceRegistryLike {
	list(): readonly RegistryWorkspace[];
}

export interface RouteDeps {
	readonly registry: WorkspaceRegistryLike;
}

/** API 前缀（唯一真源就在这一处）。 */
const API_PREFIX = "/api/task-ledger";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(body));
}

/** 每请求重新解析工作区（registry 可能刚变；`root` 探测是本地结构判定，微秒级）。 */
function workspacesOf(deps: RouteDeps) {
	return resolveWorkspaces(deps.registry.list());
}

type Handler = (
	req: IncomingMessage,
	res: ServerResponse,
) => void | Promise<void>;

export function registerRoutes(
	webServer: WebServerLike,
	deps: RouteDeps,
): void {
	/**
	 * 注册一个**读**端点：统一先看 `?fresh=1`（手动刷新 = 清缓存再算，别让用户按了刷新还看旧数）。
	 * 缓存 TTL 只有 1.5s，正常浏览照样吃缓存。
	 */
	const registerRead = (path: string, handler: Handler): void => {
		webServer.register({
			kind: "exact",
			path: `${API_PREFIX}${path}`,
			handler: async (req, res) => {
				if (
					new URL(req.url ?? "/", "http://localhost").searchParams.get(
						"fresh",
					) === "1"
				)
					invalidate();
				await handler(req, res);
			},
		});
	};

	registerRead("/workspaces", async (_req, res) => {
		try {
			sendJson(res, 200, { workspaces: await workspacesOf(deps) });
		} catch (error) {
			sendJson(res, 500, {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	});

	// 首屏一次拿全：8 卡（skill `stats`；本周/上周完成取趋势最后两个桶）+ 在办列表（`list --json`）+ 趋势。
	registerRead("/board/snapshot", async (_req, res) => {
		try {
			sendJson(res, 200, await getBoardHome(await workspacesOf(deps)));
		} catch (error) {
			sendJson(res, 500, {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	});

	// 历史页顶部日趋势（按天 + 按工作区）：只在切到历史模式时拉，不拖慢首屏。
	registerRead("/history/trend", async (req, res) => {
		try {
			const raw = new URL(req.url ?? "/", "http://localhost").searchParams.get(
				"months",
			);
			const months =
				raw === null
					? 12
					: Math.min(12, Math.max(1, Number.parseInt(raw, 10) || 12));
			sendJson(res, 200, await getHistoryTrend(await workspacesOf(deps), months));
		} catch (error) {
			sendJson(res, 500, {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	});
}
