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
import { createElement as h, type ChangeEvent, type CSSProperties, type ReactNode } from 'react'
import { UI_CONTROLS_CSS, UI_TOKENS_CSS } from './tokens'

/** 基础层样式（tokens + 控件皮肤；幂等注入）。 */
const UI_BASE_CSS = `
/* 统计卡：可点、hover 淡蓝、选中蓝描边 */
.dtl-stat{display:flex;flex-direction:column;gap:var(--dtl-space-1);
  padding:var(--dtl-space-3) var(--dtl-space-4);text-align:left;}
.dtl-stat__value{font-size:var(--dtl-font-xl);font-weight:600;line-height:var(--dtl-line-xl);font-variant-numeric:tabular-nums;}
.dtl-stat__hint{font-size:var(--dtl-font-xs);line-height:var(--dtl-line-xs);color:var(--dtl-fg-3);}

/* 列表行：头部可点，hover 淡蓝；展开行走 --dtl-open-bg */
.dtl-row-head{display:flex;align-items:center;gap:var(--dtl-space-2);
  width:100%;padding:var(--dtl-space-2) var(--dtl-space-3);border:0;background:transparent;
  color:inherit;font:inherit;text-align:left;cursor:pointer;
  transition:background-color var(--dtl-dur-fast) var(--dtl-ease);}
.dtl-row-head:hover{background:var(--dtl-card-hover);}
.dtl-row-head:focus-visible{outline:2px solid var(--dtl-business);outline-offset:-2px;}
.dtl-row[data-open="true"]{background:var(--dtl-open-bg);}
.dtl-row-body{padding:var(--dtl-space-2) var(--dtl-space-3) var(--dtl-space-3);
  background:var(--dtl-open-bg-soft);font-size:var(--dtl-font-md);}

/* 空态：真空 = 虚线引导卡；筛选空 = 小字 */
.dtl-empty-guide{padding:var(--dtl-space-4);border:1px dashed var(--dtl-border-strong);border-radius:var(--dtl-radius-md);background:transparent;}
.dtl-empty-filtered{padding:var(--dtl-space-4) 0;color:var(--dtl-fg-3);font-size:var(--dtl-font-md)}

/* 浮标角标：0→n 跳变时一次脉冲，不自动消失 */
.dtl-badge{position:absolute;top:-2px;right:-2px;min-width:16px;height:16px;padding:0 4px;
  border-radius:8px;background:var(--dtl-danger);color:var(--dtl-on-signal);
  font-size:10px;line-height:16px;text-align:center;font-weight:600;}
.dtl-badge[data-pulse="true"]{animation:dtl-pulse 900ms var(--dtl-ease) 1}
@keyframes dtl-pulse{0%{transform:scale(.6);opacity:.4}60%{transform:scale(1.15)}100%{transform:scale(1)}}

/* 过程正文：宽度受限、长行折行 */
.dtl-worklog{max-width:72ch;font-size:var(--dtl-font-md);line-height:1.6}

/* 趋势分组柱状图：细柱（8px）+ 底部基线 + 均值虚线；「精细」靠细柱与参考线 */
.dtl-gchart{position:relative;display:flex;align-items:flex-end;gap:10px;height:104px;
  border-bottom:1px solid var(--dtl-border);}
.dtl-gchart__col{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;
  flex:1 1 0;height:100%;min-width:0;}
.dtl-gchart__pair{display:flex;align-items:flex-end;gap:2px;height:100%;justify-content:center;}
.dtl-gchart__bar{width:8px;min-height:0;border-radius:var(--dtl-radius-xs) var(--dtl-radius-xs) 0 0;}
.dtl-gchart__bar--done{background:var(--dtl-business);}
.dtl-gchart__bar--created{background:var(--dtl-chip-bg);}
.dtl-gchart__col:hover .dtl-gchart__bar--done{background:var(--dtl-accent);}
.dtl-gchart__label{font-size:10px;line-height:14px;color:var(--dtl-fg-3);white-space:nowrap;}
.dtl-gchart__avg{position:absolute;left:0;right:0;border-top:1px dashed var(--dtl-border-strong);pointer-events:none;}
.dtl-gchart__avgtag{position:absolute;right:0;font-size:10px;line-height:12px;color:var(--dtl-fg-3);
  background:var(--dtl-surface-1);padding:0 2px;transform:translateY(-100%);}
.dtl-gchart-legend{display:flex;align-items:center;gap:var(--dtl-space-3);font-size:var(--dtl-font-xs);color:var(--dtl-fg-2);}
.dtl-gchart-legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;}

/* 过程正文：宽度受限、长行折行 */
.dtl-worklog{max-width:72ch;font-size:var(--dtl-font-md);line-height:1.6}

/* 趋势柱状图：div 柱 + token 色，无新依赖 */
.dtl-chart{display:flex;align-items:flex-end;gap:var(--dtl-space-2);height:120px;}
.dtl-chart__col{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:var(--dtl-space-1);flex:1 1 0;height:100%;min-width:0;}
.dtl-chart__bar{width:100%;max-width:28px;min-height:2px;border-radius:var(--dtl-radius-xs) var(--dtl-radius-xs) 0 0;
  background:var(--dtl-business);transition:background-color var(--dtl-dur-fast) var(--dtl-ease);}
.dtl-chart__col:hover .dtl-chart__bar{background:var(--dtl-accent);}
.dtl-chart__val{font-size:var(--dtl-font-xs);line-height:var(--dtl-line-xs);color:var(--dtl-fg-2);font-variant-numeric:tabular-nums;}
.dtl-chart__label{font-size:10px;line-height:var(--dtl-line-xs);color:var(--dtl-fg-3);white-space:nowrap;}
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

/* ── 趋势分组柱状图 ───────────────────────────────────────────────────── */

/** 一周两根柱（完成 / 新增）。 */
export interface GroupedBarWeek {
  /** 轴标签（MM-DD）。 */
  readonly label: string
  readonly done: number
  readonly created: number
  /** 悬停文案。 */
  readonly title: string
}

/** 分组柱状图（div 柱，无新依赖）：完成 / 新增各一细柱，底部基线 + 完成数平均值虚线。
 *  「精细」= 细柱 + 基线 + 均值线，不是粗柱堆高度（用户 2026-10-17）。 */
export function GroupedBarChart(props: {
  weeks: readonly GroupedBarWeek[]
  ariaLabel: string
  avgLabel: string
}): ReactNode {
  ensureUiBase()
  const plotHeight = 104
  const max = props.weeks.reduce((peak, week) => Math.max(peak, week.done, week.created), 0)
  const doneTotal = props.weeks.reduce((sum, week) => sum + week.done, 0)
  const avg = props.weeks.length === 0 ? 0 : doneTotal / props.weeks.length
  const barHeight = (value: number): number => (max === 0 ? 0 : Math.round((value / max) * plotHeight))
  return h('div', { style: { position: 'relative', paddingBottom: '18px' } },
    h('div', { className: 'dtl-gchart', role: 'img', 'aria-label': props.ariaLabel },
      avg > 0
        ? h('div', { className: 'dtl-gchart__avg', style: { bottom: `${barHeight(avg)}px` } },
          h('span', { className: 'dtl-gchart__avgtag' }, props.avgLabel))
        : null,
      props.weeks.map(week => h('div', { key: week.label, className: 'dtl-gchart__col', title: week.title },
        h('div', { className: 'dtl-gchart__pair' },
          h('span', { className: 'dtl-gchart__bar dtl-gchart__bar--done', style: { height: `${barHeight(week.done)}px` } }),
          h('span', { className: 'dtl-gchart__bar dtl-gchart__bar--created', style: { height: `${barHeight(week.created)}px` } }),
        ),
        h('span', { className: 'dtl-gchart__label' }, week.label),
      )),
    ),
  )
}

/** 图例（完成 / 新增 两个色块）。 */
export function ChartLegend(props: { doneLabel: string; createdLabel: string }): ReactNode {
  ensureUiBase()
  return h('div', { className: 'dtl-gchart-legend' },
    h('span', null, h('i', { style: { background: 'var(--dtl-business)' } }), props.doneLabel),
    h('span', null, h('i', { style: { background: 'var(--dtl-chip-bg)' } }), props.createdLabel),
  )
}
