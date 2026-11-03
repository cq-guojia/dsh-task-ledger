/**
 * 「继续」：在**该台账所属的 DSH 工作区**里起一个新会话，把只读提示词作为首条 user message 注入。
 *
 * 为什么不塞进现有会话的输入框（2026-11-03 核实）：写草稿的 `setDraft` 只挂在会话作用域的门面上
 * （`dsh-client-ui-conversation` `contract/input.d.ts:165`，经 `SessionInputResolver.for(actx)` 取），
 * 根级 client 插件拿不到某个会话的 `actx`；按 id 取的 `input.shell()` 是包内部件。
 * 且任务↔会话之间没有绑定字段 ⇒「往哪个会话塞」本身没有答案。链路事实见
 * `docs/design/external/dsh-session-handoff.md`，兄弟插件实证 `dsh-task-dispatch-table/src/dispatch.ts:519/562/627`。
 *
 * 三条硬约束（宿主 rc 线的坑，缺一条就是"会话建了但没法干活"）：
 *  1. `setup` 里必须 `agentPresets.mount()` —— 不挂 preset 的 agent 落到空的全局层，fs / bash 全无；
 *  2. `agentOptions.provider/model` 必须成对显式给 —— 缺省**不等于**走宿主默认；
 *  3. 建完必须 `attachSession(sessionId)` —— 只设 `meta.cwd` 不会把会话归进工作区。
 */

import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import type { RegistryWorkspace } from "../types.js";

/**
 * 比较用的规范化路径：registry 里存的是建工作区时的 `fs.realpath`，
 * 而台账目录可能是手工添加进来的（符号链接 / 相对写法）⇒ 直接用字符串比会误判成「非 DSH 工作区」。
 * realpath 失败（目录不在了）就退回原串，交给后续步骤按真实情况报错。
 */
function canonical(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return path;
	}
}

/** 宿主 `agent.send` 收的消息（`dsh-llm` 的 UserMessage 结构面，只声明实际用到的字段）。 */
interface UserMessageLike {
	readonly id: string;
	readonly role: "user";
	readonly content: readonly { readonly type: "text"; readonly text: string }[];
	readonly source: {
		readonly kind: string;
		readonly form: string;
		readonly summary: string;
	};
}

interface AgentHandleLike {
	readonly agent: {
		send(
			message: UserMessageLike,
			target: "next-turn" | "next-step",
			wakeup: boolean,
		): void;
	};
	dispose(): Promise<void>;
}

/** 宿主 `ctx.get('agents')` 的最小面。 */
export interface AgentsLike {
	create(options: {
		readonly sessionId: string;
		readonly meta: { readonly cwd: string; readonly agentPreset?: string };
		readonly agentOptions: { readonly provider: string; readonly model: string };
		readonly setup?: (agentCtx: unknown) => Promise<void>;
	}): Promise<AgentHandleLike>;
}

/** 宿主 `ctx.get('agentPresets')` 的最小面。 */
export interface AgentPresetsLike {
	/** 省略参数 = 部署默认 preset（settings 的 selectionPolicy().defaultId，热读）。 */
	resolve(): Promise<{ readonly id: string }>;
	mount(agentCtx: unknown, presetId: string): Promise<void> | void;
}

/** 宿主 `ctx.get('agentDefaultModel')` 的最小面。 */
export interface AgentDefaultModelLike {
	currentSelection(): { readonly provider?: unknown; readonly model?: unknown } | undefined;
}

export interface ContinueDeps {
	readonly registry: { list(): readonly RegistryWorkspace[] };
	/** 以下三项**按需现取**：服务可能晚于路由就位，取不到由本文件报人话，不让路由整块失效。 */
	readonly agents: AgentsLike | undefined;
	readonly presets: AgentPresetsLike | undefined;
	readonly defaultModel: AgentDefaultModelLike | undefined;
}

export interface ContinueInput {
	/** 台账工作区 id（= 台账目录绝对路径）。 */
	readonly workspaceId: string;
	/** 任务号（含任务名的那一串，skill 精确匹配用）。 */
	readonly id: string;
}

/** `not-dsh` = 该台账目录不是宿主登记过的工作区（预期分支，不是错误）。 */
export type ContinueResult =
	| { readonly kind: "started"; readonly sessionId: string }
	| { readonly kind: "not-dsh" };

/**
 * 「继续」注入的首条消息。**只依赖任务号与 task-ledger skill 的存在** ——
 * 不写命令、不写脚本路径、不写文档章节名：skill 或过程文档模板一改，这段就不用跟着改
 * （用户 2026-11-03 三次纠正后定的口径）。
 */
