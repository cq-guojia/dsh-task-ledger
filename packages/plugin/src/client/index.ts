/**
 * 浏览器半入口（client bundle，产物 dist/client.js）：装配层，不写业务逻辑。
 *
 * 三处注册各自挂进「服务就位才触发」的 slots 注入（参考插件真机教训：顶层 inject 声明
 * 组合满足不了的依赖会让 entry 一直 pending、卡死整个 dsh 启动）：
 *  · locale 字典（zh / en）——界面语言跟随宿主，插件不自备开关；
 *  · `main` keyed 槽整页（看板首页）；
 *  · `shell.overlay` list 槽浮标入口（点开 = `ctx.layout.selectPanel(<看板 id>)`）。
 *
 * 宿主能力一律**本地结构化声明**，不 import 官方包（rc 接口会无声变）；
 * `t` 席位由宿主渲染器按注册项的 `locale:` 声明合成进组件 props。
 */
import { createElement as h } from 'react'
import { BoardHome } from './board-home'
import { en, fallbackTranslate, interpolateTranslate, zh, type LocaleKey, type Translate } from './locales'
import { LedgerIcon } from './ui'
import { OverlayEntry } from './overlay-entry'

/** 命名空间（settings / locale / 面板 id 同名，便于对应）。 */
/** 模块级 t 席位（侧栏 label 渲染期求值用；绑不上就回落键名，绝不上界面）。 */
let runtimeT: Translate = (key) => key

const NS = 'dsh-task-ledger'
/** `main` 槽的 key（非 `conversation` ⇒ 不绑 Session）。 */
const PANEL_ID = NS
/** `shell.overlay` list 条目的 id（新 id = 并排添加，不替换宿主条目）。 */
const OVERLAY_ID = `${NS}-badge`

/** 浏览器插件上下文：只声明本文件实际用到的服务面。 */
interface ClientContext {
  inject(deps: readonly string[], callback: (ctx: ClientContext) => void): void
  effect(setup: () => void): void
  locale?: {
    register(ns: string, dictionaries: Record<string, Record<string, string>>): void
    /** 绑一份无参 t（侧栏 label 在渲染期求值，拿不到组件 props 的 t 席位）。 */
    bind(ns: string): Translate
  }
  layout?: {
    selectPanel(panelId: string | null): void
  }
  slots: {
    inject(slot: string, factory: () => () => void): () => void
    register(options: Record<string, unknown>, component: unknown): () => void
  }
}

/** 宿主没给 t 席位时的兜底（键名绝不上界面）。 */
const t: Translate = interpolateTranslate((key: LocaleKey, params?: Record<string, string | number>) =>
  fallbackTranslate(key, params))

export function apply(ctx: ClientContext): void {
  // ① 字典注册（宿主语言切换 ⇒ 渲染器换 t 引用 ⇒ 整页重渲染）
  ctx.inject(['locale'], (localeCtx) => {
    ctx.effect(() => localeCtx.locale?.register(NS, { zh, en }))
    // 模块级 t 席位：`sidebar.panellist` 的 label 由侧栏在渲染期求值，拿不到组件 props 的 t
    try { runtimeT = localeCtx.locale?.bind(NS) ?? runtimeT } catch { /* 保持键名兜底 */ }
  })

  // ② 布局服务：浮标点开整页 / 整页返回会话
  let selectPanel: (id: string | null) => void = () => {}
  ctx.inject(['layout'], (sub) => {
    const layout = sub.layout
    if (layout !== undefined) selectPanel = (id) => { layout.selectPanel(id) }
  })

  // ③ 槽位注册（只依赖 slots，自成一块：locale / layout 缺席也不该让入口消失）
  ctx.inject(['slots'], (sub) => {
    // 左侧入口：侧栏面板条目（list 槽）。**行按钮、点击、激活态全由侧栏 / 布局服务托管**，
    // 组件只画图标；id 必须与 main 槽的 key 一致（同一 MainPanelId）。
    // 事实见 external/client-ui-layout.md §一/§二（0.2.0-rc.2 亲验）。
    sub.slots.inject('sidebar.panellist', () =>
      sub.slots.register(
        { name: 'sidebar.panellist', id: PANEL_ID, order: 30, label: () => runtimeT('panelTitle'), locale: NS },
        (props: { size?: number }) => h(LedgerIcon, { size: props.size ?? 18 }),
      ),
    )
    sub.slots.inject('main', () =>
      sub.slots.register(
        { name: 'main', key: PANEL_ID, locale: NS },
        (props: { t?: Translate }) => h(BoardHome, {
          t: props.t ?? t,
          onBack: () => { selectPanel(null) },
        }),
      ),
    )
    sub.slots.inject('shell.overlay', () =>
      sub.slots.register(
        { name: 'shell.overlay', id: OVERLAY_ID, locale: NS },
        (props: { t?: Translate }) => h(OverlayEntry, {
          t: props.t ?? t,
          onOpen: () => { selectPanel(PANEL_ID) },
        }),
      ),
    )
  })
}
