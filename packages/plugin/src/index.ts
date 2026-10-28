/**
 * dsh-task-ledger host 半入口：装配层，不写业务逻辑。
 *
 * 已落地：数据面路由（任务 3，routes.ts）、内嵌 skill 全局注册（任务 2，
 * skill-registration.ts）。入口 / 图标 / 设置页（任务 1）与按钮会话交接
 * （任务 4）各自落地时再往本文件加装配，业务逻辑一律进 host/ 对应文件。
 *
 * 服务等待写在 apply 内的 ctx.inject（参考插件真机教训：顶层 inject 声明组合
 * 满足不了的依赖会令 entry 一直 pending、卡死整个 dsh 启动）；两条注入线
 * 互相独立——skills 缺席不挡数据面，反之亦然。
 */
import {
	registerRoutes,
	type WebServerLike,
	type WorkspaceRegistryLike,
} from "./host/routes.js";
import {
	buildSkillRegistration,
	type SkillsRegistry,
} from "./host/skill/registration.js";

export const name = "dsh-task-ledger";

/** 插件上下文的最小面（结构声明，不 import 官方包）。 */
interface PluginContext {
	inject(
		deps: readonly string[],
		callback: (ctx: Record<string, unknown>) => void,
	): void;
	/** 组合内副作用：进入时 setup、离开时执行返回的清理函数（cordis 核心面）。 */
	effect(setup: () => (() => void) | undefined): void;
}

export function apply(ctx: PluginContext): void {
	// ── 数据面（任务 3） ──
	ctx.inject(["workspaceRegistry", "webServer"], (services) => {
		const registry = services.workspaceRegistry as
			| WorkspaceRegistryLike
			| undefined;
		const webServer = services.webServer as WebServerLike | undefined;
		if (registry === undefined || webServer === undefined) {
			console.warn(
				"[task-ledger] workspaceRegistry / webServer 未就位，数据面路由不注册",
			);
			return;
		}
		registerRoutes(webServer, { registry });
		console.info(
			"[task-ledger] 数据面路由已注册（读 /api/task-ledger/workspaces、/board/stats）",
		);
	});

	// ── 写端点与会话交接本轮停用（2026-10-28） ──
	// 界面只剩首屏 8 个统计卡：认领 / 释放 / 结束任务没有入口，端点不注册，
	// 免得对外暴露没人用的写通道。接回时按 skill 方法重写（见 host/routes.ts 底部注释）。

	// ── skill 全局注册（任务 2） ──
	// unscoped 注册落全局层，模型可 load；disposer 随插件 dispose 自动注销。
	ctx.inject(["skills"], (services) => {
		const skills = services.skills as SkillsRegistry | undefined;
		if (skills === undefined || typeof skills.register !== "function") {
			console.warn(
				"[task-ledger] skills 服务未就位，内嵌 skill 不注册（数据面不受影响）",
			);
			return;
		}
		ctx.effect(() => {
			const registration = buildSkillRegistration();
			const dispose = skills.register(registration);
			console.info(
				`[task-ledger] 已注册内嵌 skill：${registration.name}（正文 ${registration.content.length} 字）`,
			);
			return dispose;
		});
	});
}
