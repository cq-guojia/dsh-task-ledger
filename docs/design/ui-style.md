# 样式规范

> **状态**：🔵 落码（2026-10-16 初建；2026-10-17 首页落码后补全 token 层 / i18n / 元件分工；**2026-10-28 控件层统一交回 `dsh-plugin-core`，自绘皮肤整套删除**，见 §四）
> **来源**：姊妹仓 `dsh-task-dispatch-table` 已核实事实（0.2.0-rc.2，`ui/tokens.ts` + `ui/controls-css.ts` 逐条对照）+ 本仓 [`external/client-ui-layout.md`](external/client-ui-layout.md)
> **配套**：外部事实详见 [`external/client-ui-layout.md`](external/client-ui-layout.md)；代码落点见 [`code-conventions.md`](code-conventions.md)

## 一、两条硬约束（违反即出 bug）

1. **明暗判据只认宿主**：`body[data-ds-dark-theme]`；插件**禁用** `prefers-color-scheme`（它跟操作系统、不跟用户在宿主里的选择，两者不一致时会把暗色的浅 / 白字套在宿主浅色面板上 ⇒ 白字白底隐形）。
2. **用宿主设计变量，不自定 px 刻度**：色 / 圆角 / 字号 / 阴影一律走 `--dsw-*` token（详见外部事实文档）；界面蓝色强调用 `--dsw-alias-state-business-primary` —— **不是** `--dsw-alias-brand-primary`（明色近黑、暗色近白，不是蓝）。

## 二、无表格件（已知缺口）

宿主 primitives **没有 Table / DataGrid / List / 排序 / 分页 / 虚拟滚动件**；最接近的行件是 `DisclosureRow`，文件类型图标 `FileTypeIcon`，约 370 个 `Icon*`。

**列表行是本插件唯一的自绘件**：一行 = 左缘状态色条 / 圆点（`.dtl-rail` / `.dtl-dot`）+ 标题 + 工作区 + `#标签` + 右侧灰字，见 [`features/board-home.md`](features/board-home.md) §二。它自绘是因为宿主没有表格件，**不是因为宿主控件不好**——行内的按钮、标签、输入仍是核心控件。

**历史页表格也是自绘件**（2026-11-01）：`.dtl-histlist__table` / `__cell` / `__headcell` / `__row` / `__dayrow` / `__spacer`，写在 `ui.ts`。自绘的原因是**核心 `Table` 支撑不了窗口化渲染**（整表逐行渲染、没有插入占位行的口子），不是外观另起一套：四边外框、灰底表头 + 下边线、行间极淡底线、行悬浮、选中淡蓝底 + 左竖条逐条对齐核心 plain 皮肤；表头底与行悬浮底在 `tokens.ts` 里 alias 核心 token（`--dtl-table-head-bg` / `--dtl-table-row-hover` / `--dtl-border-faint`），不另写色值。**以后核心 `Table` 支持窗口化时，这套应当收回去**。

（注：右上 `shell.overlay` 浮标截至本版未落码，见 `features/board-home.md` §一；宿主事实如下，若实现需注意）浮层默认 `pointer-events:none`、子元素自动恢复 ⇒ 自绘条目不挡下方应用；定位用宿主变量 `--dsh-frame-overlay-top`（标题栏净空 + 20px），不要写死 top 值。

## 三、token 层：`--dtl-*`（唯一落点 `src/client/tokens.ts`）

插件语义色一律经一层自己的变量名消费，**不在业务文件里直接写 `var(--dsw-*)`**：

