/**
 * 通用写命令后台作业：释放 / 取消 / 删除 / 历史行删除 / 直接结案共用的执行体。
 *
 * 与 agent 结案（session.service.ts）不同，这里不建会话：宿主自己 spawn skill 写命令，
 * 逐行读 stderr 的 `#step` 五阶段，经唯一写入口 jobs.reportProgress 写 TaskRecord.progress。
 * 弹窗 notice 与 TaskBar 共读同一字段、真渐进、不落盘、不轮询。
 *
 * 五种动作只是「命令 + key + 文案」的差别，执行骨架只有一份：
 *   claim → register → actOnTask（读 #step → reportProgress）→ settle。
 */
import { actOnTask } from "./task.service.js";
import {} from "./session-job.store.js";
import { readDirs } from "../repositories/dirs.repository.js";
const FIELDS = [
    "starting",
    "check",
    "sync",
    "write",
    "commit",
    "push",
    "done",
    "failed",
];
/** 提交体边界校验：只认八段非空字符串，host 不产出中文。 */
export function isWriteJobTexts(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value))
        return false;
    const record = value;
    return FIELDS.every((field) => typeof record[field] === "string" && record[field] !== "");
}
/** 终态 toast 后缀校验：成功 / 失败两段非空字符串。 */
export function isCompletionTexts(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value))
        return false;
    const record = value;
    return (typeof record.success === "string" &&
        record.success !== "" &&
        typeof record.failure === "string" &&
        record.failure !== "");
}
/**
 * 登记并启动一条写命令后台作业。**故意不等命令跑完**：submit 回调要尽快回 id，
 * 作业在宿主进程里自己跑，页面关掉照跑。
 */
export async function startWriteJob(deps, input) {
    // 台账清单是工作区的唯一真源（与旧 /task/action 同口径）——host 不猜路径。
    const dir = (await readDirs()).find((item) => item.path === input.workspace && !item.hidden);
    if (dir === undefined)
        return { kind: "not-found" };
    const existing = deps.jobs.find(input.key);
    if (existing !== undefined && existing.state === "running")
        return { kind: "duplicate" };
    if (!deps.jobs.claim(input.key, input.title, input.kind, undefined, input.completionTexts)) {
        return { kind: "duplicate" };
    }
    deps.jobs.register({
        key: input.key,
        title: input.title,
        kind: input.kind,
        taskId: input.taskId,
        workspace: dir.path,
        ...(input.origin === undefined ? {} : { origin: input.origin }),
        ...(input.panelId === undefined ? {} : { panelId: input.panelId }),
        // 宿主 spawn skill 的硬超时 240s（task.repository.ts）再留一点收尾余量，
        // 不让 reaper 先于命令自己 settlement 把作业判成超时。
        maxDurationMs: 250_000,
        progressMessage: input.texts.starting,
        ...(input.completionTexts === undefined ? {} : { completionTexts: input.completionTexts }),
    });
    watchWriteJob(deps.jobs, input);
    return { kind: "started" };
}
/** 跑写命令直到终态；逐阶段写 progress，不复核台账（skill 退出码即结论，与旧 /task/action 同口径）。 */
function watchWriteJob(jobs, input) {
    const job = { jobs, input };
    void (async () => {
        try {
            const onStep = (step) => {
                job.jobs.reportProgress(job.input.key, job.input.texts[step]);
            };
            await actOnTask({
                action: job.input.action,
                repo: job.input.workspace,
                id: job.input.taskId,
                summary: job.input.summary,
            }, onStep);
            job.jobs.settle(job.input.key, "done", {
                progressMessage: job.input.texts.done,
            });
        }
        catch (error) {
            job.jobs.settle(job.input.key, "failed", {
                reason: error instanceof Error ? error.message : String(error),
                progressMessage: job.input.texts.failed,
            });
        }
    })();
}
