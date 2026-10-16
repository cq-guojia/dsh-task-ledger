# 样式规范

> **状态**：🔵 落码（2026-10-16 初建；2026-10-17 首页落码后补全：token 层 / i18n / 复用官方元件）
> **来源**：姊妹仓 `dsh-task-dispatch-table` 已核实事实（0.2.0-rc.2）+ 本仓 [`external/client-ui-layout.md`](external/client-ui-layout.md)
> **配套**：外部事实详见 [`external/client-ui-layout.md`](external/client-ui-layout.md)；代码落点见 [`code-conventions.md`](code-conventions.md)

## 一、两条硬约束（违反即出 bug）

1. **明暗判据只认宿主**：`body[data-ds-dark-theme]`；插件**禁用** `prefers-color-scheme`（它跟操作系统、不跟用户在宿主里的选择，两者不一致时会把暗色的浅 / 白字套在宿主浅色面板上 ⇒ 白字白底隐形）。
2. **用宿主设计变量，不自定 px 刻度**：色 / 圆角 / 字号 / 阴影一律走 `--dsw-*` token（详见外部事实文档）；界面蓝色强调用 `--dsw-alias-state-business-primary` —— **不是** `--dsw-alias-brand-primary`（明色近黑、暗色近白，不是蓝）。

## 二、无表格件（已知缺口）

宿主 primitives **没有 Table / DataGrid / List / 排序 / 分页 / 虚拟滚动件**；最接近的行件是 `DisclosureRow`，状态件 `StateDot`，文件类型图标 `FileTypeIcon`，约 370 个 `Icon*`。

台账看板的列表行按官方 token 与几何自绘 —— **已定稿并落码**，见 [`features/board-home.md`](features/board-home.md) §二（`StateDot` 状态语义 open=idle / doing=ongoing / blocked=warning / 已结案=done；空态三分）。

右上浮标入口（`shell.overlay`）两条注意：浮层默认 `pointer-events:none`、子元素自动恢复 ⇒ 自绘条目不挡下方应用；定位用宿主变量 `--dsh-frame-overlay-top`（标题栏净空 + 20px），不要写死 top 值。

## 三、token 层：`--dtl-*`（唯一落点 `src/client/tokens.ts`）

插件语义色一律经一层自己的变量名消费，**不在业务文件里直接写 `var(--dsw-*)`**：

| 规矩 | 为什么 |
|---|---|
| `--dtl-*` **只在 `tokens.ts` 定义**，别处只 `var(--dtl-*)` 消费 | 宿主升级换变量别名时改一处即可；散着写必然漏改 |
| 每个 token 都带兜底值（`var(--dsw-xxx,#1f2328)`） | 宿主没定义时最坏退到兜底色，不会白屏 / 透明字 |
| 明暗差异**只写**文件末尾的 `body[data-ds-dark-theme]` 段 | 能靠宿主 alias 表达的一律不写覆盖（alias 自己随主题变）；只有「固定中性面 / 半透明底」这类 alias 表达不了的才进该段 |
| 挂载点 = `body` | 插件界面（含将来 portal 到 body 的弹层）全在 body 内，零调用点成本 |

**不需要 MutationObserver**：判据是纯 CSS 选择器，宿主 `toggleAttribute` 一改，样式立即生效——JS 侧没有「当前是什么主题」这个概念。

## 四、复用官方元件，别自造

能用的官方件就用，`src/client/primitives.d.ts` 只声明我们要消费的那一面（不引官方包类型，rc 版本会无声变）：

| 用途 | 用哪个 |
|---|---|
| 按钮（返回 / 刷新 / 加载更多） | `Button`（variant: primary / ghost / outline / toolbar；size: md 36px / sm 28px） |
| 分段控件（任务 / 统计 tab、状态档） | `SegmentedControl` |
| 状态点 | `StateDot` |
| 过程正文（markdown） | `MarkdownText`（`labels` 必须引用稳定 ⇒ `useMemo`） |
| 下拉 / 搜索框 | 宿主没有廉价选择器 ⇒ 原生 `select` / `input` + token 配色（`.dtl-select` / `.dtl-input`） |

## 五、文案唯一真源：`src/client/locales.ts`

- 命名空间 `dsh-task-ledger`，`zh` / `en` **两档键必须完全对齐**（冒烟有断言）；界面上**不许出现未登记的硬编码中文**。
- 语言切换**跟随宿主**（`ctx.locale.register(ns,{zh,en})` + 注册项声明 `locale:` ⇒ 宿主渲染器把 `t` 席位合成进 props）。插件**不自带语言开关**。
- 占位符一律 `{name}`，由 `interpolateTranslate` 自己替换（不依赖宿主是否支持 params）。
