/** 目前接的两个动作：认领（`claim`）/ 释放（`set --release`）。 */
export type TaskAction = "claim" | "release";
/** 认领 / 释放一条任务；失败把人话抛给上层（路由 → 500 → 界面原地显示）。 */
export declare function runTaskAction(repo: string, id: string, action: TaskAction): Promise<void>;
