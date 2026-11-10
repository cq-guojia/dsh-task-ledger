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
import { globalT } from "./locales";
import type {
	BoardPayload,
	DirsPayload,
	HistoryGran,
	HistoryListPayload,
	HistoryTrendPayload,
	IdentityView,
	RenameView,
	RosterPayload,
	RulesInjectionView,
} from "./types";

/** host 路由前缀（全仓唯一；与 host/routes.ts 的 API_PREFIX 对应）。 */
export const API_PREFIX = "api/task-ledger";

/** 核心 explorer 的只读文件路由（`connectFs` 接它；与 host 的 `FS_ROUTE` 是同一个地址）。 */
export const FS_PATH = `${API_PREFIX}/fs`;

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
			new DOMException(globalT("errTimeout", { ms: timeoutMs }), "TimeoutError"),
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

/**
 * 逐行读 NDJSON 流：每拆出一行交给 `handle`，它返回 true = 到此为止。
 * 返回值 `true` 表示被 `handle` 收摊、`false` 表示流读完了还没收摊（调用方按「连接中断」处理）。
 */
async function readLines(
	res: Response,
	handle: (line: string) => boolean,
): Promise<boolean> {
	if (res.body === null) throw new HttpError(globalT("errEmptyBody"), null);
	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	try {
		for (;;) {
			const chunk = await reader.read();
			if (chunk.done) break;
			buffer += decoder.decode(chunk.value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				if (handle(line)) return true;
			}
		}
		// 流没以换行结尾时，最后一行还留在 buffer 里
		buffer += decoder.decode();
		return handle(buffer);
	} finally {
		// 提前收摊（done / 出错）时把剩下的流扔掉，别让连接吊着
		void reader.cancel().catch(() => undefined);
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

/** 台账目录的写动作：登记 / 显示 / 不显示 / 改名 / 从看板移除。 */
export type DirsWriteBody =
	| { readonly action: "hide" | "unhide" | "remove"; readonly path: string }
	| { readonly action: "rename"; readonly path: string; readonly name: string }
	| { readonly action: "add"; readonly path: string };

/** 返回改完之后的完整清单（含隐藏项），调用方就地换掉表格。 */
export function postDirs(body: DirsWriteBody): Promise<DirsPayload> {
	return fetchJson<DirsPayload>("/dirs", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

/** 会话规则注入设置（插件自有文件）；回当前生效文案与写死的默认文案。 */
export function fetchRulesInjection(): Promise<RulesInjectionView> {
	return fetchJson<RulesInjectionView>("/rules-injection");
}

/** 保存开关与文案；`action: "reset"` 恢复写死的默认文案。 */
export function postRulesInjection(body: {
	readonly enabled?: boolean;
	readonly text?: string;
	readonly action?: "reset";
}): Promise<RulesInjectionView> {
	return fetchJson<RulesInjectionView>("/rules-injection", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
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

/** 摘人结果（host 逐本台账删过之后汇总）。 */
export interface ForgetReport {
	readonly removed: readonly string[];
	readonly kept: readonly { readonly workspace: string; readonly tasks: number }[];
	readonly failed: readonly { readonly workspace: string; readonly error: string }[];
	/** 删的是本机身份、并且**每一本都删成了** ⇒ host 已经顺手退出登录。 */
	readonly signedOut: boolean;
}

/** 摘人过程的阶段事件：哪本台账进了哪一步（逐本并行跑，交错时靠台账名分清）。 */
export interface ForgetStep {
	readonly workspace: string;
	readonly step: TaskActionStep;
}

/** host 在 `/identity/forget` 的 NDJSON 流里推的一行。 */
type ForgetEvent =
	| { readonly type: "step"; readonly step: TaskActionStep; readonly workspace: string }
	| { readonly type: "done"; readonly report: ForgetReport }
	| { readonly type: "error"; readonly error: string; readonly code: string | null };

/** 解析一行；不是我们的形状就返回 null，交给外层继续读。 */
function forgetEventOf(line: string): ForgetEvent | null {
	if (line.trim() === "") return null;
	let raw: unknown;
	try {
		raw = JSON.parse(line);
	} catch {
		return null;
	}
	if (raw === null || typeof raw !== "object") return null;
	const event = raw as Record<string, unknown>;
	if (event.type === "step" && typeof event.step === "string" && isStep(event.step))
		return {
			type: "step",
			step: event.step,
			workspace: typeof event.workspace === "string" ? event.workspace : "",
		};
	if (event.type === "done" && event.report !== null && typeof event.report === "object")
		return { type: "done", report: event.report as ForgetReport };
	if (event.type === "error")
		return {
			type: "error",
			error: typeof event.error === "string" ? event.error : globalT("errRenameFailed"),
			code: typeof event.code === "string" ? event.code : null,
		};
	return null;
}

/**
 * 从名册摘掉一个人：每本登记过他的台账各删各的（还有任务的那本由 host 回报为 kept）。
 *
 * host 回的是 **NDJSON 流**：逐本台账各跑一条 skill 写命令，每进一个阶段推一行
 * `{type:"step",step,workspace}` 喂给 `onStep` 翻进度文案，末行 `{type:"done",report}`
 * 带汇总；跑挂时推 `{type:"error",error,code}` ⇒ 这里抛 HttpError（码照旧）。
 */
export async function postForgetIdentity(
	uuid: string,
	onStep?: (event: ForgetStep) => void,
): Promise<ForgetReport> {
	const controller = new AbortController();
	const timer = setTimeout(() => {
		controller.abort(
			new DOMException(
				globalT("errTimeout", { ms: RENAME_TIMEOUT_MS }),
				"TimeoutError",
			),
		);
	}, RENAME_TIMEOUT_MS);
	try {
		const res = await fetch(`${API_PREFIX}/identity/forget`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ uuid }),
			signal: controller.signal,
			cache: "no-store",
		});
		if (!res.ok) throw errorOf(res.status, await res.text().catch(() => ""));
		// done 行的报告塞进数组：闭包里赋值，外层拿不到（TS 也不认）
		const reports: ForgetReport[] = [];
		await readLines(res, (line) => {
			const event = forgetEventOf(line);
			if (event === null) return false;
			if (event.type === "step") {
				onStep?.({ step: event.step, workspace: event.workspace });
				return false;
			}
			if (event.type === "error") throw new HttpError(event.error, event.code);
			reports.push(event.report);
			return true;
		});
		const report = reports[0];
		if (report === undefined)
			throw new HttpError(globalT("errRenameInterrupted"), null);
		return report;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * 任务写动作（认领 / 释放）的超时：host 要跑一次「取最新 → 改 → 提交 → 推送」，
 * 默认 8s 会在脚本还在改的时候报超时 ⇒ 与 host 侧 120s 对齐。
 */
const TASK_WRITE_TIMEOUT_MS = 120_000;

/**
 * 任务动作的过程阶段（与 skill `runner.go` 里的 `stepf(...)` 一一对应）：
 * 检查本地改动 → 拉取最新台账 → 写入台账 → 提交 → 推送。
 */
export type TaskActionStep = "check" | "sync" | "write" | "commit" | "push";

/** host 在 `/task/action` 的 NDJSON 流里推的一行。 */
type ActionEvent =
	| { readonly type: "step"; readonly step: TaskActionStep }
	| { readonly type: "done" }
	| { readonly type: "error"; readonly error: string; readonly code: string | null };

/** 认识的阶段 key（skill 那边多打一个、这边没跟上就整行忽略，界面继续显示上一句）。 */
function isStep(value: string): value is TaskActionStep {
	return (
		value === "check" ||
		value === "sync" ||
		value === "write" ||
		value === "commit" ||
		value === "push"
	);
}

/** 解析一行 NDJSON；不是我们的形状（空行 / 坏行）就返回 null，交给外层继续读。 */
function actionEventOf(line: string): ActionEvent | null {
	if (line.trim() === "") return null;
	let raw: unknown;
	try {
		raw = JSON.parse(line);
	} catch {
		return null;
	}
	if (raw === null || typeof raw !== "object") return null;
	const event = raw as Record<string, unknown>;
	if (event.type === "done") return { type: "done" };
	if (event.type === "step" && typeof event.step === "string" && isStep(event.step))
		return { type: "step", step: event.step };
	if (event.type === "error")
		return {
			type: "error",
			error: typeof event.error === "string" ? event.error : globalT("errTaskActionFailed"),
			code: typeof event.code === "string" ? event.code : null,
		};
	return null;
}

/**
 * 任务动作：认领（`claim`）/ 释放（`set --release`）/ 取消归档（`close --cancel`）/ 结案（`close`）/ 删除（`delete`）。
 * 取消 / 删除可带一句留言（`summary`），进过程文档执行记录。
 * 删除在办任务用 `id`；删除历史行用 `src` + `line`（两者二选一）。
 *
 * 写命令要跑「检查 → 拉取 → 写 → 提交 → 推送」好几秒，host 回的是 **NDJSON 流**：
 * 每个阶段一行 `{type:"step",step}` 喂给 `onStep` 翻进度文案，末尾 `{type:"done"}` 收尾；
 * 跑挂时推 `{type:"error",error,code}` ⇒ 这里抛 HttpError（码照旧，界面能认出「没身份」）。
 * 请求参数本身有问题时 host 还没来得及发头，仍是普通 JSON 400/500。
 *
 * 成功后由调用方重读快照。
 */
export async function postTaskAction(
	body: {
		readonly action: "claim" | "release" | "cancel" | "close" | "delete";
		/** 工作区 id（host 据此找台账根）。 */
		readonly workspace: string;
		/** 在办任务号；删历史行时不给。 */
		readonly id?: string;
		/** 历史行定位：相对 ledger/ 的路径 + 原文行号（删历史行时必给）。 */
		readonly src?: string;
		readonly line?: number;
		/** 该行指纹（`history --json` 的 fingerprint）：skill 写前核对，行已变就拒绝删。 */
		readonly fingerprint?: string;
		/** 取消 / 删除用留言（可空）/ 结案用摘要（必填）：一句话。 */
		readonly summary?: string;
	},
	onStep?: (step: TaskActionStep) => void,
): Promise<{ readonly ok: boolean }> {
	const controller = new AbortController();
	const timer = setTimeout(() => {
		controller.abort(
			new DOMException(
				globalT("errTimeout", { ms: TASK_WRITE_TIMEOUT_MS }),
				"TimeoutError",
			),
		);
	}, TASK_WRITE_TIMEOUT_MS);
	try {
		const res = await fetch(`${API_PREFIX}/task/action`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
			signal: controller.signal,
			cache: "no-store",
		});
		if (!res.ok) throw errorOf(res.status, await res.text().catch(() => ""));
		/**
		 * 处理一行：翻一行进度文案、`done` 返回 true（该收摊了）、`error` 直接抛。
		 * 坏行 / 空行当没看见 —— 一条读不懂的行不该让整条命令算失败。
		 */
		const done = await readLines(res, (line) => {
			const event = actionEventOf(line);
			if (event === null) return false;
			if (event.type === "step") {
				onStep?.(event.step);
				return false;
			}
			if (event.type === "error") throw new HttpError(event.error, event.code);
			return true;
		});
		if (done) return { ok: true };
		throw new HttpError(globalT("errTaskActionInterrupted"), null);
	} finally {
		clearTimeout(timer);
	}
}

/**
 * 「继续」建会话的超时：不跑 git，但 host 侧要建 agent、挂 preset、归组工作区，
 * 冷启动几秒很正常 ⇒ 单独给 60s，别让界面先报超时（会话其实建成了）。
 */
const CONTINUE_TIMEOUT_MS = 60_000;

/**
 * 「继续」的结果：
 *  - `started`：会话已建，拿 `sessionId` 跳过去；
 *  - `not-dsh`：该台账目录不是宿主登记过的工作区 —— **预期分支不是错误**，
 *    界面据此先复制任务号、再弹警告让人去对应的 Agent 继续。
 */
export type ContinueResult =
	| { readonly kind: "started"; readonly sessionId: string }
	| { readonly kind: "not-dsh" };

/** 在该台账所属的 DSH 工作区里起会话，并注入「只读读进度、汇报、停下」的提示词。 */
export function postTaskContinue(body: {
	/** 工作区 id（= 台账目录绝对路径）。 */
	readonly workspace: string;
	readonly id: string;
	/** 会话标题（客户端按界面语言拼好，会话列表里显示的名字）。 */
	readonly title: string;
	/** 注入的首条消息正文（客户端按界面语言拼好；host 不再自带中文模板）。 */
	readonly prompt: string;
}): Promise<ContinueResult> {
	return fetchJson<ContinueResult>(
		"/task/continue",
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		},
		CONTINUE_TIMEOUT_MS,
	);
}

/** 台账目录的宿主工作区归属：`dsh` 才起得了会话（「继续」「完成」都先问这一下）。 */
export type WorkspaceKind =
	| { readonly kind: "dsh"; readonly workspaceId: string }
	| { readonly kind: "not-dsh" };

/** 问 host：这个台账目录是不是宿主登记过的工作区（判据与「继续」同一条）。 */
export function getWorkspaceKind(path: string): Promise<WorkspaceKind> {
	return fetchJson<WorkspaceKind>(`/workspace/kind?path=${encodeURIComponent(path)}`);
}

/**
 * 首屏快照：8 卡 + 在办列表 + 趋势（host 侧每工作区跑 skill `stats` / `stats --trend` / `list`）。
 * `fresh` = 让 host 先清 1.5s 读缓存再算（手动刷新 / 首读都要最新，不吃上一屏的缓存）。
 * `sync` = 顺带拿宿主工作区补登记清单（**只有进看板与手动刷新**传，其余请求一律不传）。
 */
export function fetchBoardSnapshot(
	opts: { fresh?: boolean; sync?: boolean } = {},
): Promise<BoardPayload> {
	const query = [opts.fresh === true ? "fresh=1" : "", opts.sync === true ? "sync=1" : ""]
		.filter((part) => part !== "")
		.join("&");
	return fetchJson<BoardPayload>(
		`/board/snapshot${query === "" ? "" : `?${query}`}`,
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
