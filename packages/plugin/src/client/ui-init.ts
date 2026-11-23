/**
 * UI 能力初始化：应用入口只在这里挂一次，业务代码不许各自初始化。
 *
 * 核心的 Toast / Tooltip / 通知默认分组都是「显式调用一次才生效」的接线，
 * 且各自是跨 bundle 副本的全局单例 —— 不挂就静默死投递（notify 只入队、没人渲染），
 * 重复挂则靠核心的 Symbol 幂等机制配平。集中到一处后，新增同类能力只改这里，
 * 不再散落到模块顶层副作用或各页面组件里。
 *
 * 顺序照核心 demo（packages/demo/src/client/index.tsx）：
 *   setTooltipRenderer → connectToasts → mountToasts → setDefaultTaskProject → ensureUiBase
 * setStyleKit 是唯一例外，必须早于任何核心 UI 模块被求值，留在 client/index.ts 模块顶层。
 *
 * 不返回 disposer：核心的 toast-host 明确不提供注销路径（页面存活期单例），
 * notify-bridge 虽有 disconnectNotifyBridge 但本仓没有广播投递、也不中途卸载整个 client，
 * 返回「部分可拆」的 disposer 只会误导调用方以为能干净还原。
 */
import { Tooltip } from "@deepseek-ai/dsh-client-ui-primitives";
import { createElement as h } from "react";
import { getDefaultTaskProject, setDefaultTaskProject } from "dsh-plugin-core/runtime";
import { connectToasts } from "dsh-plugin-core/ui/notify";
import { mountToasts } from "dsh-plugin-core/ui/toast";
import { setTooltipRenderer } from "dsh-plugin-core/ui/tooltip";
import { TASK_PROJECT } from "./api";
import { ensureUiBase } from "./ui";

/** 核心 toast-host 的全局注册键（跨 bundle 副本共享，见核心 toast-host.ts:14）。 */
const TOAST_HOST_KEY = Symbol.for("dsh-plugin-core/toast-host");

let initialised = false;

/**
 * 挂上全部 UI 接线。幂等：重复调用直接返回；任一步抛错则不置位，下次可重试。
 * 必须在任何组件渲染前调用（client/index.ts 的 apply 开头）。
 */
export function initClientUi(): void {
	if (initialised) return;
	// 官方气泡注入核心 FieldHint / 本地 Tip 共用的渲染器（原 ui.ts 顶层副作用迁来）。
	setTooltipRenderer((props) => h(Tooltip, { ...props, portal: true }));
	// 广播接收端（纯逻辑）+ Toaster 宿主（唯一容器 + 队列订阅）各挂一次。
	connectToasts();
	mountToasts();
	setDefaultTaskProject(TASK_PROJECT);
	ensureUiBase();
	assertWiring();
	initialised = true;
}

/**
 * 自检：核心没有 isToastsMounted 这类公共查询，本地 notify 死投递又完全静默。
 * 这里探测两个真实的运行时不变量，任一不满足就报错，绝不让「提示不显示」再靠肉眼发现。
 * - Toast 宿主：Symbol.for 注册在 globalThis 上（核心 claimToastHost）；不能用
 *   `document.getElementById("dshpc-toast-root")` —— 容器是首次 show 时才懒建的。
 * - 默认分组：getDefaultTaskProject 是核心公共 API（runtime/index.ts）。
 */
function assertWiring(): void {
	if (typeof document === "undefined") return; // Node / SSR：核心 mount 本身也会跳过
	const globalWithHost = globalThis as Record<symbol, unknown>;
	if (globalWithHost[TOAST_HOST_KEY] === undefined) {
		console.error("[task-ledger] Toast 宿主未挂载：notify() 的提示不会显示");
	}
	if (getDefaultTaskProject() !== TASK_PROJECT) {
		console.error("[task-ledger] 默认通知分组未设置：后台任务通知可能无项目可用");
	}
}
