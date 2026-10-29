/**
 * UI 基础层：样式单源 + 薄包裹（**一类控件只有一份实现**）。
 *
 * 纪律（用户 2026-10-28：「以后就全用我们的核心空间库」）：
 *  1. **控件一律来自 `dsh-plugin-core/ui`**（Button / IconButton / Input / Picker /
 *     Segmented / Chip / StripCard），本文件只做「本插件需要的形状」薄包裹，
 *     **不再自绘任何控件皮肤**——旧的 `.dtl-btn / .dtl-input / .dtl-select` 等一套已删除；
 *  2. **样式**：颜色 / 圆角 / 字号一律 `var(--dtl-*)`（定义只在 tokens.ts），
 *     业务文件不许再写第二份 `var(--dsw-*)`、不许自造 `--dtl-*`；
 *  3. 官方 primitives 只留「官方做得更好」的（Tooltip / MarkdownText / 图标）。
 */

import {
	IconSearchOutlineRegular,
	Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import {
	Button as CoreButton,
	Chip as CoreChip,
	IconButton as CoreIconButton,
	Input as CoreInput,
	Picker as CorePicker,
	type PickerGroup,
	Segmented as CoreSegmented,
	showLoading as CoreShowLoading,
	type LoadingHandle,
} from "dsh-plugin-core/ui";
import { type CSSProperties, createElement as h, type ReactNode } from "react";
import { UI_CONTROLS_CSS, UI_TOKENS_CSS } from "./tokens";

/** 基础层样式（tokens + 业务容器类；幂等注入）。 */
const UI_BASE_CSS = `
/* 统计卡：8 块（2×4）+ 右图表卡位 */
.dtl-stat{display:flex;flex-direction:column;gap:var(--dtl-space-1);
  padding:var(--dtl-space-3) var(--dtl-space-4);text-align:left;}
.dtl-stat__value{font-size:var(--dtl-font-stat);font-weight:600;line-height:1.15;font-variant-numeric:tabular-nums;}
.dtl-stat__hint{font-size:var(--dtl-font-xs);line-height:var(--dtl-line-xs);color:var(--dtl-fg-3);}

/* 统计区整体：左 8 块（2 行 × 4 列）+ 右图表卡，参考图同款分栏。
   ⚠️ 列数写死 4 → 2，绝不给 3：3 列会排出 3+1 的非对称（用户 2026-10-17）。
   两栏**完全等高**：cards 两行 minmax(0,1fr) 均分 + 卡 height:100% ⇒ 图表卡与左边一样高。 */
.dtl-stats{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:var(--dtl-space-3);align-items:stretch;}
.dtl-stats__cards{display:grid;grid-auto-flow:column;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));
  gap:var(--dtl-space-3);}
.dtl-stats__cards > .dtl-stat{height:100%;box-sizing:border-box;}
@media (max-width:960px){.dtl-stats{grid-template-columns:minmax(0,1fr);}}
@media (max-width:640px){.dtl-stats__cards{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr));}}

/* ── 趋势图（右上卡：8 周 × 3 柱）────────────────────────────────
   柱高是百分比 ⇒ 祖先链必须有**确定高度**（卡 height:100% → body flex:1 → plot 绝对铺满）；
   2026-10-17 真机教训：百分比高度没有确定父高时整列柱消失，只剩数字。 */
.dtl-trend{height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:var(--dtl-space-2);
  padding:var(--dtl-space-4);}
.dtl-trend__legend{display:flex;align-items:center;flex-wrap:wrap;gap:var(--dtl-space-3);
  font-size:var(--dtl-font-xs);color:var(--dtl-fg-3);}
.dtl-trend__dot{display:inline-block;width:8px;height:8px;margin-right:4px;border-radius:var(--dtl-radius-xs);
  vertical-align:middle;}
.dtl-trend__dot--done{background:var(--dtl-business);}
.dtl-trend__dot--open{background:var(--dtl-chart-open);}
.dtl-trend__dot--added{background:var(--dtl-chart-added);}
/* 「只看我的」：贴图例右侧的小复选框（原生控件 + accent-color，不自绘皮肤） */
.dtl-trend__mine{display:inline-flex;align-items:center;gap:4px;margin-left:auto;cursor:pointer;
  font-size:var(--dtl-font-xs);color:var(--dtl-fg-3);}
.dtl-trend__mine input{margin:0;accent-color:var(--dtl-business);}
.dtl-trend__body{flex:1 1 auto;min-height:0;display:flex;gap:var(--dtl-space-2);}
.dtl-trend__axis{display:flex;flex-direction:column;justify-content:space-between;flex:none;
  padding-bottom:14px;font-size:10px;line-height:1;text-align:right;font-variant-numeric:tabular-nums;
  color:var(--dtl-fg-3);}
.dtl-trend__plot{position:relative;flex:1 1 auto;min-width:0;}
/* 网格：只在绘图区内（底部 14px 留给 x 轴日期），三档刻度与三条线一一对应 */
.dtl-trend__grid{position:absolute;left:0;right:0;top:0;bottom:14px;display:flex;flex-direction:column;
  justify-content:space-between;}
.dtl-trend__gridline{border-top:1px solid var(--dtl-border);}
.dtl-trend__gridline--base{border-top-color:var(--dtl-border-strong);}
.dtl-trend__cols{position:absolute;left:0;right:0;top:0;bottom:0;display:flex;align-items:stretch;
  gap:var(--dtl-space-2);}
.dtl-trend__col{position:relative;flex:1 1 0;min-width:0;display:flex;flex-direction:column;
  justify-content:flex-end;padding-bottom:14px;}
.dtl-trend__bars{display:flex;align-items:flex-end;justify-content:center;gap:1px;flex:1 1 auto;min-height:0;}
/* 柱宽 5px、无圆角（用户 2026-10-17：「太粗、不要圆弧」）；非零柱给 2px 下限 */
.dtl-trend__bar{position:relative;width:5px;flex:none;min-height:2px;
  transition:filter var(--dtl-dur-fast) var(--dtl-ease);}
.dtl-trend__bar--done{background:var(--dtl-business);}
.dtl-trend__bar--open{background:var(--dtl-chart-open);}
.dtl-trend__bar--added{background:var(--dtl-chart-added);}
/* hover 整列三根一起提亮（用户 2026-10-17：不是只亮蓝的一根） */
.dtl-trend__col:hover .dtl-trend__bar{filter:brightness(1.18);}
.dtl-trend__value{position:absolute;top:-12px;left:50%;transform:translateX(-50%);
  font-size:10px;line-height:1;color:var(--dtl-fg-2);font-variant-numeric:tabular-nums;white-space:nowrap;}
.dtl-trend__x{position:absolute;left:0;right:0;bottom:0;text-align:center;font-size:10px;line-height:1;
  color:var(--dtl-fg-3);font-variant-numeric:tabular-nums;}
/* hover 浮卡：自绘（原生 title 太慢且长相不一） */
.dtl-trend__tip{position:absolute;left:50%;bottom:calc(100% - 10px);z-index:2;transform:translateX(-50%);
  padding:var(--dtl-space-2);border:1px solid var(--dtl-border-strong);border-radius:var(--dtl-radius-sm);
  background:var(--dtl-surface-1);white-space:nowrap;
  font-size:var(--dtl-font-xs);line-height:1.5;color:var(--dtl-fg-2);
  opacity:0;pointer-events:none;transition:opacity var(--dtl-dur-fast) var(--dtl-ease);}
.dtl-trend__col:hover .dtl-trend__tip{opacity:1;}
.dtl-trend__tip-row{font-variant-numeric:tabular-nums;}
/* 未结的拆分行：缩进 + 淡一档，读起来是「未结」的注脚 */
.dtl-trend__tip-row--sub{padding-left:10px;color:var(--dtl-fg-3);}
.dtl-trend__foot{font-size:var(--dtl-font-xs);color:var(--dtl-fg-3);}

/* 任务行 = 一张卡（样式照抄 dispatch-table TaskCard：surface-1 底 + 1px 边框 + 左缘状态条；
   hover 只亮主行；右侧 时间⇄按钮排 互换） */
.dtl-taskrow{background:var(--dtl-surface-1);border:1px solid var(--dtl-border);
  border-radius:var(--dtl-radius-sm);margin-bottom:10px;}
.dtl-taskrow__row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:inherit;
  cursor:pointer;transition:background-color var(--dtl-dur-fast) var(--dtl-ease);}
.dtl-taskrow__row:hover{background:var(--dtl-card-hover);}

/* 状态条：贴卡片左缘、与正文两行等高的竖向色条（dispatch StatusRail 同款 6×36） */
.dtl-rail{display:inline-block;width:6px;height:36px;flex:none;border-radius:var(--dtl-radius-xs);}
.dtl-rail--doing{background:var(--dtl-success);}
.dtl-rail--backlog{background:var(--dtl-warning);}
.dtl-rail--overdue{background:var(--dtl-overdue);}
.dtl-rail--stale{background:var(--dtl-danger);}
.dtl-rail--open{background:var(--dtl-fg-3);}

/* 第一行：标题（上来就是标题）+ [YYYY-MM-DD 创建] 灰徽 + 异常 pill（baseline 对齐，dispatch 同款） */
.dtl-taskrow__l1{display:flex;align-items:baseline;gap:6px;min-width:0;}
.dtl-taskrow__title{font-size:var(--dtl-font-lg);font-weight:600;line-height:var(--dtl-line-md);min-width:0;flex:0 1 auto;}
.dtl-taskrow__stamp{flex:none;font-size:var(--dtl-font-xs);color:var(--dtl-fg-3);white-space:nowrap;
  font-variant-numeric:tabular-nums;}
/* 第二行小字：工作区 · #标签（行距拉开，用户 2026-10-17：第一二行别贴着） */
.dtl-taskrow__l2{display:flex;align-items:center;gap:var(--dtl-space-2);margin-top:6px;
  font-size:var(--dtl-font-sm);color:var(--dtl-fg-2);min-width:0;}
/* 右侧（用户 2026-10-28）：工作区 Chip（常驻）/ 时间（hover 让位）/ 动作钮。
   hover 只收时间那一截，Chip 不动 —— 按钮出现时两者保持同一个 gap。
   人名（第二行）走核心 Button 的 link 档，这里不再有它的样式。 */
.dtl-taskrow__meta{flex:none;overflow:hidden;text-overflow:ellipsis;
  font-size:var(--dtl-font-xs);color:var(--dtl-fg-3);white-space:nowrap;
  font-variant-numeric:tabular-nums;}
.dtl-taskrow__actions{display:none;flex:none;gap:6px;align-items:center;}
.dtl-taskrow__row:hover .dtl-taskrow__meta{display:none;}
.dtl-taskrow__row:hover .dtl-taskrow__actions{display:inline-flex;}
/* 次级图标钮（复制 ID / 查看）：动作排里**常驻**，故比旁边那几个描边动作钮浅一档
   （用户 2026-10-28：灰一点、别抢眼）——灰字、无底无边；hover 才回到正常字色。
   明暗都靠 --dtl-fg-3（别名随宿主主题变），不写第二套颜色。 */
.dtl-taskrow__actions .dtl-iconbtn--muted{color:var(--dtl-fg-3);}
.dtl-taskrow__actions .dtl-iconbtn--muted:hover:not(:disabled){color:var(--dtl-fg);}

/* 工作区 / #标签 都是核心可点 Chip（business 档），含最大宽 / 省略号 / 跑马灯，本文件不写皮肤。 */

/* Tooltip 垫片（见 ui.ts 的 Tip）：只是挂官方气泡的真 DOM 锚点，不占额外版面。 */
.dtl-tip{display:inline-flex;min-width:0;}

/* 空态：真空 = 虚线引导卡（用户 2026-10-18：**加高到 180px + 内容居中**；
   它贴在滚动条最底下，太窄用户根本看不见） */
.dtl-empty-guide{display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:var(--dtl-space-2);min-height:270px;padding:var(--dtl-space-4);text-align:center;
  border:1px dashed var(--dtl-border-strong);border-radius:var(--dtl-radius-md);background:transparent;}
`;

const STYLE_ID = "dtl-ui-base";

/** 幂等注入 token 层 + 控件皮肤 + 基础层（面板与浮标谁先挂载都只注入一次）。
 *  已挂载时**就地比对刷新**：插件升级后宿主若复用旧面板 DOM，旧样式表会一直挂着，
 *  导致新版本样式不生效（用户 2026-10-18：0.0.31 装上了圆圈还在）—— 内容变了就原位替换，不必重启。 */
export function ensureUiBase(): void {
	if (typeof document === "undefined") return;
	const css = `${UI_TOKENS_CSS}\n${UI_CONTROLS_CSS}\n${UI_BASE_CSS}`;
	const existing = document.getElementById(STYLE_ID);
	if (existing !== null) {
		if (existing.textContent !== css) existing.textContent = css;
		return;
	}
	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.textContent = css;
	document.head.appendChild(style);
}

/* ── 分段控件 ─────────────────────────────────────────────────────── */

/** 一段（一个可选值）。 */
export interface SegmentedItem<Value extends string = string> {
	readonly value: Value;
	readonly label: string;
	/** 段内角标数字（或已缩写字符串如「1.2K」）；`undefined` / 空串 / "0" 不显示。 */
	readonly badge?: number | string;
}

/** 分段控件（单选）：改由核心 `Segmented` 承担（size/滑块动画全在 core，外观只有一套、无需指定变体，
 *  见 core/src/ui/Segmented.ts 头注：2026-10-26 起已删除 variant 轴）。
 *  本地 `badge` 是「灰字计数」语义 ⇒ 映射到 core 的 `count`（core 的 `badge` 是红色危险圆标）。 */
export function Segmented<Value extends string>(props: {
	items: readonly SegmentedItem<Value>[];
	value: Value;
	onChange: (next: Value) => void;
	size?: "sm" | "md" | "lg";
	label: string;
	id?: string;
	style?: CSSProperties;
}): ReactNode {
	return h(CoreSegmented<Value>, {
		items: props.items.map((item) => ({
			value: item.value,
			label: item.label,
			count: item.badge,
		})),
		value: props.value,
		onChange: props.onChange,
		// size 不兜底：不传就吃核心默认档 lg（2026-10-26 用户对图拍板：跟核心 demo 一致，
		// 之前适配层自作主张降成 md 导致比 demo 矮一档）
		size: props.size,
		label: props.label,
		id: props.id,
		style: props.style,
	});
}

/* ── 按钮 / 图标钮 ────────────────────────────────────────────────── */

/** 按钮：改由核心 `Button` 承担（10 档 variant 里本地用 primary/outline/ghost/link）。
 *  `loading` = 核心自带的前置小圈 + 自动禁用（转圈动画只此一份，不自绘）。
 *  宽度三件（width/minWidth/maxWidth）核心已支持：给 maxWidth + 纯文字 ⇒ 核心自动省略号 +
 *  hover 跑马灯，本层原样透传，别再自己写截断。 */
export function Button(props: {
	children?: ReactNode;
	onClick?: () => void;
	variant?: "primary" | "outline" | "ghost" | "link";
	size?: "sm" | "md" | "lg";
	icon?: ReactNode;
	loading?: boolean;
	disabled?: boolean;
	title?: string;
	width?: number | string;
	minWidth?: number | string;
	maxWidth?: number | string;
}): ReactNode {
	return h(
		CoreButton,
		{
			variant: props.variant,
			size: props.size ?? "md",
			icon: props.icon,
			loading: props.loading,
			disabled: props.disabled,
			title: props.title,
			width: props.width,
			minWidth: props.minWidth,
			maxWidth: props.maxWidth,
			onClick: props.onClick,
		},
		props.children,
	);
}

/** 图标钮：改由核心 `IconButton` 承担。
 *  `className` 只用于挂本文件的修饰类（如 `.dtl-iconbtn--muted`），不覆盖核心皮肤。 */
export function IconButton(props: {
	icon: ReactNode;
	label: string;
	onClick?: () => void;
	variant?: "plain" | "outline";
	size?: "sm" | "md" | "lg";
	disabled?: boolean;
	title?: string;
	className?: string;
}): ReactNode {
	return h(CoreIconButton, {
		icon: props.icon,
		label: props.label,
		onClick: props.onClick,
		variant: props.variant ?? "plain",
		size: props.size ?? "md",
		disabled: props.disabled,
		title: props.title,
		className: props.className,
	});
}

/* ── 提示 ─────────────────────────────────────────────────────────── */

/** 悬停提示（本插件**唯一**挂 Tooltip 的入口）。
 *
 *  ⚠️ 官方 `Tooltip` 给子元素挂 `ref` 来当锚点（`children.ref` → `cloneElement`），
 *  而核心控件（Button / IconButton / Chip）都是**裸函数组件**（无 forwardRef）⇒ ref 被 React
 *  丢掉、锚点永远 null、气泡静默不出现。所以这里统一垫一层**真 DOM 的 span** 当锚点：
 *  悬停/聚焦事件冒泡到 span 照样触发，按钮仍由核心控件渲染。
 *  `display:inline-flex` 让垫片不改变原控件在 flex 行里的尺寸与对齐。 */
export function Tip(props: {
	label: string;
	/** 被提示的元素（Tooltip 只接受单个元素）。 */
	children: ReactNode;
	side?: "top" | "bottom" | "right";
	maxWidth?: number;
}): ReactNode {
	return h(Tooltip, {
		label: props.label,
		side: props.side ?? "bottom",
		portal: true,
		maxWidth: props.maxWidth ?? 240,
		children: h("span", { className: "dtl-tip" }, props.children),
	});
}

/**
 * 全局加载提示：核心 `showLoading` 的**默认位（屏幕下方居中、无遮罩）**，不传定位参数
 * （用户 2026-10-28：就地摆进面板内容区不好看，就用全局那个默认位置）。
 *
 *  ⚠️ 它**不会自动消失**：谁开的谁 `close()`（句柄可重复关，第二次是空操作）；
 *  同屏只有一张卡，后一次调用顶掉前一次 ⇒ 打开面板 / 首读这种场合直接开、数据到了就关。
 */
export function showLoading(text?: string): LoadingHandle {
	return CoreShowLoading({ text });
}

/** 核心封装的 Toast 卡（灰/绿/红/黄，随明暗；默认 info 灰卡、位置 bottom-center）。
 *  无关闭句柄，靠 `durationMs` 自退。 */
export { notify } from "dsh-plugin-core/ui";

/* ── 输入 / 下拉 / 搜索 ───────────────────────────────────────────── */

/** 下拉：改由核心 `Picker`（单选、受控、portal 菜单）承担。
 *  宽度由核心 `Picker` 原生支持（`width`/`minWidth`/`maxWidth` 落到位触发器内联样式，
 * 超长省略号 + hover 跑马灯）；给了 `width` 即锁定定宽，否则在 min/max 间自适应。 */
export function Select<Value extends string>(props: {
	value: Value;
	options: readonly { value: Value; label: string }[];
	onChange: (next: Value) => void;
	ariaLabel: string;
	/** 定宽（px 或任意 CSS 长度）；给了即忽略 min/max，触发器固定此宽。 */
	width?: number | string;
	/** 最小宽度（px 或任意 CSS 长度）。 */
	minWidth?: number | string;
	/** 最大宽度（px 或任意 CSS 长度）；超长内容省略号截断。 */
	maxWidth?: number | string;
	size?: "sm" | "md" | "lg";
	/** 下拉内搜索框（核心 Picker 原生）。 */
	searchable?: boolean;
	/** 分组（核心 Picker 原生）；给了 `groups` 就按组渲染，`options` 仅作无分组兜底。 */
	groups?: PickerGroup[];
	/** 触发器（选择框）文字前的图标（核心 Picker 原生 `icon`）；选了什么它都在。 */
	icon?: ReactNode;
}): ReactNode {
	return h(CorePicker, {
		groups: props.groups,
		options: props.options.map((option) => ({
			value: option.value,
			label: option.label,
		})),
		value: props.value,
		onChange: (next: string | string[]) => {
			props.onChange(next as Value);
		},
		size: props.size ?? "md",
		searchable: props.searchable === true,
		ariaLabel: props.ariaLabel,
		mode: "single",
		width: props.width,
		minWidth: props.minWidth,
		maxWidth: props.maxWidth,
		icon: props.icon,
	});
}

/** 搜索框：核心 `Input`（`type=search`）自带左侧图标槽（`icon`），这里只传放大镜图标。 */
export function SearchInput(props: {
	value: string;
	placeholder: string;
	onChange: (next: string) => void;
	ariaLabel: string;
	size?: "sm" | "md" | "lg";
}): ReactNode {
	return h(CoreInput, {
		type: "search",
		value: props.value,
		onChange: props.onChange,
		placeholder: props.placeholder,
		size: props.size ?? "md",
		"aria-label": props.ariaLabel,
		icon: h(IconSearchOutlineRegular, { size: 16 }),
	});
}

/* ── 卡 / chip / 空态 ─────────────────────────────────────────────── */

/** 统计卡：主数字 + 灰色口径小字；点一下联动下方列表筛选。
 *  `value` 为 0 时显示「—」（用户 2026-10-17 定稿：0 会被读成「没数据 / 出错了」）；
 *  `hint` 可以是富文本（如把「停滞」两字标红）；
 *  `interactive: false` = 纯展示卡（统计台：首页没有已结案可筛，不装可点）。 */
export function StatCard(props: {
	label: string;
	value: string | number;
	hint?: ReactNode;
	active?: boolean;
	interactive?: boolean;
	title?: string;
	onClick?: () => void;
}): ReactNode {
	ensureUiBase();
	const interactive =
		props.interactive !== false && props.onClick !== undefined;
	const shown =
		props.value === 0 || props.value === "0" ? "—" : String(props.value);
	return h(
		interactive ? "button" : "div",
		{
			type: interactive ? "button" : undefined,
			className: `dtl-card dtl-stat${interactive ? " dtl-card--clickable" : ""}`,
			"data-active": props.active === true,
			title: props.title,
			onClick: interactive ? props.onClick : undefined,
		},
		h(
			"span",
			{ style: { fontSize: "var(--dtl-font-sm)", color: "var(--dtl-fg-2)" } },
			props.label,
		),
		h("span", { className: "dtl-stat__value" }, shown),
		props.hint === undefined || props.hint === null || props.hint === ""
			? null
			: h("span", { className: "dtl-stat__hint" }, props.hint),
	);
}

/** 本地 7 档语义色 → 核心 `Chip` 5 档。core 缺 doing / backlog / overdue / stale / person 的独立色：
 *  overdue 与 stale 都落到 danger、doing 与 person 落到 business（需 core 补 tone 才能精确）。 */
const CHIP_TONE: Record<
	"neutral" | "open" | "backlog" | "doing" | "overdue" | "stale" | "person",
	"neutral" | "business" | "success" | "warning" | "danger"
> = {
	neutral: "neutral",
	open: "neutral",
	backlog: "warning",
	doing: "success",
	overdue: "danger",
	stale: "danger",
	person: "business",
};

/**
 * 标签：状态 / 工作区 / #标签 都走它，只换 tone（核心 `Chip` 承担）。
 * 传 `maxWidth` ⇒ 核心自动折叠省略号 + hover 跑马灯，本层不再自己算宽度。
 */
export function Tag(props: {
	text: string;
	tone?:
		| "neutral"
		| "open"
		| "backlog"
		| "doing"
		| "overdue"
		| "stale"
		| "person";
	/** 悬停说明（**始终**显示，状态标记的解释走它）。走官方 Tooltip。 */
	tip?: string;
	/** 给了就是可点的标签（核心 Chip 自动渲染成 button + hover 加深），如工作区 / #标签。 */
	onClick?: () => void;
	/** 最大宽：核心在超长时折叠省略号 + hover 跑马灯。 */
	maxWidth?: number | string;
}): ReactNode {
	ensureUiBase();
	const { text, tone = "neutral", tip, onClick, maxWidth } = props;
	const chip = h(CoreChip, { tone: CHIP_TONE[tone], onClick, maxWidth }, text);
	if (tip === undefined) return chip;
	// Chip 是核心裸组件 ⇒ 必须走 Tip 垫真 DOM 锚点，直接套 Tooltip 永不显气泡。
	return h(Tip, { label: tip, children: chip });
}

/** 空态：真空引导卡（虚线）。 */
export function EmptyState(props: {
	title: string;
	hint?: string;
}): ReactNode {
	ensureUiBase();
	return h(
		"div",
		{ className: "dtl-empty-guide" },
		h(
			"div",
			{
				style: {
					fontSize: "var(--dtl-font-lg)",
					fontWeight: 600,
					marginBottom: "var(--dtl-space-1)",
				},
			},
			props.title,
		),
		props.hint === undefined
			? null
			: h(
					"div",
					{
						style: { fontSize: "var(--dtl-font-md)", color: "var(--dtl-fg-2)" },
					},
					props.hint,
				),
	);
}

/** 台账图标（黑白线条，描边走 currentColor ⇒ 随主题 / 选中态反色）。
 *  侧栏条目与右上浮标共用这一份（图标只画一次，别处不许再画第二个）。 */
export function LedgerIcon(props: { size?: number }): ReactNode {
	const size = props.size ?? 18;
	const stroke = {
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 7,
		strokeLinecap: "round",
		strokeLinejoin: "round",
	} as const;
	return h(
		"svg",
		{ width: size, height: size, viewBox: "0 0 128 128", "aria-hidden": true },
		h("path", {
			d: "M96 34 A10 10 0 0 1 106 44 V102 A10 10 0 0 1 96 112 H32 A10 10 0 0 1 22 102 V44 A10 10 0 0 1 32 34 Z",
			...stroke,
		}),
		h("path", { d: "M50 22 V46 M78 22 V46", ...stroke }),
		h("path", { d: "M44 66 H84 M44 86 H70", ...stroke }),
	);
}
