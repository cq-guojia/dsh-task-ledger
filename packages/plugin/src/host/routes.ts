/**
 * 数据面路由薄壳：只做协议（参数解析 + JSON 响应 + 错误转 500），
 * 一行业务逻辑都不多写——全部调 service（2026-10-17 定稿）。
 * 宿主事实（handler = 原始 Node req/res、发头后不抛错、重复 path 注册直接 throw）
 * 见 external/host-webserver.md。
 *
 * 2026-10-28 收敛：首屏只有 8 个统计卡 + 在办列表，只留 `/workspaces` 与 `/board/snapshot`；
 * 详情 / 历史 / 筛选项 / 趋势 / 写动作全部停用（下方注释保留，接回时按 skill 方法重写）。
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { invalidate } from "./repositories/cache.js";
import { getBoardHome } from "./services/stats.service.js";
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

	// 首屏一次拿全：8 卡（skill `stats` + 两次 `history --count-only`）+ 在办列表（`list --json`）。
	registerRead("/board/snapshot", async (_req, res) => {
		try {
			sendJson(res, 200, await getBoardHome(await workspacesOf(deps)));
		} catch (error) {
			sendJson(res, 500, {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	});

	/* ─────────────────── 以下端点本轮停用（接回时按 skill 方法重写） ───────────────────
	 *
	 * 停用原因：界面上现在只有 8 个统计卡与（留空的）趋势图，其余区块整块注释；
	 * 这些端点的取数里还有插件自己算的部分（趋势 / 筛选项派生 / 按路径直读 worklog），
	 * skill 补齐对应方法后再接回来，不要原样启用。
	 *
	 * /board            旧的「首页一次拿全」（snapshot + 8 周趋势 + 四个自然周期），已由 /board/snapshot 取代
	 * /board/trend      近 8 周趋势（无 skill 方法）
	 * /task             单条详情 + 过程文档
	 * /history          已结案列表（history --json）
	 * /filters          owner / category / tag 候选（插件自己从在办 + 历史派生）
	 *
	 * ────────────────────────────────────────────────────────────────────────────── */
}

/* ───────────────────────── 以下注册函数本轮停用 ─────────────────────────
 *
 * `registerWriteRoutes`（认领 / 释放）：host 直跑 skill 的 claim / set，属写动作，
 *   与「只显示 8 个统计卡」无关，本轮不注册。
 * `registerSessionRoutes`（结束任务）：起会话 + 预置提示词，同样不接。
 *
 * 两者形状与实现保留在 git 历史里（提交 24fc351 之前的 routes.ts），
 * 接回时按新的 skill 方法重写，不复用旧的直读逻辑。
 */
export function registerWriteRoutes(
	_webServer: WebServerLike,
	_deps: RouteDeps,
): void {}

export interface SessionRouteDeps {
	readonly registry: WorkspaceRegistryLike;
	readonly agents: unknown;
	readonly getService: (name: string) => unknown;
}

export function registerSessionRoutes(
	_webServer: WebServerLike,
	_deps: SessionRouteDeps,
): void {}
