/** 界面行内按钮对应的动作：认领 / 释放 / 取消归档 / 正常结案。 */
export type TaskAction = "claim" | "release" | "cancel" | "close";
/** 写命令的阶段 key（与 skill `runner.go` 里的 `stepf(...)` 一一对应）。 */
export type TaskActionStep = "check" | "sync" | "write" | "commit" | "push";
/**
 * 跑一条任务写命令。
 *
 * @param summary - 「取消」与「结案」都用：一句话理由 / 结案摘要，写进历史行与执行记录。
 *   留空就不传 `--summary`（skill 允许取消不带摘要；正常结案由界面强制填）。
 * @param onStep - 过程步骤回调（逐条转发给界面做进度翻牌），不传就不让 skill 打标记。
 */
export declare function runTaskAction(repo: string, id: string, action: TaskAction, summary?: string, onStep?: (step: TaskActionStep) => void): Promise<void>;
