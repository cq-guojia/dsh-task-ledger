/**
 * 历史页顶部：**图表卡在左、4 数显在右**，沿用主页 8 块的分栏与单块尺寸；不显示图例。
 *
 * 柱色：≥2 工作区 = 每个工作区一种颜色；仅 1 个工作区 = 完成(绿) / 取消(红) 两色。
 * 布局：柱序居左、柱宽固定、柱间 2px；按容器宽算能放几天（屏幕越窄显示越少），右边留白。
 * 悬停：虚线框住当天 + 浮卡给「日期 · 结案数」。
 * 0 值：host 的 `from/to` 是有数据的最早/最晚天 ⇒ 首尾 0 天然裁掉；中间空白天补空槽保持连续。
 * 翻页：左右各 10 天，窗口在 [from, to] 内平移。
 */
import { createElement as h, type ReactNode, useEffect, useRef, useState } from "react";
import {
	IconChevronLeftOutlineRegular,
	IconChevronRightOutlineRegular,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { Translate } from "./locales";
import type { HistoryDay, HistoryTrendPayload } from "./types";
import { EmptyState, IconButton, StatCard, Tip } from "./ui";

/** 工作区配色：取插件语义 token（≥5 个区会循环）。 */
const PALETTE = [
	"var(--dtl-business)",
	"var(--dtl-success)",
	"var(--dtl-warning)",
	"var(--dtl-overdue)",
	"var(--dtl-danger)",
];

/** 单日槽宽：柱宽 = 槽宽。2026-10-29 用户要求加粗到 1.5 倍（10 → 15）。 */
const SLOT_W = 15;
/** 槽间距：用户没让变，保持 2px。 */
const GAP = 2;
const PAGE_DAYS = 10;

/** 浮卡里的一行：色块 + 名称 + 数量。 */
interface TipRow {
	key: string;
	name: string;
	count: number;
	color: string;
}

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

function ymdOf(date: Date): string {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseYmd(value: string): Date {
	return new Date(`${value}T00:00:00`);
}

function addDays(value: string, delta: number): string {
	const date = parseYmd(value);
	date.setDate(date.getDate() + delta);
	return ymdOf(date);
}

/** 本周一（周一为一周之始，与 skill / 趋势同口径）。 */
function mondayOf(value: string): string {
	const date = parseYmd(value);
	date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
	return ymdOf(date);
}

function monthStart(value: string): string {
	return `${value.slice(0, 7)}-01`;
}

function prevMonthStart(value: string): string {
	const date = parseYmd(monthStart(value));
	date.setMonth(date.getMonth() - 1);
	return ymdOf(date);
}

function closedOf(day: HistoryDay): number {
	return day.done + day.cancelled;
}

export interface HistoryTotals {
	readonly today: number;
	readonly week: number;
	readonly month: number;
	readonly lastMonth: number;
}

/** 4 数显的四个数：按结案时间落在今天 / 本周 / 本月 / 上月。 */
export function historyTotals(data: HistoryTrendPayload): HistoryTotals {
	const today = ymdOf(new Date());
	const weekFrom = mondayOf(today);
	const monthFrom = monthStart(today);
	const lastMonthFrom = prevMonthStart(today);
	const lastMonthTo = addDays(monthFrom, -1);
	const sumIn = (from: string, to: string): number =>
		data.days.reduce(
			(sum, day) => (day.date >= from && day.date <= to ? sum + closedOf(day) : sum),
			0,
		);
	return {
		today: sumIn(today, today),
		week: sumIn(weekFrom, today),
		month: sumIn(monthFrom, today),
		lastMonth: sumIn(lastMonthFrom, lastMonthTo),
	};
}

/** 右侧 4 个方框（2×2，单块尺寸与主页统计卡一致）。 */
export function HistoryStats(props: {
	data: HistoryTrendPayload;
	t: Translate;
}): ReactNode {
	const { data, t } = props;
	const totals = historyTotals(data);
	const today = ymdOf(new Date());
	const weekFrom = mondayOf(today);
	// 每块带一行小字（覆盖区间）——与主页统计卡同结构 ⇒ 同尺寸、同高度。
	return h(
		"div",
		{ className: "dtl-stats__cards" },
		h(StatCard, { label: t("historyToday"), value: totals.today, hint: today.slice(5) }),
		h(StatCard, {
			label: t("historyWeek"),
			value: totals.week,
			hint: `${weekFrom.slice(5)}~${today.slice(5)}`,
		}),
		h(StatCard, { label: t("historyMonth"), value: totals.month, hint: today.slice(0, 7) }),
		h(StatCard, {
			label: t("historyLastMonth"),
			value: totals.lastMonth,
			hint: prevMonthStart(today).slice(0, 7),
		}),
	);
}

/** 左侧图表卡：按天堆叠柱 + y 轴 + 翻页（无图例）。 */
export function HistoryChart(props: {
	data: HistoryTrendPayload;
	t: Translate;
}): ReactNode {
	const { data, t } = props;
	const plotRef = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);
	const [shift, setShift] = useState(0);

	useEffect(() => {
		const el = plotRef.current;
		if (el === null) return;
		const observer = new ResizeObserver((entries) => {
			const rect = entries[0];
			if (rect !== undefined) setWidth(rect.contentRect.width);
		});
		observer.observe(el);
		setWidth(el.clientWidth);
		return () => observer.disconnect();
	}, []);

	if (data.days.length === 0) {
		return h(
			"div",
			{ className: "dtl-card dtl-hist" },
			h(EmptyState, { title: t("historyEmpty") }),
		);
	}

	const byDate = new Map<string, HistoryDay>();
	for (const day of data.days) byDate.set(day.date, day);

	const capacity = width > 0 ? Math.max(1, Math.floor(width / (SLOT_W + GAP))) : 30;
	const rawWindowEnd = addDays(data.to, -shift);
	const windowEnd = rawWindowEnd < data.from ? data.from : rawWindowEnd;
	const earliest = addDays(windowEnd, -(capacity - 1));
	const windowStart = earliest < data.from ? data.from : earliest;

	const dates: string[] = [];
	for (let cur = windowStart; cur <= windowEnd; cur = addDays(cur, 1)) {
		dates.push(cur);
	}

	const peak = dates.reduce((max, date) => {
		const day = byDate.get(date);
		return day === undefined ? max : Math.max(max, closedOf(day));
	}, 0);

	const multi = data.workspaces.length >= 2;
	const colorById = new Map<string, string>();
	data.workspaces.forEach((workspace, index) => {
		colorById.set(workspace.id, PALETTE[index % PALETTE.length] ?? PALETTE[0]);
	});

	const segmentsOf = (day: HistoryDay): { count: number; color: string }[] => {
		if (!multi) {
			const out: { count: number; color: string }[] = [];
			if (day.done > 0) out.push({ count: day.done, color: "var(--dtl-success)" });
			if (day.cancelled > 0)
				out.push({ count: day.cancelled, color: "var(--dtl-danger)" });
			return out;
		}
		const out: { count: number; color: string }[] = [];
		for (const workspace of data.workspaces) {
			const cell = day.byWorkspace[workspace.id];
			const count = cell === undefined ? 0 : cell.done + cell.cancelled;
			if (count > 0)
				out.push({ count, color: colorById.get(workspace.id) ?? PALETTE[0] });
		}
		return out;
	};

	/** 浮卡：首行日期，下面**一工作区一行**（色块 + 名称 + 结案数），有几个列几个、0 值不列。
	 *  多工作区按 host 给的 workspaces 顺序（与配色分配同序）；单工作区时柱色本来就是
	 *  完成绿 / 取消红，所以拆成那两行，不硬塞一个工作区色（用户 2026-10-29）。 */
	const rowsOf = (day: HistoryDay): TipRow[] => {
		const rows: TipRow[] = [];
		if (multi) {
			for (const workspace of data.workspaces) {
				const cell = day.byWorkspace[workspace.id];
				const count = cell === undefined ? 0 : cell.done + cell.cancelled;
				if (count <= 0) continue;
				rows.push({
					key: workspace.id,
					name: workspace.title,
					count,
					color: colorById.get(workspace.id) ?? PALETTE[0],
				});
			}
		} else {
			if (day.done > 0)
				rows.push({
					key: "done",
					name: t("chartFinished"),
					count: day.done,
					color: "var(--dtl-success)",
				});
			if (day.cancelled > 0)
				rows.push({
					key: "cancelled",
					name: t("chartCancelled"),
					count: day.cancelled,
					color: "var(--dtl-danger)",
				});
		}
		return rows;
	};

	const tipOf = (date: string, day: HistoryDay): ReactNode => {
		const rows = rowsOf(day);
		// 「新增」一行：全天汇总、不分工作区，与曲线同色；0 / 取不到就不列（0 不充数）
		const added = data.addedByDay?.[date];
		return h(
			"div",
			{
				className: "dtl-hist__tip",
			},
			h("div", { className: "dtl-hist__tip-date" }, date),
			added !== undefined && added > 0
				? h(
						"div",
						{ key: "added", className: "dtl-hist__tip-row" },
						h("span", {
							className: "dtl-hist__tip-dot",
							style: { background: "var(--dtl-chart-added)" },
						}),
						h("span", null, t("chartAdded")),
						h("span", { className: "dtl-hist__tip-count" }, String(added)),
					)
				: null,
			...rows.map((row) =>
				h(
					"div",
					{ key: row.key, className: "dtl-hist__tip-row" },
					h("span", {
						className: "dtl-hist__tip-dot",
						style: { background: row.color },
					}),
					h("span", null, row.name),
					h("span", { className: "dtl-hist__tip-count" }, String(row.count)),
				),
			),
		);
	};

	const colOf = (date: string): ReactNode => {
		const day = byDate.get(date);
		const colStyle: Record<string, string | number> = {
			width: `${String(SLOT_W)}px`,
		};
		if (day === undefined) {
			return h("div", { key: date, className: "dtl-hist__col", style: colStyle });
		}
		const total = closedOf(day);
		const segments = segmentsOf(day);
		const height = peak === 0 ? 0 : Math.max((total / peak) * 100, 2);
		return h(
			"div",
			{ key: date, className: "dtl-hist__col", style: colStyle },
			h(
				"div",
				{ className: "dtl-hist__bar", style: { height: `${String(height)}%` } },
				segments.map((segment, index) =>
					h("div", {
						key: index,
						style: {
							height: `${String((segment.count / total) * 100)}%`,
							background: segment.color,
						},
					}),
				),
			),
			tipOf(date, day),
		);
	};

	const labelStep = Math.max(1, Math.ceil(dates.length / 10));
	const labelOf = (date: string, index: number): ReactNode =>
		h(
			"div",
			{ key: date, className: "dtl-hist__label", style: { width: `${String(SLOT_W)}px` } },
			index % labelStep === 0 ? date.slice(5) : "",
		);

	const atEarliest = windowStart <= data.from;
	const atLatest = shift <= 0;

	/** 新增量曲线：一天一个点落在列中心，**一条线、不分工作区**（用户 2026-10-29）。
	 *  SVG 用 0-100 百分比坐标 + non-scaling-stroke ⇒ 不用测 plot 像素高，窗口缩放线宽恒定；
	 *  归一化只看曲线自己的峰值（与柱子的结案峰值各管各的），全 0 / 取数失败就不画。 */
	const curve = (): ReactNode => {
		const series = data.addedByDay;
		if (series === undefined) return null;
		const values = dates.map((date) => series[date] ?? 0);
		const max = values.reduce((m, v) => (v > m ? v : m), 0);
		if (max <= 0) return null;
		const totalW = dates.length * (SLOT_W + GAP) - GAP;
		const points = values
			.map(
				(value, index) =>
					`${((((index + 0.5) * (SLOT_W + GAP)) / totalW) * 100).toFixed(2)},${(100 - (value / max) * 96).toFixed(2)}`,
			)
			.join(" ");
		return h(
			"svg",
			{
				className: "dtl-hist__line",
				viewBox: "0 0 100 100",
				preserveAspectRatio: "none",
				"aria-hidden": true,
			},
			h("polyline", { points }),
		);
	};

	/** 翻页钮：**只画箭头** —— 核心 `IconButton` 出皮、`Icon*` 官方图标出图形，本文件不再手写
	 *  按钮样式与箭头字形（用户 2026-10-29）。悬停提示走官方 Tooltip（本仓库 `Tip` 唯一入口）；
	 *  文案只当无障碍名 + 气泡，且用 `title: ""` 压掉原生 title（照 `task-row.ts` 的惯例）。 */
	const navButton = (
		dir: "left" | "right",
		label: string,
		disabled: boolean,
		onClick: () => void,
	): ReactNode =>
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
				disabled,
				onClick,
			}),
		});

	return h(
		"div",
		{ className: "dtl-card dtl-hist" },
		// 翻页：绝对定位飘在图区右上角，不单独占一行（用户 2026-10-29）
		h(
			"div",
			{ className: "dtl-hist__nav" },
			navButton("left", t("historyPrevDays", { n: PAGE_DAYS }), atEarliest, () => {
				setShift((value) => value + PAGE_DAYS);
			}),
			navButton("right", t("historyNextDays", { n: PAGE_DAYS }), atLatest, () => {
				setShift((value) => Math.max(0, value - PAGE_DAYS));
			}),
		),
		// 图体：左 y 轴 + 柱区（弹性填充高度）
		h(
			"div",
			{ style: { flex: "1 1 auto", minHeight: 0, display: "flex", gap: "var(--dtl-space-2)" } },
			h(
				"div",
				{
					style: {
						display: "flex",
						flexDirection: "column",
						justifyContent: "space-between",
						flex: "none",
						minWidth: "26px",
						// 底部让出 x 轴日期行（10px 字 + 2px 上边距），零刻度才落在基线上
						paddingBottom: "12px",
						textAlign: "right",
						fontSize: "10px",
						lineHeight: "1",
						color: "var(--dtl-fg-3)",
						fontVariantNumeric: "tabular-nums",
					},
				},
				// 四档刻度：顶 / ⅔ / ⅓ / 0，与四条网格线一一对应
				h("span", null, String(peak)),
				h("span", null, String(Math.round((peak * 2) / 3))),
				h("span", null, String(Math.round(peak / 3))),
				h("span", null, "0"),
			),
			h(
				"div",
				{ style: { flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 } },
				h(
					"div",
					{ className: "dtl-hist__plot", ref: plotRef },
					// 四条刻度线：顶 / 底实线，中间两条虚线（用户 2026-10-29）
					h(
						"div",
						{ className: "dtl-hist__grid" },
						h("div", { className: "dtl-hist__gridline" }),
						h("div", { className: "dtl-hist__gridline dtl-hist__gridline--dashed" }),
						h("div", { className: "dtl-hist__gridline dtl-hist__gridline--dashed" }),
						h("div", { className: "dtl-hist__gridline dtl-hist__gridline--base" }),
					),
					h("div", { className: "dtl-hist__cols" }, ...dates.map((date) => colOf(date))),
				// 曲线压在柱子上（参考图同款），pointer-events:none 不挡柱子的悬停
				curve(),
				),
				h(
					"div",
					{ className: "dtl-hist__labels" },
					...dates.map((date, index) => labelOf(date, index)),
				),
			),
		),
	);
}
