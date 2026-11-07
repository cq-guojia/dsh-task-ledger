# 宿主 client UI：入口槽位、元件与设计变量

| 项 | 值 |
|---|---|
| 用途 | 决定插件入口挂哪个槽位、能用哪些宿主元件与设计变量 |
| 适用版本 | `@deepseek-ai/dsh-client-ui-layout` / `-sidebar` / `-primitives` / `-theme` 均取 `0.2.0-rc.2`（npm `next` 线；`latest` tag 指向旧版，勿用） |
| 版本真源 | 上述包 `@0.2.0-rc.2` 解包产物 `lib/types/client/*.d.ts`、`lib/client.js`；同栈仓 `dsh-task-dispatch-table` 的 primitives / theme 核实记录 |
| 复核日期 | 2026-10-16 |

## 一、结论：全槽位清单

| 槽位 | 类型 / 作用域 | 第三方可否注册 | 用途 |
|---|---|---|---|
| `sidebar.panellist` | list / root | 可 | 侧栏全局面板条目（只画图标；行按钮、点击、激活态归侧栏） |
| `main` | keyed / root | 可 | 整页面板；保留键 `conversation`，其他键**不绑 Session** |
| `shell.overlay` | list / root | 可 | 全帧浮层：徽标 / toast / 状态 pill 的正式席位；条目并排添加不替换 |
| `sidebar.footer.action` | list / root | 可 | 侧栏脚注行（「设置」旁） |
| `sidebar` | single / root | 被 ui-sidebar 的 SidebarRoot 占用 | 注册即整体替换导航列 |
| `rightbar` | single / root | 被会话右侧栏占用 | — |
| `shell.leading` | single / root | 被 ui-sidebar 占用 | 左上窗口 chrome |
| `sidebar.toggle.badge` | single / root | 可注册但仅折叠侧栏展开钮内、不可交互 | — |

本插件入口 = `sidebar.panellist` 条目 + `main` 整页（见 [board-home.md](../features/board-home.md)）。`shell.overlay` 浮标是宿主提供的候选槽位，未注册。

入口三件套：

1. 侧栏条目：注册进 `sidebar.panellist`（list 槽，root 作用域）—— 由 `dsh-client-ui-sidebar` 声明，原文 *"Global panel icons. Each list id addresses the matching main panel"*。
2. 整页面板：注册进 `main`（keyed 槽，root）—— 由 `dsh-client-ui-layout` 声明；保留键 `conversation` 宿主会话，其他键不绑 Session。
3. 切换：`ctx.layout.selectPanel(id | null)`；id 未注册会抛错并保持当前选择，`null` 回会话。

三者用同一个 `MainPanelId`（branded 类型）关联。归属提醒：0.1.x 旧记录把 panellist 归在 layout 包 —— rc.2 上 layout 的 `sidebar` 槽是 single 且被 ui-sidebar 的 SidebarRoot 占用（注册它会整体替换导航列），第三方条目必须进 panellist 内部 seat。

## 二、逐条事实与出处

