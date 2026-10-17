/**
 * UI 基础层：样式单源 + 共用元件（**一类控件只有一份实现**）。
 *
 * 纪律（用户 2026-10-17「样式与方法一律抽象，不要反复重写」；形态抄本机
 * `dsh-task-dispatch-table` 的 `ui/tokens.ts` + `ui/controls-css.ts` + `ui/*.tsx`）：
 *  1. **样式**：颜色 / 圆角 / 字号 / 高度一律 `var(--dtl-*)`（定义只在 tokens.ts），
 *     业务文件不许再写第二份 `var(--dsw-*)`、不许自造 `--dtl-*`、不许自造高度档；
 *  2. **元件**：分段 / 按钮 / 图标钮 / 输入 / 下拉 / 卡 / chip / 空态 / 图表各一份，
 *     页面与浮标共用。官方 primitives 只留「官方做得更好」的（StateDot / MarkdownText / 图标）。
 */
import { createElement as h, useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react'
import { UI_CONTROLS_CSS, UI_TOKENS_CSS } from './tokens'

/** 基础层样式（tokens + 控件皮肤；幂等注入）。 */
const UI_BASE_CSS = `
/* 统计卡：可点、hover 淡蓝、选中蓝描边 */
.dtl-stat{display:flex;flex-direction:column;gap:var(--dtl-space-1);
  padding:var(--dtl-space-3) var(--dtl-space-4);text-align:left;}
.dtl-stat__value{font-size:var(--dtl-font-stat);font-weight:600;line-height:1.15;font-variant-numeric:tabular-nums;}
.dtl-stat__hint{font-size:var(--dtl-font-xs);line-height:var(--dtl-line-xs);color:var(--dtl-fg-3);}

/* 列表行：分组标题头仍走 .dtl-row-head（可点折叠）；任务行走 .dtl-taskrow（两行式，不可点） */
.dtl-row-head{display:flex;align-items:center;gap:var(--dtl-space-2);
  width:100%;padding:var(--dtl-space-2) var(--dtl-space-3);border:0;background:transparent;
  color:inherit;font:inherit;text-align:left;cursor:pointer;
  transition:background-color var(--dtl-dur-fast) var(--dtl-ease);}
.dtl-row-head:hover{background:var(--dtl-card-hover);}
.dtl-row-head:focus-visible{outline:2px solid var(--dtl-business);outline-offset:-2px;}

/* 任务行（两行式，视觉对齐参考图）：左色条标状态 + hover 提亮；右侧 时间⇄按钮排 互换 */
.dtl-taskrow{padding:var(--dtl-space-2) var(--dtl-space-3);border-radius:var(--dtl-radius-md);
  border-left:3px solid var(--dtl-border);transition:background-color var(--dtl-dur-fast) var(--dtl-ease);}
.dtl-taskrow[data-tone="doing"]{border-left-color:var(--dtl-business);}
.dtl-taskrow[data-tone="blocked"]{border-left-color:var(--dtl-warning);}
.dtl-taskrow[data-tone="stale"]{border-left-color:var(--dtl-danger);}
.dtl-taskrow[data-tone="open"]{border-left-color:var(--dtl-border-strong);}
.dtl-taskrow[data-tone="closed"]{border-left-color:var(--dtl-border);}
.dtl-taskrow:hover{background:var(--dtl-card-hover);}
.dtl-taskrow__l1{display:flex;align-items:center;gap:var(--dtl-space-2);min-width:0;}
.dtl-taskrow__title{font-size:var(--dtl-font-md);font-weight:600;min-width:0;flex:0 1 auto;}
.dtl-taskrow__stamp{flex:none;font-size:10px;color:var(--dtl-fg-3);white-space:nowrap;
  font-variant-numeric:tabular-nums;}
.dtl-taskrow__age{flex:none;padding:1px 8px;border-radius:999px;background:var(--dtl-business-soft);
  color:var(--dtl-business);font-size:10px;line-height:16px;font-weight:600;white-space:nowrap;
  font-variant-numeric:tabular-nums;}
.dtl-taskrow__actions{display:none;flex:none;gap:4px;}
.dtl-taskrow:hover .dtl-taskrow__age{display:none;}
.dtl-taskrow:hover .dtl-taskrow__actions{display:inline-flex;}
.dtl-taskrow__l2{display:flex;align-items:center;gap:var(--dtl-space-2);margin-top:2px;
  font-size:var(--dtl-font-xs);color:var(--dtl-fg-3);min-width:0;}

/* 异常 pill：阻塞=黄 / 停滞=红（进行中无标记，只有色条） */
.dtl-pill{flex:none;padding:1px 8px;border-radius:999px;font-size:10px;line-height:16px;font-weight:600;white-space:nowrap;}
.dtl-pill--blocked{background:var(--dtl-warning);color:var(--dtl-on-signal);}
.dtl-pill--stale{background:var(--dtl-danger);color:var(--dtl-on-signal);}

/* 标签迷你 chip（用户 2026-10-17：标签再小点儿）——10px、无边框、灰底 */
.dtl-minitag{flex:none;padding:0 5px;border-radius:999px;background:var(--dtl-surface-2);
  color:var(--dtl-fg-3);font-size:10px;line-height:16px;white-space:nowrap;max-width:120px;
  overflow:hidden;text-overflow:ellipsis;}

/* 行内迷你按钮（样子先行，点击行为归「任务按钮与会话交接」任务） */
.dtl-minibtn{padding:1px 8px;border:1px solid var(--dtl-border);border-radius:var(--dtl-radius-sm);
  background:var(--dtl-surface-1);color:var(--dtl-fg-2);font:inherit;font-size:var(--dtl-font-xs);
  line-height:16px;white-space:nowrap;cursor:default;}
.dtl-minibtn:hover{border-color:var(--dtl-border-strong);color:var(--dtl-fg);}

/* 空态：真空 = 虚线引导卡；筛选空 = 小字 */
.dtl-empty-guide{padding:var(--dtl-space-4);border:1px dashed var(--dtl-border-strong);border-radius:var(--dtl-radius-md);background:transparent;}
.dtl-empty-filtered{padding:var(--dtl-space-4) 0;color:var(--dtl-fg-3);font-size:var(--dtl-font-md)}

/* 浮标角标：0→n 跳变时一次脉冲，不自动消失 */
.dtl-badge{position:absolute;top:-2px;right:-2px;min-width:16px;height:16px;padding:0 4px;
  border-radius:8px;background:var(--dtl-danger);color:var(--dtl-on-signal);
  font-size:10px;line-height:16px;text-align:center;font-weight:600;}
.dtl-badge[data-pulse="true"]{animation:dtl-pulse 900ms var(--dtl-ease) 1}
@keyframes dtl-pulse{0%{transform:scale(.6);opacity:.4}60%{transform:scale(1.15)}100%{transform:scale(1)}}

/* 统计区整体：左 8 块（2 行 × 4 列）+ 右趋势图，参考图同款分栏。
   ⚠️ 列数写死 4 → 2，绝不给 3：3 列会排出 3+1 的非对称（用户 2026-10-17）。
   两栏**完全等高**：cards 两行 minmax(0,1fr) 均分 + 卡 height:100% ⇒ 图表卡与左边一样高。 */
/* 左 8 块略收窄、右图表略放宽（用户 2026-10-17：左再短一丢丢、右长一丢丢） */
.dtl-stats{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:var(--dtl-space-3);align-items:stretch;}
.dtl-stats__cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));
  gap:var(--dtl-space-3);}
.dtl-stats__cards > .dtl-stat{height:100%;box-sizing:border-box;}
@media (max-width:960px){.dtl-stats{grid-template-columns:minmax(0,1fr);}}
@media (max-width:640px){.dtl-stats__cards{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr));}}

/* 「只看我的」小复选框（替掉右上角的分段切换） */
.dtl-check{display:inline-flex;align-items:center;gap:5px;height:20px;margin-top:-2px;
  font-size:var(--dtl-font-xs);color:var(--dtl-fg-3);cursor:pointer;user-select:none;white-space:nowrap;}
.dtl-check input{width:12px;height:12px;margin:0;accent-color:var(--dtl-business);cursor:pointer;}
.dtl-check:hover{color:var(--dtl-fg-2);}

/* 趋势分组柱状图：绘图区高度**随卡拉伸**（flex），柱 / 刻度 / 网格全用百分比 ⇒ 与卡等高 */
.dtl-gchart-wrap{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;padding-left:30px;padding-bottom:18px;}
.dtl-gchart{position:relative;flex:1 1 auto;min-height:96px;border-bottom:1px solid var(--dtl-border);}
.dtl-gchart__grid{position:absolute;left:0;right:0;border-top:1px solid var(--dtl-border-faint);pointer-events:none;}
.dtl-gchart__ytick{position:absolute;left:-30px;width:26px;text-align:right;font-size:10px;line-height:12px;
  color:var(--dtl-fg-3);transform:translateY(50%);font-variant-numeric:tabular-nums;}
.dtl-gchart__col{position:absolute;top:0;bottom:0;min-width:0;}
/* ⚠️ pair 必须 top/bottom 双锚（或 height:100%）：绝对定位 + 只给 bottom 时高度是 auto，
   子元素的 height:% 没有可解析的包含块 ⇒ 整根柱子塌成 0（2026-10-17 真机教训：
   改百分比柱高后「一个柱子都看不见，只剩数字」）。 */
.dtl-gchart__pair{position:absolute;top:0;bottom:0;left:50%;transform:translateX(-50%);
  display:flex;align-items:flex-end;gap:1px;}
/* 三柱：完成(蓝) / 没完成(琥珀) / 新增(灰)，每根 5px、无圆角（用户 2026-10-17：太粗、不要圆弧） */
.dtl-gchart__bar{width:5px;min-height:0;}
.dtl-gchart__bar--done{background:var(--dtl-business);}
.dtl-gchart__bar--remaining{background:var(--dtl-chart-remaining);}
.dtl-gchart__bar--created{background:var(--dtl-chart-created);}
/* hover：整列三根柱一起提亮（用户 2026-10-17：移上去应该两个都变色，不是只蓝的一根） */
.dtl-gchart__col:hover .dtl-gchart__bar{filter:brightness(1.18);}
.dtl-gchart__val{position:absolute;left:50%;transform:translateX(-50%);font-size:10px;line-height:12px;
  color:var(--dtl-fg-2);font-variant-numeric:tabular-nums;white-space:nowrap;}
.dtl-gchart__label{position:absolute;left:0;right:0;bottom:-16px;text-align:center;
  font-size:10px;line-height:14px;color:var(--dtl-fg-3);white-space:nowrap;}
/* hover 浮卡（参考图同款：日期 + 两个数；原生 title 太慢、长相不一） */
.dtl-gchart__tip{position:absolute;top:0;z-index:2;min-width:104px;box-sizing:border-box;
  padding:6px 8px;border:1px solid var(--dtl-border);border-radius:var(--dtl-radius-sm);
  background:var(--dtl-surface-1);box-shadow:var(--dtl-shadow-2);
  font-size:var(--dtl-font-xs);line-height:var(--dtl-line-sm);color:var(--dtl-fg-2);pointer-events:none;}
.dtl-gchart__tip b{display:block;color:var(--dtl-fg);font-weight:600;}
.dtl-gchart__tip i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;}
.dtl-gchart-legend{display:flex;align-items:center;gap:var(--dtl-space-3);font-size:var(--dtl-font-xs);color:var(--dtl-fg-2);}
.dtl-gchart-legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;}

/* 过程正文：宽度受限、长行折行 */
.dtl-worklog{max-width:72ch;font-size:var(--dtl-font-md);line-height:1.6}
`

const STYLE_ID = 'dtl-ui-base'

/** 幂等注入 token 层 + 控件皮肤 + 基础层（面板与浮标谁先挂载都只注入一次）。 */
export function ensureUiBase(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `${UI_TOKENS_CSS}\n${UI_CONTROLS_CSS}\n${UI_BASE_CSS}`
  document.head.appendChild(style)
}

/* ── 分段控件 ─────────────────────────────────────────────────────── */

/** 一段（一个可选值）。 */
export interface SegmentedItem<Value extends string = string> {
  readonly value: Value
  readonly label: string
  /** 段内角标数字；`undefined` 或 ≤0 不显示。 */
  readonly badge?: number
}

/** 分段控件（单选）：同一份结构 + size 轴；外观差异只由 variant 的两个颜色变量表达。 */
export function Segmented<Value extends string>(props: {
  items: readonly SegmentedItem<Value>[]
  value: Value
  onChange: (next: Value) => void
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'inset'
  label: string
  id?: string
  style?: CSSProperties
}): ReactNode {
  ensureUiBase()
  const size = props.size ?? 'md'
  const variant = props.variant ?? 'default'
  return h('div', {
    role: 'group',
    'aria-label': props.label,
    id: props.id,
    className: `dtl-seg dtl-seg--${variant} dtl-seg--${size}`,
    style: props.style,
  }, props.items.map(item => h('button', {
    key: item.value,
    type: 'button',
    className: 'dtl-seg__item',
    'aria-pressed': item.value === props.value,
    onClick: () => { props.onChange(item.value) },
  }, item.label, item.badge !== undefined && item.badge > 0
    ? h('span', { className: 'dtl-seg__badge' }, String(item.badge))
    : null)))
}

/* ── 按钮 / 图标钮 ────────────────────────────────────────────────── */

export function Button(props: {
  children?: ReactNode
  onClick: () => void
  variant?: 'primary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
  disabled?: boolean
  title?: string
}): ReactNode {
  ensureUiBase()
  return h('button', {
    type: 'button',
    className: `dtl-btn dtl-btn--${props.variant ?? 'outline'} dtl-btn--${props.size ?? 'md'}`,
    disabled: props.disabled === true,
    title: props.title,
    onClick: props.onClick,
  }, props.icon, props.children)
}

export function IconButton(props: {
  icon: ReactNode
  label: string
  onClick: () => void
  variant?: 'plain' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  title?: string
}): ReactNode {
  ensureUiBase()
  return h('button', {
    type: 'button',
    className: `dtl-iconbtn dtl-iconbtn--${props.variant ?? 'plain'} dtl-iconbtn--${props.size ?? 'md'}`,
    'aria-label': props.label,
    disabled: props.disabled === true,
    title: props.title ?? props.label,
    onClick: props.onClick,
  }, props.icon)
}

/* ── 输入 / 下拉 / 搜索 ───────────────────────────────────────────── */

/** 原生下拉（工作区 / 状态共用一份；宿主没有廉价下拉件 ⇒ 原生 + token 皮肤）。 */
export function Select<Value extends string>(props: {
  value: Value
  options: readonly { value: Value; label: string }[]
  onChange: (next: Value) => void
  ariaLabel: string
  /** 定宽（px）；不给就按内容。 */
  width?: number
  size?: 'sm' | 'md' | 'lg'
}): ReactNode {
  ensureUiBase()
  const size = props.size ?? 'md'
  return h('select', {
    className: `dtl-select dtl-select--${size}`,
    'aria-label': props.ariaLabel,
    style: props.width === undefined ? undefined : { width: `${props.width}px` },
    value: props.value,
    onChange: (event: ChangeEvent<HTMLSelectElement>) => { props.onChange(event.target.value as Value) },
  }, props.options.map(option => h('option', { key: option.value, value: option.value }, option.label)))
}

/** 搜索框（关键字过滤；占满剩余宽度由调用方的 flex 决定）。 */
export function SearchInput(props: {
  value: string
  placeholder: string
  onChange: (next: string) => void
  ariaLabel: string
  size?: 'sm' | 'md' | 'lg'
}): ReactNode {
  ensureUiBase()
  const size = props.size ?? 'md'
  return h('input', {
    className: `dtl-input dtl-input--${size}`,
    type: 'search',
    'aria-label': props.ariaLabel,
    placeholder: props.placeholder,
    value: props.value,
    spellCheck: false,
    onChange: (event: ChangeEvent<HTMLInputElement>) => { props.onChange(event.target.value) },
  })
}

/* ── 卡 / chip / 空态 ─────────────────────────────────────────────── */

/** 统计卡：主数字 + 灰色口径小字；点一下联动下方列表筛选。
 *  `value` 为 0 时显示「—」（用户 2026-10-17 定稿：0 会被读成「没数据 / 出错了」）；
 *  `hint` 可以是富文本（如把「停滞」两字标红）；
 *  `interactive: false` = 纯展示卡（统计台：首页没有已结案可筛，不装可点）。 */
export function StatCard(props: {
  label: string
  value: string | number
  hint?: ReactNode
  active?: boolean
  interactive?: boolean
  title?: string
  onClick?: () => void
}): ReactNode {
  ensureUiBase()
  const interactive = props.interactive !== false && props.onClick !== undefined
  const shown = props.value === 0 || props.value === '0' ? '—' : String(props.value)
  return h(interactive ? 'button' : 'div', {
    type: interactive ? 'button' : undefined,
    className: `dtl-card dtl-stat${interactive ? ' dtl-card--clickable' : ''}`,
    'data-active': props.active === true,
    title: props.title,
    onClick: interactive ? props.onClick : undefined,
  },
  h('span', { style: { fontSize: 'var(--dtl-font-sm)', color: 'var(--dtl-fg-2)' } }, props.label),
  h('span', { className: 'dtl-stat__value' }, shown),
  props.hint === undefined || props.hint === null || props.hint === ''
    ? null
    : h('span', { className: 'dtl-stat__hint' }, props.hint),
  )
}

/** chip（分类 / 标签 / 工作区名）。 */
export function Chip(props: { text: string; color?: string }): ReactNode {
  ensureUiBase()
  return h('span', {
    className: 'dtl-chip',
    style: props.color === undefined ? undefined : { background: props.color, color: 'var(--dtl-on-signal)' },
    title: props.text,
  }, props.text)
}

/** 空态：`guide` = 真空引导卡（虚线），`filtered` = 筛选空小字。 */
export function EmptyState(props: { tone: 'guide' | 'filtered'; title: string; hint?: string }): ReactNode {
  ensureUiBase()
  if (props.tone === 'filtered') return h('div', { className: 'dtl-empty-filtered' }, props.title)
  return h('div', { className: 'dtl-empty-guide' },
    h('div', { style: { fontSize: 'var(--dtl-font-lg)', fontWeight: 600, marginBottom: 'var(--dtl-space-1)' } }, props.title),
    props.hint === undefined ? null : h('div', { style: { fontSize: 'var(--dtl-font-md)', color: 'var(--dtl-fg-2)' } }, props.hint),
  )
}

/** 台账图标（黑白线条，描边走 currentColor ⇒ 随主题 / 选中态反色）。
 *  侧栏条目与右上浮标共用这一份（图标只画一次，别处不许再画第二个）。 */
export function LedgerIcon(props: { size?: number }): ReactNode {
  const size = props.size ?? 18
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  return h('svg', { width: size, height: size, viewBox: '0 0 128 128', 'aria-hidden': true },
    h('path', { d: 'M96 34 A10 10 0 0 1 106 44 V102 A10 10 0 0 1 96 112 H32 A10 10 0 0 1 22 102 V44 A10 10 0 0 1 32 34 Z', ...stroke }),
    h('path', { d: 'M50 22 V46 M78 22 V46', ...stroke }),
    h('path', { d: 'M44 66 H84 M44 86 H70', ...stroke }),
  )
}

/* ── 趋势分组柱状图 ───────────────────────────────────────────────────── */

/** 一周三根柱（完成 / 没完成 / 新增）。 */
export interface GroupedBarWeek {
  /** 轴标签（MM-DD）。 */
  readonly label: string
  readonly done: number
  readonly remaining: number
  readonly created: number
  /** 悬停文案。 */
  readonly title: string
}

/** 千位压缩（1.2k / 12k）：y 轴刻度与柱顶数值用，避免 4 位数把刻度挤宽。 */
function compactCount(value: number): string {
  if (value >= 10_000) return `${Math.round(value / 1000)}k`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}

/** 分组柱状图（div 柱，无新依赖）：完成（蓝）/ 没完成（琥珀）/ 新增（灰）各一细柱。
 *  - 高度全用百分比 ⇒ 绘图区随卡片拉伸，图表卡与左边 8 块**完全等高**；
 *  - y 轴三档刻度 + 淡网格线；柱顶只标「完成」（3 系列 × 8 周数值会糊成一片）；
 *  - hover 整列提亮 + 浮卡（日期 + 三个数）——原生 title 太慢；
 *  - **没有**均值线与长注释（用户 2026-10-17：均值不要、注释太长不要）。 */
export function GroupedBarChart(props: {
  weeks: readonly GroupedBarWeek[]
  ariaLabel: string
  doneLabel: string
  remainingLabel: string
  createdLabel: string
}): ReactNode {
  ensureUiBase()
  const [hover, setHover] = useState<number | null>(null)
  const top = Math.max(1, props.weeks.reduce((peak, week) => Math.max(peak, week.done, week.remaining, week.created), 0))
  const ticks = [0, top / 2, top]
  const pct = (value: number): string => `${(value / top) * 100}%`
  const columnStyle = (index: number): Record<string, string | number> => ({
    left: `${(index / props.weeks.length) * 100}%`,
    right: `${((props.weeks.length - index - 1) / props.weeks.length) * 100}%`,
  })
  // 浮卡定位：贴边两列向内收，其余居中（否则溢出图表卡）
  const tipStyle = (index: number): Record<string, string | number> => {
    if (index <= 1) return { left: 0 }
    if (index >= props.weeks.length - 2) return { right: 0 }
    return { left: `${((index + 0.5) / props.weeks.length) * 100}%`, transform: 'translateX(-50%)' }
  }
  return h('div', { className: 'dtl-gchart-wrap' },
    h('div', {
      className: 'dtl-gchart',
      role: 'img',
      'aria-label': props.ariaLabel,
      onMouseLeave: () => { setHover(null) },
    },
      ticks.map((tick) => h('div', { key: `grid-${String(tick)}`, className: 'dtl-gchart__grid', style: { bottom: pct(tick) } })),
      ticks.map((tick) => h('span', { key: `tick-${String(tick)}`, className: 'dtl-gchart__ytick', style: { bottom: pct(tick) } }, compactCount(Math.round(tick)))),
      props.weeks.map((week, index) => h('div', {
        key: week.label,
        className: 'dtl-gchart__col',
        style: columnStyle(index),
        onMouseEnter: () => { setHover(index) },
      },
        h('div', { className: 'dtl-gchart__pair' },
          h('span', { className: 'dtl-gchart__bar dtl-gchart__bar--done', style: { height: pct(week.done), minHeight: week.done > 0 ? '2px' : undefined } }),
          h('span', { className: 'dtl-gchart__bar dtl-gchart__bar--remaining', style: { height: pct(week.remaining), minHeight: week.remaining > 0 ? '2px' : undefined } }),
          h('span', { className: 'dtl-gchart__bar dtl-gchart__bar--created', style: { height: pct(week.created), minHeight: week.created > 0 ? '2px' : undefined } }),
        ),
        week.done === 0
          ? null
          : h('span', { className: 'dtl-gchart__val', style: { bottom: `calc(${pct(week.done)} + 3px)` } }, String(week.done)),
        h('span', { className: 'dtl-gchart__label' }, week.label),
      )),
      hover === null
        ? null
        : h('div', { className: 'dtl-gchart__tip', style: tipStyle(hover) },
          h('b', null, props.weeks[hover].title),
          h('div', null, h('i', { style: { background: 'var(--dtl-business)' } }), `${props.doneLabel} ${props.weeks[hover].done}`),
          h('div', null, h('i', { style: { background: 'var(--dtl-chart-remaining)' } }), `${props.remainingLabel} ${props.weeks[hover].remaining}`),
          h('div', null, h('i', { style: { background: 'var(--dtl-chart-created)' } }), `${props.createdLabel} ${props.weeks[hover].created}`),
        ),
    ),
  )
}

/** 图例（完成 / 没完成 / 新增 三个色块）。 */
export function ChartLegend(props: { doneLabel: string; remainingLabel: string; createdLabel: string }): ReactNode {
  ensureUiBase()
  return h('div', { className: 'dtl-gchart-legend' },
    h('span', null, h('i', { style: { background: 'var(--dtl-business)' } }), props.doneLabel),
    h('span', null, h('i', { style: { background: 'var(--dtl-chart-remaining)' } }), props.remainingLabel),
    h('span', null, h('i', { style: { background: 'var(--dtl-chart-created)' } }), props.createdLabel),
  )
}
