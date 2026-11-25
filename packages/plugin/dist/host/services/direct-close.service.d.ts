import { type SessionJobStore } from "./session-job.store.js";
import type { DisplayTitle } from "dsh-plugin-core/adv/tasks";
/** 八段文案：起始 + skill 五阶段 + 成功 / 失败终态。全部由客户端按界面语言透传。 */
export interface DirectCloseTexts {
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
export declare function isDirectCloseTexts(value: unknown): value is DirectCloseTexts;
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
/**
 * 登记并启动一条直接结案作业。**故意不等命令跑完**：submit 回调要尽快回 id，
 * 作业在宿主进程里自己跑，页面关掉照跑。
 */
export declare function startDirectClose(deps: DirectCloseDeps, input: StartDirectCloseInput): Promise<StartDirectCloseReply>;
