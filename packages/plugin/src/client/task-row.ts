/**
 * 任务行（宿主**无表格件** ⇒ 自绘），**两种形态**（用户 2026-10-17 定稿：两区视觉必须不同，
 * 且**互不重用**）：
 *
 * A. `mine`（我的待办）= 整行一张卡，样式照抄 dispatch-table 任务配置卡：
 *    左缘 6×36 状态条 + 标题行 + 第二行工作区/标签；右侧灰字时长；悬停出
 *    「继续 / 结束 / 释放」；最右常驻「查看」放大镜钮。
 *
 * B. `others`（全部待办）= 连体长表里的一行（用户 2026-10-18 定稿）：**无卡片、无外框**，
 *    行 = 一条淡分隔线格：上下居中的状态圆点 + 任务（标题行 + 标签行；**标签行最前是状态标签**）
 *    + **执行人列**（原状态位，有执行人才摆 `@名字` 标签）+ 最右「@创建人 创建于 年-月-日 时:分:秒」
 *    （悬停掉时分秒并让位给操作钮）+ 查看。
 *    状态一律**标签型、五色**（用户 2026-10-18：原来是一排素字 / pill，现在与人员**位置互换**）：
 *    灰=待认领 / 蓝=进行中 / 黄=积压 / 橙=逾期 / 红=停滞；三个异常标签悬停给**配置出来的**
 *    阈值解释（staleDays / overdueDays / backlogDays 由 host 下发）。圆点颜色同色系。
 *
 * 按钮（含查看）**不各判各的**：权限一律问 `resolveActions()`（rows.ts），本文件只按返回值画。
 *
 * 按钮点击行为（含查看）归「任务按钮与会话交接」任务，本文件只做样子与提示。
 */

