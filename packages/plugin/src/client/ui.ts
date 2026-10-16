/**
 * UI 基础层：样式单源 + 共用元件。
 *
 * 两条纪律（用户 2026-10-17 要求「该抽象的必须抽象」）：
 *  1. **样式**：所有颜色 / 圆角 / 字号一律 `var(--dtl-*)`（定义只在 tokens.ts），
 *     任何文件不许再写第二份 `var(--dsw-*)`、也不许自造 `--dtl-*`；
 *     需要 hover / focus / 动画的（内联样式表达不了）才有资格进这里的 `UI_BASE_CSS`。
 *  2. **元件**：卡 / chip / 下拉 / 空态 / 搜索框各只有一份实现，页面与浮标共用。
 */
import { createElement as h, type ChangeEvent, type ReactNode } from 'react'
import { UI_TOKENS_CSS } from './tokens'

/** 基础层样式（幂等注入；只装 hover / focus / 动画这些内联样式写不了的部分）。 */
const UI_BASE_CSS = `
/* 统计卡：可点、hover 抬底、选中走蓝描边 + 浅蓝底 */
.dtl-card{
  display:flex;flex-direction:column;gap:var(--dtl-space-1);
  padding:var(--dtl-space-3) var(--dtl-space-4);
  border:1px solid var(--dtl-border);border-radius:var(--dtl-radius-md);
  background:var(--dtl-surface-1);color:var(--dtl-fg);
  cursor:pointer;text-align:left;font:inherit;
  transition:background var(--dtl-dur) var(--dtl-ease),border-color var(--dtl-dur) var(--dtl-ease);
}
.dtl-card:hover{background:var(--dtl-hover)}
.dtl-card[aria-pressed="true"]{border-color:var(--dtl-business);background:var(--dtl-business-soft)}
.dtl-card:focus-visible{outline:2px solid var(--dtl-business);outline-offset:2px}

/* 列表行：头部可点，hover 抬底；展开行走 --dtl-open-bg */
.dtl-row{border:1px solid var(--dtl-border);border-radius:var(--dtl-radius-md);overflow:hidden}
.dtl-row + .dtl-row{margin-top:var(--dtl-space-2)}
.dtl-row-head{
  display:flex;align-items:center;gap:var(--dtl-space-2);
  width:100%;padding:var(--dtl-space-3);border:0;background:transparent;
  color:inherit;font:inherit;text-align:left;cursor:pointer;
  transition:background var(--dtl-dur) var(--dtl-ease);
}
.dtl-row-head:hover{background:var(--dtl-hover)}
.dtl-row-head:focus-visible{outline:2px solid var(--dtl-business);outline-offset:-2px}
.dtl-row[data-open="true"]{background:var(--dtl-open-bg)}
.dtl-row-body{padding:0 var(--dtl-space-3) var(--dtl-space-3);border-top:1px solid var(--dtl-border)}

/* chip（分类 / 标签）：小底板走 --dtl-chip-bg，hover 加深 */
.dtl-chip{
  display:inline-flex;align-items:center;gap:var(--dtl-space-1);
  padding:0 var(--dtl-space-2);height:20px;border-radius:var(--dtl-radius-sm);
  background:var(--dtl-chip-bg);color:var(--dtl-fg-2);
  font-size:var(--dtl-font-xs);white-space:nowrap;max-width:20ch;overflow:hidden;text-overflow:ellipsis;
}

/* 原生下拉 / 输入框：宿主没有廉价的选择器，用原生控件 + token 配色（不用自绘菜单） */
.dtl-select,.dtl-input{
  height:var(--dtl-control-h-md);box-sizing:border-box;
  padding:0 var(--dtl-space-2);border:1px solid var(--dtl-border);border-radius:var(--dtl-radius-sm);
  background:var(--dtl-surface-1);color:var(--dtl-fg);
  font-family:inherit;font-size:var(--dtl-font-md);
}
.dtl-input{padding-left:var(--dtl-space-3);min-width:220px}
.dtl-select:focus-visible,.dtl-input:focus-visible{outline:2px solid var(--dtl-business);outline-offset:1px}

/* 空态：真空 = 虚线引导卡；筛选空 = 小字 */
.dtl-empty-guide{
  padding:var(--dtl-space-4);border:1px dashed var(--dtl-border-strong);border-radius:var(--dtl-radius-md);
  background:transparent;
}
.dtl-empty-filtered{padding:var(--dtl-space-4) 0;color:var(--dtl-fg-3);font-size:var(--dtl-font-md)}

/* 浮标角标：0→n 跳变时一次脉冲，不自动消失 */
.dtl-badge{
  position:absolute;top:-2px;right:-2px;min-width:16px;height:16px;padding:0 4px;
  border-radius:8px;background:var(--dtl-danger);color:var(--dtl-on-signal);
  font-size:10px;line-height:16px;text-align:center;font-weight:600;
}
.dtl-badge[data-pulse="true"]{animation:dtl-pulse 900ms var(--dtl-ease) 1}
@keyframes dtl-pulse{0%{transform:scale(.6);opacity:.4}60%{transform:scale(1.15)}100%{transform:scale(1)}}

/* 过程正文：宽度受限、长行折行 */
.dtl-worklog{max-width:72ch;font-size:var(--dtl-font-md);line-height:1.6}
`
const STYLE_ID = 'dtl-ui-base'

