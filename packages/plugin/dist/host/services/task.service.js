/**
 * 任务动作（界面行内按钮 → skill 写命令）：认领、释放。
 *
 * 写完必须清读缓存 —— 下一屏快照要看到刚改过的归属，不能吃 1.5s 的旧值。
 */
import { invalidate } from "../repositories/cache.js";
import { runTaskAction, } from "../repositories/task.repository.js";
/**
 * @param onStep - 过程步骤回调：路由把它写成 NDJSON 一行一行推给界面（进度翻牌）。
 *   命令跑完 / 失败前都会先收到前面那几个阶段，界面据此换文案。
 */
export async function actOnTask(input, onStep) {
    await runTaskAction(input.repo, input.id, input.action, input.summary ?? "", onStep);
    invalidate();
}
