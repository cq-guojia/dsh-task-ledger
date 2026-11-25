import { type TaskAction, type TaskActionStep } from "../repositories/task.repository.js";
export type { TaskAction, TaskActionStep };
export interface TaskActionInput {
    readonly action: TaskAction;
    /** 任务所在工作区根（skill 定位台账用）。 */
    readonly repo: string;
    /** 任务号：在办与历史删除都用它定位（历史行由 skill 按 worklog 反查）。 */
    readonly id: string;
    /** 取消 / 删除时的一句话留言（可选；进过程文档执行记录）。 */
    readonly summary?: string;
}
/**
 * @param onStep - 过程步骤回调：路由把它写成 NDJSON 一行一行推给界面（进度翻牌）。
 *   命令跑完 / 失败前都会先收到前面那几个阶段，界面据此换文案。
 */
export declare function actOnTask(input: TaskActionInput, onStep?: (step: TaskActionStep) => void): Promise<void>;
