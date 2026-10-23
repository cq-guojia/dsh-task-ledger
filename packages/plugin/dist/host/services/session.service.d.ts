import type { LedgerWorkspace } from "../types.js";
/** 模型路由：provider 与 model 必须成对。 */
export interface ModelRoute {
    readonly provider: string;
    readonly model: string;
}
/** 会话首条 user 消息（`@deepseek-ai/dsh-llm` UserMessage 的最小同形面）。 */
export interface UserMessageLike {
    readonly id: string;
    readonly role: "user";
    readonly content: readonly {
        readonly type: "text";
        readonly text: string;
    }[];
    /**
     * 生产者自有 kind（宿主 v4 格式要求；`kind: 'plugin'` 已废弃会被拒）。
     * form/summary 给官方界面渲染成通知卡用。
     */
    readonly source: {
        readonly kind: string;
        readonly form: "notice";
        readonly summary: string;
    };
}
/** `ctx.agents` 最小面（`CreateAgentOptions` 见 session-handoff 文档 §二）。 */
export interface AgentsLike {
    create(options: {
        readonly sessionId: string;
        readonly meta?: {
            readonly cwd?: string;
            readonly agentPreset?: string;
        };
        readonly agentOptions?: {
            readonly provider?: string;
            readonly model?: string;
        };
        readonly setup?: (agentCtx: unknown) => void | Promise<void>;
    }): Promise<{
        readonly agent: {
            send(message: UserMessageLike, target: "next-turn" | "next-step", wakeup: boolean): void;
        };
    }>;
}
/** `ctx.agentPresets` 最小面：resolve 省略 id = 部署默认；mount 只在 setup 里调得到。 */
export interface AgentPresetsLike {
    resolve(id?: string): Promise<{
        readonly id: string;
    }>;
    mount(agentCtx: unknown, id?: string): Promise<unknown>;
}
/** `ctx.agentDefaultModel` 最小面（部署默认模型）。 */
export interface DefaultModelLike {
    currentSelection(): ModelRoute;
}
/** 交接失败的原因码（路由层据此给状态码，文案在这里写成能直接上界面的）。 */
export type HandoffErrorCode = "no-agents" | "no-preset" | "no-model" | "task-missing" | "create-failed" | "send-failed";
export declare class HandoffError extends Error {
    readonly code: HandoffErrorCode;
    constructor(code: HandoffErrorCode, message: string);
}
/** 结束任务的预置提示词入参（纯数据，便于冒烟直接断言文案）。 */
export interface ClosePromptInput {
    readonly title: string;
    readonly taskId: string;
    /** 任务所在工作区绝对路径（`--repo` 就是它）。 */
    readonly workspacePath: string;
    /** 过程文档相对 `ledger/` 的路径；缺失传 null，提示词如实说「没有」。 */
    readonly worklogPath: string | null;
    /** 用户在弹框里留的话（可为空）。 */
    readonly message: string;
}
/**
 * 「结束任务」提示词（2026-10-18 用户口述定稿）。
 *
 * 结构照用户原话：**预置说明在前，用户留言放最末**（越靠后、越只讲一件事的段落遵守率越高 ——
 * 参考插件真机结论）。三道硬约束缺一不可：
 * ① 不要开新会话（用户：我要结束这个流程了，不能让模型再开一堆框）；
 * ② 读过程文档后直接收尾（别再回头问，用户已经留言了）；
 * ③ 写台账只经 skill 脚本（插件不手改文件，close 由模型执行）。
 */
export declare function buildClosePrompt(input: ClosePromptInput): string;
/** 交接入参（路由层校验完协议字段后给）。 */
export interface CloseHandoffRequest {
    readonly workspace: LedgerWorkspace;
    readonly taskId: string;
    readonly message: string;
    /** 用户选的模型；不给 = 用宿主默认。 */
    readonly model?: ModelRoute;
}
export interface CloseHandoffResult {
    readonly sessionId: string;
    /** 非致命问题（如会话没能挂进工作区列表），如实回给调用方显示，不吞。 */
    readonly warning?: string;
}
/** 依赖面（都是惰性服务，缺了给 503 人话，不硬崩）。 */
export interface CloseHandoffDeps {
    readonly agents: AgentsLike | undefined;
    readonly presets: AgentPresetsLike | undefined;
    readonly defaultModel: DefaultModelLike | undefined;
}
/**
 * 起一个「结束任务」会话并发出首条提示词。
 * 失败抛 {@link HandoffError}（带原因码）；成功返回 sessionId 供客户端 `openSession` 跳转。
 */
export declare function startCloseSession(deps: CloseHandoffDeps, request: CloseHandoffRequest): Promise<CloseHandoffResult>;
/**
 * 模型路由：用户选了就必须给全一对（只有一半 = 配错，直接人话拒绝）；
 * 没选就走宿主部署默认。**没有兜底猜测**——猜一个模型去结案比报错更糟。
 */
export declare function resolveModelRoute(defaultModel: DefaultModelLike | undefined, explicit?: ModelRoute): ModelRoute;