export function buildContinuePrompt(id: string): string {
	return [
		`请先只读了解任务 \`${id}\` 的当前进度，汇报完停下。`,
		"",
		"## 第一步：读",
		"",
		"用 task-ledger skill 查这个任务，按 skill 自己的说明走，不要另拼命令、不要猜脚本路径。",
		"",
		"把任务字段和它指向的过程文档完整读完 —— 要真的打开读，不要只看查询回执的摘要。",
		"",
		"查不到这个任务、或过程文档读不到：把错误原样贴出来就停下，不要换关键词模糊搜，",
		"不要猜任务号，不要另找一份文档顶上，也不要当成已完成来汇报。",
		"",
		"## 第二步：报",
		"",
		"开头写一行 `过程文档：<路径>`，然后只输出这三块，不要加别的：",
		"",
		"1. **当前进度** —— 已做到哪一步；最近一条进展记录（时间 + 一句话）。",
		"2. **下一步** —— 文档里写的下一个具体动作；没写就写「文档没有写下一步」。",
		"3. **风险与阻塞** —— 文档里记的未完成项和坑；没有就写「没有」。",
		"",
		"如实转述文档写了什么，不要补推测；文档没写的地方标「文档未写」。",
		"",
		"## 第三步：停",
		"",
		"输出完立即停下，等用户指令。不要开始执行下一步里的动作，",
		"也不要额外提方案、不要追问。",
		"",
		"## 硬约束",
		"",
		"- 本轮只读：不写文件、不装依赖、不跑构建、不动 git，不执行 task-ledger skill 的任何写操作。",
		"- 不新建会话、不派发子 agent、不派生后台任务、不新建台账任务。",
		"- 不修改台账与过程文档；你认为该改的地方只列出来，等用户发话。",
		"- 命令报错就原样贴出，不要绕过、不要手改台账文件。",
	].join("\n");
}

function continueMessage(id: string): UserMessageLike {
	return {
		id: randomUUID(),
		role: "user",
		content: [{ type: "text", text: buildContinuePrompt(id) }],
		// source 的 kind 与别的插件不冲突（合并扩展的判别字段），form/summary 只影响气泡上那行小字。
		source: { kind: "task-ledger", form: "notice", summary: `继续任务 ${id}` },
	};
}

/** 模型必须成对给：宿主缺省不填 `{{model}}` 会让 deployment persona 取不到值直接报错。 */
function resolveRoute(
	defaultModel: AgentDefaultModelLike | undefined,
): { provider: string; model: string } | undefined {
	if (defaultModel === undefined) return undefined;
	try {
		const route = defaultModel.currentSelection();
		if (
			typeof route?.provider === "string" &&
			route.provider !== "" &&
			typeof route.model === "string" &&
			route.model !== ""
		)
			return { provider: route.provider, model: route.model };
	} catch {
		/* 宿主服务未挂载时读属性会抛：按"没有默认模型"处理，由调用方报人话 */
	}
	return undefined;
}

/** 部署默认 preset；解析不出按 rosterless 处理（那种部署的东西在全局层，不挂也看得见）。 */
async function resolvePresetId(
	presets: AgentPresetsLike | undefined,
): Promise<string | undefined> {
	if (presets === undefined) return undefined;
	try {
		const { id } = await presets.resolve();
		return id === "" ? undefined : id;
	} catch {
		return undefined;
	}
}

/**
 * 起会话并注入只读提示词。
 *
 * @throws Error（人话直上界面）：宿主缺 agents 服务 / 没有可用默认模型 / 会话建不起来 /
 *   建好了但归不进工作区（此时会话会被 dispose 掉，不留孤儿）。
 */
export async function continueTask(
	deps: ContinueDeps,
	input: ContinueInput,
): Promise<ContinueResult> {
	// ① 判据：台账目录的 path 能不能在宿主工作区里找到实体 —— 找不到就是非 DSH 工作区。
	const registryList = deps.registry.list();
	const wanted = canonical(input.workspaceId);
	const workspace =
		registryList.find((item) => item.path === input.workspaceId) ??
		registryList.find((item) => canonical(item.path) === wanted);
	if (workspace === undefined) return { kind: "not-dsh" };

	const agents = deps.agents;
	if (agents === undefined)
		throw new Error("宿主没有提供 agents 服务，起不了会话（本环境无法继续任务）。");
	const route = resolveRoute(deps.defaultModel);
	if (route === undefined)
		throw new Error(
			"宿主没有可用的默认模型（provider + model 需成对），请先在宿主里选一个模型再继续。",
		);
	const presetId = await resolvePresetId(deps.presets);

	// ② 建会话（禁止预建再驱动：撞 already exists）
	const sessionId = randomUUID();
	const handle = await agents.create({
		sessionId,
		meta: {
			cwd: workspace.path,
			...(presetId === undefined ? {} : { agentPreset: presetId }),
		},
		agentOptions: route,
		setup: async (agentCtx: unknown): Promise<void> => {
			if (presetId === undefined || deps.presets === undefined) return;
			await deps.presets.mount(agentCtx, presetId);
		},
	});

	// ③ 归组：不 attach 就只有 cwd，侧栏里找不到这个会话 ⇒ 宁可回滚也不留孤儿
	try {
		if (workspace.attachSession === undefined)
			throw new Error(
				`宿主没有提供 attachSession，会话 ${sessionId} 无法归入工作区「${workspace.title}」，已放弃。`,
			);
		await workspace.attachSession(sessionId);
	} catch (error) {
		await handle.dispose().catch(() => {});
		throw error;
	}

	// ④ 注入首条消息并唤醒 driver
	handle.agent.send(continueMessage(input.id), "next-turn", true);
	return { kind: "started", sessionId };
}
