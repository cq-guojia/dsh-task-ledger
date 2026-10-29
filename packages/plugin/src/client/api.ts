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
import type { BoardPayload, HistoryTrendPayload } from "./types";

/** host 路由前缀（全仓唯一；与 host/routes.ts 的 API_PREFIX 对应）。 */
export const API_PREFIX = "api/task-ledger";

const DEFAULT_TIMEOUT_MS = 8_000;

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
		: `HTTP ${status}：${text}`;
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

/** 历史页顶部日趋势（只在切到历史模式时拉，别拖慢首屏）。 */
export function fetchHistoryTrend(months = 12): Promise<HistoryTrendPayload> {
	return fetchJson<HistoryTrendPayload>(`/history/trend?months=${months}`);
}
