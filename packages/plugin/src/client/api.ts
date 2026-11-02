/**
 * 数据面取数**单源**：所有 client → host 的 HTTP 都在这里，页面不许各写一份 fetch。
 *
 * 纪律：只做传输与形状校验，不造兜底假值（DSH 插件规则「数据真实」）——
 * 失败就抛，由调用方显示错误态；返回什么渲染什么。
 *
 * ⚠️ 必须带超时且 abort 要带 reason：一次挂起的请求会让面板永久停在「读取中」，
 * 而不带 reason 时浏览器把 error.message 填成「signal is aborted without reason」，
 * 看不出是超时（姊妹仓 2026-10-07 真机教训）。
 */
import type {
	BoardPayload,
	DirsPayload,
	HistoryGran,
	HistoryListPayload,
	HistoryTrendPayload,
	IdentityView,
	RenameView,
	RosterPayload,
} from "./types";

/** host 路由前缀（全仓唯一；与 host/routes.ts 的 API_PREFIX 对应）。 */
export const API_PREFIX = "api/task-ledger";

const DEFAULT_TIMEOUT_MS = 8_000;

/** host 侧「这台机器还没有身份」的机器可读码（从 skill 退出码 4 翻译过来）。 */
export const IDENTITY_MISSING_CODE = "LEDGER_IDENTITY_MISSING";

/** 这次失败是不是「没有身份」——是的话整个面板要切成身份页，而不是显示错误。 */
export function isIdentityMissing(error: unknown): boolean {
	return (
		error !== null &&
		typeof error === "object" &&
		"code" in error &&
		(error as { code?: unknown }).code === IDENTITY_MISSING_CODE
	);
}

/** host 返回的失败响应（带人话 + 机器可读码）。 */
export class HttpError extends Error {
	readonly code: string | null;
	constructor(message: string, code: string | null) {
		super(message);
		this.name = "HttpError";
		this.code = code;
	}
}

/**
 * 错误响应榨人话：host 路由（routes.ts）发的是 `{ error, code }`，`error` 是**能直接上界面的**
 * （带工作区名、台账程序起不来之类的原文）。不带它界面上只剩「HTTP 500」，等于没报错。
 */
function errorOf(status: number, body: string): HttpError {
	let message = "";
	let code: string | null = null;
	try {
		const parsed = JSON.parse(body) as { error?: unknown; code?: unknown };
		if (typeof parsed.error === "string") message = parsed.error;
		if (typeof parsed.code === "string") code = parsed.code;
	} catch {
		/* 不是 JSON：走原文 */
	}
	if (message === "") message = body.trim().slice(0, 200);
	return new HttpError(
		message === "" ? `HTTP ${String(status)}` : `HTTP ${status}：${message}`,
		code,
	);
}

/** 带超时的 JSON 取数（相对路径，同源）。 */
export async function fetchJson<T>(
	path: string,
	init: RequestInit = {},
	timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => {
		controller.abort(
			new DOMException(`请求超时（${timeoutMs}ms 未响应）`, "TimeoutError"),
		);
	}, timeoutMs);
	try {
		const res = await fetch(`${API_PREFIX}${path}`, {
			...init,
			signal: controller.signal,
			cache: "no-store",
		});
		if (!res.ok) throw errorOf(res.status, await res.text().catch(() => ""));
		return (await res.json()) as T;
	} finally {
		clearTimeout(timer);
	}
}

/** 本机身份：进面板的**第一个**请求（没身份时快照会 500，所以必须先问它）。 */
export function fetchIdentity(): Promise<IdentityView> {
	return fetchJson<IdentityView>("/identity");
}

/** 可以认领的人：各工作区名册（没身份也能读）。 */
export function fetchRoster(): Promise<RosterPayload> {
	return fetchJson<RosterPayload>("/identity/roster");
}

/** 台账目录清单（机器级；带隐藏项——设置页要能把它打开回来）。 */
export function fetchDirs(): Promise<DirsPayload> {
	return fetchJson<DirsPayload>("/dirs");
}

/**
 * 改昵称的超时：要逐本台账走「取最新 → 改 → 提交 → 推送」，
 * 一本几秒、十本一分钟很正常 —— 吃默认 8s 只会「界面报超时、脚本还在改」。
 */
export const RENAME_TIMEOUT_MS = 180_000;

/**
 * 换身份 / 改昵称：
 *  - `new` 建全新身份、`claim` 认领某工作区名册里已有的人 → 返回换完之后的身份；
 *  - `rename` 改自己昵称 → 返回新昵称 + 每本台账各自的结果（`dirs`）。
 */
export function postSwitchIdentity(
	body:
		| { readonly action: "new"; readonly name: string }
		| { readonly action: "claim"; readonly uuid: string; readonly workspace: string }
		| { readonly action: "rename"; readonly name: string },
): Promise<IdentityView | RenameView> {
	return fetchJson<IdentityView | RenameView>(
		"/identity/switch",
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		},
		body.action === "rename" ? RENAME_TIMEOUT_MS : undefined,
	);
}

/**
 * 首屏快照：8 卡 + 在办列表 + 趋势（host 侧每工作区跑 skill `stats` / `stats --trend` / `list`）。
 * `fresh` = 让 host 先清 1.5s 读缓存再算（手动刷新 / 首读都要最新，不吃上一屏的缓存）。
 */
export function fetchBoardSnapshot(
	opts: { fresh?: boolean } = {},
): Promise<BoardPayload> {
	return fetchJson<BoardPayload>(
		`/board/snapshot${opts.fresh === true ? "?fresh=1" : ""}`,
	);
}

/** 历史页顶部趋势（gran = 柱图粒度；切粒度 = 重新请求，host 有读缓存）。 */
export function fetchHistoryTrend(gran: HistoryGran = "day"): Promise<HistoryTrendPayload> {
	return fetchJson<HistoryTrendPayload>(`/history/trend?gran=${gran}`);
}

/** 历史页列表：**一次只取一个自然月**（`ym` = `YYYY-MM`），整月全量回本地，滚动由前端开窗。 */
export function fetchHistoryList(query: {
	ym: string;
	workspace?: string;
	owner?: string;
}): Promise<HistoryListPayload> {
	const params = new URLSearchParams();
	params.set("ym", query.ym);
	if (query.workspace !== undefined && query.workspace !== "")
		params.set("workspace", query.workspace);
	if (query.owner !== undefined && query.owner !== "")
		params.set("owner", query.owner);
	const suffix = params.toString();
	return fetchJson<HistoryListPayload>(
		`/history/list${suffix === "" ? "" : `?${suffix}`}`,
	);
}
