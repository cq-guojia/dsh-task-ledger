/**
 * 会话跳转的**唯一出口**。
 *
 * 「继续」在 host 侧建完会话后要跳到那个会话：官方导航是 `uiWorkspace.openSession(id)`
 * （它自己 `retain('mainView')` + 切选择，插件**不得**自己 retain，事实见
 * `docs/design/external/dsh-session-handoff.md:19`）。
 *
 * 服务由入口（index.ts）在就位时注册进来；取不到就退化成空操作 —— 会话本身已经建好、
 * 也归进了工作区，用户照样能在侧栏找到，不该因为跳不过去而报错。
 */

let opener: ((sessionId: string) => void) | null = null;

/** 由入口在 `uiWorkspace` 就位时调用（只注册一次）。 */
export function setSessionOpener(next: (sessionId: string) => void): void {
	opener = next;
}

/** @returns 是否真的跳了（false = 宿主没这个服务，调用方只是少一步跳转，不算失败）。 */
export function openSession(sessionId: string): boolean {
	if (opener === null) return false;
	opener(sessionId);
	return true;
}
