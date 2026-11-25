/**
 * Agent 结案的阶段披露源：把宿主会话事件翻成 `TaskRecord.progress`。
 *
 * 为什么读 `session/event` 而不是 skill 的 stderr：agent 路径里 skill 由 DSH agent 执行，
 * stderr 归工具结果，且 `tool/result` 是命令结束后一次性 emit——五条 `#step` 同时到达，
 * 根本没有「渐进」。会话的 `step/start` 是模型每一步真实开始时的事件，带单调 `seq`，
 * 这里只把它当「Agent 正在处理」这一作业级节点的触发点（2026-11-25 三方评审定案）。
 *
 * 不落盘、不轮询、不改 DSH/核心；文案由 client 按界面语言随 startTask.args 透传，
 * host 不产出中文。直接结案走 direct-close.service.ts 读 skill 真实的五阶段 stderr。
 */
import type { SessionJobStore } from "./session-job.store.js";

type Listener = (...args: never[]) => unknown;

interface EventContext {
	on(event: string, listener: Listener): unknown;
}

/** 五段文案：起始 / 每一步 / 核对 / 成功 / 失败；全部由 client 透传。 */
export interface CloseProgressTexts {
	readonly starting: string;
	readonly step: string;
	readonly checking: string;
	readonly done: string;
	readonly failed: string;
}

const FIELDS = ["starting", "step", "checking", "done", "failed"] as const;

/** 提交体边界校验：只认五个非空字符串，防止畸形文案进 store。 */
export function isCloseProgressTexts(value: unknown): value is CloseProgressTexts {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return FIELDS.every((field) => typeof record[field] === "string" && record[field] !== "");
}

interface SessionLike {
	readonly id?: unknown;
}

interface SessionEventLike {
	readonly type?: unknown;
	readonly seq?: unknown;
	readonly data?: unknown;
}

interface Binding {
	readonly key: string;
	readonly texts: CloseProgressTexts;
	lastSeq: number;
	/** register 之前不写：claim 占位行存在但还没推 SSE，首步会被 starting 覆盖。 */
	ready: boolean;
	/** register 之前抢跑的阶段：只留最新一段，登记成功后补报。 */
	pending?: string;
}

export interface SessionProgressTracker {
	/** 会话建好后、注入首条消息之前绑定；并发作业按 sessionId 隔离。 */
	bind(sessionId: string, key: string, texts: CloseProgressTexts): void;
	/** register 成功后补报抢跑的阶段；仍是走 jobs.reportProgress 这一个写入口。 */
	flush(sessionId: string): void;
	unbind(sessionId: string): void;
	dispose(): void;
}

/** 安装会话事件订阅；返回的 tracker 随插件 dispose 释放。 */
export function installSessionProgress(
	ctx: EventContext,
	jobs: SessionJobStore,
): SessionProgressTracker {
	const bindings = new Map<string, Binding>();

	const onEvent = ((session: SessionLike, event: SessionEventLike): void => {
		const id = session?.id;
		if (typeof id !== "string") return;
		const binding = bindings.get(id);
		if (binding === undefined || event?.type !== "step/start") return;
		const seq = event.seq;
		if (typeof seq !== "number" || !Number.isFinite(seq) || seq <= binding.lastSeq) return;
		binding.lastSeq = seq;
		// 只用 step/start 当「Agent 正在处理」这一真实节点的触发点——文案由客户端拼好，
		// 不带 {turn}/{step}：模型第几轮第几步没有业务语义，披露给人看的是作业阶段。
		const message = binding.texts.step;
		// register 之前只暂存：claim 占位行虽在内存，但还没推给 UI，写了也会被 starting 覆盖。
		if (!binding.ready) {
			binding.pending = message;
			return;
		}
		jobs.reportProgress(binding.key, message);
	}) as Listener;

	const onDisposed = ((session: SessionLike): void => {
		if (typeof session?.id === "string") bindings.delete(session.id);
	}) as Listener;

	const offEvent = ctx.on("session/event", onEvent);
	const offDisposed = ctx.on("session/disposed", onDisposed);

	return {
		bind(sessionId, key, texts) {
			bindings.set(sessionId, { key, texts, lastSeq: -1, ready: false });
		},
		flush(sessionId) {
			const binding = bindings.get(sessionId);
			if (binding === undefined) return;
			binding.ready = true;
			if (binding.pending === undefined) return;
			const message = binding.pending;
			binding.pending = undefined;
			jobs.reportProgress(binding.key, message);
		},
		unbind(sessionId) {
			bindings.delete(sessionId);
		},
		dispose() {
			bindings.clear();
			(offEvent as (() => void) | undefined)?.();
			(offDisposed as (() => void) | undefined)?.();
		},
	};
}
