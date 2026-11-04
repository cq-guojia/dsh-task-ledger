/** 界面行内按钮对应的动作：认领 / 释放 / 取消归档 / 正常结案 / 删除。 */
export type TaskAction = "claim" | "release" | "cancel" | "close" | "delete";
/** 写命令的阶段 key（与 skill `runner.go` 里的 `stepf(...)` 一一对应）。 */
export type TaskActionStep = "check" | "sync" | "write" | "commit" | "push";
/**
 * 跑一条任务写命令。
 *
 * @param summary - 取消 / 结案的摘要、删除的留言；留空就不传 `--summary`。
 * @param onStep - 过程步骤回调（逐条转发给界面做进度翻牌），不传就不让 skill 打标记。
 * @param history - 给就是删历史行（`delete --src/--line`），不给就是删在办任务（`delete --id`）。
 */
export declare function runTaskAction(repo: string, id: string, action: TaskAction, summary?: string, onStep?: (step: TaskActionStep) => void, history?: {
    readonly src: string;
    readonly line: number;
}): Promise<void>;
