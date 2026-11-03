import { type TaskAction } from "../repositories/task.repository.js";
export type { TaskAction };
export interface TaskActionInput {
    readonly action: TaskAction;
    /** 任务所在工作区根（skill 定位台账用）。 */
    readonly repo: string;
    readonly id: string;
    /** 取消时的一句话理由（可选；进历史摘要与执行记录）。 */
    readonly summary?: string;
}
export declare function actOnTask(input: TaskActionInput): Promise<void>;
