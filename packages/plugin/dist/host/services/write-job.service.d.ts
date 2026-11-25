/**
 * 通用写命令后台作业：释放 / 取消 / 删除 / 历史行删除 / 直接结案共用的执行体。
 *
 * 与 agent 结案（session.service.ts）不同，这里不建会话：宿主自己 spawn skill 写命令，
 * 逐行读 stderr 的 `#step` 五阶段，经唯一写入口 jobs.reportProgress 写 TaskRecord.progress。
 * 弹窗 notice 与 TaskBar 共读同一字段、真渐进、不落盘、不轮询。
 *
 * 五种动作只是「命令 + key + 文案」的差别，执行骨架只有一份：
 *   claim → register → actOnTask（读 #step → reportProgress）→ settle。
 */
import { type TaskAction } from "./task.service.js";
import { type CompletionTexts, type JobKind, type SessionJobStore } from "./session-job.store.js";
import type { HistoryDeleteParams } from "./task-action-params.js";
import type { DisplayTitle } from "dsh-plugin-core/adv/tasks";
/** 八段披露文案：起始 + skill 五阶段 + 成功 / 失败终态。全部由客户端按界面语言透传。 */
export interface WriteJobTexts {
    readonly starting: string;
    readonly check: string;
    readonly sync: string;
    readonly write: string;
    readonly commit: string;
    readonly push: string;
    readonly done: string;
    readonly failed: string;
}
/** 提交体边界校验：只认八段非空字符串，host 不产出中文。 */
export declare function isWriteJobTexts(value: unknown): value is WriteJobTexts;
/** 终态 toast 后缀校验：成功 / 失败两段非空字符串。 */
export declare function isCompletionTexts(value: unknown): value is CompletionTexts;
/** 写命令后台作业的执行者类型（决定作业 store 的 rowButtons：这些都没有会话可看）。 */
export type WriteJobKind = JobKind;
export interface StartWriteJobInput {
    /** 业务键：`release:<任务号>` / `close:<任务号>` / `delete-hist:<src>:<行号>` … */
    readonly key: string;
    readonly kind: WriteJobKind;
    /** skill 写动作（task.repository.ts 的命令名）。 */
    readonly action: TaskAction;
    readonly title: DisplayTitle;
    readonly texts: WriteJobTexts;
    /** 终态 toast 后缀；直接结案沿用 store 默认的「已结案 / 失败」，新动作必传。 */
    readonly completionTexts?: CompletionTexts;
    /** 台账目录（工作区 id）：清单里没有就报 not-found，不猜路径。 */
    readonly workspace: string;
    /** 在办任务号；历史行删除给空串（命令改用 src/line 定位）。 */
    readonly taskId: string;
    /** 取消理由 / 删除留言 / 结案摘要；空串就不传 --summary。 */
    readonly summary: string;
    /** 删历史行时的 src / line / 指纹；不给就是删在办任务。 */
    readonly history?: HistoryDeleteParams;
    readonly origin?: string;
    readonly panelId?: string;
}
export type StartWriteJobReply = {
    readonly kind: "started";
} | {
    readonly kind: "duplicate";
} | {
    readonly kind: "not-found";
};
/**
 * 登记并启动一条写命令后台作业。**故意不等命令跑完**：submit 回调要尽快回 id，
 * 作业在宿主进程里自己跑，页面关掉照跑。
 */
export declare function startWriteJob(deps: {
    readonly jobs: SessionJobStore;
}, input: StartWriteJobInput): Promise<StartWriteJobReply>;
