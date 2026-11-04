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
 * **完成仍未接**，先只摆按钮。
 */

import {
	IconCheckOutlineRegular,
	IconChevronLeftOutlineRegular,
	IconChevronRightOutlineRegular,
	IconCloseOutlineRegular,
	IconCopyOutlineRegular,
	IconSearchOutlineRegular,
} from "@deepseek-ai/dsh-client-ui-primitives";
import {
	createElement as h,
	Fragment,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
	useState,
} from "react";
import { ConfirmModal } from "dsh-plugin-core/ui";
import {
	getWorkspaceKind,
	postTaskAction,
	postTaskContinue,
	type TaskActionStep,
} from "./api";
import { CancelTaskModal } from "./cancel-task-modal";
import { hasSessions, startCloseSession } from "./close-session";
import { CloseTaskModal } from "./close-task-modal";
import { formatDateTime, formatRelative } from "./format";
import { archiveSession, openSession } from "./nav";
import type { LocaleKey, Translate } from "./locales";
import { closePrompt, continuePrompt } from "./prompts";
import { displayName, type Row, resolveActions } from "./rows";
import { boardSnapshot, focusOwner, refresh, setQuery } from "./store";
import { Button, IconButton, notify, Surface, Tag, Tip } from "./ui";

type Tone = "doing" | "overdue" | "stale" | "backlog" | "open";

