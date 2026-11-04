/** 界面行内按钮对应的动作：认领 / 释放 / 取消归档 / 正常结案。 */
export type TaskAction = "claim" | "release" | "cancel" | "close";
/**
 * 跑一条任务写命令。
 *
 * @param summary - 「取消」与「结案」都用：一句话理由 / 结案摘要，写进历史行与执行记录。
 *   留空就不传 `--summary`（skill 允许取消不带摘要；正常结案由界面强制填）。
 */
export declare function runTaskAction(repo: string, id: string, action: TaskAction, summary?: string): Promise<void>;
