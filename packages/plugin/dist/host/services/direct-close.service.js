/**
 * 直接结案的后台作业：**薄封装**，执行骨架在 write-job.service.ts。
 *
 * 与 agent 结案（session.service.ts）共用同一作业 store 与同一 key，所以同一条任务
 * 同一时刻只会有一个结案作业；差别只在执行者：这里不建会话，直接 spawn skill 写台账。
 * 阶段披露经 write-job 的唯一写入口 jobs.reportProgress 写 progress，弹窗与 TaskBar 共读。
 */
import { isWriteJobTexts, startWriteJob, } from "./write-job.service.js";
import { closeJobKey } from "./session-job.store.js";
/** 提交体边界校验：只认八段非空字符串，host 不产出中文。 */
export const isDirectCloseTexts = isWriteJobTexts;
/** 登记并启动一条直接结案作业；终态文案沿用 store 默认的「已结案 / 失败」。 */
export async function startDirectClose(deps, input) {
    return startWriteJob(deps, {
        key: closeJobKey(input.taskId),
        kind: "close-direct",
        action: "close",
        title: input.title,
        texts: input.texts,
        workspace: input.workspace,
        taskId: input.taskId,
        summary: input.summary,
        ...(input.origin === undefined ? {} : { origin: input.origin }),
        ...(input.panelId === undefined ? {} : { panelId: input.panelId }),
    });
}
