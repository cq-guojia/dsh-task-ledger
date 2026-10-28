/**
 * 任务行（宿主**无表格件** ⇒ 自绘）：整行一张卡，样式照抄 dispatch-table 任务配置卡：
 * 左缘 6×36 状态条 + 标题行 + 第二行工作区/标签；右侧灰字时长；悬停出「继续 / 结束 / 释放」；
 * 最右常驻「查看」放大镜钮。
 *
 * 「我的待办」卡只摆异常标记（进行中只靠左缘色条，不再重复一枚）。
 * 状态一律**标签型、五色**（用户 2026-10-18）：灰=待认领 / 蓝=进行中 / 黄=积压 / 橙=逾期 /
 * 红=停滞；三个异常标签悬停给 skill 算好的天数解释（ageDays / idleDays / waitingDays 随 list 下发）。
 *
 * 按钮（含查看）**不各判各的**：权限一律问 `resolveActions()`（rows.ts），本文件只按返回值画。
 *
 * 按钮点击行为（含查看）归「任务按钮与会话交接」任务，本文件只做样子与提示。
 */

import {
	IconCheckOutlineRegular,
	IconChevronRightOutlineRegular,
	IconSearchOutlineRegular,
	Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import { createElement as h, type ReactNode } from "react";
import { formatDateTime } from "./format";
import type { Translate } from "./locales";
import { displayName, type Row, resolveActions } from "./rows";
import { Button, IconButton, Tag } from "./ui";

type Tone = "doing" | "overdue" | "stale" | "backlog" | "open";

/** 行标题：任务名（缺则任务号）。 */
function titleOf(row: Row): string {
	return row.task.title || row.task.id;
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
	/** 查看：弹右侧 dock 预览过程文档 / 台账文件夹。 */
	onView?: (row: Row) => void;
}): ReactNode {
	const { t, row } = props;
	const tone = toneOf(row);
	const tags = row.task.tags ?? [];

	// 创建日期（第一行灰徽只给日期）。
	const created = row.task.created ?? null;
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
	const detailTip = (which: Tone): string | undefined => {
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
	// 动作权限：**唯一**判定（用户 2026-10-18）——任务行同一套，不许各判各的；本文件只按返回值画。
	const actions = resolveActions(row.task);

	// 动作钮：继续 / 结束 / 释放 + 查看，各一份。
	// 悬停说明统一走官方 Tooltip（portal 逃逸裁切、hover 即出），不在 CSS 里手搓 ::after 浮层。
	// 「查看」：统一最右、放大镜图标（用户 2026-10-17）。
	const viewButton = h(Tooltip, {
		label: t("viewDetail"),
		side: "bottom",
		portal: true,
		maxWidth: 240,
		children: h(IconButton, {
			variant: "plain",
			size: "sm",
			label: t("viewDetail"),
			icon: h(IconSearchOutlineRegular, { size: 14 }),
			onClick: () => props.onView?.(row),
		}),
	});
	const tipBtn = (
		icon: ReactNode,
		actionKey: "actionResume" | "actionFinish" | "actionRelease",
		tipKey: "tipResume" | "tipFinish" | "tipRelease",
	): ReactNode =>
		h(Tooltip, {
			label: t(tipKey),
			side: "bottom",
			portal: true,
			maxWidth: 240,
			children: h(
				Button,
				{ variant: "ghost", size: "sm", icon: icon ?? undefined },
				t(actionKey),
			),
		});
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
	// 「我的待办」卡只摆异常标记（进行中只靠左缘色条，不再重复一枚）
	const alarmTags = markTones.map((which) => tagOf(which));

	// 第一行：标题 + 创建徽 + 异常标签
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

	// ── 卡片：dispatch 任务配置卡同款 ──
	const parts: string[] = [];
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
							title: row.task.workspace.title,
						},
						row.task.workspace.title,
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
			// 谁出来由 resolveActions 说了算（同一套权限，不再各判各的）
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
