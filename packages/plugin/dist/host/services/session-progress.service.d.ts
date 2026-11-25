/**
 * 后台结案的阶段披露源：把宿主会话事件翻成 `TaskRecord.progress`。
 *
 * 为什么读 `session/event` 而不是 skill 的 stderr：agent 路径里 skill 由宿主执行，
 * stderr 归工具结果，且 `tool/result` 是命令结束后一次性 emit——五条 `#step` 同时到达，
 * 根本没有「渐进」。会话的 `step/start` 是模型每一步真实开始时 append 的事件，
 * 带单调 `seq`、turn/step，正好是本仓能给的唯一真源（2026-11-25 三方评审定案）。
 *
 * 不落盘、不轮询、不改 DSH/核心；文案由 client 按界面语言随 startTask.args 透传，
 * host 只做 `{step}` / `{turn}` 占位替换，不产出中文。
 */
import type { SessionJobStore } from "./session-job.store.js";
type Listener = (...args: never[]) => unknown;
interface EventContext {
    on(event: string, listener: Listener): unknown;
}
/** 五段文案：起始 / 每一步 / 核对 / 成功 / 失败；全部由 client 透传。 */
export interface CloseProgressTexts {
    readonly starting: string;
    readonly step: string;
    readonly checking: string;
    readonly done: string;
    readonly failed: string;
}
/** 提交体边界校验：只认五个非空字符串，防止畸形文案进 store。 */
export declare function isCloseProgressTexts(value: unknown): value is CloseProgressTexts;
export interface SessionProgressTracker {
    /** 会话建好后、注入首条消息之前绑定；并发作业按 sessionId 隔离。 */
    bind(sessionId: string, key: string, texts: CloseProgressTexts): void;
    /** register 成功后补报抢跑的阶段；仍是走 jobs.reportProgress 这一个写入口。 */
    flush(sessionId: string): void;
    unbind(sessionId: string): void;
    dispose(): void;
}
/** 安装会话事件订阅；返回的 tracker 随插件 dispose 释放。 */
export declare function installSessionProgress(ctx: EventContext, jobs: SessionJobStore): SessionProgressTracker;
export {};