| 事实 | 原文 / 证据 | 出处 |
|---|---|---|
| 侧栏条目槽 | `'sidebar.panellist': { kind: 'list'; scope: 'root'; owner: SidebarPanelIconOwnerProps }`；注释 *"Global panel icons. Each list id addresses the matching main panel; the sidebar owns the button and resolves its label from list metadata."* | `dsh-client-ui-sidebar@0.2.0-rc.2` `lib/types/client/contract/slots.d.ts:43-50` |
| 条目元数据 | `SidebarPanelMetadata { id: MainPanelId; order: number; label: string }`（order 升序、并列保持注册序；label 缺省回落 id） | 同上 `:100-108` |
| 条目图标 share | `SidebarPanelIconOwnerProps { size: number; active: boolean }`（active = 该面板是否在主列选中） | 同上 `:93-99` |
| 整页槽 | `'main': { kind: 'keyed'; scope: 'root' }`；注释 *"Central panel selected by sidebar entry id. The reserved `conversation` key hosts the Conversation; other keys receive no Session binding."* | `dsh-client-ui-layout@0.2.0-rc.2` `lib/types/client/index.d.ts:53-56` |
| `sidebar` 槽被占用 | single/root；注释 *"OCCUPIED by ui-sidebar's SidebarRoot … registering here replaces the navigation column outright …"* | 同上 `:34-48` |
| 切换 API | `selectPanel(panelId: MainPanelId \| null): void`；*"@throws if the selected main key is not registered; preserves the current selection"*；`PanelInfo.activePanelId` 为 null 显示会话 | layout `lib/types/client/service.d.ts:17-32`、`:64` |
| MainPanelId | `Branded<'MainPanelId'>`，*"Identity shared by a sidebar panel entry and its main-slot occupant"* | layout `lib/types/client/service.d.ts:15` |
| 全局浮层 | `'shell.overlay'`（list，root，click-through，entries 自行选择指针事件）—— 可作 toast / 状态 pill | layout `lib/types/client/index.d.ts:76-88` |
| AppFrame 五子槽 | `'sidebar' \| 'main' \| 'rightbar' \| 'shell.overlay' \| 'shell.leading'` | layout `lib/types/client/AppFrame.d.ts:4` |
| **无表格件** | primitives 86 个 `.d.ts` / 36 个 `.module.css` 无 `Table*` / `List*` / `DataGrid*`；无表头 / 列宽 / 排序 / 分页 / 虚拟滚动件 | `dsh-client-ui-primitives@0.2.0-rc.2` `lib/types/**` |
| 行件 / 状态件 / 文件图标 | `DisclosureRow`（24px 单行 + icon + title + chevron）、`StateDot`（done/warning/ongoing/error/idle）、`FileTypeIcon`（按路径分类着色） | 同上 |
| 图标库 | 约 370 个 `Icon*` 导出，命名 `Icon<名><Outline\|Fill><Regular\|Medium>` | 同上 `lib/types/icons/index.d.ts` |
| 设计变量 | 去重后约 400 个 `--dsw-*`（alias 107 / static 77 / font 族 182…）+ 5 个 `--ds-*` | `dsh-client-ui-theme@0.2.0-rc.2` `lib/client.js` 内嵌 CSS |
| **明暗判据唯一** | `body[data-ds-dark-theme]`（宿主启动脚本 `toggleAttribute` 写）；`prefers-color-scheme` 仅宿主内部用 ⇒ 插件侧不得自己使用 | theme `lib/index.js`（bootThemeBodyScript） |
| 品牌色不是蓝 | `--dsw-alias-brand-primary` 明色近黑 / 暗色近白；蓝色强调走 `--dsw-alias-state-business-primary` | theme `lib/client.js` + 同栈仓记录 |
| **浮层实现** | `.overlayLayer{position:absolute;inset:0;z-index:20;pointer-events:none}` + `.overlayLayer>*{pointer-events:auto}`；宿主发布 `--dsh-frame-overlay-top`（= 标题栏净空 + 20px；全屏时 20px）供条目自定位 | layout `lib/client.js` |
| 浮层定位原文 | *"Frame-wide floating layer, above every column and outside their scroll containers… This is the additive seat… a fresh `id` is added beside the shipped entries instead of replacing them."* | layout `lib/types/client/index.d.ts:75-88` |
| **无通知 API** | layout / sidebar 两包全文无 `notification` 字样 ⇒ 宿主无推送通知能力，「通知」只能自绘（角标 / toast / pill） | 两包 `lib/client.js` |
| 三列几何 | 右栏先缩后失 track，center 保底 400（`CENTER_MIN`）；`rightbar` 占用者自报开合状态 | layout `lib/types/client/columns.d.ts`、`service.d.ts:47-49` |

## 三、对本插件的落地含义

