import type { DisplayTitle, TaskRecord } from "dsh-plugin-core/adv/tasks";
import type { TaskStreamSource } from "dsh-plugin-core/host";
/** 任务中心的一级项目名（与客户端 `TASK_PROJECT` 必须是同一个值）。 */
export declare const PROJECT = "dsh-task-ledger";
/** 二级分组：本插件只有「会话作业」一类后台任务，不按用途再分。 */
export declare const GROUP = "session";
/** 「查看会话」按钮 id（客户端 mountTaskUI 的 handler 按它注册）。 */
export declare const VIEW_SESSION_ACTION = "view-session";
/** 详情载荷：任意 JSON 值（与核心 `NotifyDetail` 同结构，结构化克隆过线）。 */
export type JobDetail = string | number | boolean | null | readonly JobDetail[] | {
    readonly [key: string]: JobDetail;
};
/** 新建一条作业需要的东西（由 service 在会话建好之后给）。 */
export interface RegisterInput {
    /** 业务键：`close:<任务号>` —— 判重的唯一依据。 */
    readonly key: string;
    readonly title: DisplayTitle;
    /** toast「查看会话」按钮文案；客户端按界面语言拼好，缺省写死中文兜老提交。 */
    readonly buttonText?: string;
    /** 会话 id（随 detail 下发，客户端拿它归档 / 打开）。 */
    readonly sessionId: string;
    readonly taskId: string;
    /** 台账目录绝对路径（detail 里给客户端做跳转备份）。 */
    readonly workspace: string;
    /** 核心随提交体发来的页面级归属，回显到记录供 scope:'origin' 判弹卡。 */
    readonly origin?: string;
    /** 核心随提交体发来的面板级归属，回显到记录供「查看会话」跳回发起面板。 */
    readonly panelId?: string;
    /** 超过它还在跑 ⇒ 判超时失败；0 / 缺省 = 不设上限（作业自己会结束）。 */
    readonly maxDurationMs?: number;
}
/** 终态结算载荷。 */
export interface SettleInput {
    readonly reason?: string;
    readonly result?: JobDetail;
}
/** 结案归档回调：由入口注入宿主 workspaceRegistry.archiveSession；失败由本文件消化。 */
export type SessionArchiver = (sessionId: string) => Promise<void>;
export interface SessionJobStore extends TaskStreamSource {
    /**
     * 原子占位（消除 TOCTOU）：起会话的 await 之前先占住 key，返回 true 表示拿到；
     * 并发第二个同 key 立刻拿到 false，不会再起第二个会话。失败要 release。
     */
    claim(key: string, title: DisplayTitle, buttonText?: string): boolean;
    /** 占位失败时释放（createSession 抛错 / 非 DSH）；没占住就是空操作。 */
    release(key: string): void;
    /** 把占位记录填成正式 running（带 sessionId 等详情）。 */
    register(input: RegisterInput): TaskRecord;
    /** 结算成 done / failed（幂等：已终态直接返回旧记录）。 */
    settle(key: string, state: "done" | "failed", input?: SettleInput): TaskRecord | undefined;
    /** 读一条（不含终态也返回，供 service 判「已经在跑」）。 */
    find(key: string): TaskRecord | undefined;
    /** 摘掉看护定时器（插件 dispose 时调）。 */
    dispose(): void;
}
/**
 * 建一个进程内 store。不落盘是刻意的：宿主重启 ⇒ 会话必然已中断 ⇒ 记录随之消失才是真实状态。
 */
export declare function createSessionJobStore(archive?: SessionArchiver): SessionJobStore;
/** 业务键：同一条任务同一时刻只允许一个结案作业（跨刷新、跨标签页成立）。 */
export declare function closeJobKey(taskId: string): string;