/** 写命令的阶段 → 底栏进度文案（skill 那边新增阶段、这边没对上 ⇒ 继续显示上一句）。 */
const STEP_LABEL: Record<TaskActionStep, LocaleKey> = {
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

	// 行内动作（认领 / 释放）：确认框不关、确定键转圈。
	// 写命令是**一次 spawn**，但 skill 每进一个阶段会打一行 `#step`，host 用 NDJSON 流推回来 ⇒
	// 底栏进度文案跟着翻（检查 → 拉取 → 写 → 提交 → 推送），比一句固定的「同步中」有准头。
	const [busy, setBusy] = useState(false);
	const [step, setStep] = useState<TaskActionStep | null>(null);
	/** 底栏进度文案：还没收到第一个阶段就先用一句「同步中」。 */
	const progressNotice = (): string =>
		step === null ? t("actionSyncing") : t(STEP_LABEL[step]);
	/** 起一条写命令：清掉上一轮的阶段，每个阶段到了就翻文案。 */
	const onStep = (next: TaskActionStep): void => setStep(next);
	const [confirmAct, setConfirmAct] = useState<"claim" | "release" | null>(null);
	const runAction = (action: "claim" | "release"): void => {
		if (!busy) setConfirmAct(action);
	};

	// 取消（归档）：走带理由输入框的弹窗（用户 2026-11-03：理由作为备注记进历史）。
	// 失败留在弹窗里改理由重试（不弹 Toast 也不关窗），成功后关窗 + 绿 Toast + 重读。
	const [cancelOpen, setCancelOpen] = useState(false);
	const [cancelError, setCancelError] = useState<string | null>(null);
	const cancelTask = async (reason: string): Promise<void> => {
		setBusy(true);
		setStep(null);
		setCancelError(null);
		try {
			await postTaskAction(
				{
					action: "cancel",
					workspace: row.task.workspace.id,
					id: row.task.id,
					...(reason === "" ? {} : { summary: reason }),
				},
				onStep,
			);
			setCancelOpen(false);
			notify(t("actionCancelDone", { title: titleOf(row) }), { variant: "success" });
			await refresh();
		} catch (error) {
			setCancelError(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
			setStep(null);
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
			const result = await postTaskContinue({
				workspace: row.task.workspace.id,
				id: row.task.id,
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

	// 完成（用户 2026-11-03 定口径）：默认交给 Agent —— 官方客户端会话面起会话、注入结案提示词，
	// 监听 `running` 由真变假（宿主推流，不轮询），然后**只查一次**台账确认结没结；
	// 结成了立刻把会话归档（不归档会攒一堆垃圾会话）。不勾「由 Agent」⇒ 留言即摘要，直接结案。
	// 成功与否**以台账为准**，不看模型自述；`lastAgentError` 只用来解释「为什么没结」。
	const [closeOpen, setCloseOpen] = useState(false);
	const [closeError, setCloseError] = useState<string | null>(null);
	// 点了「交给 Agent」才探测到不是 DSH 工作区 ⇒ 复制提示词 + 弹警告 Toast，弹窗照旧开着让人改选
	const [closing, setClosing] = useState(false);
	// 在跑的结案会话 id：会话视图被关掉后靠它重开（null = 还没有会话 / 已跑完）
	const [closingId, setClosingId] = useState<string | null>(null);
	// 只读会话视图由看板托管（行结案后会从列表移除并卸载，视图必须活在行外面）
	const sessionHeading = t("closeSessionTitle", { title: titleOf(row) });
	const showSession = (id: string): boolean =>
		props.onShowSession?.(id, sessionHeading) ?? false;

	/** 结案后确认一眼台账：这条还在不在办列表里（读不到就按"没结"处理，不谎报成功）。 */
	const stillOpen = (): boolean => {
		const board = boardSnapshot().board;
		if (board === null) return true;
		return board.tasks.some((task) => task.id === row.task.id);
	};

	const finishTask = async (input: { useAgent: boolean; note: string }): Promise<void> => {
		setBusy(true);
		setStep(null);
		setCloseError(null);
		const title = titleOf(row);
		try {
			if (!input.useAgent) {
				await postTaskAction(
					{
						action: "close",
						workspace: row.task.workspace.id,
						id: row.task.id,
						summary: input.note,
					},
					onStep,
				);
				setCloseOpen(false);
				notify(t("closeDone", { title }), { variant: "success" });
				await refresh();
				return;
			}

			const prompt = closePrompt(t, row.task.id, input.note);
			// 先判工作区（与「继续」同一条判据）：非 DSH 工作区**起不了会话**。
			// 处理与「继续」一致：复制提示词 + 警告 Toast；弹窗**不关也不锁**，人还能改成「直接结案」
			// （用户 2026-11-04：别把 Agent 选项禁掉，也别在弹窗框里加提示行）。
			let workspaceId: string | undefined;
			try {
				const kind = await getWorkspaceKind(row.task.workspace.path);
				if (kind.kind === "not-dsh") {
					const copied = await copyText(prompt);
					// 复制失败得如实改口，不能照说"已复制"
					notify(t("closeNotDshTitle"), {
						description: t(
							copied ? "closeNotDshBody" : "closeNotDshCopyFailedBody",
						),
						variant: "warning",
						durationMs: 8000,
					});
					return;
				}
				workspaceId = kind.workspaceId;
			} catch (probeError) {
				setCloseError(
					probeError instanceof Error ? probeError.message : String(probeError),
				);
				return;
			}
			// 不关窗（用户 2026-11-04）：本框禁用到跑完，上面叠只读会话视图；视图关掉就露出这个框
			setClosing(true);
			// 兜底：会话被手动关掉 / 宿主重启 ⇒ 事件永远不来。只兜「一直显示结案中」，
			// 不用它判断结果（结果照样以台账为准）。
			let guard: ReturnType<typeof setTimeout> | null = null;
			const clearGuard = (): void => {
				if (guard === null) return;
				clearTimeout(guard);
				guard = null;
			};
			const started = await startCloseSession({
				cwd: row.task.workspace.path,
				...(workspaceId === undefined ? {} : { workspaceId }),
				title: t("closeSessionTitle", { title }),
				prompt,
				onSettled: (outcome) => {
					clearGuard();
					void (async (): Promise<void> => {
						try {
							await refresh();
							const open = stillOpen();
							if (!open) {
								notify(t("closeDone", { title }), { variant: "success" });
								// 成功只关自己的结案弹窗；会话视图归看板托管，留着让人看完再自己关
								setCloseOpen(false);
								await archiveSession(outcome.sessionId);
								return;
							}
							notify(t("closeNotClosed"), {
								description:
									outcome.lastAgentError === null
										? t("closeNotClosedDesc")
										: t("closeAgentFailed", { error: outcome.lastAgentError }),
								variant: "warning",
								durationMs: 8000,
								actions: [
									{
										text: t("actionOpenSession"),
										onClick: () => {
											openSession(outcome.sessionId);
										},
									},
								],
							});
						} finally {
							setClosing(false);
							setClosingId(null);
						}
					})();
				},
				onFailed: (error, sessionId) => {
					clearGuard();
					setClosing(false);
					setClosingId(null);
					notify(t("closeAgentFailed", { error: error.message }), {
						variant: "error",
						durationMs: 8000,
						...(sessionId === null
							? {}
							: {
									actions: [
										{
											text: t("actionOpenSession"),
											onClick: () => {
												openSession(sessionId);
											},
										},
									],
								}),
					});
				},
			});
			// null = 宿主没提供会话服务：退回手动分支，别让人以为点了个寂寞
			if (started === null) {
				clearGuard();
				setClosing(false);
				setCloseOpen(true);
				setCloseError(t("closeNoSessions"));
				return;
			}
			// 会话起来了 ⇒ 把只读视图叠上来（实时刷新），同时记住 id 供「查看会话」重开
			setClosingId(started);
			// 视图起不来（宿主没给 uiConversation）⇒ 回到老路：关框 + 一句「已交给 Agent」，
			// 别把人锁在一个永远重开不了的弹窗里
			if (!showSession(started)) {
				setClosingId(null);
				setClosing(false);
				setCloseOpen(false);
				notify(t("closeStarted", { title }), { variant: "success" });
			}
			// 10 分钟还没等到「这一轮跑完」⇒ 多半是会话被关掉了：只解除按钮锁定，不改结果
			guard = setTimeout(() => {
				guard = null;
				setClosing(false);
				setClosingId(null);
				notify(t("closeNotClosed"), {
					description: t("closeNotClosedDesc"),
					variant: "warning",
					durationMs: 8000,
					actions: [
						{
							text: t("actionOpenSession"),
							onClick: () => {
								openSession(started);
							},
						},
					],
				});
			}, 600_000);
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
	// 同一档尺寸（md，和动作钮同高）、无底无边的 `plain` + `.dtl-iconbtn--muted` 灰字。
	const viewButton = h(Tip, {
		label: t("viewDetail"),
		children: h(IconButton, {
			variant: "plain",
			size: "md",
			label: t("viewDetail"),
			// 抑制原生 title（系统提示要悬停一两秒才出，和官方气泡抢）：核心是 `title ?? label`，空串即不渲染。
			title: "",
			className: "dtl-iconbtn--muted",
			icon: h(IconSearchOutlineRegular, { size: 14 }),
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
					disabled: busy,
				},
				t(actionKey),
			),
		});
	// 认领：只有待认领行才有（权限见 resolveActions.claim）。点了先确认再调 claim。
	const claimButton = tipBtn(null, "actionClaim", "tipClaim", () => void runAction("claim"));
	const resumeButton = tipBtn(
		h(IconChevronRightOutlineRegular, { size: 14 }),
		"actionResume",
		"tipResume",
		() => void resumeTask(),
	);
	const finishButton = tipBtn(
		h(IconCheckOutlineRegular, { size: 14 }),
		"actionFinish",
		// 结案中（会话在跑）不再给点：避免一任务开两个结案会话
		closing ? "closeInProgress" : "tipFinish",
		closing
			? undefined
			: () => {
					setCloseError(null);
					setCloseOpen(true);
				},
	);
	// 释放 = 退回公共池：左向箭头（与「继续」的右箭头成一进一出，用户 2026-10-30）
	const releaseButton = tipBtn(
		h(IconChevronLeftOutlineRegular, { size: 14 }),
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
			title: "",
			className: "dtl-iconbtn--muted",
			icon: h(IconCloseOutlineRegular, { size: 14 }),
			disabled: busy,
			onClick: () => {
				setCancelError(null);
				setCancelOpen(true);
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
			// 抑制原生 title（系统提示要悬停一两秒才出，和官方气泡抢）：
			// 核心 IconButton 是 `title ?? label`，给空串即不渲染原生提示。
			title: "",
			className: "dtl-iconbtn--muted",
			icon: h(IconCopyOutlineRegular, { size: 14 }),
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
	const metaText = `${t("whenSubmitted", { time: whenStamp })} 丨 ${
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
	// 卡片外框（底 / 1px 边 / 圆角 12）交核心 Surface，本文件只摆行内内容。
	// ⚠️ 不传 radius：容器圆角只有一档（核心 Surface 默认 md=12），与框内 Button / Input 同档；
	// 传 sm 会变成「卡 8 < 按钮 12」的倒挂（用户 2026-11-01 一眼看出圆角不对）。
	const card = h(
		Surface,
		{ className: "dtl-taskrow", padding: null },
		h(
			"div",
			{ className: "dtl-taskrow__row", onClick: handleRowClick },
			h("span", { className: `dtl-rail dtl-rail--${tone}` }),
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
				copyButton,
				actions.view ? viewButton : null,
			),
		),
	);
	// 弹窗与卡片并列（弹窗自带遮罩，挂在哪一层都不影响定位）。
	return h(
		Fragment,
		null,
		card,
		confirmAct === null
			? null
			: (() => {
					const action = confirmAct;
					const claim = action === "claim";
					const title = titleOf(row);
					return h(ConfirmModal, {
						title: t(claim ? "claimConfirmTitle" : "releaseConfirmTitle"),
						message: t(claim ? "claimConfirmBody" : "releaseConfirmBody", { title }),
						confirmText: t(claim ? "claimConfirmOk" : "releaseConfirmOk"),
						cancelText: t("settingsCancel"),
						// 确定键无 icon ⇒ loading 时清文字、只留圈（核心自己锁宽，中英文都不跳）
						loadingText: false,
						// 提交中：底栏提示跟着 skill 的阶段翻（检查 → 拉取 → 写 → 提交 → 推送）
						notice: busy ? progressNotice() : undefined,
						onCancel: () => setConfirmAct(null),
						onConfirm: async () => {
							setBusy(true);
							setStep(null);
							try {
								await postTaskAction(
									{
										action,
										workspace: row.task.workspace.id,
										id: row.task.id,
									},
									onStep,
								);
								notify(t(claim ? "actionClaimDone" : "actionReleaseDone", { title }), {
									variant: "success",
								});
								// 归属变了 ⇒ 重读首屏（行要换位置，8 卡也跟着动）
								setConfirmAct(null);
								await refresh();
							} catch (failure) {
								notify(
									t("actionFailed", {
										error:
											failure instanceof Error
												? failure.message
												: String(failure),
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
					});
				})(),
		cancelOpen
			? h(CancelTaskModal, {
					t,
					taskTitle: titleOf(row),
					busy,
					notice: busy ? progressNotice() : undefined,
					error: cancelError,
					onClose: () => setCancelOpen(false),
					onSubmit: (reason) => void cancelTask(reason),
				})
			: null,
		closeOpen
			? h(CloseTaskModal, {
					t,
					taskTitle: titleOf(row),
					busy,
					notice: busy ? progressNotice() : undefined,
					error: closeError,
					canUseAgent: hasSessions(),
					locked: closing,
					...(closingId === null
						? {}
						: {
								onShowSession: () => {
									if (closingId !== null) showSession(closingId);
								},
							}),
					onClose: () => setCloseOpen(false),
					onSubmit: (input) => void finishTask(input),
				})
			: null,
	);
}
