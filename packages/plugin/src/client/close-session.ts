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

/** 由入口在 `sessions` 就位时注册（服务缺席 ⇒ 结案只能走手动分支）。 */
export function setSessions(next: SessionsLike): void {
	service = next;
}

/** 宿主是否提供了会话服务（界面据此决定「由 Agent 结案」能不能勾）。 */
export function hasSessions(): boolean {
	return service !== null;
}

/** 远端调用返回 `{ ok: false, ... }` 时当失败处理（业务错误不走 throw）。 */
function remoteFailure(result: unknown): Error | null {
	if (result === null || typeof result !== "object") return null;
	const record = result as { ok?: unknown; error?: unknown };
	if (record.ok !== false) return null;
	return new Error(`远端拒绝：${JSON.stringify(record.error ?? "unknown")}`);
}

export interface CloseSessionInput {
	/** 工作区目录（= 台账目录，会话 cwd）。 */
	readonly cwd: string;
	/** 宿主 registry 的工作区 id：给得出就按它归组（比 cwd 准），给不出靠 cwd 兜。 */
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
		sessionId = await svc.create(
			input.workspaceId === undefined
				? { cwd: input.cwd }
				: { cwd: input.cwd, workspaceId: input.workspaceId },
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
