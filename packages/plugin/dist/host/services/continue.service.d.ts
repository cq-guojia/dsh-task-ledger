/**
 * 「继续」：在**该台账所属的 DSH 工作区**里起一个新会话，把只读提示词作为首条 user message 注入。
 *
 * 为什么不塞进现有会话的输入框（2026-11-03 核实）：写草稿的 `setDraft` 只挂在会话作用域的门面上
 * （`dsh-client-ui-conversation` `contract/input.d.ts:165`，经 `SessionInputResolver.for(actx)` 取），
 * 根级 client 插件拿不到某个会话的 `actx`；按 id 取的 `input.shell()` 是包内部件。
 * 且任务↔会话之间没有绑定字段 ⇒「往哪个会话塞」本身没有答案。链路事实见
 * `docs/dependencies/dsh-session-handoff.md`，兄弟插件实证 `dsh-task-dispatch-table/src/dispatch.ts:519/562/627`。
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
        /** 宿主 `Session`：命名的入参（`sessionTitle.rename(agent.session, …)`）。 */
        readonly session: unknown;
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
/** 宿主 `sessionTitle` 服务的最小面（给会话起名；缺席就保持「未命名」，不影响继续）。 */
export interface SessionTitleLike {
    rename(session: unknown, title: string): unknown;
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
    /** 以下四项**按需现取**：服务可能晚于路由就位，取不到由本文件报人话，不让路由整块失效。 */
    readonly agents: AgentsLike | undefined;
    readonly presets: AgentPresetsLike | undefined;
    readonly defaultModel: AgentDefaultModelLike | undefined;
    /** 命名服务；缺席会话就叫「未命名」，继续照跑。 */
    readonly sessionTitle: SessionTitleLike | undefined;
}
/** 宿主工作区解析结果：`dsh` 带上 registry 实体（建会话要靠它归组、取名）。 */
export type WorkspaceResolution = {
    readonly kind: "dsh";
    readonly workspace: RegistryWorkspace;
} | {
    readonly kind: "not-dsh";
};
/**
 * 判据：台账目录的 path 能不能在宿主工作区里找到实体。
 *
 * 「继续」和「完成」两条链都先过这一关 —— 非 DSH 工作区**起不了会话**，
 * 只能退化成「把提示词复制给用户，让他去对应的 Agent 粘」。
 */
export declare function resolveWorkspace(registry: {
    list(): readonly RegistryWorkspace[];
}, path: string): WorkspaceResolution;
export interface ContinueInput {
    /** 台账工作区 id（= 台账目录绝对路径）。 */
    readonly workspaceId: string;
    /** 任务号（含任务名的那一串，skill 精确匹配用）。 */
    readonly id: string;
    /** 会话标题（客户端按界面语言拼好，会话列表里显示的名字）。 */
    readonly title: string;
    /**
     * 注入的首条消息正文。**由客户端拼好传进来** —— 提示词要跟界面语言（中/英）走，
     * 而语言只有浏览器半知道；host 不再自带中文模板（否则英文环境收到的仍是中文）。
     */
    readonly prompt: string;
}
/** `not-dsh` = 该台账目录不是宿主登记过的工作区（预期分支，不是错误）。 */
export type ContinueResult = {
    readonly kind: "started";
    readonly sessionId: string;
} | {
    readonly kind: "not-dsh";
};
/**
 * 起会话并注入只读提示词。
 *
 * @throws Error（人话直上界面）：宿主缺 agents 服务 / 没有可用默认模型 / 会话建不起来 /
 *   建好了但归不进工作区（此时会话会被 dispose 掉，不留孤儿）。
 */
export declare function continueTask(deps: ContinueDeps, input: ContinueInput): Promise<ContinueResult>;
export {};
