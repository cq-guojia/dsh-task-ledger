/** 界面行内按钮对应的三个动作。 */
export type TaskAction = "claim" | "release" | "cancel";
/**
 * 跑一条任务写命令。
 *
 * @param summary - 只有「取消」用：一句话理由，写进历史行摘要与执行记录（`cancelled: <理由>`）。
 *   留空就不传 `--summary`（skill 允许取消不带摘要）。
 */
export declare function runTaskAction(repo: string, id: string, action: TaskAction, summary?: string): Promise<void>;
