/**
 * 历史页顶部：**图表卡在左、4 数显在右**，沿用主页 8 块的分栏与单块尺寸；不显示图例。
 *
 * 柱：一根 = 一个周期（日 / 周 / 月，右上角切换，默认日），高度 = 该周期的结案数。
 * 数字真源是 skill `stats --trend <gran>`（切粒度 = 重新请求，host 有读缓存），
 * 本文件**只做展示**：切片、配色、画图 —— 聚合与求和都在 host / skill（用户 2026-10-30 定）。
 * 柱色：≥2 工作区 = 叠加分段、每区一色；仅 1 个工作区 = 完成(绿) / 取消(红) 两段。
 * 曲线：**新增任务量**（一条线、不分工作区），每个周期一个点，跟柱对齐。
 * 布局：柱序居左、柱宽固定、柱间 2px；按容器宽算能放几个周期（屏幕越窄越少），右边留白。
 * 翻页：步长随粒度（用户 2026-10-29 定）——日 10 天 / 周 4 周 / 月 3 月。
 */
import { createElement as h, type ReactNode, useEffect, useRef, useState } from "react";
import {
	IconChevronLeftOutlineRegular,
	IconChevronRightOutlineRegular,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { LocaleKey, Translate } from "./locales";
import type { HistoryBucket, HistoryGran, HistoryTrendPayload } from "./types";
import { EmptyState, IconButton, Segmented, StatCard, Tip } from "./ui";

/** 工作区配色：取插件语义 token（≥5 个区会循环）。 */
const PALETTE = [
	"var(--dtl-business)",
	"var(--dtl-success)",
	"var(--dtl-warning)",
	"var(--dtl-overdue)",
	"var(--dtl-danger)",
];

/** 单周期槽宽：柱宽 = 槽宽。2026-10-29 用户要求加粗到 1.5 倍（10 → 15）。 */
const SLOT_W = 15;
/** 槽间距：用户没让变，保持 2px。 */
const GAP = 2;
/** x 轴标签的最小间距（小于这个就跳着显示，免得挤成一团）。 */
const LABEL_MIN_PITCH = 40;

/** 翻页步长：按一次左右箭头走几个周期（用户 2026-10-29 定）。 */
const GRAN_STEP: Record<HistoryGran, number> = { day: 10, week: 4, month: 3 };
/** 各粒度的单位名（用于翻页提示「前 4 周」里的单位）。 */
const GRAN_UNIT: Record<HistoryGran, LocaleKey> = {
	day: "historyGranDay",
	week: "historyGranWeek",
	month: "historyGranMonth",
};
const GRAN_VALUES: readonly HistoryGran[] = ["day", "week", "month"];

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

/** 本周一（周一为一周之始，与 skill 同口径）。 */
function mondayOf(value: string): string {
	const date = new Date(`${value}T00:00:00`);
	date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
	return ymdOf(date);
}

function monthStart(value: string): string {
	return `${value.slice(0, 7)}-01`;
}

function prevMonthStart(value: string): string {
	const date = new Date(`${monthStart(value)}T00:00:00`);
	date.setMonth(date.getMonth() - 1);
	return ymdOf(date);
}

/** 右侧 4 个方框（2×2，单块尺寸与主页统计卡一致）；数字由 host 从 day 桶求和下发。 */
export function HistoryStats(props: {
	data: HistoryTrendPayload;
	t: Translate;
}): ReactNode {
	const { data, t } = props;
	const totals = data.totals;
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

/** 左侧图表卡：周期堆叠柱 + 新增量曲线 + y 轴 + 粒度切换 / 翻页（无图例）。 */
export function HistoryChart(props: {
	data: HistoryTrendPayload;
	t: Translate;
	/** 当前粒度（真源在页面层；切粒度 = 重新请求 `/history/trend`）。 */
	gran: HistoryGran;
	onGranChange: (next: HistoryGran) => void;
}): ReactNode {
	const { data, t, gran, onGranChange } = props;
	const plotRef = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);
	/** 从最新周期往回翻了几次（每次走 GRAN_STEP 个周期）。 */
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

	if (data.buckets.length === 0) {
		return h(
			"div",
			{ className: "dtl-card dtl-hist" },
			h(EmptyState, { title: t("historyEmpty") }),
		);
	}

	const step = GRAN_STEP[gran];
	const capacity = width > 0 ? Math.max(1, Math.floor(width / (SLOT_W + GAP))) : 30;
	// 一屏放几个周期：日按像素算；周 / 月按「一个周期占多少天」折算，且不少于一次翻页的量
	const perScreen =
		gran === "day"
			? capacity
			: Math.max(step, Math.round(capacity / (gran === "week" ? 7 : 30)));

	// 窗口：payload.buckets 已按 [from, to] 裁成连续桶；从最新往回 shift × step 个周期
	const last = data.buckets.length - 1;
	const endIndex = Math.max(0, Math.min(last, last - shift * step));
	const startIndex = Math.max(0, endIndex - (perScreen - 1));
	const buckets = data.buckets.slice(startIndex, endIndex + 1);

	const peak = buckets.reduce(
		(max, bucket) => Math.max(max, bucket.done + bucket.cancelled),
		0,
	);

	const multi = data.workspaces.length >= 2;
	const colorById = new Map<string, string>();
	data.workspaces.forEach((workspace, index) => {
		colorById.set(workspace.id, PALETTE[index % PALETTE.length] ?? PALETTE[0]);
	});

	const segmentsOf = (bucket: HistoryBucket): { count: number; color: string }[] => {
		if (!multi) {
			const out: { count: number; color: string }[] = [];
			if (bucket.done > 0) out.push({ count: bucket.done, color: "var(--dtl-success)" });
			if (bucket.cancelled > 0)
				out.push({ count: bucket.cancelled, color: "var(--dtl-danger)" });
			return out;
		}
		const out: { count: number; color: string }[] = [];
		for (const workspace of data.workspaces) {
			const cell = bucket.byWorkspace[workspace.id];
			const count = cell === undefined ? 0 : cell.done + cell.cancelled;
			if (count > 0)
				out.push({ count, color: colorById.get(workspace.id) ?? PALETTE[0] });
		}
		return out;
	};

	/** 浮卡：首行周期，下面**一工作区一行**（色块 + 名称 + 结案数），有几个列几个、0 值不列。
	 *  多工作区按 host 给的 workspaces 顺序（与配色分配同序）；单工作区时柱色本来就是
	 *  完成绿 / 取消红，所以拆成那两行，不硬塞一个工作区色（用户 2026-10-29）。 */
	const rowsOf = (bucket: HistoryBucket): TipRow[] => {
		const rows: TipRow[] = [];
		if (multi) {
			for (const workspace of data.workspaces) {
				const cell = bucket.byWorkspace[workspace.id];
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
			if (bucket.done > 0)
				rows.push({
					key: "done",
					name: t("chartFinished"),
					count: bucket.done,
					color: "var(--dtl-success)",
				});
			if (bucket.cancelled > 0)
				rows.push({
					key: "cancelled",
					name: t("chartCancelled"),
					count: bucket.cancelled,
					color: "var(--dtl-danger)",
				});
		}
		return rows;
	};

	/** 浮卡标题：日 = 当天、周 = 起止区间、月 = 年月（桶边界是 skill 口径）。 */
	const titleOf = (bucket: HistoryBucket): string =>
		gran === "day"
			? bucket.key
			: gran === "week"
				? t("periodRange", { from: bucket.key, to: bucket.to })
				: bucket.key.slice(0, 7);

	const tipOf = (bucket: HistoryBucket): ReactNode => {
		const rows = rowsOf(bucket);
		// 「新增」一行：整个周期汇总、不分工作区，与曲线同色；0 就不列（0 不充数）
		return h(
			"div",
			{ className: "dtl-hist__tip" },
			h("div", { className: "dtl-hist__tip-date" }, titleOf(bucket)),
			bucket.added > 0
				? h(
						"div",
						{ key: "added", className: "dtl-hist__tip-row" },
						h("span", {
							className: "dtl-hist__tip-dot",
							style: { background: "var(--dtl-chart-added)" },
						}),
						h("span", null, t("chartAdded")),
						h("span", { className: "dtl-hist__tip-count" }, String(bucket.added)),
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

	const colStyle: Record<string, string | number> = { width: `${String(SLOT_W)}px` };
	const colOf = (bucket: HistoryBucket): ReactNode => {
		const total = bucket.done + bucket.cancelled;
		if (total <= 0) {
			return h("div", { key: bucket.key, className: "dtl-hist__col", style: colStyle });
		}
		const segments = segmentsOf(bucket);
		const height = peak === 0 ? 0 : Math.max((total / peak) * 100, 2);
		return h(
			"div",
			{ key: bucket.key, className: "dtl-hist__col", style: colStyle },
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
			tipOf(bucket),
		);
	};

	const labelStep = Math.max(1, Math.ceil(LABEL_MIN_PITCH / (SLOT_W + GAP)));
	const labelOf = (bucket: HistoryBucket, index: number): ReactNode =>
		h(
			"div",
			{ key: bucket.key, className: "dtl-hist__label", style: colStyle },
			index % labelStep === 0 ? (gran === "month" ? bucket.key.slice(0, 7) : bucket.key.slice(5)) : "",
		);

	const atEarliest = startIndex <= 0;
	const atLatest = shift <= 0;

	/** 新增量曲线：一周期一个点落在柱中心，**一条线、不分工作区**（用户 2026-10-29）。
	 *  x 用「列中心 / plot 实宽」的真实占比 —— 周 / 月模式柱子只占左边一小条，
	 *  曲线必须跟着柱走，不许铺满图宽（用户 2026-10-30）。
	 *  归一化只看曲线自己的峰值（与柱子的结案峰值各管各的），全 0 就不画。 */
	const curve = (): ReactNode => {
		if (width <= 0) return null;
		const values = buckets.map((bucket) => bucket.added);
		const max = values.reduce((m, v) => (v > m ? v : m), 0);
		if (max <= 0) return null;
		const points = values
			.map(
				(value, index) =>
					`${((((index + 0.5) * (SLOT_W + GAP)) / width) * 100).toFixed(3)},${(100 - (value / max) * 96).toFixed(2)}`,
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

	const unit = t(GRAN_UNIT[gran]);

	return h(
		"div",
		{ className: "dtl-card dtl-hist" },
		// 粒度 + 翻页：绝对定位飘在图区右上角，不单独占一行（用户 2026-10-29）
		h(
			"div",
			{ className: "dtl-hist__nav" },
			h(Segmented<HistoryGran>, {
				id: "dtl-hist-gran",
				value: gran,
				size: "sm",
				// 轨道底与卡片同色、看不出轮廓 ⇒ 用核心的带描边款勾出边界（用户 2026-10-30）
				bordered: true,
				label: t("historyGranLabel"),
				items: GRAN_VALUES.map((value) => ({
					value,
					label: t(GRAN_UNIT[value]),
				})),
				// 切粒度 = 换一套 skill 桶：页面层重新请求，窗口回到最新
				onChange: (next: HistoryGran) => {
					setShift(0);
					onGranChange(next);
				},
			}),
			navButton("left", t("historyPrev", { n: step, unit }), atEarliest, () => {
				setShift((value) => value + 1);
			}),
			navButton("right", t("historyNext", { n: step, unit }), atLatest, () => {
				setShift((value) => Math.max(0, value - 1));
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
						// 底部让出 x 轴标签行（10px 字 + 2px 上边距），零刻度才落在基线上
						paddingBottom: "12px",
						textAlign: "right",
						fontSize: "10px",
						lineHeight: "1",
						color: "var(--dtl-fg-3)",
						fontVariantNumeric: "tabular-nums",
					},
				},
				// 五档刻度：峰值只是量程标注（顶上不画线），下面四档各对应一条线
				h("span", null, String(peak)),
				h("span", null, String(Math.round((peak * 3) / 4))),
				h("span", null, String(Math.round(peak / 2))),
				h("span", null, String(Math.round(peak / 4))),
				h("span", null, "0"),
			),
			h(
				"div",
				{ style: { flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 } },
				h(
					"div",
					{ className: "dtl-hist__plot", ref: plotRef },
					// 刻度线：顶部不画（从右上角控件后面穿过），中间三条虚线 + 底部实线基线
					h(
						"div",
						{ className: "dtl-hist__grid" },
						h("div", { className: "dtl-hist__gridline dtl-hist__gridline--none" }),
						h("div", { className: "dtl-hist__gridline dtl-hist__gridline--dashed" }),
						h("div", { className: "dtl-hist__gridline dtl-hist__gridline--dashed" }),
						h("div", { className: "dtl-hist__gridline dtl-hist__gridline--dashed" }),
						h("div", { className: "dtl-hist__gridline dtl-hist__gridline--base" }),
					),
					h("div", { className: "dtl-hist__cols" }, ...buckets.map(colOf)),
					// 曲线压在柱子上（参考图同款），pointer-events:none 不挡柱子的悬停
					curve(),
				),
				h(
					"div",
					{ className: "dtl-hist__labels" },
					...buckets.map((bucket, index) => labelOf(bucket, index)),
				),
			),
		),
	);
}
