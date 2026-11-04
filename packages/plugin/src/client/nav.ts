/**
 * 会话导航 / 归档的**唯一出口**（`uiWorkspace` 服务）。
 *
 * 「继续」建完会话跳到那个会话：官方导航是 `uiWorkspace.openSession(id)`
 * （它自己 `retain('mainView')` + 切选择，插件**不得**自己 retain）。
 *
 * 「完成」结案成功后把会话归档（用户 2026-11-03：不归档会攒一堆垃圾会话）：
 * 官方是 `uiWorkspace.archiveSession(id, { stopActivity? })`，不自己动会话列表。
 *
 * 服务由入口（index.ts）在就位时注册进来；取不到就退化成空操作 —— 会话本身已经建好，
 * 用户照样能在侧栏找到，不该因为跳不过去 / 归档不了而报错。
 */

let opener: ((sessionId: string) => void) | null = null;
let archiver: ((sessionId: string) => Promise<void>) | null = null;

/** 由入口在 `uiWorkspace` 就位时调用（只注册一次）。 */
export function setSessionOpener(next: (sessionId: string) => void): void {
	opener = next;
}

/** 由入口在 `uiWorkspace` 就位时调用（只注册一次）。 */
export function setSessionArchiver(next: (sessionId: string) => Promise<void>): void {
	archiver = next;
}

/** @returns 是否真的跳了（false = 宿主没这个服务，只是少一步跳转，不算失败）。 */
export function openSession(sessionId: string): boolean {
	if (opener === null) return false;
	opener(sessionId);
	return true;
}

/** @returns 是否真的归档了（false = 宿主没这个服务，会话会留在侧栏，不算失败）。 */
export async function archiveSession(sessionId: string): Promise<boolean> {
	if (archiver === null) return false;
	await archiver(sessionId);
	return true;
}
