/**
 * 任务行（宿主**无表格件** ⇒ 自绘）：整行一张卡，样式照抄 dispatch-table 任务配置卡：
 * 左缘 6×36 状态条 + 标题行 + 第二行标签；右侧执行人名 + 灰字时长；悬停出「继续 / 完成 / 释放 / 取消」；
 * 最右常驻「查看」放大镜钮。
 *
 * 标签排最前的一定是**状态本身**（待认领 / 进行中），异常标记跟在后面（用户 2026-10-30）。
 * 状态一律**标签型、五色**（用户 2026-10-18）：灰=待认领 / 蓝=进行中 / 黄=积压 / 橙=逾期 /
 * 红=停滞；三个异常标签悬停给 skill 算好的天数解释（ageDays / idleDays / waitingDays 随 list 下发）。
 *
 * 行内**不再显示工作区**（列表已按工作区分组，组头写着，用户 2026-10-30）——原来那个位置换成了
 * 执行人名（蓝字，不是标签）。
 *
 * 按钮（含查看）**不各判各的**：权限一律问 `resolveActions()`（rows.ts），本文件只按返回值画。
 *
 * 点击行为：查看已在用；认领 / 释放（各弹一次确认）与取消（带理由输入框的弹窗）已接台账命令
 * （2026-11-03，统一走 `/task/action`）；继续走 `/task/continue` 起会话（2026-11-03 晚）；
 * 完成（含「交给 Agent」）走 `postTaskAction` / `startTask`（2026-11-21 按 v0.43.8 重构）。
 */

