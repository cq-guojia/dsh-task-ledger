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
import { codeOf, messageOf } from "./errors.js";
import { invalidate } from "./repositories/cache.js";
import { scriptPath } from "./repositories/runner.js";
import {
	getIdentity,
	getRoster,
	forgetOwner,
	switchIdentity,
	type SwitchInput,
} from "./services/identity.service.js";
import { getBoardHome } from "./services/stats.service.js";
import { listDirs, writeDirs } from "./services/dirs.service.js";
import { getHistoryList, getHistoryTrend } from "./services/history.service.js";
import { actOnTask } from "./services/task.service.js";
import { resolveWorkspaces } from "./services/workspaces.service.js";
import type { RegistryWorkspace } from "./types.js";

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

/** 核心 explorer 的只读文件路由（`serveFsRoute` 挂这里，client 的 `connectFs` 用同一个值）。 */
export const FS_ROUTE = `${API_PREFIX}/fs`;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(body));
}

/**
 * 失败统一出口：500 + 人话 + **机器可读码**。
 * 界面靠 `code` 分流（`LEDGER_IDENTITY_MISSING` ⇒ 整页切身份页），不去匹配中文。
 */
function sendFailure(res: ServerResponse, error: unknown): void {
	sendJson(res, 500, { error: messageOf(error), code: codeOf(error) });
}

/** 请求体上限：身份写入只带一个名字 / 一个 uuid，8 KB 富余。 */
const MAX_BODY_BYTES = 8 * 1024;

