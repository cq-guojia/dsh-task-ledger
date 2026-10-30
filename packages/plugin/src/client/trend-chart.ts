/**
 * 首页趋势图（右上卡）：**每周两根柱 + 一条新增曲线**（2026-10-30 用户改版）。
 *
 * 术语（2026-10-29 用户拍板）：**结案 = 完成 + 取消**（上位词）。结案柱一根里上下两段 ——
 * 底蓝 = 完成、顶红 = 取消（用户 2026-10-30：有取消才多一段，取消在上；完成色从绿改 business 蓝）；
 * 第二根柱 = 未结。「新增」不再占柱，改成历史页那种曲线（各自归一化，不跟柱共用量程），
 * 线色取中性灰 —— 柱子已经是蓝的。
 *
 * 数据口径**全由 skill 算好**（`stats --trend week --last 26w --by-owner`，host 已跨工作区求和）：
 * 结案按结案时间、新增按**创建人**、未结是「该周结束时仍未结案」（待认领 + 进行中合成一个数）。
 *
 * 「只看我的」（2026-10-29 用户定稿）：勾上 = 我的，不勾 = 所有；两套数随快照一起回来 ⇒ 勾选零请求。
 *
 * 画法对齐历史页（用户 2026-10-30）：柱宽 11.25px（固定，缺未结那根也不许拉宽）、组内 1px /
 * 组间 10px、柱顶 2px 圆角、柱面带 45° 斜纹、悬停整组（两根柱）一个虚线框；
 * y 轴五档（中间三档全虚线，底基线实线）；
 * 一屏几周按容器实宽算（宽屏也不会铺出空柱），右上角**绝对定位**的左右箭头一次翻 4 周。
 */
import {
	IconChevronLeftOutlineRegular,
	IconChevronRightOutlineRegular,
} from "@deepseek-ai/dsh-client-ui-primitives";
import { createElement as h, type ReactNode, useEffect, useState } from "react";
import { addDays, formatCount, mondayOf, ymdOf } from "./format";
import type { Translate } from "./locales";
import type { TrendBucketView, TrendOwnerCounts, TrendView } from "./types";
import { IconButton, Loader, Tip } from "./ui";

/** 柱宽：原 7.5px 的 1.5 倍（用户 2026-10-30）。 */
const BAR_W = 11.25;
/** 同组两根柱的间距（用户 2026-10-30：跟原来一样 1px）。 */
const BAR_GAP = 1;
/** 两组之间的间距（用户 2026-10-30：3px → 6px → 10px，一直嫌挤）。 */
const GROUP_GAP = 10;
/** 一组 = 两根柱 + 组内间距。 */
const COL_W = BAR_W * 2 + BAR_GAP;
/** 一组的横向占宽（含组间距）。 */
const PITCH = COL_W + GROUP_GAP;
/** 翻页步长：一次 4 周（用户 2026-10-30）。 */
const WEEK_STEP = 4;
/** x 轴标签的最小间距（小于这个就隔一个标一个，免得挤成一团）。 */
const LABEL_MIN_PITCH = 40;
/** 数据还没到 / 宽度没量到时按几周排（≈ 卡片默认宽度能放的列数）。 */
const FALLBACK_WEEKS = 13;
/** 入场动画的**整屏**错峰总时长（跟历史页同款：延迟按列摊，不按序号累加）。 */
const STAGGER_MS = 120;

/**
 * 四数归一：老版本 host 返回的桶可能没有 `cancelled`（甚至没有 `owners`），
 * 缺字段按 0 —— 这是「那一类记录本来就没有」，不是拿 0 充真值。
 * 不做这层兜底，`done + undefined` 会变成 NaN，把峰、刻度、柱高整张图一起毁掉。
 */
const norm = (cell: TrendOwnerCounts | undefined): TrendOwnerCounts => ({
	added: cell?.added ?? 0,
	done: cell?.done ?? 0,
	cancelled: cell?.cancelled ?? 0,
	open: cell?.open ?? 0,
});