import {
	IconCheckOutlineRegular,
	IconChevronRightOutlineRegular,
	IconDownloadOutlineRegular,
	IconSearchOutlineRegular,
	Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import { createElement as h, type ReactNode } from "react";
import { formatDateTime } from "./format";
import type { Translate } from "./locales";
import { CLOSED_ACTIONS, displayName, type Row, resolveActions } from "./rows";
import type { BoardPayload } from "./types";
import { Tag } from "./ui";

type Tone = "doing" | "overdue" | "stale" | "backlog" | "open" | "closed";

/** 行标题：在办 = 任务名（缺则任务号）；已结案 = 任务包名（缺则「完成了什么」首句）。 */
function titleOf(row: Row): string {
	if (row.kind === "task") return row.task.title ?? row.task.id;
	const title = row.record.workpackage ?? row.record.summary;
	return title !== undefined && title !== "" ? title : (row.record.src ?? "—");
}

/** 状态语义（异常优先：停滞 > 逾期 > 积压；三者都是 host 按时间算出来的，不是状态）。
 *  只决定圆点 / 左缘色条这类**单色位**——标签可以多枚，见 MARKS。 */
function toneOf(row: Row): Tone {
	if (row.kind !== "task") return "closed";
	if (row.task.stale === true) return "stale";
	if (row.task.overdue === true) return "overdue";
	if (row.task.backlog === true) return "backlog";
	if (row.task.status === "open") return "open";
	return "doing";
}

/** 三个异常标记**可叠加**（用户 2026-10-19）：一条任务能同时逾期 + 停滞，两枚标签都要摆。
 *  积压与逾期 / 停滞不会共存（前者是待认领，后两者是进行中），故最多 2 枚。 */
const MARKS = ["backlog", "overdue", "stale"] as const;

/** 状态文案（已结案没有在办状态 ⇒ 不给标签）。 */
function statusLabel(tone: Tone, t: Translate): string | null {
	if (tone === "stale") return t("statusStale");
	if (tone === "overdue") return t("statusOverdue");
	if (tone === "backlog") return t("statusBacklog");
	if (tone === "open") return t("statusOpen");
	if (tone === "doing") return t("statusActive");
	return null;
}

export function TaskRowView(props: {
	t: Translate;
	row: Row;
	/** 形态：我的待办（卡片）/ 全部待办（表格行）——两区视觉必须不同、互不重用。 */
	variant: "mine" | "others";
	/** 快照：问动作权限（是不是我的 / 能不能认领），并取 host 下发的三个阈值做悬停解释。 */
	board: BoardPayload | null;
}): ReactNode {
	const { t, row, variant, board } = props;
	const tone = toneOf(row);
	const isTask = row.kind === "task";
	const tags = (row.kind === "task" ? row.task.tags : row.record.tags) ?? [];

	// 创建日期（第一行灰徽只给日期）。
	const created =
		row.kind === "task"
			? (row.task.created ?? null)
			: (row.record.created ?? null);
	const createdDay =
		created !== null && created !== undefined && Date.parse(created) >= 0
			? formatDateTime(created).slice(0, 10)
			: null;

	// 标签悬停解释（用户 2026-10-19）：一律「谁 / 何时开始 / 最后更新 / 多少天」，天数由 host 下发，
	// 前端不自行推算；缺时间就报「时间未知」，不编。
	const stamp = (value: string | null | undefined): string =>
		value === null || value === undefined
			? t("timeUnknown")
			: formatDateTime(value, { seconds: true, fallback: t("timeUnknown") });
	const dayText = (n: number | null | undefined): string =>
		n === null || n === undefined ? t("daysNone") : t("daysValue", { n });
	const detailTip = (which: Exclude<Tone, "closed">): string | undefined => {
		if (row.kind !== "task") return undefined;
		const { task } = row;
		const owner = displayName(task.owner_name, task.owner);
		const who = owner === "" ? t("ownerUnclaimed") : `@${owner}`;
		const started = stamp(task.started ?? task.created);
		const updated = stamp(task.updated ?? task.started ?? task.created);
		if (which === "open") return t("tipOpen", { created: stamp(task.created) });
		if (which === "backlog")
			return t("tipBacklog", {
				created: stamp(task.created),
				d: dayText(task.waitingDays),
			});
		if (which === "doing") return t("tipDoing", { who, started, updated });
		if (which === "overdue")
			return t("tipOverdue", {
				who,
				started,
				updated,
				d: dayText(task.ageDays),
			});
		return t("tipStale", { who, started, updated, d: dayText(task.idleDays) });
	};
	// 动作权限：**唯一**判定（用户 2026-10-18）——两区同一套，不许各判各的；本文件只按返回值画。
	const actions = isTask ? resolveActions(row.task, board) : CLOSED_ACTIONS;

	// 动作钮：四个 + 查看，各一份（两区共用，不许各画一套）。
	// 悬停说明统一走官方 Tooltip（portal 逃逸裁切、hover 即出），不在 CSS 里手搓 ::after 浮层。
	// 「查看」：两区都有、统一最右、放大镜图标（用户 2026-10-17）。
	const viewButton = h(Tooltip, {
		label: t("viewDetail"),
		side: "bottom",
		portal: true,
		maxWidth: 240,
		children: h(
			"button",
			{ type: "button", className: "dtl-viewbtn" },
			h(IconSearchOutlineRegular, { size: 14 }),
		),
	});
	const tipBtn = (
		icon: ReactNode,
		actionKey:
			| "actionClaim"
			| "actionResume"
			| "actionFinish"
			| "actionRelease",
		tipKey: "tipClaim" | "tipResume" | "tipFinish" | "tipRelease",
	): ReactNode =>
		h(Tooltip, {
			label: t(tipKey),
			side: "bottom",
			portal: true,
			maxWidth: 240,
			children: h(
				"button",
				{ type: "button", className: "dtl-minibtn" },
				...(icon ? [icon, t(actionKey)] : [t(actionKey)]),
			),
		});
	const claimButton = tipBtn(
		h(IconDownloadOutlineRegular, { size: 14 }),
		"actionClaim",
		"tipClaim",
	);
	const resumeButton = tipBtn(
		h(IconChevronRightOutlineRegular, { size: 14 }),
		"actionResume",
		"tipResume",
	);
	const finishButton = tipBtn(
		h(IconCheckOutlineRegular, { size: 14 }),
		"actionFinish",
		"tipFinish",
	);
	// 释放：官方 rc.2 无断链图标（已全量核实）⇒ 纯文字，不用叉
	const releaseButton = tipBtn(null, "actionRelease", "tipRelease");

	// 状态标签（五色实心块，用户 2026-10-18 定稿）：已结案没有在办状态 ⇒ 不摆；
	// 三枚异常标签带 host 配置的阈值解释（没配就不解释，不编）。
	const tagOf = (which: Exclude<Tone, "closed">, tip?: string): ReactNode => {
		const text = statusLabel(which, t) ?? "";
		return h(Tag, {
			key: which,
			text,
			tone: which,
			tip: tip ?? detailTip(which),
		});
	};
	const markTones = isTask
		? MARKS.filter((which) => row.task[which] === true)
		: [];
	// 异常标记全部摆出来；一个都没有 ⇒ 退回归属状态（待认领 / 进行中）那一枚
	const statusTags =
		tone === "closed"
			? []
			: (markTones.length > 0
					? markTones
					: [tone as Exclude<Tone, "closed">]
				).map((which) => tagOf(which));
	// 「我的待办」卡只摆异常标记（进行中只靠左缘色条，不再重复一枚）
	const alarmTags = markTones.map((which) => tagOf(which));

	// 第一行（「我的待办」卡）：标题 + 创建徽 + 异常标签
	const titleLine = h(
		"div",
		{ className: "dtl-taskrow__l1" },
		h(
			"span",
			{ className: "dtl-taskrow__title dtl-ellipsis", title: titleOf(row) },
			titleOf(row),
		),
		createdDay === null
			? null
			: h(
					"span",
					{ className: "dtl-taskrow__stamp" },
					`[${t("fieldCreatedStamp", { day: createdDay })}]`,
				),
		...alarmTags,
	);

	// 第一行（表格行）：独立类族，不沾卡片基类（用户 2026-10-18）。
	// 只有标题 —— 创建信息挪到最右、状态进标签行，标题行不再重复一遍。
	const orowTitleLine = h(
		"div",
		{ className: "dtl-orow__title" },
		h(
			"span",
			{ className: "dtl-orow__name dtl-ellipsis", title: titleOf(row) },
			titleOf(row),
		),
	);

	// ── 形态 B：全部待办 = 真表格行（无卡片、无外框，一行一格）──
	if (variant === "others") {
		// 已结案行没有「执行人」列 ⇒ 那格摆负责人（显示名优先，没有才退回 uuid）
		const creator = isTask
			? row.task.creator
			: displayName(row.record.owner_name, row.record.owner);
		const owner = isTask ? row.task.owner : null;
		const creatorLabel = displayName(
			isTask ? row.task.creator_name : row.record.owner_name,
			creator,
		);
		const hasOwner = !(owner === null || owner === undefined || owner === "");
		const who = creatorLabel === "" ? "—" : `@${creatorLabel}`;
		const createdOk =
			created !== null && created !== undefined && Date.parse(created) >= 0;
		// 执行人的悬停提示（**只在名字被截断时才显示**，见 Tag）：全名 + **什么时候开始执行**
		// （任务上的 started；没有就报「时间未知」，不编）
		const startedOk =
			isTask &&
			row.task.started !== null &&
			row.task.started !== undefined &&
			Date.parse(row.task.started) >= 0;
		const ownerTip = t("startedAt", {
			who: displayName(isTask ? row.task.owner_name : null, owner),
			when: startedOk
				? formatDateTime(String(row.task.started))
				: t("timeUnknown"),
		});
		// 标签行：**状态在最前**（原执行人位），#标签跟在后面（用户 2026-10-18 位置互换）
		const tagLine = h(
			"div",
			{ className: "dtl-orow__tags" },
			...statusTags,
			tags.map((tag) => h(Tag, { key: tag, text: `#${tag}` })),
		);
		return h(
			"div",
			{ className: "dtl-orow" },
			h(
				"div",
				{ className: "dtl-orow__row" },
				// 行标识：上下居中圆点（段头是文件夹/竖线，两处刻意不同）
				h("span", { className: `dtl-dot dtl-dot--${tone}` }),
				h(
					"div",
					{ className: "dtl-tcell dtl-tcell--title" },
					orowTitleLine,
					tagLine,
				),
				// 执行人列（原状态位）：有执行人 ⇒ 一枚 @名字 标签，悬停给「谁 什么时候开始执行」
				// （页面不许跳：右侧槽位宽度是常驻的，hover 只换可见性 ⇒ 这个提示不会跟着飘）
				h(
					"span",
					{ className: "dtl-tcell dtl-tcell--status" },
					// 名字上限 20 字（Tag 的 20ch）；超了 ⇒ 省略号 + 悬停补全名（ownerTip）
					hasOwner
						? h(Tag, {
								text: `@${String(owner)}`,
								tone: "person",
								title: ownerTip,
							})
						: null,
				),
				// 最右**一个槽**：创建信息 ⇄ 操作钮二选一（用户 2026-10-18：悬停就把创建信息整条干掉，
				// 按钮顶上那一格；两个都常驻布局 ⇒ 行宽不变、页面不跳）
				h(
					"span",
					{ className: "dtl-orow__slot" },
					h(
						"span",
						{ className: "dtl-orow__created" },
						t("createdAt", {
							who,
							when: createdOk
								? formatDateTime(String(created))
								: t("timeUnknown"),
						}),
					),
					// 动作排：**同一排、同一间距**（用户 2026-10-18：查看钮不许单独一档间距）；
					// 谁出来由 resolveActions 说了算 —— 我的 ⇒ 继续/结束/释放，待认领 ⇒ 认领
					h(
						"span",
						{ className: "dtl-orow__actions" },
						actions.claim ? claimButton : null,
						actions.resume ? resumeButton : null,
						actions.finish ? finishButton : null,
						actions.release ? releaseButton : null,
						actions.view ? viewButton : null,
					),
				),
			),
		);
	}

	// ── 形态 A：我的待办 = 卡片（dispatch 任务配置卡同款）──
	const parts: string[] = [];
	if (isTask) {
		const startRaw = row.task.started ?? row.task.created;
		if (
			startRaw !== undefined &&
			startRaw !== null &&
			startRaw !== "" &&
			Date.parse(startRaw) >= 0
		) {
			parts.push(
				`${formatDateTime(startRaw).slice(0, 10)} ${t("fieldStarted")}`,
			);
		}
		if (row.task.ageDays !== null && row.task.ageDays !== undefined) {
			parts.push(
				row.task.ageDays === 0
					? t("ageToday")
					: t("ageDaysText", { n: row.task.ageDays }),
			);
		}
	} else {
		parts.push(
			`${t("fieldFinished")} ${formatDateTime(row.record.time ?? row.record.created ?? "", { fallback: t("timeUnknown") })}`,
		);
	}
	return h(
		"div",
		{ className: "dtl-taskrow" },
		h(
			"div",
			{ className: "dtl-taskrow__row" },
			h("span", { className: `dtl-rail dtl-rail--${tone}` }),
			h(
				"div",
				{ style: { flex: "1 1 auto", minWidth: 0 } },
				titleLine,
				h(
					"div",
					{ className: "dtl-taskrow__l2" },
					h(
						"span",
						{
							className: "dtl-wstag dtl-ellipsis",
							title: row.kind === "task" ? row.task.workspace.title : "",
						},
						row.kind === "task" ? row.task.workspace.title : "",
					),
					tags.map((tag) => h(Tag, { key: tag, text: `#${tag}` })),
				),
			),
			h(
				"span",
				{ className: "dtl-taskrow__when" },
				parts.length === 0 ? t("timeUnknown") : parts.join("丨"),
			),
			// 动作排：继续 / 结束 / 释放 + 查看 —— **同一排、同一间距**
			// （用户 2026-10-18：查看钮原来是独立的一格，离前面的按钮远一档）
			// 谁出来由 resolveActions 说了算（与下面「全部待办」**同一个方法**，不再各判各的）
			h(
				"span",
				{ className: "dtl-taskrow__actions" },
				actions.resume ? resumeButton : null,
				actions.finish ? finishButton : null,
				actions.release ? releaseButton : null,
				actions.view ? viewButton : null,
			),
		),
	);
}
