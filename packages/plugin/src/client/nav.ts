/**
 * 客户端**会话外壳的唯一出口**：导航 / 归档 / 只读视图 / 作业终态收尾。
 *
 * 为什么都放这里：这四件事全是客户端才能做的（宿主没有 `uiWorkspace`），
 * 而且都围绕「一个会话」——注册在入口（`index.ts`），消费在行 / 看板 / 弹窗，
 * 中间必须有人保存服务句柄。一个出口，免得每加一处用法就新开一个文件。
 *
 * 三组服务（都由入口在就位时注册；取不到就退化成空操作 / false，不报错）：
 *  · `opener`     `uiWorkspace.openSession(id)` —— 官方导航自己 `retain('mainView')`，插件不得自己 retain；
 *  · `sessions` + `uiConversation` —— 只读会话视图（`adv/session` 的 `openSessionView`）；
 *  · 归档不在这里：服务端终态漏斗直接调 `workspaceRegistry.archiveSession`，与客户端订阅无关。
 */
import {
	openSessionView,
	type SessionsFace,
	type SessionViewTarget,
	type UiConversationFace,
} from "dsh-plugin-core/adv/session";


/** 客户端 `ctx.sessions` 的结构面（只声明只读视图用到的方法）。 */
export interface SessionsLike {
	create(options: { cwd?: string; workspaceId?: string }): Promise<string>;
	retain(sessionId: string, options: { source: string }): SessionRefLike;
}

interface SessionRefLike {
	readonly ready: Promise<unknown>;
	release(): void;
}

let opener: ((sessionId: string) => void) | null = null;
let service: SessionsLike | null = null;
let conversation: UiConversationFace | null = null;

/** 由入口在 `uiWorkspace` 就位时调用（只注册一次）。 */
export function setSessionOpener(next: (sessionId: string) => void): void {
	opener = next;
}

/** 由入口在 `sessions` 就位时调用（只注册一次）。 */
export function setSessions(next: SessionsLike): void {
	service = next;
}

/** 由入口在 `uiConversation` 就位时调用（只注册一次）。 */
export function setUiConversation(next: UiConversationFace): void {
	conversation = next;
}

/** @returns 是否真的跳了（false = 宿主没这个服务，只是少一步跳转，不算失败）。 */
export function openSession(sessionId: string): boolean {
	if (opener === null) return false;
	opener(sessionId);
	return true;
}

/** 建只读会话视图；两个服务缺一个、或会话解析不出来 ⇒ null。 */
export function openCloseSessionView(sessionId: string): SessionViewTarget | null {
	if (service === null || conversation === null) return null;
	// SessionsLike 只声明了本文件用到的方法；binding 在宿主的同一个 sessions 服务上
	return openSessionView(
		service as unknown as SessionsFace,
		conversation,
		sessionId,
		"dsh-task-ledger",
	);
}

/** 只读会话视图能不能开（缺一个服务就开不了 ⇒ 界面别给「查看会话」这个死按钮）。 */
export function hasSessionView(): boolean {
	return service !== null && conversation !== null;
}

/** 从作业记录的 `detail` 里取会话 id（记录由宿主写，类型上是任意 JSON）。 */
export function sessionIdOfDetail(detail: unknown): string | null {
	if (detail === null || typeof detail !== "object") return null;
	const value = (detail as { sessionId?: unknown }).sessionId;
	return typeof value === "string" ? value : null;
}