/** 读原始请求体（宿主给的 handler 是裸 Node req，没有解析过的 body）。 */
function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let text = "";
		req.on("data", (chunk: Buffer) => {
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
function sendWriteFailure(res: ServerResponse, error: unknown): void {
	const message = messageOf(error);
	if (message.startsWith(BAD_REQUEST)) {
		sendJson(res, 400, { error: message.slice(BAD_REQUEST.length) });
		return;
	}
	sendFailure(res, error);
}

/** 界面上给用户复制到终端的 init 命令（有工作区就带上 --repo，否则脚本找不到台账）。 */
function initCommandOf(repoPath: string): string {
	const head = `sh "${scriptPath()}" init`;
	return repoPath === "" ? head : `${head} --repo "${repoPath}"`;
}

/** 换身份请求体 → 动作参数（名字 / uuid 的合法性由 skill 再判一次，这里只挡形状）。 */
async function switchInputOf(
	req: IncomingMessage,
	deps: RouteDeps,
): Promise<SwitchInput> {
	let raw: unknown;
	try {
		raw = JSON.parse(await readBody(req));
	} catch {
		throw new Error(`${BAD_REQUEST}请求体不是合法 JSON`);
	}
	const body = (raw ?? {}) as Record<string, unknown>;
	if (body.action === "new") {
		const name = typeof body.name === "string" ? body.name.trim() : "";
		if (name === "") throw new Error(`${BAD_REQUEST}新建身份必须填名字`);
		return { action: "new", name };
	}
	if (body.action === "claim") {
		const uuid = typeof body.uuid === "string" ? body.uuid.trim() : "";
		if (uuid === "") throw new Error(`${BAD_REQUEST}认领身份必须给 uuid`);
		const workspaceId = typeof body.workspace === "string" ? body.workspace : "";
		const workspace = (await workspacesOf(deps)).find(
			(item) => item.id === workspaceId,
		);
		if (workspace === undefined)
			throw new Error(`${BAD_REQUEST}找不到这个工作区，读不了名册`);
		return { action: "claim", uuid, repo: workspace.path };
	}
	if (body.action === "rename") {
		const name = typeof body.name === "string" ? body.name.trim() : "";
		if (name === "") throw new Error(`${BAD_REQUEST}改昵称必须填新昵称`);
		return { action: "rename", name };
	}
	throw new Error(`${BAD_REQUEST}action 只能是 new / claim / rename`);
}

/**
 * 解析工作区。`sync` 只在「进看板 / 手动刷新」时为 true —— 只有这一次才去宿主工作区补登记，
 * 其余请求（名册、趋势、名册写动作…）一律只读清单，不起进程、不写盘。
 */
function workspacesOf(deps: RouteDeps, sync = false) {
	return resolveWorkspaces(deps.registry.list(), sync);
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
		} catch (error) {
			sendFailure(res, error);
		}
	});

	// 可以认领的人：各工作区名册（没身份也能读；读挂的工作区直接跳过）。
	registerRead("/identity/roster", async (_req, res) => {
		try {
			sendJson(res, 200, await getRoster(await workspacesOf(deps)));
		} catch (error) {
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
			} catch (error) {
				sendWriteFailure(res, error);
			}
		},
	});

	// 从名册摘人（设置页每行的小叉）：逐本台账各删各的，分片还有任务的那本不删。
	webServer.register({
		kind: "exact",
		path: `${API_PREFIX}/identity/forget`,
		handler: async (req, res) => {
			if (req.method !== "POST") {
				sendJson(res, 405, { error: "身份写入只接受 POST" });
				return;
			}
			try {
				let raw: unknown;
				try {
					raw = JSON.parse(await readBody(req));
				} catch {
					throw new Error(`${BAD_REQUEST}请求体不是合法 JSON`);
				}
				const body = (raw ?? {}) as Record<string, unknown>;
				const uuid = typeof body.uuid === "string" ? body.uuid.trim() : "";
				if (uuid === "") throw new Error(`${BAD_REQUEST}摘人必须给 uuid`);
				sendJson(res, 200, await forgetOwner(await workspacesOf(deps), uuid));
			} catch (error) {
				sendWriteFailure(res, error);
			}
		},
	});

	registerRead("/workspaces", async (_req, res) => {
		try {
			sendJson(res, 200, { workspaces: await workspacesOf(deps) });
		} catch (error) {
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
					if (
						new URL(req.url ?? "/", "http://localhost").searchParams.get(
							"fresh",
						) === "1"
					)
						invalidate();
					sendJson(res, 200, await listDirs());
				} catch (error) {
					sendFailure(res, error);
				}
				return;
			}
			try {
				let raw: unknown;
				try {
					raw = JSON.parse(await readBody(req));
				} catch {
					throw new Error(`${BAD_REQUEST}请求体不是合法 JSON`);
				}
				const body = (raw ?? {}) as Record<string, unknown>;
				const path = typeof body.path === "string" ? body.path.trim() : "";
				if (path === "") throw new Error(`${BAD_REQUEST}必须给台账目录路径`);
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
			} catch (error) {
				sendWriteFailure(res, error);
			}
		},
	});

	// 任务动作（在办行内的按钮）：认领 / 释放。前端只给工作区 id + 任务号，
	// 台账根由 host 解析，改台账一律交给 skill（claim / set --release），插件不碰文件。
	webServer.register({
		kind: "exact",
		path: `${API_PREFIX}/task/action`,
		handler: async (req, res) => {
			if (req.method !== "POST") {
				sendJson(res, 405, { error: "任务动作只接受 POST" });
				return;
			}
			try {
				let raw: unknown;
				try {
					raw = JSON.parse(await readBody(req));
				} catch {
					throw new Error(`${BAD_REQUEST}请求体不是合法 JSON`);
				}
				const body = (raw ?? {}) as Record<string, unknown>;
				const action = body.action;
				if (action !== "claim" && action !== "release" && action !== "cancel")
					throw new Error(`${BAD_REQUEST}action 只能是 claim / release / cancel`);
				// 取消理由：一句话就够，超长的截掉（历史摘要不该被一段小作文撑开）
				const summary =
					typeof body.summary === "string" ? body.summary.trim().slice(0, 200) : "";
				const id = typeof body.id === "string" ? body.id.trim() : "";
				if (id === "") throw new Error(`${BAD_REQUEST}必须给任务号`);
				const workspaceId = typeof body.workspace === "string" ? body.workspace : "";
				const workspace = (await workspacesOf(deps)).find(
					(item) => item.id === workspaceId,
				);
				if (workspace === undefined)
					throw new Error(`${BAD_REQUEST}找不到这个工作区，改不了任务`);
				await actOnTask({ action, repo: workspace.path, id, summary });
				sendJson(res, 200, { ok: true });
			} catch (error) {
				sendWriteFailure(res, error);
			}
		},
	});

	// 首屏一次拿全：8 卡（skill `stats`；本周/上周完成取趋势最后两个桶）+ 在办列表（`list --json`）+ 趋势。
	// `?sync=1` 才去宿主工作区补登记（用户 2026-11-03：只在进看板与手动刷新时同步，别的时候一次都不跑）。
	registerRead("/board/snapshot", async (req, res) => {
		try {
			const sync =
				new URL(req.url ?? "/", "http://localhost").searchParams.get("sync") === "1";
			sendJson(res, 200, await getBoardHome(await workspacesOf(deps, sync)));
		} catch (error) {
			sendFailure(res, error);
		}
	});

	// 历史页顶部趋势（粒度 day/week/month，桶全在 skill）：切粒度 = 重新请求，host 有读缓存。
	registerRead("/history/trend", async (req, res) => {
		try {
			const raw = new URL(req.url ?? "/", "http://localhost").searchParams.get(
				"gran",
			);
			const gran =
				raw === "week" || raw === "month" ? raw : ("day" as const);
			sendJson(res, 200, await getHistoryTrend(await workspacesOf(deps), gran));
		} catch (error) {
			sendFailure(res, error);
		}
	});

	// 历史页列表：**只取选中的那个月**（工作区 / 执行人 / 年月筛都在 host）。
	registerRead("/history/list", async (req, res) => {
		try {
			const params = new URL(req.url ?? "/", "http://localhost").searchParams;
			const all = await workspacesOf(deps);
			const workspaceId = params.get("workspace") ?? "";
			const scoped =
				workspaceId === ""
					? all
					: all.filter((workspace) => workspace.id === workspaceId);
			const owner = params.get("owner") ?? "";
			const ym = params.get("ym") ?? "";
			sendJson(
				res,
				200,
				await getHistoryList(scoped, {
					ym,
					...(owner === "" ? {} : { owner }),
				}),
			);
		} catch (error) {
			sendFailure(res, error);
		}
	});
}
