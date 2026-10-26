# 20261026-0946-用-dsh-plugin-core-替换插件现有-ui-控件-57bb：用 dsh-plugin-core 替换插件现有 UI 控件

> **创建**：2026-10-26 09:46:05（@GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6）
> **分类**：重构 ｜ **标签**：dsh-plugin-core、控件替换、界面

<!-- 「> **分类**：… ｜ **标签**：…」行由脚本按 new --category / --tags 插入；两者皆空则不写。 -->

## 背景

用户要求：除页面顶部「统计 + 图表」整块外，把插件现有 UI 控件全部替换为 dsh-plugin-core（已引入 v0.4.0）的控件；重点含列表里的框 / 提示 / 按钮，以及「滑动选择」（分段控件）。

## 待办

- 空态 `EmptyState`、降级警告横幅、两种任务行（尤其 `others` 表格式行）、分组头、`LedgerIcon` 仍是自绘：core 无对应件（见「结论」）。
- `--dtl-*` token 层与 core `--dshpc-*` 并存；token 全量退役另开一轮。
- 改动未提交（等用户明确说提交）。

## 下一步

用户验收界面（构建 / 类型检查已过）；把「结论」里的 core 缺口转给组件包负责的 Agent。

## 过程

- 客户端 UI 全在 5 文件：`index.ts` / `board-home.ts` / `ui.ts` / `tokens.ts` / `task-row.ts`，均为 `h()` + 手写 CSS；官方 primitive 目前只用 Tooltip + 图标。
- 现有控件：Button / IconButton / Segmented（「滑动选择」）/ Select / SearchInput / Tag（7 tone）/ Chip（死码）/ EmptyState / StatCard / 图表。
- 排除区：StatCard、GroupedBarChart、ChartLegend、`.dtl-stats`/`.dtl-gchart*` 皮肤、`board-home.ts:292-430`；图表卡内「只看我的」checkbox 随区块保留。
- 落地改法（最小改动）：`index.ts` 启动 `setStyleKit(createStyleKit({ id: 'dsh-task-ledger' }))`；`ui.ts` 的 Segmented/Button/IconButton/Select/SearchInput/Chip/Tag 改为 core 同名件（保持对外签名，调用点不动）；`task-row.ts` 的「查看」/ 动作钮改 core `IconButton`/`Button`。
- 映射要点：本地 `Segmented.badge`（灰字计数）→ core `count`；Tag 7 tone → core Chip 5 tone（overdue/stale→danger，doing/person→business），截断用 `.dshpc-chip.dtl-tagchip` 补 20ch 省略号。
- 验证：`typecheck` 通过；`build` 通过；`dist/client.js` 104,772 → 336,180 bytes（gzip 95 KB）。产物内 `EditorView` 0 处（codemirror 运行时未进）、`sonner` 0 处（tree-shake 掉）；体积增长来自 Picker 依赖的 floating-ui。

## 结论

已完成控件层替换（build / typecheck 通过）。用起来发现的 core 缺口（建议组件包 Agent 修，不在插件里绕）：
1. `Chip` 只有 5 档 tone、无截断/title：状态需 7 档（open/backlog/doing/overdue/stale/person），且标签要 20ch 省略号；现为插件侧映射 + `.dtl-tagchip` 补丁，颜色会撞（overdue/stale、doing/person）。
2. `Picker` 无 `style`/`width`/`minWidth`（PickerProps 只有 className）：工作区下拉原来的定宽 131px 丢失。
3. 无 `EmptyState`、无内联 `Banner`/`Alert`：空态与降级横幅只能继续自绘。
4. 无表格行 / `ListRow`：`others` 表格式任务行继续自绘；`Card`/`StripCard` 自带 head/bar/panel，不适配任务行结构。
5. 打包：`dsh-plugin-core/ui` 是单一 barrel、无按控件子路径 ⇒ Picker 的 floating-ui 全量进包（+231 KB）；建议给子路径入口或把重依赖组件拆出。
6. `createStyleKit` 只有 `id`、前缀写死 `dshpc`：id 只隔离 `<style>` 标签，不隔离 `--dshpc-*` 变量，多插件同页会互相覆盖；建议加 token 前缀 / 命名空间。

## 执行记录

<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。
     补记用 progress.py log --id <任务号> --note "一句话"。 -->
- 2026-10-26 17:46:05 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 创建任务并认领
- 2026-10-26 17:48:40 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 调查完成：客户端 UI 全在 5 文件；待替换 Button/Segmented/Input/Picker/Chip/Tag/EmptyState 等，排除统计+图表区；4 个缺口待确认（Tag 7→5 tone、空态/横幅、表格行、LedgerIcon）
- 2026-10-26 17:54:53 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 控件层替换完成：ui.ts 的 Segmented/Button/IconButton/Select/SearchInput/Chip/Tag + task-row 按钮改 core；index 挂 setStyleKit；build/typecheck 过，client.js 104.8→336.2KB（floating-ui），无 codemirror/sonner；6 个 core 缺口已记
