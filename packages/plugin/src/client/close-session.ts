/**
 * 「完成 → 由 Agent 结案」：全程走宿主**官方客户端会话面**，不建自家 HTTP 路由、不轮询。
 *
 * 官方能力（`@deepseek-ai/dsh-api-session-controller@0.2.0-rc.1`，与本机宿主同版本线）：
 *  · `ctx.sessions.create({ cwd })`              —— 建会话，归组由宿主做（`contract/sessions.d.ts:88-93`）；
 *  · `ctx.sessions.retain(id, { source })`       —— 拿会话句柄（`:52`）；
 *  · `face.rename(title)` / `face.prompt(...)`   —— 命名 + 注入提示词（`contract/session.d.ts:82-117`）；
 *  · `face.subscribe` + `snapshot.running`       —— 「这一轮跑完没」由宿主推流（`:156`）；
 *  · `snapshot.lastAgentError`                   —— 跑挂了的原因（`contract/snapshot.d.ts:75`）。
 *
 * 判据必须「先见到 true 再变 false」：刚 create 出来 `running` 就是 false，
 * 直接看 false 会立刻误报结案。
 *
 * 注意：**成功与否以台账为准**，本模块只负责回答「跑完没 / 为什么挂」，不解析模型自述。
 */

// 只读会话视图（核心）：会话在跑时给人看过程，实时刷新；两个服务缺一个就返回 null。
import {
	openSessionView,
	type SessionsFace,
	type SessionViewTarget,
	type UiConversationFace,
} from "dsh-plugin-core/session";

/** 会话快照里本模块用到的两位。 */
interface SnapshotLike {
	readonly running: boolean;
	readonly lastAgentError: string | null;
}

/** 会话句柄（`SessionFace` 的结构面）。 */
interface SessionFaceLike {
	rename(title: string): Promise<unknown>;
	prompt(
		content: readonly { readonly type: "text"; readonly text: string }[],
		mode: "queue" | "steer",
	): Promise<unknown>;
	getSnapshot(): SnapshotLike;
	subscribe(listener: () => void): () => void;
}

interface SessionRefLike {
	readonly ready: Promise<{ readonly session: SessionFaceLike }>;
	release(): void;
}

/** 客户端 `ctx.sessions` 的结构面（只声明用到的方法）。 */
export interface SessionsLike {
	create(options: { cwd?: string; workspaceId?: string }): Promise<string>;
	retain(sessionId: string, options: { source: string }): SessionRefLike;
}

export interface CloseOutcome {
	readonly sessionId: string;
	/** 这一轮的 agent 错误原因（没挂就是 null）。 */
	readonly lastAgentError: string | null;
}

let service: SessionsLike | null = null;
let conversation: UiConversationFace | null = null;

/** 由入口在 `sessions` 就位时注册（服务缺席 ⇒ 结案只能走手动分支）。 */
export function setSessions(next: SessionsLike): void {
	service = next;
}

/** 由入口在 `uiConversation` 就位时注册（缺席 ⇒ 没有会话视图，只能跳官方会话页）。 */
export function setUiConversation(next: UiConversationFace): void {
	conversation = next;
}

/** 建只读会话视图；两个服务缺一个、或会话解析不出来 ⇒ null。 */
export function openCloseSessionView(sessionId: string): SessionViewTarget | null {
	if (service === null || conversation === null) return null;
	// SessionsLike 只声明了本模块用到的方法；binding 在宿主的同一个 sessions 服务上
	return openSessionView(
		service as unknown as SessionsFace,
		conversation,
		sessionId,
		"dsh-task-ledger",
	);
}

/** 宿主是否提供了会话服务（界面据此决定「由 Agent 结案」能不能勾）。 */
export function hasSessions(): boolean {
	return service !== null;
}

/** 只读会话视图能不能开（两个服务缺一个就开不了 ⇒ 界面别给「查看会话」这个死按钮）。 */
export function hasSessionView(): boolean {
	return service !== null && conversation !== null;
}

/** 远端调用返回 `{ ok: false, ... }` 时当失败处理（业务错误不走 throw）。 */
function remoteFailure(result: unknown): Error | null {
	if (result === null || typeof result !== "object") return null;
	const record = result as { ok?: unknown; error?: unknown };
	if (record.ok !== false) return null;
	return new Error(`远端拒绝：${JSON.stringify(record.error ?? "unknown")}`);
}

export interface CloseSessionInput {
	/** 台账目录（工作区 realpath）—— 只在**拿不到 workspaceId** 时作为裸 cwd 兜底。 */
	readonly cwd: string;
	/**
	 * 宿主 registry 的工作区 id（**uuid**，由 `getWorkspaceKind` 从路径反查得到）。
	 * 有它就按它归组、会话 cwd 取该工作区的 realpath；与 `cwd` 互斥（宿主只收一个）。
	 */
	readonly workspaceId?: string;
	/** 会话标题（客户端按语言拼好）。 */
	readonly title: string;
	/** 注入的结案提示词。 */
	readonly prompt: string;
	/** 这一轮跑完（`running` 由真变假）。 */
	readonly onSettled: (outcome: CloseOutcome) => void;
	/** 建会话 / 起跑阶段就失败了。 */
	readonly onFailed: (error: Error, sessionId: string | null) => void;
}

/**
 * 起一个「结案会话」并注入提示词。
 *
 * @returns 会话 id（`null` = 宿主没提供会话服务，调用方应改走手动分支）；
 *   起跑阶段的失败走 `onFailed`，此时返回值可能是已建好的 id（供「去会话」用）。
 */
export async function startCloseSession(input: CloseSessionInput): Promise<string | null> {
	const svc = service;
	if (svc === null) return null;

	let sessionId: string;
	try {
		// 宿主 `session.create`：`workspaceId` 与 `cwd` **二选一**，两个都给直接 bad-request
		// （`@deepseek-ai/dsh-api-session-controller` `lib/index.js` create 首行）；
		// 给了 workspaceId 就按它归组、cwd 取该工作区 realpath，给了 cwd 才是不归组的裸目录。
		sessionId = await svc.create(
			input.workspaceId === undefined
				? { cwd: input.cwd }
				: { workspaceId: input.workspaceId },
		);
	} catch (error) {
		input.onFailed(
			error instanceof Error ? error : new Error(String(error)),
			null,
		);
		return null;
	}

	const ref = svc.retain(sessionId, { source: "task-ledger" });
	let unsubscribe: () => void = () => {};
	try {
		const { session } = await ref.ready;
		await session.rename(input.title);

		// 必须「先见到 running 再变 false」：create 完就是 false
		let seenRunning = false;
		let done = false;
		const settle = (): void => {
			if (done) return;
			const snapshot = session.getSnapshot();
			if (snapshot.running) {
				seenRunning = true;
				return;
			}
			if (!seenRunning) return;
			done = true;
			unsubscribe();
			ref.release();
			input.onSettled({ sessionId, lastAgentError: snapshot.lastAgentError });
		};
		unsubscribe = session.subscribe(settle);

		const rejected = remoteFailure(
			await session.prompt([{ type: "text", text: input.prompt }], "queue"),
		);
		if (rejected !== null) throw rejected;
		return sessionId;
	} catch (error) {
		unsubscribe();
		ref.release();
		input.onFailed(
			error instanceof Error ? error : new Error(String(error)),
			sessionId,
		);
		return sessionId;
	}
}