import {
	createElement as h,
	Fragment,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { ConfirmModal } from "dsh-plugin-core/ui/confirm-modal";
/* 后台任务中心（核心 v0.43.8）：startTask 提交、作业状态由宿主持有。 */
import { startTask, taskCenterStore } from "dsh-plugin-core/adv/tasks";
import type { DisplayTitle, TaskRecord } from "dsh-plugin-core/adv/tasks";
import {
	canHostAgentSession,
	cancelJobKey,
	closeJobKey,
	deleteJobKey,
	JOB_GROUP,
	postSessionStart,
	postTaskAction,
	releaseJobKey,
	TASK_PROJECT,
	type TaskActionStep,
} from "./api";
import {
	completionTextsOf,
	completeWriteTexts,
	displayTitleForAction,
	findJob,
	writeJobProgress,
} from "./write-job-ui";
import { CancelTaskModal, ReasonTaskModal } from "./cancel-task-modal";
import { ConfirmActionModal } from "./confirm-action-modal";
import { CloseTaskModal } from "./close-task-modal";
import { formatDateTime, formatRelative } from "./format";
import { openSession, sessionIdOfDetail } from "./nav";
import type { LocaleKey, Translate } from "./locales";
import { closePrompt, continuePrompt } from "./prompts";
import { displayName, type Row, resolveActions } from "./rows";
import { focusOwner, refresh, setQuery } from "./store";
import { Button, Card, Icon, IconButton, Loader, notify, Tag, Tip } from "./ui";

type Tone = "doing" | "overdue" | "stale" | "backlog" | "open";

/** 状态条颜色原样喂核心 Card 的 accent（核心接受任意 CSS 色值，档位映射反而不准）。 */
const RAIL_COLOR: Record<Tone, string> = {
	doing: "var(--dtl-success)",
	overdue: "var(--dtl-overdue)",
	stale: "var(--dtl-danger)",
	backlog: "var(--dtl-warning)",
	open: "var(--dtl-fg-3)",
};

/** 写命令的阶段 → 底栏进度文案（skill 那边新增阶段、这边没对上 ⇒ 继续显示上一句）。
 *  设置页的「移除身份」也逐本跑写命令，同一个映射，别抄第二份。 */
export const STEP_LABEL: Record<TaskActionStep, LocaleKey> = {
	check: "actionStepCheck",
	sync: "actionStepSync",
	write: "actionStepWrite",
	commit: "actionStepCommit",
	push: "actionStepPush",
};

/** 行标题：任务名（缺则任务号）。 */
function titleOf(row: Row): string {
	return row.task.title || row.task.id;
}

/** 复制到剪贴板：没有 clipboard API / 写入被拒都算失败，由调用方决定说什么。 */
async function copyText(text: string): Promise<boolean> {
	const clipboard = navigator.clipboard;
	if (clipboard === undefined) return false;
	try {
		await clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

/** 状态语义（异常优先：停滞 > 逾期 > 积压；三者都是 skill 按时间算出来的，不是状态）。
 *  只决定圆点 / 左缘色条这类**单色位**——标签可以多枚，见 MARKS。 */
function toneOf(row: Row): Tone {
	if (row.task.stale === true) return "stale";
	if (row.task.overdue === true) return "overdue";
	if (row.task.backlog === true) return "backlog";
	if (row.task.status === "open") return "open";
	return "doing";
}

/** 三个异常标记**可叠加**（用户 2026-10-19）：一条任务能同时逾期 + 停滞，两枚标签都要摆。
 *  积压与逾期 / 停滞不会共存（前者是待认领，后两者是进行中），故最多 2 枚。 */
const MARKS = ["backlog", "overdue", "stale"] as const;

/** 状态文案。 */
function statusLabel(tone: Tone, t: Translate): string {
	if (tone === "stale") return t("statusStale");
	if (tone === "overdue") return t("statusOverdue");
	if (tone === "backlog") return t("statusBacklog");
	if (tone === "open") return t("statusOpen");
	return t("statusActive");
}

export function TaskRowView(props: {
	t: Translate;
	row: Row;
	/** 单人台账：人名相关的一律不显示（用户 2026-10-29）。 */
	solo?: boolean;
	/** 查看：弹右侧 dock 预览过程文档 / 台账文件夹。 */
	onView?: (row: Row) => void;
	/** 打开只读会话视图（由看板托管：行结案后会被移除，视图得活在行外面）。 */
	onShowSession?: (id: string, heading: string) => boolean;
}): ReactNode {
	const { t, row } = props;
	const solo = props.solo === true;
	const tone = toneOf(row);
	const tags = row.task.tags ?? [];

	// 同步动作（认领 / 继续）仍用 busy + NDJSON step：这两条不改成后台作业。
	// 释放 / 取消 / 删除 / 结案走核心后台任务中心：提交即返回、进度读 TaskRecord.progress、
	// 终态由核心 toast + board-home 的 onSettled 统一收口，本行不自己 notify / refresh。
	const [busy, setBusy] = useState(false);
	const [step, setStep] = useState<TaskActionStep | null>(null);
	/** 底栏进度文案：还没收到第一个阶段就先用一句「同步中」。 */
	const progressNotice = (): string =>
		step === null ? t("actionSyncing") : t(STEP_LABEL[step]);
	/** 起一条写命令：清掉上一轮的阶段，每个阶段到了就翻文案。 */
	const onStep = (next: TaskActionStep): void => setStep(next);
	const [confirmAct, setConfirmAct] = useState<"claim" | "release" | null>(null);
	const runAction = (action: "claim" | "release"): void => {
		if (!busy && !anyJobRunning) setConfirmAct(action);
	};

	// 这条任务的四类后台作业：结案 / 释放 / 取消 / 删除，每类一个独立 key。
	// 本地乐观记录只兜「服务端帧还没到」的提交瞬间；终态一到即以服务端记录为准。
	const storeSnapshot = useSyncExternalStore(
		taskCenterStore.subscribe,
		taskCenterStore.getSnapshot,
	);
	const jobKeys = {
		close: closeJobKey(row.task.id),
		release: releaseJobKey(row.task.id),
		cancel: cancelJobKey(row.task.id),
		delete: deleteJobKey(row.task.id),
	} as const;
	const [optimistic, setOptimistic] = useState<TaskRecord | null>(null);
	const jobOf = (key: string): TaskRecord | undefined =>
		findJob(storeSnapshot.tasks, TASK_PROJECT, key) ??
		(optimistic?.key === key && optimistic.state === "running" ? optimistic : undefined);
	const runningOf = (key: string): boolean => jobOf(key)?.state === "running";
	const progressOf = (key: string): string | null =>
		writeJobProgress(storeSnapshot.tasks, TASK_PROJECT, key) ?? jobOf(key)?.progress?.message ?? null;
	const anyJobRunning = (Object.values(jobKeys) as readonly string[]).some(runningOf);
	/** 释放后台作业的锁定态：提交后弹窗转圈、底部只留「后台执行」。 */
	const releaseRunning = runningOf(jobKeys.release);

	// 终态一到就清掉本地乐观兜底：否则乐观行退场后旧记录仍卡着 running，按钮永远解不开。
	useEffect(() => {
		if (optimistic === null || optimistic.key === undefined) return;
		const settled = findJob(storeSnapshot.tasks, TASK_PROJECT, optimistic.key);
		if (settled !== undefined && settled.state !== "running") setOptimistic(null);
	}, [storeSnapshot, optimistic]);

	/** 提交一条写命令后台作业：不等待跑完，提交期错误留给调用方写进弹窗。 */
	const startWrite = async (
		action: "release" | "cancel" | "delete",
		key: string,
		summary: string,
	): Promise<void> => {
		const record = await startTask({
			project: TASK_PROJECT,
			group: JOB_GROUP,
			key,
			kind: action,
			title: displayTitleForAction(action, t, titleOf(row)),
			args: {
				workspace: row.task.workspace.id,
				taskId: row.task.id,
				...(summary === "" ? {} : { summary }),
				progressTexts: completeWriteTexts(action, t),
				completionTexts: completionTextsOf(action, t),
			},
		});
		setOptimistic(record);
	};

	// 取消（归档）：带理由输入框的弹窗。提交即后台执行，弹窗锁定转圈；
	// 失败（提交本身出错）留在弹窗改理由重试，命令失败走核心 toast + 看板刷新。
	const [cancelOpen, setCancelOpen] = useState(false);
	const [cancelError, setCancelError] = useState<string | null>(null);
	const cancelRunning = runningOf(jobKeys.cancel);
	const cancelTask = async (reason: string): Promise<void> => {
		setCancelError(null);
		try {
			await startWrite("cancel", jobKeys.cancel, reason);
		} catch (error) {
			setCancelError(error instanceof Error ? error.message : String(error));
		}
	};

	// 删除在办任务：与取消同款留言弹窗，后台执行 delete --id，不提供恢复 / 查询入口。
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const deleteRunning = runningOf(jobKeys.delete);
	const deleteTask = async (note: string): Promise<void> => {
		setDeleteError(null);
		try {
			await startWrite("delete", jobKeys.delete, note);
		} catch (error) {
			setDeleteError(error instanceof Error ? error.message : String(error));
		}
	};

	// 继续（用户 2026-11-03 定口径）：台账属于 DSH 工作区 ⇒ host 起会话注入「只读读进度 → 汇报 → 停下」
	// 的提示词，界面跳过去；不属于 ⇒ **先**复制完整任务号，**再**弹警告让人去对应的 Agent 继续。
	// 警告文案里那句「任务 ID 已复制」必须为真 ⇒ 复制失败换另一条文案，不许照原样说已复制。
	const resumeTask = async (): Promise<void> => {
		if (busy) return;
		setBusy(true);
		const title = titleOf(row);
		try {
			// 提示词按界面语言拼（英文环境给英文），host 只负责注入原文
			const prompt = continuePrompt(t, row.task.id);
			const result = await postSessionStart({
				workspace: row.task.workspace.id,
				id: row.task.id,
				policy: "resume",
				title: t("continueSessionTitle", { title }),
				prompt,
			});
			if (result.kind === "not-dsh") {
				// 非 DSH 工作区起不了会话：复制的是**整段提示词**（用户 2026-11-03 改口径），
				// 不是任务号 —— 用户拿去直接贴给对应 Agent 就能接着干。
				const copied = await copyText(prompt);
				notify(t("continueNotDshTitle"), {
					description: t(
						copied ? "continueNotDshBody" : "continueNotDshCopyFailedBody",
					),
					variant: "warning",
					durationMs: 8000,
				});
				return;
			}
			notify(t("continueStarted", { title }), { variant: "success" });
			// 跳不过去也不报错：会话已经建好并归进工作区，用户在侧栏能找到
			openSession(result.sessionId);
		} catch (failure) {
			notify(
				t("actionFailed", {
					error: failure instanceof Error ? failure.message : String(failure),
				}),
				{ variant: "error" },
			);
		} finally {
			setBusy(false);
		}
	};

	// 完成（用户 2026-11-03 定口径；2026-11-17 收敛到宿主执行）：
	//  · 交给 Agent：**一条命令**起会话。执行 / 判重 / 终态判定全在宿主
	//    （`host/services/session.service.ts`），作业记录在宿主（`session-job.store.ts`）；
	//    本行只发命令、按作业状态锁弹窗。终态提示与归档由看板统一消费 —— 页面关掉也不影响作业。
	//  · 不勾「由 Agent」：留言即摘要，直接写台账结案。
	// 成功与否**以台账为准**（宿主跑完会复查在办列表），不看模型自述。
	const [closeOpen, setCloseOpen] = useState(false);
	const [closeError, setCloseError] = useState<string | null>(null);
	// 只读会话视图由看板托管（行结案后会从列表移除并卸载，视图必须活在行外面）
	const sessionHeading = t("closeSessionTitle", { title: titleOf(row) });
	const showSession = (id: string): boolean =>
		props.onShowSession?.(id, sessionHeading) ?? false;

	// 结案作业的锁定态与披露文字：与 TaskBar 同源读 TaskRecord.progress。
	const closing = runningOf(jobKeys.close);
	const closingId = closing
		? sessionIdOfDetail(jobOf(jobKeys.close)?.detail)
		: null;
	const progressMessage = progressOf(jobKeys.close);

	// 各后台作业从 running 落终态时收起自己的弹窗：弹窗状态是本行私有的，
	// 顶层 onSettled 不该跨层来关；用户已点「后台执行」关窗的场合这里只是幂等兜底。
	const wasRunning = useRef({
		close: closing,
		release: runningOf(jobKeys.release),
		cancel: cancelRunning,
		delete: deleteRunning,
	});
	useEffect(() => {
		const now = {
			close: closing,
			release: runningOf(jobKeys.release),
			cancel: runningOf(jobKeys.cancel),
			delete: runningOf(jobKeys.delete),
		};
		if (wasRunning.current.close && !now.close && closeOpen) setCloseOpen(false);
		if (wasRunning.current.release && !now.release && confirmAct === "release")
			setConfirmAct(null);
		if (wasRunning.current.cancel && !now.cancel && cancelOpen) setCancelOpen(false);
		if (wasRunning.current.delete && !now.delete && deleteOpen) setDeleteOpen(false);
		wasRunning.current = now;
	}, [closing, cancelRunning, deleteRunning, closeOpen, confirmAct, cancelOpen, deleteOpen, storeSnapshot]);

	const finishTask = async (input: { useAgent: boolean; note: string }): Promise<void> => {
		setBusy(true);
		setStep(null);
		setCloseError(null);
		const title = titleOf(row);
		try {
			// 后台作业标题走核心 v0.46.0 的结构契约：分类说清「这是什么活」，描述才是任务名。
			const displayTitle: DisplayTitle = {
				category: t("taskClosureCategory"),
				description: title,
			};

			if (!input.useAgent) {
				// 直接结案也走后台作业：host 自己跑 skill，五阶段经真实 stderr 写 progress。
				// 与 agent 结案共用 close:<任务号> key（同任务互斥），只按 kind 区分执行者。
				const record = await startTask({
					project: TASK_PROJECT,
					group: JOB_GROUP,
					key: closeJobKey(row.task.id),
					kind: "close-direct",
					title: displayTitle,
					args: {
						workspace: row.task.workspace.id,
						taskId: row.task.id,
						summary: input.note,
						progressTexts: {
							starting: t("closeDirectStarting"),
							check: t("actionStepCheck"),
							sync: t("actionStepSync"),
							write: t("actionStepWrite"),
							commit: t("actionStepCommit"),
							push: t("actionStepPush"),
							done: t("closeDirectDone"),
							failed: t("closeDirectFailed"),
						},
					},
				});
				// 与 agent 路径一致：提交成功弹窗锁定转圈，不自己 notify / refresh ——
				// 终态 toast 由核心按作业配置弹，看板刷新由 board-home 的 onSettled 统一做。
				setOptimistic(record);
				return;
			}

			// 交给 Agent：**一条 startTask**。执行、判重、终态判定、归档时机全在宿主与看板，
			// 本行只提交、按返回的作业记录锁弹窗（2026-11-21 按 v0.43.8 重写）。
			const prompt = closePrompt(t, row.task.id, input.note);
			const sessionTitle = t("closeSessionTitle", { title });

			// 非 DSH 工作区起不了会话：提交前问 host 现算一次（核心 submit 不回业务错误原文），
			// 直接走「复制提示词、去对应 Agent 粘」——弹窗不关也不锁，人还能改成直接结案。
			if (!(await canHostAgentSession(row.task.workspace.path))) {
				const copied = await copyText(prompt);
				notify(t("closeNotDshTitle"), {
					description: t(copied ? "closeNotDshBody" : "closeNotDshCopyFailedBody"),
					variant: "warning",
					durationMs: 8000,
				});
				return;
			}

			const record = await startTask({
				project: TASK_PROJECT,
				group: JOB_GROUP,
				key: closeJobKey(row.task.id),
				title: displayTitle,
				kind: "close-agent",
				args: {
					workspace: row.task.workspace.id,
					taskId: row.task.id,
					prompt,
					title: sessionTitle,
					// toast 按钮文案只有浏览器知道界面语言，跟 title / prompt 一样拼好传进去。
					buttonText: t("actionOpenSession"),
					// 五段阶段披露文案同走 args：host 只替换 {turn}/{step}，不产出中文。
					progressTexts: {
						starting: t("closeStepStarting"),
						step: t("closeStepRunning"),
						checking: t("closeStepChecking"),
						done: t("closeStepDone"),
						failed: t("closeStepFailed"),
					},
				},
			});
			// 提交成功：弹窗照旧锁定转圈（用户 2026-11-21 重申 —— 不是提交就关、也不自动拉会话）。
			// 要转后台，点框里那颗「后台执行」例外钮（只关窗）；再看会话自己从后台 UI 的按钮进。
			// 本行不 showSession：会话由用户之后从后台列表的「查看会话」按钮拉起。
			setOptimistic(record);
		} catch (error) {
			setCloseError(error instanceof Error ? error.message : String(error));
			setCloseOpen(true);
		} finally {
			setBusy(false);
			setStep(null);
		}
	};

	// 第一行灰徽（用户 2026-10-28）：`[@谁 创建于 2 天前]`，只读、不可点，颜色不变。
	const created = row.task.created ?? null;
	const creatorName = displayName(row.task.creator_name, row.task.creator);
	const creatorAge =
		created === null || created === undefined
			? null
			: formatRelative(created, t);

	// 标签悬停解释（用户 2026-10-19）：一律「谁 / 何时开始 / 最后更新 / 多少天」，天数由 host 下发，
	// 前端不自行推算；缺时间就报「时间未知」，不编。
	const stamp = (value: string | null | undefined): string =>
		value === null || value === undefined
			? t("timeUnknown")
			: formatDateTime(value, { seconds: true, fallback: t("timeUnknown") });
	const dayText = (n: number | null | undefined): string =>
		n === null || n === undefined ? t("daysNone") : t("daysValue", { n });
	const detailTip = (which: Tone): string | undefined => {
		const { task } = row;
		const owner = displayName(task.owner_name, task.owner);
		// 单人台账不写人名（用户 2026-10-29）：who 传空串后，tip 首行 `{who}\n` 只剩一个前导换行，去掉
		const who = solo ? "" : owner === "" ? t("ownerUnclaimed") : `@${owner}`;
		const tip = (text: string): string => (solo ? text.replace(/^\n/, "") : text);
		const started = stamp(task.started ?? task.created);
		const updated = stamp(task.updated ?? task.started ?? task.created);
		if (which === "open") return t("tipOpen", { created: stamp(task.created) });
		if (which === "backlog")
			return t("tipBacklog", {
				created: stamp(task.created),
				d: dayText(task.waitingDays),
			});
		if (which === "doing") return tip(t("tipDoing", { who, started, updated }));
		if (which === "overdue")
			return tip(
				t("tipOverdue", {
					who,
					started,
					updated,
					d: dayText(task.ageDays),
				}),
			);
		return tip(t("tipStale", { who, started, updated, d: dayText(task.idleDays) }));
	};
	// 动作权限：**唯一**判定（用户 2026-10-18）——任务行同一套，不许各判各的；本文件只按返回值画。
	const actions = resolveActions(row.task);

	// 动作钮：继续 / 结束 / 释放 + 查看，各一份。
	// 悬停说明统一走 `Tip`（官方 Tooltip + 真 DOM 锚点；portal 逃逸裁切、hover 即出），
	// 不在 CSS 里手搓 ::after 浮层。
	// 「查看」：统一最右、放大镜图标（用户 2026-10-17）。
	// 复制 / 查看两枚是**次级**动作（常驻、非主操作）⇒ 比旁边的描边动作钮浅一档（用户 2026-10-28）：
	// 同一档尺寸（md，和动作钮同高）、无底无边的 `plain` + `.dtl-icon--muted` 灰字。
	const viewButton = h(Tip, {
		label: t("viewDetail"),
		children: h(IconButton, {
			variant: "plain",
			size: "md",
			label: t("viewDetail"),
			className: "dtl-icon--muted",
			icon: h(Icon, { name: "common.base:chazhao" }),
			onClick: () => props.onView?.(row),
		}),
	});
	// 文字动作钮：**灰底、不带边**（核心 `secondary` 档，用户 2026-10-30：原来那圈描边不要）。
	// `onPress` 没给 = 这个钮此刻不可点（结案中），提示语换成「正在结案」。
	const tipBtn = (
		icon: ReactNode,
		actionKey: "actionClaim" | "actionResume" | "actionFinish" | "actionRelease",
		tipKey: "tipClaim" | "tipResume" | "tipFinish" | "tipRelease" | "closeInProgress",
		onPress?: () => void,
	): ReactNode =>
		h(Tip, {
			label: t(tipKey),
			children: h(
				Button,
				{
					variant: "secondary",
					size: "md",
					icon: icon ?? undefined,
					onClick: onPress,
					disabled: busy || anyJobRunning,
				},
				t(actionKey),
			),
		});
	// 认领：只有待认领行才有（权限见 resolveActions.claim）。点了先确认再调 claim。
	const claimButton = tipBtn(null, "actionClaim", "tipClaim", () => void runAction("claim"));
	const resumeButton = tipBtn(
		h(Icon, { name: "common.base:jiantou-you" }),
		"actionResume",
		"tipResume",
		() => void resumeTask(),
	);
	// 「完成」（用户 2026-11-23）：不挂 hover 提示；点开结案框的行为两种状态都一样。
	// 后台会话在跑时（closing 来自 SSE 基线，刷新可恢复）按钮换「后台执行」+ 左侧动图标，
	// 但点击仍打开同一个结案框，不在按钮层禁用（同一任务不开两个会话由 finishTask 内的占位保证）。
	const finishButton = h(
		Button,
		{
			variant: "secondary",
			size: "md",
			icon: closing
				? h(Loader, { variant: "blocks", size: "xs" })
				: h(Icon, { name: "common.base:gou" }),
			onClick: () => {
					setCloseError(null);
					setCloseOpen(true);
				},
			disabled: busy || anyJobRunning,
		},
		t(closing ? "executing" : "actionFinish"),
	);
	// 释放 = 退回公共池：左向箭头（与「继续」的右箭头成一进一出，用户 2026-10-30）
	const releaseButton = tipBtn(
		h(Icon, { name: "common.base:shifang" }),
		"actionRelease",
		"tipRelease",
		() => void runAction("release"),
	);
	// 取消（用户 2026-10-29，2026-10-30 改图标）：一枚小叉，与复制 / 查看同款次级图标钮（灰字无边）；
	// 出不出来由 resolveActions.cancel 判（池任务 + 我名下的才有，别人名下的不给）。
	// 点击弹带理由输入框的弹窗（2026-11-03），不是普通确认框。
	const cancelButton = h(Tip, {
		label: t("tipCancel"),
		children: h(IconButton, {
			variant: "plain",
			size: "md",
			label: t("actionCancel"),
			className: "dtl-icon--muted",
			icon: h(Icon, { name: "common.base:guanbi" }),
			disabled: busy || anyJobRunning,
			onClick: () => {
				setCancelError(null);
				setCancelOpen(true);
			},
		}),
	});
	// 删除（2026-11-04）：紧跟小叉右边，同款次级图标钮；悬停提示「删除任务」。
	const deleteButton = h(Tip, {
		label: t("tipDeleteTask"),
		children: h(IconButton, {
			variant: "plain",
			size: "md",
			label: t("actionDelete"),
			className: "dtl-icon--muted",
			icon: h(Icon, { name: "common.base:shanchu" }),
			disabled: busy || anyJobRunning,
			onClick: () => {
				setDeleteError(null);
				setDeleteOpen(true);
			},
		}),
	});

	// 状态标签（五色实心块，用户 2026-10-18 定稿）：
	// 三枚异常标签带 skill 下发的阈值解释（没配就不解释，不编）。
	const tagOf = (which: Tone, tip?: string): ReactNode => {
		const text = statusLabel(which, t);
		return h(Tag, {
			key: which,
			text,
			tone: which,
			tip: tip ?? detailTip(which),
		});
	};
	const markTones = MARKS.filter((which) => row.task[which] === true);
	// 第一枚永远是**状态本身**（待认领 / 进行中），异常标记跟在后面（用户 2026-10-30）
	const statusTags = [
		tagOf(row.task.status === "open" ? "open" : "doing"),
		...markTones.map((which) => tagOf(which)),
	];

	// 复制任务 ID（用户 2026-10-28）：放进右侧动作排（放大镜左边）。
	// 原先摆标题后，24px 的按钮比第一行高 ⇒ hover 出现/消失会把卡片撑高再缩回，一直跳；
	// 动作排本身 hover 才显示、且那一排高度不影响行高，放这儿不抖。
	// 只复制**完整 ID** —— skill 的 show / claim / set 都是精确匹配，短码查不到（实测「找不到任务」）。
	const copyButton = h(Tip, {
		label: `${t("copyTaskId")}\n${row.task.id}`,
		maxWidth: 320,
		children: h(IconButton, {
			variant: "plain",
			size: "md",
			label: t("copyTaskId"),
			className: "dtl-icon--muted",
			icon: h(Icon, { name: "common.base:fuzhi" }),
			onClick: () => {
				void copyText(row.task.id).then((copied) => {
					notify(t(copied ? "copiedTaskId" : "copyFailed"));
				});
			},
		}),
	});

	// 第一行：标题 + 创建徽（标签全在第二行，状态标签打头，用户 2026-10-30）
	const titleLine = h(
		"div",
		{ className: "dtl-taskrow__l1" },
		h(
			"span",
			{ className: "dtl-taskrow__title dtl-ellipsis" },
			titleOf(row),
		),
		creatorAge === null || creatorName === ""
			? null
			: h(
					"span",
					{ className: "dtl-taskrow__stamp" },
					// 单人台账只留时间，不带名字（用户 2026-10-29）
					solo
						? `[${t("fieldCreatorStamp", { age: creatorAge })}]`
						: `[@${creatorName} ${t("fieldCreatorStamp", { age: creatorAge })}]`,
				),
	);

	// 右侧（用户 2026-10-28）：执行人名（常驻，代替原工作区徽标）/ `更新于 MM-DD HH:mm 丨 3 分钟前`（hover 让位）/ 动作钮。
	const whenRaw = row.task.updated ?? row.task.started ?? row.task.created;
	const whenStamp =
		whenRaw === null || whenRaw === undefined || Number.isNaN(Date.parse(whenRaw))
			? t("timeUnknown")
			: formatDateTime(whenRaw).slice(5);
	const metaText = `${t("whenSubmitted", { time: whenStamp })}${t("metaDivider")}${
		whenRaw === null || whenRaw === undefined
			? t("timeUnknown")
			: formatRelative(whenRaw, t)
	}`;
	// 执行人名只给**进行中**的行（用户 2026-10-28：没人认领就不写名字，创建人已经摆在标题后）。
	// 纯蓝字、不是标签（用户 2026-10-30）；占的是原工作区徽标那一格 —— 列表已按工作区分组，
	// 行内再写一遍工作区名是重复的。点人名 = 选中「执行人」下拉里的这个人（名册里没有也照样补进去，见 store.focusOwner）。
	const ownerName = displayName(row.task.owner_name, row.task.owner);
	const ownerUuid = (row.task.owner ?? "").trim();
	const whoNode =
		solo || row.task.status === "open" || ownerUuid === ""
			? null
			: h(
					Button,
					{
						variant: "link",
						size: "sm",
						maxWidth: 180,
						// 不加悬停提示（用户 2026-10-29）：点人名左右筛选是给内行动作，不必再解释一遍
						onClick: () => focusOwner(ownerUuid, ownerName),
					},
					`@${ownerName}`,
				);
	// 整块可点 = 查看（用户 2026-10-28）：点空白处 / 标题 / 时间都进详情；
	// 行内按钮（动作钮、人名、标签、放大镜）各干各的事，靠 closest('button') 让过。
	const handleRowClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
		const target = event.target as HTMLElement | null;
		if (target !== null && target.closest("button") !== null) return;
		props.onView?.(row);
	};
	// 整张卡交核心 Card：底色（filled 默认有底）、圆角边框、状态色条、悬停变色全由它提供，
	// 本文件只摆行内内容；不再自己写 :hover 背景。
	const card = h(
		"div",
		{ className: "dtl-taskrow", onClick: handleRowClick },
		h(
			Card,
			{
				accent: RAIL_COLOR[tone],
				// 结案作业在跑时色条在原色上呼吸（核心 0.46.6 的 loading，只改视觉不改交互）；
				// 终态由 SSE 摘掉 running 记录，closing 转 false，呼吸自动停。
				loading: closing,
				hoverable: true,
				hoverScope: "card",
				style: { padding: "12px 14px" },
			},
			h(
				"div",
				{ className: "dtl-taskrow__row" },
			h(
				"div",
				{ style: { flex: "1 1 auto", minWidth: 0 } },
				titleLine,
				h(
					"div",
					{ className: "dtl-taskrow__l2" },
					// 状态标签打头（用户 2026-10-30），#标签 = 塞进搜索框
					...statusTags,
					tags.map((tag) =>
						h(Tag, {
							key: tag,
							text: `#${tag}`,
							maxWidth: 160,
							onClick: () => setQuery({ keyword: tag }),
						}),
					),
				),
			),
			// 执行人名（蓝字，原工作区徽标的位置，用户 2026-10-30）
			whoNode,
			h("span", { className: "dtl-taskrow__meta" }, metaText),
			// 动作排：认领 / 继续 / 完成 / 释放 / 取消 + 复制 / 查看 —— **同一排、同一间距**
			// （用户 2026-10-18：查看钮原来是独立的一格，离前面的按钮远一档；
			//   2026-10-28：复制 ID 挪进来，排在放大镜左边；
			//   2026-10-29：取消排在释放之后）
			// 谁出来由 resolveActions 说了算（同一套权限，不再各判各的）
			h(
				"span",
				{ className: "dtl-taskrow__actions" },
				actions.claim ? claimButton : null,
				actions.resume ? resumeButton : null,
				actions.finish ? finishButton : null,
				actions.release ? releaseButton : null,
				actions.cancel ? cancelButton : null,
				actions.delete ? deleteButton : null,
				copyButton,
				actions.view ? viewButton : null,
			),
		),
		),
	);
	// 弹窗与卡片并列（弹窗自带遮罩，挂在哪一层都不影响定位）。
	return h(
		Fragment,
		null,
		card,
		// 认领是同步动作，沿用核心 ConfirmModal（提交期锁定、无「后台执行」）。
		confirmAct === "claim"
			? h(ConfirmModal, {
					title: t("claimConfirmTitle"),
					message: t("claimConfirmBody", { title: titleOf(row) }),
					confirmText: t("claimConfirmOk"),
					cancelText: t("settingsCancel"),
					loadingText: false,
					notice: busy ? progressNotice() : undefined,
					locked: busy,
					onCancel: () => setConfirmAct(null),
					onConfirm: async () => {
						setBusy(true);
						setStep(null);
						try {
							await postTaskAction(
								{ action: "claim", workspace: row.task.workspace.id, id: row.task.id },
								onStep,
							);
							notify(t("actionClaimDone", { title: titleOf(row) }), { variant: "success" });
							// 归属变了 ⇒ 重读首屏（行要换位置，8 卡也跟着动）
							setConfirmAct(null);
							await refresh();
						} catch (failure) {
							notify(
								t("actionFailed", {
									error: failure instanceof Error ? failure.message : String(failure),
								}),
								{ variant: "error" },
							);
							// 不关框：确定键恢复可点，能原地重试
							throw failure;
						} finally {
							setBusy(false);
							setStep(null);
						}
					},
				})
			: confirmAct === "release"
				// 释放是后台作业：点确定提交后弹窗锁定转圈，底部只留「后台执行」可关窗。
				? h(ConfirmActionModal, {
						t,
						title: t("releaseConfirmTitle"),
						message: t("releaseConfirmBody", { title: titleOf(row) }),
						confirmText: t("releaseConfirmOk"),
						busy,
						notice: releaseRunning
							? (progressOf(jobKeys.release) ?? t("actionSyncing"))
							: undefined,
						locked: releaseRunning,
						onBackground: () => setConfirmAct(null),
						onClose: () => setConfirmAct(null),
						onSubmit: () => {
							void (async () => {
								setBusy(true);
								try {
									await startWrite("release", jobKeys.release, "");
								} catch (failure) {
									notify(
										t("actionFailed", {
											error: failure instanceof Error ? failure.message : String(failure),
										}),
										{ variant: "error" },
									);
								} finally {
									setBusy(false);
								}
							})();
						},
					})
				: null,
		cancelOpen
			? h(CancelTaskModal, {
					t,
					taskTitle: titleOf(row),
					busy,
					notice: cancelRunning
						? (progressOf(jobKeys.cancel) ?? t("actionSyncing"))
						: undefined,
					error: cancelError,
					locked: cancelRunning,
					onBackground: () => setCancelOpen(false),
					onClose: () => setCancelOpen(false),
					onSubmit: (reason) => void cancelTask(reason),
				})
			: null,
		deleteOpen
			? h(ReasonTaskModal, {
					kind: "delete",
					t,
					taskTitle: titleOf(row),
					busy,
					notice: deleteRunning
						? (progressOf(jobKeys.delete) ?? t("actionSyncing"))
						: undefined,
					error: deleteError,
					locked: deleteRunning,
					onBackground: () => setDeleteOpen(false),
					onClose: () => setDeleteOpen(false),
					onSubmit: (note) => void deleteTask(note),
				})
			: null,
		closeOpen
			? h(CloseTaskModal, {
					t,
					taskTitle: titleOf(row),
					busy,
					// 扫光过程提示贯穿整个结案期（核心 Modal.notice → FlipText(sweep)）：
					// 提交阶段翻 step 文案；两条结案路径（Agent / 直接）都读服务端同一条
					// progress.message，与 TaskBar 同步翻牌；首帧未落时退回固定文案，终态保留最后一段。
					notice: busy
						? progressNotice()
						: closing
							? (progressMessage ?? t("closingNotice"))
							: undefined,
					error: closeError,
					// 「交给 Agent」能不能用由宿主说了算：起不来会在提交时回人话（不再靠客户端服务探测）
					canUseAgent: true,
					locked: closing,
					...(closingId === null
						? {}
						: {
								onShowSession: () => {
									if (closingId !== null) showSession(closingId);
								},
							}),
					// 「后台执行」：把框收起，任务留在后台列表里继续跑（会话不停）
					onBackground: () => setCloseOpen(false),
					onClose: () => setCloseOpen(false),
					onSubmit: (input) => void finishTask(input),
				})
			: null,
	);
}
