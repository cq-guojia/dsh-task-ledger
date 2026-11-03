/**
 * 任务动作（界面行内按钮 → skill 写命令）：认领、释放。
 *
 * 写完必须清读缓存 —— 下一屏快照要看到刚改过的归属，不能吃 1.5s 的旧值。
 */
import { invalidate } from "../repositories/cache.js";
import { runTaskAction, type TaskAction } from "../repositories/task.repository.js";

export type { TaskAction };

export interface TaskActionInput {
	readonly action: TaskAction;
	/** 任务所在工作区根（skill 定位台账用）。 */
	readonly repo: string;
	readonly id: string;
}

export async function actOnTask(input: TaskActionInput): Promise<void> {
	await runTaskAction(input.repo, input.id, input.action);
	invalidate();
}