export function TrendChart(props: {
	/** 首读没到就是 `null` ⇒ 卡里只有三点加载（跟历史页一致，不画骨架）。 */
	trend: TrendView | null;
	/** 本机身份 uuid；拿不到就不给「只看我的」（不猜）。 */
	me: string | null;
	t: Translate;
}): ReactNode {
	const { trend, me, t } = props;
	const [mineOnly, setMineOnly] = useState(false);
	/** 从最新一周往回翻了几次（每次 WEEK_STEP 周）。 */
	const [shift, setShift] = useState(0);
	// callback ref：plot 是**条件渲染**的（空态时不存在），对象 ref 的 effect 只跑一次
	// 会扑空、之后再也不重跑 ⇒ 宽度永远是 0（一屏几周就算不出来）。挂载即接线。
	const [plotEl, setPlotEl] = useState<HTMLDivElement | null>(null);
	const [width, setWidth] = useState(0);
	const mine = mineOnly && me !== null;

	useEffect(() => {
		if (plotEl === null) return;
		const observer = new ResizeObserver((entries) => {
			const rect = entries[0];
			if (rect !== undefined) setWidth(rect.contentRect.width);
		});
		observer.observe(plotEl);
		setWidth(plotEl.clientWidth);
		return () => observer.disconnect();
	}, [plotEl]);

	// 首读未到 ⇒ 卡里就一个三点加载，**不画线、不铺刻度**（用户 2026-10-30：跟历史页一样，
	// 加载时图里本来就是空的）
	if (trend === null) {
		return h(
			"div",
			{ className: "dtl-card dtl-trend" },
			h(
				"div",
				{
					style: {
						flex: "1 1 auto",
						minHeight: 0,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					},
				},
				h(Loader, { variant: "blocks", size: "xl" }),
			),
		);
	}

	const buckets = trend.buckets;
	if (buckets.length === 0) {
		return h(
			"div",
			{ className: "dtl-card dtl-trend" },
			h("div", { className: "dtl-trend__foot" }, t("chartEmpty")),
		);
	}

	/** 当前口径下这一桶的数：全量，或「我的」那条（没数据就是 0）。 */
	const counts = (bucket: TrendBucketView): TrendOwnerCounts =>
		mine ? norm(bucket.owners[me]) : norm(bucket);

	/** 未结拆两段：进行中 = 各人未结之和；待认领 = 未结 − 进行中。
	 *  「只看我的」时只有进行中（我的任务必然有人接），不显示拆分行。 */
	const breakdown = (bucket: TrendBucketView): { doing: number; waiting: number } => {
		const doing = Object.values(bucket.owners).reduce((sum, cell) => sum + cell.open, 0);
		return { doing, waiting: Math.max(0, bucket.open - doing) };
	};

	/** 结案 = 完成 + 取消（用户 2026-10-29 定的上位词）；结案柱整根高就是它。 */
	const closed = (cell: TrendOwnerCounts): number => cell.done + cell.cancelled;

	// 一屏几周：按容器实宽算，但不超过 skill 给的桶数（宽屏上不铺一排空柱，翻页才有意义）
	const fit = width > 0 ? Math.max(1, Math.floor((width + GROUP_GAP) / PITCH)) : FALLBACK_WEEKS;
	const perScreen = Math.min(fit, buckets.length);

	// 窗口：**今天所在那周永远是最右一根**，往前数满一屏；翻出去超出数据的补空槽
	// （26 周窗口之外没有桶 ⇒ 柱子没有、曲线是直线，跟历史页同一套做法）
	const byKey = new Map(buckets.map((bucket) => [bucket.from, bucket]));
	const lastKey = mondayOf(ymdOf(new Date()));
	const slots: TrendBucketView[] = [];
	for (let back = perScreen - 1; back >= 0; back -= 1) {
		const key = addDays(lastKey, -(shift * WEEK_STEP + back) * 7);
		slots.push(
			byKey.get(key) ?? {
				from: key,
				to: addDays(key, 6),
				added: 0,
				done: 0,
				cancelled: 0,
				open: 0,
				owners: {},
			},
		);
	}

	const peak = slots.reduce((max, slot) => {
		const cell = counts(slot);
		return Math.max(max, closed(cell), cell.open);
	}, 0);
	// 只防除零（柱高仍为 0）：刻度照实给 0，不拿 1 充数
	const top = peak === 0 ? 1 : peak;

	/** 翻页钮：**只画箭头**（核心 `IconButton` 出皮、官方图标出图形）；悬停提示走官方 Tooltip。 */
	const navButton = (dir: "left" | "right", label: string, onClick: () => void): ReactNode =>
		h(Tip, {
			label,
			side: "bottom",
			children: h(IconButton, {
				icon: h(
					dir === "left"
						? IconChevronLeftOutlineRegular
						: IconChevronRightOutlineRegular,
					{ size: 14 },
				),
				label,
				title: "",
				variant: "outline",
				size: "sm",
				onClick,
			}),
		});

	const weekUnit = t("historyGranWeek");

	/** 图例：四个色块 = 柱子两段 + 未结柱 + 曲线，与图里颜色一一对应。 */
	const legend: readonly { key: string; label: string; color: string }[] = [
		{ key: "done", label: t("chartFinished"), color: "var(--dtl-chart-done)" },
		{ key: "cancelled", label: t("chartCancelled"), color: "var(--dtl-danger)" },
		{
			key: "open",
			// 只看我的时「未结」叫「进行中」（我的任务必然有人接）
			label: t(mine ? "chartDoing" : "chartOpen"),
			color: "var(--dtl-chart-open)",
		},
		// 曲线用中性灰：柱子已经占了 business 蓝，曲线再用蓝就分不清了（用户 2026-10-30）
		{ key: "added", label: t("chartAdded"), color: "var(--dtl-chart-line)" },
	];

	const row = (key: string, label: string, count: number, color: string): ReactNode =>
		count > 0
			? h(
					"div",
					{ key, className: "dtl-trend__tip-row" },
					h("span", { className: "dtl-trend__dot", style: { background: color } }),
					`${label} ${formatCount(count)}`,
				)
			: null;

	/** 浮卡：周期 → 新建 / 完成 / 取消 / 未结（0 值不列），未结再补一行进行中 · 待认领。 */
	const tipOf = (bucket: TrendBucketView): ReactNode => {
		const cell = counts(bucket);
		const split = breakdown(bucket);
		return h(
			"div",
			{ className: "dtl-trend__tip" },
			h(
				"div",
				{ className: "dtl-trend__tip-row" },
				t("periodRange", { from: bucket.from, to: bucket.to }),
			),
			// 圆点在深灰浮卡上：曲线那支灰是随主题变的，浅色主题下会糊进底色 ⇒ 用浮卡自己的浅灰
			row("added", t("chartCreatedTasks"), cell.added, "var(--dtl-tip-fg-dim)"),
			row("done", t("chartFinished"), cell.done, "var(--dtl-chart-done)"),
			row("cancelled", t("chartCancelled"), cell.cancelled, "var(--dtl-danger)"),
			row("open", t(mine ? "chartDoing" : "chartOpen"), cell.open, "var(--dtl-chart-open)"),
			mine || cell.open <= 0
				? null
				: h(
						"div",
						{ key: "split", className: "dtl-trend__tip-row dtl-trend__tip-row--sub" },
						`${t("chartDoing")} ${formatCount(split.doing)} · ${t("chartWaiting")} ${formatCount(split.waiting)}`,
					),
		);
	};

	const colStyle: Record<string, string | number> = { width: `${String(COL_W)}px` };

	/** 一根柱 = 一个周：左结案（底绿完成 / 顶红取消，两段叠一根）、右未结。 */
	const colOf = (bucket: TrendBucketView, index: number): ReactNode => {
		const cell = counts(bucket);
		const total = closed(cell);
		const height = (value: number): string => `${String((value / top) * 100)}%`;
		// 入场延迟：按「第几列 / 共几列」摊进 STAGGER_MS；key 带批次（翻页次数）⇒ 翻页整批重放
		const style: Record<string, string | number> = {
			...colStyle,
			"--lc-d": `${String(Math.round((index / Math.max(1, slots.length - 1)) * STAGGER_MS))}ms`,
		};
		return h(
			"div",
			{ key: `${String(shift)}:${bucket.from}`, className: "dtl-trend__col", style },
			h(
				"div",
				{ className: "dtl-trend__bars", style: { gap: `${String(BAR_GAP)}px` } },
				total > 0
					? h(
							"div",
							{
								className: "dtl-trend__bar dtl-trend__bar--closed",
								style: { height: height(total) },
							},
							// 取消叠在顶端（用户 2026-10-30：取消在上、红色；完成是柱体本身的绿）
							cell.cancelled > 0
								? h("span", {
										className: "dtl-trend__seg dtl-trend__seg--cancelled",
										style: {
											height: `${String((cell.cancelled / total) * 100)}%`,
										},
									})
								: null,
						)
					: null,
				cell.open > 0
					? h("div", {
							className: "dtl-trend__bar dtl-trend__bar--open",
							style: { height: height(cell.open) },
						})
					: null,
			),
			tipOf(bucket),
		);
	};

	const labelStep = Math.max(1, Math.ceil(LABEL_MIN_PITCH / PITCH));
	/** 最后一个真正画出文字的位置：它得右对齐，否则末位数字会顶出卡片。 */
	const lastLabelIndex = slots.length - 1 - ((slots.length - 1) % labelStep);
	/** x 轴标**周末日期**（数据按截止日判），当前周就是今天。 */
	const labelOf = (bucket: TrendBucketView, index: number): ReactNode => {
		const text = index % labelStep === 0 ? bucket.to.slice(5) : "";
		// 锚点以**列中心**向两侧展开；首列左对齐、末个有字列右对齐，只把这两头钳回卡片内
		const anchor =
			text === ""
				? null
				: index === 0
					? { left: "0", transform: "none" }
					: index === lastLabelIndex
						? { left: "auto", right: "0", transform: "none" }
						: null;
		return h(
			"div",
			{ key: bucket.from, className: "dtl-trend__label", style: colStyle },
			text === "" ? null : h("span", { style: anchor ?? undefined }, text),
		);
	};

	/** 新增量曲线：一周一个点落在柱组中心，**只看自己的峰值**（不跟柱共用量程），全 0 就不画。 */
	const curve = (): ReactNode => {
		if (width <= 0) return null;
		const values = slots.map((slot) => counts(slot).added);
		const max = values.reduce((m, v) => (v > m ? v : m), 0);
		if (max <= 0) return null;
		const points = values
			.map(
				(value, index) =>
					`${((((index + 0.5) * PITCH) / width) * 100).toFixed(3)},${(100 - (value / max) * 96).toFixed(2)}`,
			)
			.join(" ");
		return h(
			"svg",
			{
				className: "dtl-trend__line",
				viewBox: "0 0 100 100",
				preserveAspectRatio: "none",
				"aria-hidden": true,
			},
			h("polyline", { points }),
		);
	};

	const first = slots[0];
	const partial =
		trend.coverageFrom !== "" && first !== undefined && trend.coverageFrom > first.from
			? h("div", { className: "dtl-trend__foot" }, t("chartPartial", { from: trend.coverageFrom }))
			: null;

	return h(
		"div",
		{ className: "dtl-card dtl-trend" },
		h(
			"div",
			{ className: "dtl-trend__legend" },
			...legend.map((item) =>
				h(
					"span",
					{ key: item.key },
					h("span", { className: "dtl-trend__dot", style: { background: item.color } }),
					item.label,
				),
			),
			// 右侧「只看我的」：只作用于这张图，不动统计卡；数据已随快照回来，勾选不发请求
			me === null
				? null
				: h(
						"label",
						{ className: "dtl-trend__mine" },
						h("input", {
							type: "checkbox",
							checked: mineOnly,
							onChange: (event: { target: { checked: boolean } }) => {
								setMineOnly(event.target.checked);
							},
						}),
						t("chartMine"),
					),
		),
		// 翻页箭头：绝对定位飘在卡片右上角（不进图例那一排，否则整排会被按钮撑高）；
		// 跟历史页一样一次翻 4 周，往前不设边界（翻出去是空槽）
		h(
			"div",
			{ className: "dtl-trend__nav" },
			navButton("left", t("historyPrev", { n: WEEK_STEP, unit: weekUnit }), () => {
				setShift((value) => value + 1);
			}),
			navButton("right", t("historyNext", { n: WEEK_STEP, unit: weekUnit }), () => {
				setShift((value) => Math.max(0, value - 1));
			}),
		),
		// 图体：左 y 轴 + 柱区（弹性填充高度）
		h(
			"div",
			{ className: "dtl-trend__body" },
			h(
				"div",
				{ className: "dtl-trend__axis" },
				// 五档刻度：峰值只是量程标注（顶上不画线），下面四档对应四条线
				h("span", null, formatCount(peak)),
				h("span", null, formatCount(Math.round((peak * 3) / 4))),
				h("span", null, formatCount(Math.round(peak / 2))),
				h("span", null, formatCount(Math.round(peak / 4))),
				h("span", null, "0"),
			),
			h(
				"div",
				{
					style: {
						flex: "1 1 auto",
						minWidth: 0,
						display: "flex",
						flexDirection: "column",
						minHeight: 0,
					},
				},
				h(
					"div",
					{ className: "dtl-trend__plot", ref: setPlotEl },
					// 刻度线：顶部不画（从右上角控件后面穿过），中间三档全虚线、底部基线实线
					h(
						"div",
						{ className: "dtl-trend__grid" },
						h("div", { className: "dtl-trend__gridline dtl-trend__gridline--none" }),
						h("div", { className: "dtl-trend__gridline dtl-trend__gridline--dashed" }),
						h("div", { className: "dtl-trend__gridline dtl-trend__gridline--dashed" }),
						h("div", { className: "dtl-trend__gridline dtl-trend__gridline--dashed" }),
						h("div", { className: "dtl-trend__gridline dtl-trend__gridline--base" }),
					),
					// 柱序居左、组宽固定：宽屏也不会把柱子拉宽（跟历史页同款）
					h(
						"div",
						{ className: "dtl-trend__cols", style: { gap: `${String(GROUP_GAP)}px` } },
						...slots.map(colOf),
					),
					// 曲线压在柱子上，pointer-events:none 不挡悬停
					curve(),
				),
				h(
					"div",
					{ className: "dtl-trend__labels", style: { gap: `${String(GROUP_GAP)}px` } },
					...slots.map(labelOf),
				),
			),
		),
		partial,
	);
}