/** 幂等注入 token 层 + 基础层（面板与浮标谁先挂载都只注入一次）。 */
export function ensureUiBase(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `${UI_TOKENS_CSS}\n${UI_BASE_CSS}`
  document.head.appendChild(style)
}

/** 统计卡：点一下联动下方列表筛选（aria-pressed = 选中态）。 */
export function StatCard(props: {
  label: string
  value: string
  active: boolean
  title?: string
  onClick: () => void
}): ReactNode {
  return h('button', {
    type: 'button',
    className: 'dtl-card',
    'aria-pressed': props.active,
    title: props.title,
    onClick: props.onClick,
  },
    h('span', { style: { fontSize: 'var(--dtl-font-sm)', color: 'var(--dtl-fg-2)' } }, props.label),
    h('span', { style: { fontSize: '24px', fontWeight: 600, lineHeight: 1.2 } }, props.value),
  )
}

/** chip（分类 / 标签 / 工作区名）。 */
export function Chip(props: { text: string; tone?: 'plain' | 'signal'; color?: string }): ReactNode {
  const style: Record<string, string> = {}
  if (props.tone === 'signal' && props.color !== undefined) {
    style.background = props.color
    style.color = 'var(--dtl-on-signal)'
  }
  return h('span', { className: 'dtl-chip', style, title: props.text }, props.text)
}

/** 原生下拉（时间 / 标签筛选共用一份）。 */
export function Select<Value extends string>(props: {
  value: Value
  options: readonly { value: Value; label: string }[]
  onChange: (next: Value) => void
  ariaLabel: string
}): ReactNode {
  return h('select', {
    className: 'dtl-select',
    'aria-label': props.ariaLabel,
    value: props.value,
    onChange: (event: ChangeEvent<HTMLSelectElement>) => { props.onChange(event.target.value as Value) },
  }, props.options.map(option => h('option', { key: option.value, value: option.value }, option.label)))
}

/** 搜索框（关键字过滤）。 */
export function SearchInput(props: {
  value: string
  placeholder: string
  onChange: (next: string) => void
  ariaLabel: string
}): ReactNode {
  return h('input', {
    className: 'dtl-input',
    type: 'search',
    'aria-label': props.ariaLabel,
    placeholder: props.placeholder,
    value: props.value,
    spellCheck: false,
    onChange: (event: ChangeEvent<HTMLInputElement>) => { props.onChange(event.target.value) },
  })
}

/** 空态：`guide` = 真空引导卡（虚线），`filtered` = 筛选空小字。 */
export function EmptyState(props: { tone: 'guide' | 'filtered'; title: string; hint?: string }): ReactNode {
  if (props.tone === 'filtered') {
    return h('div', { className: 'dtl-empty-filtered' }, props.title)
  }
  return h('div', { className: 'dtl-empty-guide' },
    h('div', { style: { fontSize: 'var(--dtl-font-lg)', fontWeight: 600, marginBottom: 'var(--dtl-space-1)' } }, props.title),
    props.hint === undefined ? null : h('div', { style: { fontSize: 'var(--dtl-font-md)', color: 'var(--dtl-fg-2)' } }, props.hint),
  )
}