1. 入口 = `main` 整页（在办 / 历史 / 设置三段视图）+ 侧栏 `sidebar.panellist` 条目，无 overlay。若实现 overlay，定位 `top:var(--dsh-frame-overlay-top); right:12px`，浮层默认点击穿透、子元素自动恢复指针事件 ⇒ 不挡应用。
2. 非 `conversation` 键不绑 Session，无需处理会话上下文。
3. 列表行自绘（无表格件），行件几何参照 `DisclosureRow`；状态色条 / 圆点自绘（`.dtl-rail` / `.dtl-dot`），文件类型图标仍用 `FileTypeIcon`。
4. 样式硬约束（明暗判据、token 使用）见 [ui-style.md](../development/ui-style.md)。

## 四、复核方式（宿主升级后）

```bash
npm view @deepseek-ai/dsh-client-ui-layout dist-tags --json   # 取 next 线（latest 是旧版）
npm view @deepseek-ai/dsh-client-ui-sidebar dist-tags --json
cd /tmp && npm pack @deepseek-ai/dsh-client-ui-layout@<版本> @deepseek-ai/dsh-client-ui-sidebar@<版本> && tar xzf *.tgz
# 看：sidebar.panellist / main / selectPanel 是否仍在、签名是否变
#     primitives 是否新增 Table 类件；DisclosureRow / StateDot / FileTypeIcon 签名
```

## 五、插件详情页配置区与「更多」菜单

本节是 `0.2.0-rc.1` 的解包原文，其它节是 rc.2；两槽名在 rc.2 未见变更，升级后按 §四 复核一遍。

| 事实 | 原文 / 证据 | 出处 |
|---|---|---|
| bundle 详情页配置槽 | `'plugins.bundle.config': { kind: 'keyed'; scope: 'root'; owner: PluginConfigViewProps }`；*"A bundle's own configuration, keyed by the bundle's package name and rendered on the bundle's page between its description and its rows (`view: 'page'` only)."* | `dsh-client-ui-plugin-manager@0.2.0-rc.1` `lib/types/client/slot-contract.d.ts:100` |
| 槽位 owner props | `{ view: 'summary' \| 'page'; form?: { state: ConfigFormSnapshot; mutate } }` —— 宿主只投喂快照 + mutate，不是可订阅的 store | 同上 `:20-26`、`:150-158` |
| 详情页按包名取用 | `renderSlot("plugins.bundle.config", { view: "page" }, { entryKey: pkg.name })` | 同上 `lib/client.js:2527` |
| 插件设置文档服务 | `ctx.configForms.get(ns)`（`ConfigForm<T>`：`getSnapshot` / `subscribe` / `mutate` / `set` / `unset`）；命名空间 = 活跃 entry 的 id，schema 由 host 侧 `Config` 的 `.volatile()` 字段派生 | `dsh-client-ui-settings@0.2.0-rc.1` `lib/types/client/config-form-types.d.ts`、`config-form.d.ts` |
| 官方设置表单 | `SettingsForm` / `SettingsFormModel` / `settingsTextField` / `settingsNumberField` / `SettingsValueField`（没有单选 / 布尔 / 下拉字段工厂，那类要自己拼 `SegmentedControl` / `Menu`） | `dsh-client-ui-primitives@0.2.0-rc.1` `lib/types/settings-form/*.d.ts`、`lib/types/index.d.ts:59-64` |
| 「更多」菜单槽 | `sidebar.panellist.actions`：注册一行 `MenuItemButton`（props 由 owner 给 `onDismiss`），行里跳整页并收起菜单 | `dsh-plugin-core/packages/demo/src/client/index.tsx:113-137`（同栈样本；`dsh-client-ui-sidebar` 本机未装，`.d.ts` 未逐行核实） |

## 更新日志

- 2026-11-07 23:03:03：按 koc-code-docwriter 槽位迁移，剔除过程稿并统一标题头
