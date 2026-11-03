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
import type { RegistryWorkspace } from "../types.js";
/** 宿主 `agent.send` 收的消息（`dsh-llm` 的 UserMessage 结构面，只声明实际用到的字段）。 */
interface UserMessageLike {
    readonly id: string;
    readonly role: "user";
    readonly content: readonly {
        readonly type: "text";
        readonly text: string;
    }[];
    readonly source: {
        readonly kind: string;
        readonly form: string;
        readonly summary: string;
    };
}
interface AgentHandleLike {
    readonly agent: {
        send(message: UserMessageLike, target: "next-turn" | "next-step", wakeup: boolean): void;
    };
    dispose(): Promise<void>;
}
/** 宿主 `ctx.get('agents')` 的最小面。 */
export interface AgentsLike {
    create(options: {
        readonly sessionId: string;
        readonly meta: {
            readonly cwd: string;
            readonly agentPreset?: string;
        };
        readonly agentOptions: {
            readonly provider: string;
            readonly model: string;
        };
        readonly setup?: (agentCtx: unknown) => Promise<void>;
    }): Promise<AgentHandleLike>;
}
/** 宿主 `ctx.get('agentPresets')` 的最小面。 */
export interface AgentPresetsLike {
    /** 省略参数 = 部署默认 preset（settings 的 selectionPolicy().defaultId，热读）。 */
    resolve(): Promise<{
        readonly id: string;
    }>;
    mount(agentCtx: unknown, presetId: string): Promise<void> | void;
}
/** 宿主 `ctx.get('agentDefaultModel')` 的最小面。 */
export interface AgentDefaultModelLike {
    currentSelection(): {
        readonly provider?: unknown;
        readonly model?: unknown;
    } | undefined;
}
export interface ContinueDeps {
    readonly registry: {
        list(): readonly RegistryWorkspace[];
    };
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
export type ContinueResult = {
    readonly kind: "started";
    readonly sessionId: string;
} | {
    readonly kind: "not-dsh";
};
/**
 * 「继续」注入的首条消息。**只依赖任务号与 task-ledger skill 的存在** ——
 * 不写命令、不写脚本路径、不写文档章节名：skill 或过程文档模板一改，这段就不用跟着改
 * （用户 2026-11-03 三次纠正后定的口径）。
 */
export declare function buildContinuePrompt(id: string): string;
/**
 * 起会话并注入只读提示词。
 *
 * @throws Error（人话直上界面）：宿主缺 agents 服务 / 没有可用默认模型 / 会话建不起来 /
 *   建好了但归不进工作区（此时会话会被 dispose 掉，不留孤儿）。
 */
export declare function continueTask(deps: ContinueDeps, input: ContinueInput): Promise<ContinueResult>;
export {};
