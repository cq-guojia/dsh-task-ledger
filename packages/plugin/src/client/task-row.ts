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
 * 按钮点击行为（含查看）归「任务按钮与会话交接」任务，本文件只做样子与提示。
 */

import {
	IconCheckOutlineRegular,
	IconChevronLeftOutlineRegular,
	IconChevronRightOutlineRegular,
	IconCloseOutlineRegular,
	IconCopyOutlineRegular,
	IconSearchOutlineRegular,
} from "@deepseek-ai/dsh-client-ui-primitives";
import { createElement as h, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { formatDateTime, formatRelative } from "./format";
import type { Translate } from "./locales";
import { displayName, type Row, resolveActions } from "./rows";
import { focusOwner, setQuery } from "./store";
import { Button, IconButton, notify, Tag, Tip } from "./ui";

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
	/** 单人台账：人名相关的一律不显示（用户 2026-10-29）。 */
	solo?: boolean;
	/** 查看：弹右侧 dock 预览过程文档 / 台账文件夹。 */
	onView?: (row: Row) => void;
}): ReactNode {
	const { t, row } = props;
	const solo = props.solo === true;
	const tone = toneOf(row);
	const tags = row.task.tags ?? [];

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
	const tipBtn = (
		icon: ReactNode,
		actionKey: "actionClaim" | "actionResume" | "actionFinish" | "actionRelease",
		tipKey: "tipClaim" | "tipResume" | "tipFinish" | "tipRelease",
	): ReactNode =>
		h(Tip, {
			label: t(tipKey),
			children: h(
				Button,
				{ variant: "secondary", size: "md", icon: icon ?? undefined },
				t(actionKey),
			),
		});
	// 认领：只有待认领行才有（权限见 resolveActions.claim）。功能待接，先摆按钮（用户 2026-10-28）。
	const claimButton = tipBtn(null, "actionClaim", "tipClaim");
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
	// 释放 = 退回公共池：左向箭头（与「继续」的右箭头成一进一出，用户 2026-10-30）
	const releaseButton = tipBtn(
		h(IconChevronLeftOutlineRegular, { size: 14 }),
		"actionRelease",
		"tipRelease",
	);
	// 取消（用户 2026-10-29，2026-10-30 改图标）：一枚小叉，与复制 / 查看同款次级图标钮（灰字无边）；
	// 出不出来由 resolveActions.cancel 判（池任务 + 我名下的才有，别人名下的不给）
	const cancelButton = h(Tip, {
		label: t("tipCancel"),
		children: h(IconButton, {
			variant: "plain",
			size: "md",
			label: t("actionCancel"),
			title: "",
			className: "dtl-iconbtn--muted",
			icon: h(IconCloseOutlineRegular, { size: 14 }),
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
				const clipboard = navigator.clipboard;
				if (clipboard === undefined) {
					notify(t("copyFailed"));
					return;
				}
				void clipboard.writeText(row.task.id).then(
					() => notify(t("copiedTaskId")),
					() => notify(t("copyFailed")),
				);
			},
		}),
	});

	// 第一行：标题 + 创建徽（标签全在第二行，状态标签打头，用户 2026-10-30）
	const titleLine = h(
		"div",
		{ className: "dtl-taskrow__l1" },
		h(
			"span",
			{ className: "dtl-taskrow__title dtl-ellipsis", title: titleOf(row) },
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
	return h(
		"div",
		{ className: "dtl-taskrow" },
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
}
