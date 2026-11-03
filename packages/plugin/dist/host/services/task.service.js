/**
 * 任务动作（界面行内按钮 → skill 写命令）：认领、释放。
 *
 * 写完必须清读缓存 —— 下一屏快照要看到刚改过的归属，不能吃 1.5s 的旧值。
 */
import { invalidate } from "../repositories/cache.js";
import { runTaskAction } from "../repositories/task.repository.js";
export async function actOnTask(input) {
    await runTaskAction(input.repo, input.id, input.action, input.summary ?? "");
    invalidate();
}
