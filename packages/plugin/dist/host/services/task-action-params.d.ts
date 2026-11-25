/**
 * 任务写动作的公共参数校验（`/task/action` 旧路由与任务中心 submit 共用的单一真源）。
 *
 * 删除（在办 / 历史）一律只认任务号：历史行没有独立任务号列，但每行都带过程文档链接，
 * skill 用任务号反查该行（core.WorklogMatchesTask）。src / 行号 / 指纹都不再跨进程传，
 * 只在 skill 内部算。两处若各自写一份校验，规则一旦漂移，错误就会从「提交期可见」
 * 退化成「后台跑完 git 才失败」。这里只判形状、不产中文。
 */
/** 历史删除的定位参数：只有任务号。 */
export interface HistoryDeleteParams {
    readonly taskId: string;
}
/** 校验结果：`reason` 只用于调用方选文案，不对外展示原文。 */
export type ParamCheck<T> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly reason: "task-id";
};
/**
 * 任务号形状校验：YYYYMMDD-HHMM-<随机码>-<标题>，至少到随机码那一段（9 位以上）。
 * 只判形状，不判存在 —— 存不存在由 skill 在写前扫台账决定，提交期碰不到仓库内容。
 */
export declare function checkHistoryDelete(taskId: string): ParamCheck<HistoryDeleteParams>;
/**
 * 从 `delete-hist:<任务号>` 拆出任务号（与客户端 deleteHistJobKey 同构）。
 * 任务号本身可能含冒号吗？不会：格式是 `YYYYMMDD-HHMM-随机码-标题`，不含冒号。
 */
export declare function parseDeleteHistKey(key: string): string | null;
