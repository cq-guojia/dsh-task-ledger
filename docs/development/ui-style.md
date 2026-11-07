# 样式规范

外部事实详见 [client-ui-layout.md](../dependencies/client-ui-layout.md)，代码落点见 [code-conventions.md](code-conventions.md)。

## 一、两条硬约束（违反即出 bug）

1. 明暗判据只认宿主 `body[data-ds-dark-theme]`；插件禁用 `prefers-color-scheme`（它跟操作系统、不跟宿主里的选择，两者不一致会把暗色的浅字套在宿主浅色面板上 ⇒ 白字白底隐形）。
2. 用宿主设计变量，不自定 px 刻度：色 / 圆角 / 字号 / 阴影一律走 `--dsw-*` token；界面蓝色强调用 `--dsw-alias-state-business-primary`，**不是** `--dsw-alias-brand-primary`（明色近黑、暗色近白，不是蓝）。

## 二、token 层：`--dtl-*`（唯一落点 `src/client/tokens.ts`）

插件语义色一律经一层自己的变量名消费，不在业务文件里直接写 `var(--dsw-*)`：

| 规矩 | 为什么 |
|---|---|
| `--dtl-*` 只在 `tokens.ts` 定义，别处只 `var(--dtl-*)` 消费 | 宿主升级换变量别名时改一处即可 |
| 每个 token 都带兜底值（`var(--dsw-xxx,#1f2328)`） | 宿主没定义时最坏退到兜底色，不会白屏 / 透明字 |
| 明暗差异只写文件末尾的 `body[data-ds-dark-theme]` 段 | 能靠宿主 alias 表达的一律不写覆盖；只有固定中性面 / 半透明底这类 alias 表达不了的才进该段 |
| 挂载点 = `body` | 插件界面（含 portal 到 body 的弹层）全在 body 内，零调用点成本 |

判据是纯 CSS 选择器，宿主 `toggleAttribute` 一改样式立即生效，不需要 `MutationObserver`，JS 侧没有「当前是什么主题」这个概念。

卡 / 行的 hover 高亮直接用核心 `--dshpc-card-hover`（与核心 `Card` 的 `hoverable` 同源），插件不自带一份卡 hover 色；卡片底色与边框由核心 `Surface` / `Card` 提供。`Card` 的 `hoverable` 默认只作用于头部（`hoverScope: 'head'`），要整卡变色须显式给 `hoverScope: 'card'`，展开区内容放 `panel` 才不会被 hover 区裁掉内距。

## 三、控件全部走核心库，不许自绘皮肤

| 用途 | 用哪个 | 本地是否还有皮肤 |
|---|---|---|
| 按钮 / 图标按钮 | `dsh-plugin-core/ui::Button` / `IconButton` | 无（`ui.ts` 只转 props） |
| 输入框 / 搜索框 | `Input` | 无 |
| 下拉 | `Picker`（含 `PickerGroup`） | 无 |
| 分段 | `Segmented` | 无 |
| 标签 / chip | `Chip`（`Tag` 只做宽度截断 + tone 映射） | 无 |
| 条带卡 | `StripCard` | 无 |
| 一行一条 | `ListRow`（自带底色 / hover / 右侧操作槽，整行可点） | 无 |
| 提示气泡 | 官方 `Tooltip`（`dsh-client-ui-primitives`） | 无 |
| 图标 | `Icon*`（色随 currentColor） | 无 |
| 容器外框（底 / 1px 边 / 圆角 / 内距） | `Surface`（`tone` / `border` / `radius` / `padding` 四轴） | 无 |
| 统计卡 / 图表卡 / 任务行 / 空态 / 图表浮卡 / 流程节点 | 外框用 `Surface`，本插件只补排版（`.dtl-stat` / `.dtl-hist` / `.dtl-trend` / `.dtl-taskrow` / `.dtl-empty-guide` / `*__tip` / `.dtl-flow__box`） | 仅排版与尺寸 |
| 表格 | 核心 `Table` 支撑不了窗口化 ⇒ 自绘 `.dtl-histlist__*`，外框仍用 `Surface` | 仅表格内部线 |

判据：核心库有的控件一律用核心库，本地只允许薄包裹（转 props、拼 className 做布局），不得重写高度 / 内距 / 边框 / 圆角 / 配色。核心没有的（表格、行内排版、图表画法）才允许自绘，且颜色圆角字号只吃 `var(--dtl-*)`。

宿主 primitives 没有 Table / DataGrid / List / 排序 / 分页 / 虚拟滚动件，最接近的行件是 `DisclosureRow`。列表行与历史页表格是本插件仅有的自绘件：自绘是因为核心 `Table` 支撑不了窗口化渲染（整表逐行渲染、没有插入占位行的口子），不是外观另起一套。历史表头底、行悬浮底、边色在 `tokens.ts` 里 alias 核心 token（`--dtl-table-head-bg` / `--dtl-table-row-hover` / `--dtl-border-faint`），不另写色值；四边外框（1px + 圆角 12）由外套 `Surface` 提供（`.dtl-histlist__frame`，`overflow:hidden`）。核心 `Table` 支持窗口化后，这套应当收回去。

插件详情页配置区的控件同样全部走核心控件库（`Input` / `Picker` / `Chip` / `Button`），本文件只排标签、说明与两列容器（`.dtl-config__*`，随同一处注入器挂载），颜色只吃 `var(--dtl-*)`；宿主官方 primitives 只用到图标与 `SettingsFormModel`。

### 3.1 用 `Surface` 的两条写法约束

1. 要覆盖 `Surface` 基类的属性（内距 / 定位 / 背景 / 边色）时一律写复合选择器 `.dshpc-surface.dtl-xxx`。`Surface` 的四根轴全用变量表达，修饰类只改变量，胜负不依赖两份 CSS 的注入顺序；只写 `.dtl-xxx` 与基类同为 (0,1,0)，谁先注入谁说了算。
2. 只改底色 / 边色时改 Surface 自己的变量（`--surface-bg` / `--surface-border`），不要重写 `background` / `border-color`。

调用 `Surface` 一律不传 `radius`：容器圆角只有一档 12（`--dshpc-radius-md`，与框内 `Button` / `Input` 同档），传 `sm`(8) 会「卡 8 < 按钮 12」倒挂。本插件不自己写任何 `border-radius` 建面（小色块、柱子、头像除外）。

趋势图图表色只有两档：`--dtl-chart-open`（琥珀，取 `--dtl-warning`）与 `--dtl-chart-added`（灰，取 `--dtl-fg-dim`，明暗自带）；「完成」直接用既有的 `--dtl-business`。柱 / 浮卡样式全在 `ui.ts` 的 `.dtl-trend*` 一组类里，组件不写内联色值。

## 四、文案唯一真源：`src/client/locales.ts`

- 命名空间 `dsh-task-ledger`，`zh` / `en` 两档键必须完全对齐；界面上不许出现未登记的硬编码中文。
- 语言切换跟随宿主（`ctx.locale.register(ns,{zh,en})` + 注册项声明 `locale:` ⇒ 宿主渲染器把 `t` 席位合成进 props）；插件不自带语言开关。
- 占位符一律 `{name}`，由 `interpolateTranslate` 自己替换（不依赖宿主是否支持 params）。

## 更新日志

- 2026-11-07 23:03:04：按 koc-code-docwriter 槽位迁移，剔除过程稿并统一标题头
- 2026-11-08 01:29:51：补 Card 的 hoverScope 默认档与 panel 约束
