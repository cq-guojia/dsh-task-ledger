/**
 * 首页趋势图（右上卡）：近 8 周 × 三根细柱 = 完成 / 未结 / 新增。
 *
 * 数据口径**全由 skill 算好**（`stats --trend week --last 8w --by-owner`，host 已跨工作区求和）：
 * 完成按结案时间、新增按**创建人**、未结是「该周结束时仍未结案」（待认领 + 进行中合成一个数）。
 *
 * 「只看我的」（2026-10-29 用户定稿）：勾上 = 我的，不勾 = 所有；两套数随快照一起回来 ⇒ 勾选零请求。
 * 按人口径 = skill 的 per-owner：`added` 按 creator（我提的）、`done` / `open` 按 owner（我负责的）。
 *
 * 画法（2026-10-17 参考图口径）：
 *  - 柱宽 5px、组内 1px、**无圆角**；柱高百分比（祖先链有确定高度，见 ui.ts 的注释）；
 *  - y 轴三档刻度（0 / 半峰 / 峰）+ 淡网格线 + 底部基线；
 *  - **只标「完成」数值**（三系列 × 8 周会糊成一片），未结 / 新增走 hover；
 *  - hover 整列三根一起提亮 + 自绘浮卡（原生 title 太慢且长相不一）——纯 CSS，无额外状态。
 */
import {
	createElement as h,
	type ReactNode,
	useState,
} from "react";
import { formatCount } from "./format";
import type { Translate } from "./locales";
import type { TrendBucketView, TrendOwnerCounts, TrendView } from "./types";

const BAR_KINDS = ["done", "open", "added"] as const;
type BarKind = (typeof BAR_KINDS)[number];

const ZERO: TrendOwnerCounts = { added: 0, done: 0, open: 0 };

const labelKey = (kind: BarKind): "chartDone" | "chartOpen" | "chartAdded" =>
	kind === "done" ? "chartDone" : kind === "open" ? "chartOpen" : "chartAdded";

export function TrendChart(props: {
	trend: TrendView;
	/** 本机身份 uuid；拿不到就不给「只看我的」（不猜）。 */
	me: string | null;
	t: Translate;
}): ReactNode {
	const { trend, me, t } = props;
	const [mineOnly, setMineOnly] = useState(false);
	const buckets = trend.buckets;
	const mine = mineOnly && me !== null;

	if (buckets.length === 0) {
		return h(
			"div",
			{ className: "dtl-card dtl-trend" },
			h("div", { className: "dtl-trend__foot" }, t("chartEmpty")),
		);
	}

	/** 当前口径下这一桶的三个数：全量，或「我的」那条（没数据就是 0）。 */
	const counts = (bucket: TrendBucketView): TrendOwnerCounts =>
		mine ? (bucket.owners[me] ?? ZERO) : bucket;

	// 峰 = 当前口径下三系列的最大值；全 0 时按 1 兜底（只防除零，柱高仍为 0）
	const peak = buckets.reduce((max, bucket) => {
		const cell = counts(bucket);
		return Math.max(max, cell.added, cell.done, cell.open);
	}, 0);
	const top = peak === 0 ? 1 : peak;
	const ticks = [formatCount(top), formatCount(Math.ceil(top / 2)), "0"];

	const bar = (bucket: TrendBucketView, kind: BarKind): ReactNode => {
		const value = counts(bucket)[kind];
		return h(
			"div",
			{
				className: `dtl-trend__bar dtl-trend__bar--${kind}`,
				style: {
					height: `${String((value / top) * 100)}%`,
					minHeight: value > 0 ? "2px" : "0",
				},
			},
			kind === "done" && value > 0
				? h("span", { className: "dtl-trend__value" }, formatCount(value))
				: null,
		);
	};

	const column = (bucket: TrendBucketView): ReactNode =>
		h(
			"div",
			{ className: "dtl-trend__col" },
			h(
				"div",
				{ className: "dtl-trend__tip" },
				h(
					"div",
					{ className: "dtl-trend__tip-row" },
					t("periodRange", { from: bucket.from, to: bucket.to }),
				),
				...BAR_KINDS.map((kind) =>
					h(
						"div",
						{ className: "dtl-trend__tip-row" },
						h("span", { className: `dtl-trend__dot dtl-trend__dot--${kind}` }),
						`${t(labelKey(kind))} ${formatCount(counts(bucket)[kind])}`,
					),
				),
			),
			h("div", { className: "dtl-trend__bars" }, ...BAR_KINDS.map((kind) => bar(bucket, kind))),
			// x 轴标**周末日期**（数据按截止日判），当周就是今天
			h("div", { className: "dtl-trend__x" }, bucket.to.slice(5)),
		);

	const first = buckets[0];
	const partial =
		trend.coverageFrom !== "" && trend.coverageFrom > first.from
			? h(
					"div",
					{ className: "dtl-trend__foot" },
					t("chartPartial", { from: trend.coverageFrom }),
				)
			: null;

	return h(
		"div",
		{ className: "dtl-card dtl-trend" },
		h(
			"div",
			{ className: "dtl-trend__legend" },
			...BAR_KINDS.map((kind) =>
				h(
					"span",
					null,
					h("span", { className: `dtl-trend__dot dtl-trend__dot--${kind}` }),
					t(labelKey(kind)),
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
		h(
			"div",
			{ className: "dtl-trend__body" },
			h(
				"div",
				{ className: "dtl-trend__axis" },
				...ticks.map((tick) => h("span", null, tick)),
			),
			h(
				"div",
				{ className: "dtl-trend__plot" },
				h(
					"div",
					{ className: "dtl-trend__grid" },
					h("div", { className: "dtl-trend__gridline" }),
					h("div", { className: "dtl-trend__gridline" }),
					h("div", { className: "dtl-trend__gridline dtl-trend__gridline--base" }),
				),
				h("div", { className: "dtl-trend__cols" }, ...buckets.map(column)),
			),
		),
		partial,
	);
}
