import { type TaskAction, type TaskActionStep } from "../repositories/task.repository.js";
export type { TaskAction, TaskActionStep };
export interface TaskActionInput {
    readonly action: TaskAction;
    /** 任务所在工作区根（skill 定位台账用）。 */
    readonly repo: string;
    readonly id: string;
    /** 删除历史行时的定位（相对 ledger/ 的路径 + 原文行号）；不给就是删在办任务。 */
    readonly src?: string;
    readonly line?: number;
    /** 该行指纹（skill `history --json` 的 fingerprint）：写前核对，行已变则拒绝删。 */
    readonly fingerprint?: string;
    /** 取消 / 删除时的一句话留言（可选；进过程文档执行记录）。 */
    readonly summary?: string;
}
/**
 * @param onStep - 过程步骤回调：路由把它写成 NDJSON 一行一行推给界面（进度翻牌）。
 *   命令跑完 / 失败前都会先收到前面那几个阶段，界面据此换文案。
 */
export declare function actOnTask(input: TaskActionInput, onStep?: (step: TaskActionStep) => void): Promise<void>;
