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
import { serveFsRoute } from "dsh-plugin-core/host";
import { FS_ROUTE, registerRoutes, type WebServerLike, type WorkspaceRegistryLike } from "./host/routes.js";
import type {
	AgentDefaultModelLike,
	AgentPresetsLike,
	AgentsLike,
	SessionTitleLike,
} from "./host/services/continue.service.js";
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
	/** 按名取服务（取不到给 undefined）。**读属性**在未 inject 的模块上会直接 throw ⇒ 见 serviceOf。 */
	get(name: string): unknown;
}

/**
 * 「继续」用的宿主服务读取器：**现取、不预先注入**。
 *
 * 为什么不写进 `ctx.inject([...])` 的依赖表：cordis 里任一依赖缺席，整个回调永远 pending，
 * 数据面会跟着一起消失（参考插件真机教训）。这些服务缺席只该让「继续」这一个动作报人话。
 * 另外 ctx 的命名空间属性是 getter，未 inject 时读取直接 throw ⇒ 这里归一成 undefined。
 */
function serviceOf<T>(ctx: PluginContext, name: string): () => T | undefined {
	return () => {
		try {
			return ctx.get(name) as T | undefined;
		} catch {
			return undefined;
		}
	};
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
		registerRoutes(webServer, {
			registry,
			// 「继续」要起会话：agents / agentPresets / agentDefaultModel 三者按需现取
			agents: serviceOf<AgentsLike>(ctx, "agents"),
			presets: serviceOf<AgentPresetsLike>(ctx, "agentPresets"),
			defaultModel: serviceOf<AgentDefaultModelLike>(ctx, "agentDefaultModel"),
			sessionTitle: serviceOf<SessionTitleLike>(ctx, "sessionTitle"),
		});
		console.info(
			"[task-ledger] 数据面路由已注册（读 /api/task-ledger/workspaces、/board/snapshot；写 /task/action、/task/continue）",
		);
	});

	// ── 只读文件路由（核心 explorer 的数据面：选目录弹窗 + 文件预览都吃它） ──
	// 官方 workspaceFiles 只能在各自工作区内列目录，选台账目录要能走全盘 ⇒ 用核心这条。
	serveFsRoute(ctx, { path: FS_ROUTE });

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
