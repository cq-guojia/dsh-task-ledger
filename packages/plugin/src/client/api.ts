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
	CloseHandoff,
	FilterOptions,
	HistoryRecord,
	TaskDetail,
	TrendPayload,
} from "./types";

/** host 路由前缀（全仓唯一；与 host/routes.ts 的 API_PREFIX 对应）。 */
export const API_PREFIX = "api/task-ledger";

const DEFAULT_TIMEOUT_MS = 8_000;
/** 趋势端点读 history，比快路径慢一个量级（20 万条实测 4s+），超时单给。 */
const TREND_TIMEOUT_MS = 30_000;

/**
 * 错误响应榨人话：host 路由（routes.ts）发的是 `{ error: "..." }`，那里的话是**能直接上界面的**
 * （带工作区名、台账程序起不来之类的原文）。不带它界面上只剩「HTTP 500」，等于没报错。
 */
export function httpErrorMessage(status: number, body: string): string {
	try {
		const parsed = JSON.parse(body) as { error?: unknown };
		if (typeof parsed.error === "string" && parsed.error !== "")
			return `HTTP ${status}：${parsed.error}`;
	} catch {
		/* 不是 JSON：走原文 */
	}
	const text = body.trim().slice(0, 200);
	return text === ""
		? `HTTP ${String(status)}`
		: `HTTP ${String(status)}：${text}`;
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
		if (!res.ok)
			throw new Error(
				httpErrorMessage(res.status, await res.text().catch(() => "")),
			);
		return (await res.json()) as T;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * 首页快照（快路径：在办全量 + 统计 + 各工作区身份；**不含趋势**）。
 * `fresh` = 让 host 先清 1.5s 读缓存再算（手动刷新 / 首读都要最新，不吃上一屏的缓存）。
 */
export function fetchBoardSnapshot(
	opts: { fresh?: boolean } = {},
): Promise<BoardPayload> {
	return fetchJson<BoardPayload>(`/board/snapshot${freshSuffix(opts)}`);
}

/**
 * 趋势（慢路径：近 8 周 + 四个自然周期，host 侧要读 history）。
 * 超时给得比默认宽：历史量大时读得久（实测 20 万条量级 4s+）；
 * 旧宿主没有该端点 ⇒ 404，直接抛给调用方兜底，不阻塞列表。
 */
export function fetchTrend(
	opts: { fresh?: boolean } = {},
): Promise<TrendPayload> {
	return fetchJson<TrendPayload>(
		`/board/trend${freshSuffix(opts)}`,
		{},
		TREND_TIMEOUT_MS,
	);
}

/** `?fresh=1` 只在真要最新值时带；不带就吃 host 的 1.5s 缓存。 */
function freshSuffix(opts: { fresh?: boolean }): string {
	return opts.fresh === true ? "?fresh=1" : "";
}

/** 已结案列表（服务端按窗口 / 标签 / 分页过滤）。 */
export function fetchHistory(params: {
	since?: string;
	until?: string;
	tag?: string;
	limit?: number;
}): Promise<HistoryRecord[]> {
	const query = new URLSearchParams();
	if (params.since !== undefined) query.set("since", params.since);
	if (params.until !== undefined) query.set("until", params.until);
	if (params.tag !== undefined && params.tag !== "")
		query.set("tag", params.tag);
	if (params.limit !== undefined) query.set("limit", String(params.limit));
	const suffix = query.toString();
	return fetchJson<{ records: HistoryRecord[] }>(
		`/history${suffix === "" ? "" : `?${suffix}`}`,
	).then((body) => body.records ?? []);
}

/** 单条在办 + 过程文档正文（展开行用）。 */
export function fetchTaskDetail(
	workspaceId: string,
	taskId: string,
): Promise<TaskDetail> {
	const query = new URLSearchParams({ ws: workspaceId, id: taskId });
	return fetchJson<TaskDetail>(`/task?${query.toString()}`);
}

/** 筛选项候选（在办全量 + 近 13 个月历史的去重 owner / category / tag）。 */
export function fetchFilters(): Promise<FilterOptions> {
	return fetchJson<FilterOptions>("/filters");
}

/**
 * 结束任务：请 host 起一个会话（首条 = 预置提示词 + 用户留言），返回 `sessionId` 供跳转。
 *
 * `message` 是用户在弹框里留的话（可空）；`provider` / `model` 成对给 = 用用户选的模型，
 * 都不给 = 用宿主默认模型（只给一半会被 host 400 拒，不做猜测）。
 */
export function requestClose(body: {
	ws: string;
	id: string;
	message: string;
	provider?: string;
	model?: string;
}): Promise<CloseHandoff> {
	return fetchJson<CloseHandoff>("/close", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

/** 认领 / 释放的写结果；成功后由调用方自行刷新快照（host 已清该工作区读缓存）。 */
export interface TaskMutationResult {
	readonly ok: true;
	/** 写成功但同步（commit / push）没成功时的人话；同步正常时没有这个字段。 */
	readonly notice?: string;
}

/**
 * 认领：点一下即归当前用户（host 直跑脚本，不开会话）。
 * 只有 `open` 且无人认领才允许，忙时 host 回 500 + 人话（脚本原文）。
 */
export function requestClaim(body: {
	ws: string;
	id: string;
}): Promise<TaskMutationResult> {
	return fetchJson<TaskMutationResult>("/claim", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

/** 释放：退回待认领（owner 清空），只许当前 owner 本人（host 侧脚本校验）。 */
export function requestRelease(body: {
	ws: string;
	id: string;
}): Promise<TaskMutationResult> {
	return fetchJson<TaskMutationResult>("/release", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}
