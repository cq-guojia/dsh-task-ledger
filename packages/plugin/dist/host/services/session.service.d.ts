import type { DisplayTitle } from "dsh-plugin-core/adv/tasks";
import type { RegistryWorkspace } from "../types.js";
import { type SessionJobStore } from "./session-job.store.js";
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
/** 宿主 agent 的结构面（只声明本文件用到的部分）。 */
interface AgentLike {
    /** 生命周期状态：`running` = 有 driver 在跑（`runtime-types.d.ts:114`）。 */
    readonly status: "idle" | "running";
    /** 当前整段活动到达静止后兑现（`runtime-types.d.ts:192`）。 */
    whenIdle(): Promise<void>;
    /** 宿主 `Session`：命名的入参（`sessionTitle.rename(agent.session, …)`）。 */
    readonly session: unknown;
    send(message: UserMessageLike, target: "next-turn" | "next-step", wakeup: boolean): void;
}
interface AgentHandleLike {
    readonly agent: AgentLike;
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
export interface SessionDeps {
    readonly registry: {
        list(): readonly RegistryWorkspace[];
    };
    /** 以下四项**按需现取**：服务可能晚于路由就位，取不到由本文件报人话，不让路由整块失效。 */
    readonly agents: AgentsLike | undefined;
    readonly presets: AgentPresetsLike | undefined;
    readonly defaultModel: AgentDefaultModelLike | undefined;
    /** 命名服务；缺席会话就叫「未命名」，照跑。 */
    readonly sessionTitle: SessionTitleLike | undefined;
    /** 服务端作业记录（状态唯一真源）。 */
    readonly jobs: SessionJobStore;
}
/** 宿主工作区解析结果：`dsh` 带上 registry 实体（建会话要靠它归组、取名）。 */
export type WorkspaceResolution = {
    readonly kind: "dsh";
    readonly workspace: RegistryWorkspace;
} | {
    readonly kind: "not-dsh";
};
/**
 * 判据：台账目录的 path 能不能在宿主工作区里找到实体。「继续」与「完成」共用这一条。
 *
 * 非 DSH 工作区**起不了会话**，只能退化成「把提示词复制给用户，让他去对应的 Agent 粘」。
 */
export declare function resolveWorkspace(registry: {
    list(): readonly RegistryWorkspace[];
}, path: string): WorkspaceResolution;
/** 「继续」与「完成」的差别只有这一个字段 —— 不是两条链路。 */
export type StartPolicy = "resume" | "close";
export interface StartSessionInput {
    /** 台账工作区 id（= 台账目录绝对路径）。 */
    readonly workspace: string;
    /** 任务号（含任务名的那一串，skill 精确匹配用）。 */
    readonly taskId: string;
    readonly policy: StartPolicy;
    /** 会话标题（客户端按界面语言拼好，会话列表里显示的名字）。 */
    readonly title: string;
    /** 后台作业的结构化标题（核心 TaskBar 显示「分类丨说明」）；close 必填，resume 不产生作业。 */
    readonly displayTitle?: DisplayTitle;
    /**
     * 注入的首条消息正文。**由客户端拼好传进来** —— 提示词要跟界面语言（中/英）走，
     * 而语言只有浏览器半知道；host 不自带中文模板（否则英文环境收到的仍是中文）。
     */
    readonly prompt: string;
    /** 核心随提交体带来的页面级归属，登记作业时回显到 SSE 记录（缺省则核心本地兜底）。 */
    readonly origin?: string;
    /** 核心随提交体带来的面板级归属，回显供「查看会话」跳回发起面板。 */
    readonly panelId?: string;
}
/**
 * `started` = 本次新建；`duplicate` = 同一条任务已有结案作业在跑（不重复起会话）；
 * `not-dsh` = 该台账目录不是宿主登记过的工作区（**预期分支，不是错误**）。
 */
export type StartSessionReply = {
    readonly kind: "started";
    readonly sessionId: string;
} | {
    readonly kind: "duplicate";
    readonly sessionId: string;
} | {
    readonly kind: "not-dsh";
};
/** 台账结算结论（交给客户端翻文案，host 不产出中文）。 */
export type CloseOutcomeReason = "still-open" | "timeout" | "ledger-unreadable" | "session-error";
/**
 * 唯一入口：起会话（+ 需要时登记并看护作业）。
 *
 * @throws Error（人话直上界面）：见 `createSession` 的三条。
 */
export declare function startSession(deps: SessionDeps, input: StartSessionInput): Promise<StartSessionReply>;
export {};
