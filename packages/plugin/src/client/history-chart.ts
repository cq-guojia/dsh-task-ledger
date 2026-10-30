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
import { createElement as h, type ReactNode, useEffect, useState } from "react";
import {
	IconChevronLeftOutlineRegular,
	IconChevronRightOutlineRegular,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { LocaleKey, Translate } from "./locales";
import type { HistoryBucket, HistoryGran, HistoryTrendPayload } from "./types";
import {
	EmptyState,
	IconButton,
	LoadingBlock,
	Segmented,
	StatCard,
	Tip,
} from "./ui";


/** 工作区配色：色相环按黄金角 137.5° 取 24 档，相邻色差最大、互相不重复
 *  （用户 2026-10-30：内置二三十个够用，按工作区顺序依次分配；中亮度中饱和，明暗底都成立）。 */
const colorAt = (index: number): string =>
	`hsl(${String(Math.round((index * 137.5) % 360))}deg 62% 52%)`;

/** 单周期槽宽：柱宽 = 槽宽。2026-10-29 用户要求加粗到 1.5 倍（10 → 15）。 */
const SLOT_W = 15;
/** 槽间距：用户没让变，保持 2px。 */
const GAP = 2;
/** 入场动画的错峰上限：第 20 列之后共用同一档延迟（再往后延迟太长，右边要等好几秒）。 */
const STAGGER_CAP = 20;

/** x 轴标签的最小间距（小于这个就跳着显示，免得挤成一团）。月是 `2026-10` 七位，
 *  比 `10-30` 宽一截 ⇒ 单独放宽，跨度落到 4 个槽标一次（用户 2026-10-30 嫌月标签太密）。 */
const LABEL_MIN_PITCH: Record<HistoryGran, number> = { day: 40, week: 40, month: 62 };

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

/** y 轴刻度紧凑格式：≥1000 走 1.3K / 13K（用户 2026-10-30：左侧只留 3~4 位数字的宽度）。 */
function compactTick(value: number): string {
	return value < 1000 ? String(value) : `${String(Math.round(value / 100) / 10)}K`;
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

function addDays(value: string, delta: number): string {
	const date = new Date(`${value}T00:00:00`);
	date.setDate(date.getDate() + delta);
	return ymdOf(date);
}

function addMonths(value: string, delta: number): string {
	const date = new Date(`${monthStart(value)}T00:00:00`);
	date.setMonth(date.getMonth() + delta);
	return ymdOf(date);
}

/** 某天属于哪个周期（桶 key = 周期起始日，与 skill 口径一致）。 */
function keyOf(gran: HistoryGran, date: string): string {
	return gran === "day" ? date : gran === "week" ? mondayOf(date) : monthStart(date);
}

/** 周期 key 前后挪几个周期。 */
function shiftKey(gran: HistoryGran, key: string, delta: number): string {
	return gran === "day"
		? addDays(key, delta)
		: gran === "week"
			? addDays(key, delta * 7)
			: addMonths(key, delta);
}

/** 周期最后一天（浮卡的区间标题用）。 */
function endOf(gran: HistoryGran, key: string): string {
	return gran === "day"
		? key
		: gran === "week"
			? addDays(key, 6)
			: addDays(addMonths(key, 1), -1);
}

/** 右侧 4 个方框（2×2，单块尺寸与主页统计卡一致）；数字由 host 从 day 桶求和下发。
 *  数据没到（null）= 四块全显示横杠：骨架高度不变，页面不跳（用户 2026-10-30）。 */
export function HistoryStats(props: {
	data: HistoryTrendPayload | null;
	t: Translate;
}): ReactNode {
	const { data, t } = props;
	const totals = data?.totals;
	const dash = "—";
	const today = ymdOf(new Date());
	const weekFrom = mondayOf(today);
	// 每块带一行小字（覆盖区间）——与主页统计卡同结构 ⇒ 同尺寸、同高度。
	return h(
		"div",
		{ className: "dtl-stats__cards" },
		h(StatCard, {
			label: t("historyToday"),
			value: totals === undefined ? dash : totals.today,
			hint: today.slice(5),
		}),
		h(StatCard, {
			label: t("historyWeek"),
			value: totals === undefined ? dash : totals.week,
			hint: `${weekFrom.slice(5)}~${today.slice(5)}`,
		}),
		h(StatCard, {
			label: t("historyMonth"),
			value: totals === undefined ? dash : totals.month,
			hint: today.slice(0, 7),
		}),
		h(StatCard, {
			label: t("historyLastMonth"),
			value: totals === undefined ? dash : totals.lastMonth,
			hint: prevMonthStart(today).slice(0, 7),
		}),
	);
}

/** 左侧图表卡：周期堆叠柱 + 新增量曲线 + y 轴 + 粒度切换 / 翻页（无图例）。
 *  `data = null`（首读未到）⇒ 骨架卡：卡壳高度与有数据时一致，中间核心加载卡 ⇒ 页面不跳。 */
export function HistoryChart(props: {
	data: HistoryTrendPayload | null;
	t: Translate;
	/** 当前粒度（真源在页面层；切粒度 = 重新请求 `/history/trend`）。 */
	gran: HistoryGran;
	onGranChange: (next: HistoryGran) => void;
}): ReactNode {
	const { data, t, gran, onGranChange } = props;
	// callback ref：plot 是**条件渲染**的（骨架 / 空态时不存在），对象 ref 的 effect 只跑一次
	// 会扑空、之后再也不重跑 ⇒ 曲线用的实宽永远是 0（曲线凭空消失的真因）。挂载即接线。
	const [plotEl, setPlotEl] = useState<HTMLDivElement | null>(null);
	const [width, setWidth] = useState(0);
	/** 从最新周期往回翻了几次（每次走 GRAN_STEP 个周期）。 */
	const [shift, setShift] = useState(0);

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

	if (data === null) {
		return h(
			"div",
			{
				className: "dtl-card dtl-hist",
				style: { alignItems: "center", justifyContent: "center" },
			},
			h(LoadingBlock, { text: t("loading") }),
		);
	}

	if (data.buckets.length === 0) {
		return h(
			"div",
			{ className: "dtl-card dtl-hist" },
			h(EmptyState, { title: t("historyEmpty") }),
		);
	}

	const step = GRAN_STEP[gran];
	// 一屏几根柱：只跟宽度走（日就看 N 天、周就看 N 周、月就看 N 月，不折算）
	const perScreen = width > 0 ? Math.max(1, Math.floor(width / (SLOT_W + GAP))) : 30;

	// 窗口：**今天永远是最右一根**，往前数满一屏；翻页不设边界 —— 数据窗口（最近 365 天）
	// 之外一律补空槽（柱没有、曲线是直线），所以永远能翻（用户 2026-10-30）
	const byKey = new Map(data.buckets.map((bucket) => [bucket.key, bucket]));
	const lastKey = keyOf(gran, ymdOf(new Date()));
	const offset = shift * step;
	const buckets: HistoryBucket[] = [];
	for (let back = perScreen - 1; back >= 0; back -= 1) {
		const key = shiftKey(gran, lastKey, -(offset + back));
		buckets.push(
			byKey.get(key) ?? {
				key,
				to: endOf(gran, key),
				done: 0,
				cancelled: 0,
				added: 0,
				byWorkspace: {},
			},
		);
	}

	const peak = buckets.reduce(
		(max, bucket) => Math.max(max, bucket.done + bucket.cancelled),
		0,
	);

	const multi = data.workspaces.length >= 2;
	const colorById = new Map<string, string>();
	// 按 host 给的 workspaces 顺序依次取色（同序 = 同色，切粒度不变色）
	data.workspaces.forEach((workspace, index) => {
		colorById.set(workspace.id, colorAt(index));
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
				out.push({ count, color: colorById.get(workspace.id) ?? colorAt(0) });
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
					color: colorById.get(workspace.id) ?? colorAt(0),
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

	/** 总计行的图例块（用户 2026-10-30）：**固定两/三段等分**，不按本列实际有几段去算 ——
	 *  只借色板前 3 色当示例，横着一条条叠（与柱子的分段同向，柱里的段也是横着叠的）。
	 *  单工作区时柱子本来就是「完成绿 / 取消红」两段，图例跟着给两段，别硬凑三色。 */
	const legendColors = multi
		? [colorAt(0), colorAt(1), colorAt(2)]
		: ["var(--dtl-success)", "var(--dtl-danger)"];
	const legend = h(
		"span",
		{ className: "dtl-hist__tip-dot dtl-hist__tip-dot--split" },
		...legendColors.map((color, index) => h("span", { key: index, style: { background: color } })),
	);

	const tipOf = (bucket: HistoryBucket): ReactNode => {
		const rows = rowsOf(bucket);
		// 柱高 = 完成 + 取消 = 结案总量（术语见 locales：结案 = 完成 + 取消）
		const closed = bucket.done + bucket.cancelled;
		// 结构（用户 2026-10-30）：日期 → 新建任务 → 结案任务（总计）→ 虚线 → 明细。
		// 「新建」是曲线口径、不分工作区，与曲线同色；两行总计 0 就不列（0 不充数）。
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
						h("span", null, t("chartCreatedTasks")),
						h("span", { className: "dtl-hist__tip-count" }, String(bucket.added)),
					)
				: null,
			closed > 0
				? h(
						"div",
						{ key: "closed", className: "dtl-hist__tip-total" },
						legend,
						h("span", null, t("chartClosedTasks")),
						h("span", { className: "dtl-hist__tip-count" }, String(closed)),
					)
				: null,
			rows.length > 0 ? h("div", { key: "sep", className: "dtl-hist__tip-sep" }) : null,
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
	const colOf = (bucket: HistoryBucket, index: number): ReactNode => {
		const total = bucket.done + bucket.cancelled;
		// 入场动画的错峰序号：写在列上（CSS 变量会继承到柱体），柱子的 animation-delay 用它。
		// key 里带批次（粒度 + 翻页次数）：翻页时新旧窗口有大半列 key 相同，React 会复用 DOM
		// ⇒ 那几根柱子不重放动画（用户 2026-10-30 看到的「有的柱子一直在那」）。带批次才整批重建。
		const style: Record<string, string | number> = {
			...colStyle,
			"--lc-i": String(Math.min(index, STAGGER_CAP)),
		};
		const colKey = `${gran}:${String(shift)}:${bucket.key}`;
		// 空列也挂浮卡：柱可以为空、x 轴标签也可以跳着不画，但悬停时该周期的时间必须显出来
		//（用户 2026-10-30）。floats 里没有 0 值行 ⇒ 这类浮卡只剩一行日期。
		if (total <= 0) {
			return h("div", { key: colKey, className: "dtl-hist__col", style }, tipOf(bucket));
		}
		const segments = segmentsOf(bucket);
		const height = peak === 0 ? 0 : Math.max((total / peak) * 100, 2);
		return h(
			"div",
			{ key: colKey, className: "dtl-hist__col", style },
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

	const labelStep = Math.max(1, Math.ceil(LABEL_MIN_PITCH[gran] / (SLOT_W + GAP)));
	/** 最后一个真正画出文字的槽：它得右对齐，否则末位数字会顶出卡片。 */
	const lastLabelIndex = buckets.length - 1 - ((buckets.length - 1) % labelStep);
	const labelOf = (bucket: HistoryBucket, index: number): ReactNode => {
		// 日 / 周 = `10-30`（五位），月 = `2026-10`（七位，年不可省 —— 月粒度会翻到去年）
		// 月桶 key 是 `YYYY-MM-01`（月首日）⇒ 取前 7 位
		const text =
			index % labelStep === 0
				? gran === "month"
					? bucket.key.slice(0, 7)
					: bucket.key.slice(5)
				: "";
		// 锚点：一律以**列中心**向两侧展开（不从卡片最左 / 最右起排，用户 2026-10-30）；
		// 首列左对齐、末个有字列右对齐，只把这两头钳回卡片内。
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
			{ key: bucket.key, className: "dtl-hist__label", style: colStyle },
			text === "" ? null : h("span", { style: anchor ?? undefined }, text),
		);
	};

	// 翻页**不设边界**：前面全是 0 也允许翻（用户 2026-10-30 定的简化方案）

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
				onClick,
			}),
		});

	const unit = t(GRAN_UNIT[gran]);

	return h(
		"div",
		{ className: "dtl-card dtl-hist" },
		// 粒度 + 翻页：绝对定位飘在图区右上角，不单独占一行（用户 2026-10-29）；
		// 排布：翻页箭头在左、粒度滑动框居右（用户 2026-10-30）
		h(
			"div",
			{ className: "dtl-hist__nav" },
			navButton("left", t("historyPrev", { n: step, unit }), () => {
				setShift((value) => value + 1);
			}),
			navButton("right", t("historyNext", { n: step, unit }), () => {
				setShift((value) => Math.max(0, value - 1));
			}),
			h(Segmented<HistoryGran>, {
				id: "dtl-hist-gran",
				value: gran,
				size: "sm",
				// 不描边：轨道就用核心自带的底（自带底色本就有轮廓），不外包一层自定义底
				//（用户 2026-10-30：先看核心原样）
				// 选中片用业务主色（与顶部「在办 / 历史」切换同款，用户 2026-10-30）
				tone: "business",
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
						// 只留 3~4 位数字的宽度（用户 2026-10-30）；再长的数字走 compactTick
						minWidth: "20px",
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
				h("span", null, compactTick(peak)),
				h("span", null, compactTick(Math.round((peak * 3) / 4))),
				h("span", null, compactTick(Math.round(peak / 2))),
				h("span", null, compactTick(Math.round(peak / 4))),
				h("span", null, "0"),
			),
			h(
				"div",
				{ style: { flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 } },
				h(
					"div",
					{ className: "dtl-hist__plot", ref: setPlotEl },
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
