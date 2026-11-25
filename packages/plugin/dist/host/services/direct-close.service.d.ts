/**
 * 直接结案的后台作业：**薄封装**，执行骨架在 write-job.service.ts。
 *
 * 与 agent 结案（session.service.ts）共用同一作业 store 与同一 key，所以同一条任务
 * 同一时刻只会有一个结案作业；差别只在执行者：这里不建会话，直接 spawn skill 写台账。
 * 阶段披露经 write-job 的唯一写入口 jobs.reportProgress 写 progress，弹窗与 TaskBar 共读。
 */
import { isWriteJobTexts, type WriteJobTexts } from "./write-job.service.js";
import { type SessionJobStore } from "./session-job.store.js";
import type { DisplayTitle } from "dsh-plugin-core/adv/tasks";
/** 八段文案（起始 + skill 五阶段 + 终态），保留旧名兼容现有调用方。 */
export type DirectCloseTexts = WriteJobTexts;
/** 提交体边界校验：只认八段非空字符串，host 不产出中文。 */
export declare const isDirectCloseTexts: typeof isWriteJobTexts;
export interface DirectCloseDeps {
    readonly jobs: SessionJobStore;
}
export interface StartDirectCloseInput {
    readonly workspace: string;
    readonly taskId: string;
    readonly summary: string;
    readonly title: DisplayTitle;
    readonly texts: DirectCloseTexts;
    readonly origin?: string;
    readonly panelId?: string;
}
export type StartDirectCloseReply = {
    readonly kind: "started";
} | {
    readonly kind: "duplicate";
} | {
    readonly kind: "not-found";
};
/** 登记并启动一条直接结案作业；终态文案沿用 store 默认的「已结案 / 失败」。 */
export declare function startDirectClose(deps: DirectCloseDeps, input: StartDirectCloseInput): Promise<StartDirectCloseReply>;