| 规矩 | 为什么 |
|---|---|
| `--dtl-*` **只在 `tokens.ts` 定义**，别处只 `var(--dtl-*)` 消费 | 宿主升级换变量别名时改一处即可；散着写必然漏改 |
| 每个 token 都带兜底值（`var(--dsw-xxx,#1f2328)`） | 宿主没定义时最坏退到兜底色，不会白屏 / 透明字 |
| 明暗差异**只写**文件末尾的 `body[data-ds-dark-theme]` 段 | 能靠宿主 alias 表达的一律不写覆盖（alias 自己随主题变）；只有「固定中性面 / 半透明底」这类 alias 表达不了的才进该段 |
| 挂载点 = `body` | 插件界面（含将来 portal 到 body 的弹层）全在 body 内，零调用点成本 |

**不需要 MutationObserver**：判据是纯 CSS 选择器，宿主 `toggleAttribute` 一改，样式立即生效——JS 侧没有「当前是什么主题」这个概念。

## 四、控件全部走核心库，不许自绘皮肤（2026-10-28 定稿）

> 用户原话：「以后就全用我们的核心空间库」「把原来老的样式也删掉、清掉——你如果不清掉，我都不知道哪些是他自己写的，哪些是用的老的」。

| 用途 | 用哪个 | 本地是否还有皮肤 |
|---|---|---|
| 按钮 / 图标按钮 | `dsh-plugin-core/ui::Button` / `IconButton` | ❌ 无（`ui.ts` 只转 props） |
| 输入框 / 搜索框 | `Input` | ❌ 无 |
| 下拉 | `Picker`（含 `PickerGroup`） | ❌ 无 |
| 分段 | `Segmented` | ❌ 无 |
| 标签 / chip | `Chip`（`Tag` 只做宽度截断 + tone 映射） | ❌ 无 |
| 条带卡 | `StripCard` | ❌ 无（直接 re-export 去掉后不再包一层） |
| 提示气泡 | 官方 `Tooltip`（`dsh-client-ui-primitives`） | ❌ 无 |
| 图标 | `Icon*`（约 370 个，色随 currentColor） | ❌ 无 |
| 卡片容器 / 列表行 / 统计卡 / 空态 | **本插件业务壳**（`.dtl-card` / `.dtl-orow` / `.dtl-stat` / `.dtl-empty-guide`） | ✅ 仅这些 |

**判据**：核心库有的控件，一律用核心库，本地只允许薄包裹（转 props、拼 className 做布局），**不得重写高度 / 内距 / 边框 / 圆角 / 配色**。核心没有的（表格行、统计卡），才允许自绘，且颜色圆角字号只吃 `var(--dtl-*)`。

已删除的旧皮肤（2026-10-28）：`.dtl-btn*` / `.dtl-iconbtn*` / `.dtl-input` / `.dtl-select*` / `.dtl-seg*` / `.dtl-check` / `.dtl-badge` / `.dtl-row*` / `.dtl-group` / `.dtl-tag--*` / `.dtl-gchart*` / `.dtl-worklog`，以及随之无引用的 39 个 token（控件高度三档、图表三色、旧阴影 / 圆角大档等）。趋势图与原生 `select` 组件同样已删。

**2026-10-29 趋势图接回**：图表色只恢复两档 —— `--dtl-chart-open`（琥珀，取 `--dtl-warning`）与 `--dtl-chart-added`（灰，取 `--dtl-fg-dim`，明暗自带）；「完成」直接用既有的 `--dtl-business`，不再单独造一个蓝。柱 / 浮卡样式全在 `ui.ts` 的 `.dtl-trend*` 一组类里，组件 `client/trend-chart.ts` 不写内联色值。

## 五、文案唯一真源：`src/client/locales.ts`

- 命名空间 `dsh-task-ledger`，`zh` / `en` **两档键必须完全对齐**；界面上**不许出现未登记的硬编码中文**。
- 语言切换**跟随宿主**（`ctx.locale.register(ns,{zh,en})` + 注册项声明 `locale:` ⇒ 宿主渲染器把 `t` 席位合成进 props）。插件**不自带语言开关**。
- 占位符一律 `{name}`，由 `interpolateTranslate` 自己替换（不依赖宿主是否支持 params）。
