/**
 * 直接结案的后台作业：宿主自己跑 skill 的写命令，五阶段逐行写进 TaskRecord.progress。
 *
 * 与 agent 结案（session.service.ts）共用同一作业 store 与同一 key，所以同一条任务
 * 同一时刻只会有一个结案作业；差别只在执行者：这里不建会话，直接 spawn skill。
 * skill 的 stderr 每进一个阶段打一行 `#step`（runner.ts 逐行解析），host 收到就
 * 调唯一写入口 jobs.reportProgress，弹窗与 TaskBar 从同一字段读，真渐进、不落盘、
 * 不轮询、不消耗客户端资源，多个作业并行由 (sessionId/key) 与 startedAt 隔离。
 */
import { actOnTask, type TaskActionStep } from "./task.service.js";
import { closeJobKey, type SessionJobStore } from "./session-job.store.js";
import { readDirs } from "../repositories/dirs.repository.js";
import type { DisplayTitle } from "dsh-plugin-core/adv/tasks";

/** 八段文案：起始 + skill 五阶段 + 成功 / 失败终态。全部由客户端按界面语言透传。 */
export interface DirectCloseTexts {
	readonly starting: string;
	readonly check: string;
	readonly sync: string;
	readonly write: string;
	readonly commit: string;
	readonly push: string;
	readonly done: string;
	readonly failed: string;
}

const FIELDS = [
	"starting",
	"check",
	"sync",
	"write",
	"commit",
	"push",
	"done",
	"failed",
] as const;

/** 提交体边界校验：只认八段非空字符串，host 不产出中文。 */
export function isDirectCloseTexts(value: unknown): value is DirectCloseTexts {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	return FIELDS.every((field) => typeof record[field] === "string" && record[field] !== "");
}

export interface DirectCloseDeps {
	readonly jobs: SessionJobStore;
}

export interface StartDirectCloseInput {
	readonly workspace: string;
	readonly taskId: string;
	readonly summary: string;
	readonly title: DisplayTitle;
	readonly texts: DirectCloseTexts;
	readonly origin?: string;
	readonly panelId?: string;
}

export type StartDirectCloseReply =
	| { readonly kind: "started" }
	| { readonly kind: "duplicate" }
	| { readonly kind: "not-found" };

/**
 * 登记并启动一条直接结案作业。**故意不等命令跑完**：submit 回调要尽快回 id，
 * 作业在宿主进程里自己跑，页面关掉照跑。
 */
export async function startDirectClose(
	deps: DirectCloseDeps,
	input: StartDirectCloseInput,
): Promise<StartDirectCloseReply> {
	// 台账清单是工作区的唯一真源（workspaces.service.ts 同口径）——直接结案不建会话，
	// 不要求宿主 registry 里有这条工作区；原来的 /task/action 也正是按清单找 path。
	const dir = (await readDirs()).find((item) => item.path === input.workspace && !item.hidden);
	if (dir === undefined) return { kind: "not-found" };

	const key = closeJobKey(input.taskId);
	const existing = deps.jobs.find(key);
	if (existing !== undefined && existing.state === "running") return { kind: "duplicate" };
	if (!deps.jobs.claim(key, input.title, "close-direct")) {
		return { kind: "duplicate" };
	}

	deps.jobs.register({
		key,
		title: input.title,
		kind: "close-direct",
		taskId: input.taskId,
		workspace: dir.path,
		...(input.origin === undefined ? {} : { origin: input.origin }),
		...(input.panelId === undefined ? {} : { panelId: input.panelId }),
		progressMessage: input.texts.starting,
	});

	watchDirectCloseJob(deps.jobs, {
		key,
		repo: dir.path,
		taskId: input.taskId,
		summary: input.summary,
		texts: input.texts,
	});
	return { kind: "started" };
}

interface DirectCloseJob {
	readonly key: string;
	readonly repo: string;
	readonly taskId: string;
	readonly summary: string;
	readonly texts: DirectCloseTexts;
}

/** 跑写命令直到终态；逐阶段写 progress，不复核台账（skill 退出码即结论，与旧 /task/action 同口径）。 */
function watchDirectCloseJob(jobs: SessionJobStore, job: DirectCloseJob): void {
	void (async (): Promise<void> => {
		try {
			const onStep = (step: TaskActionStep): void => {
				jobs.reportProgress(job.key, job.texts[step]);
			};
			await actOnTask(
				{
					action: "close",
					repo: job.repo,
					id: job.taskId,
					summary: job.summary,
				},
				onStep,
			);
			jobs.settle(job.key, "done", { progressMessage: job.texts.done });
		} catch (error) {
			jobs.settle(job.key, "failed", {
				reason: error instanceof Error ? error.message : String(error),
				progressMessage: job.texts.failed,
			});
		}
	})();
}
