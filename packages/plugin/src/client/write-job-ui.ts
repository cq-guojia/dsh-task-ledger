/**
 * 写命令后台作业的客户端共用助手：任务行与历史页都从这里取作业标题、八段文案、
 * 终态文案与运行态查询。三处动作共用一套实现，避免 UI 与 submit 参数各写一份漂移。
 */
import type { DisplayTitle, TaskRecord } from "dsh-plugin-core/adv/tasks";
import type { Translate } from "./locales";

/** skill 五阶段文案键（与 client/api.ts 的 TaskActionStep 一一对应）。 */
export const WRITE_STEP_KEYS = {
	check: "actionStepCheck",
	sync: "actionStepSync",
	write: "actionStepWrite",
	commit: "actionStepCommit",
	push: "actionStepPush",
} as const;

/** 写动作类型（与宿主 submit 的 kind 同值）。 */
export type WriteAction = "release" | "cancel" | "delete" | "delete-hist";

/**
 * 本仓后台作业的全部 key 前缀：board-home 的 onSettled 用它过滤，
 * 只刷本仓写动作（结案 + 三个新动作 + 历史行删除），不误刷别的作业。
 * 新增写动作时在这里加一个前缀即可，不为每个动作写特例。
 */
export const WRITE_JOB_KEY_PREFIXES = [
	"close:",
	"release:",
	"cancel:",
	"delete:",
	"delete-hist:",
] as const;

interface ActionTexts {
	readonly starting: string;
	readonly done: string;
	readonly failed: string;
}

function textsOf(action: WriteAction, t: Translate): ActionTexts {
	switch (action) {
		case "release":
			return {
				starting: t("writeReleaseStarting"),
				done: t("writeReleaseDone"),
				failed: t("writeReleaseFailed"),
			};
		case "cancel":
			return {
				starting: t("writeCancelStarting"),
				done: t("writeCancelDone"),
				failed: t("writeCancelFailed"),
			};
		case "delete":
		case "delete-hist":
			return {
				starting: t("writeDeleteStarting"),
				done: t("writeDeleteDone"),
				failed: t("writeDeleteFailed"),
			};
	}
}

/** 后台作业的结构化标题：分类说清「这是什么活」，描述才是任务名。 */
export function displayTitleForAction(t: Translate, title: string): DisplayTitle {
	return { category: t("taskActionCategory"), description: title };
}

/** 八段披露文案：起始 + 五阶段（复用 actionStep*）+ 成功 / 失败，全部按界面语言拼好。 */
export function completeWriteTexts(action: WriteAction, t: Translate) {
	const texts = textsOf(action, t);
	return {
		starting: texts.starting,
		check: t(WRITE_STEP_KEYS.check),
		sync: t(WRITE_STEP_KEYS.sync),
		write: t(WRITE_STEP_KEYS.write),
		commit: t(WRITE_STEP_KEYS.commit),
		push: t(WRITE_STEP_KEYS.push),
		done: texts.done,
		failed: texts.failed,
	};
}

/** 终态 toast 后缀：核心 toast 不显示 TaskRecord.reason，人话原因必须写进后缀。 */
export function completionTextsOf(action: WriteAction, t: Translate) {
	const texts = textsOf(action, t);
	return { success: texts.done, failure: texts.failed };
}

/** 从核心 store 快照里找一条作业（按 project + key）。 */
export function findJob(
	tasks: readonly TaskRecord[],
	project: string,
	key: string,
): TaskRecord | undefined {
	return tasks.find((item) => item.key === key && item.project === project);
}

/** 该 key 是否有后台作业在跑。 */
export function isWriteJobRunning(
	tasks: readonly TaskRecord[],
	project: string,
	key: string,
): boolean {
	return findJob(tasks, project, key)?.state === "running";
}

/** 作业当前披露文字（终态保留最后一段），没有就 null。 */
export function writeJobProgress(
	tasks: readonly TaskRecord[],
	project: string,
	key: string,
): string | null {
	return findJob(tasks, project, key)?.progress?.message ?? null;
}
