# 20261026-0946-用-dsh-plugin-core-替换插件现有-ui-控件-57bb：用 dsh-plugin-core 替换插件现有 UI 控件

> **创建**：2026-10-26 09:46:05（@GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6）
> **分类**：重构 ｜ **标签**：dsh-plugin-core、控件替换、界面

<!-- 「> **分类**：… ｜ **标签**：…」行由脚本按 new --category / --tags 插入；两者皆空则不写。 -->

## 背景

用户要求：除页面顶部「统计 + 图表」整块外，把插件现有 UI 控件全部替换为 dsh-plugin-core（已引入 v0.4.0）的控件；重点含列表里的框 / 提示 / 按钮，以及「滑动选择」（分段控件）。

## 待办

- 待确认 4 个缺口：① Tag 有 7 档语义色（neutral/open/backlog/doing/overdue/stale/person），core `Chip` 只有 5 档（neutral/business/success/warning/danger）；② 空态与降级横幅 core 无直接件；③「全部待办」表格式行 core 无对应；④ `LedgerIcon` 品牌图标无对应。
- token 层：core 前缀写死 `dshpc`，`--dtl-*` 需迁移或做别名。
- 替换后跑 build + typecheck，并量 `dist/client.js` 体积。

## 下一步

缺口确认后：先在 `packages/plugin/src/client/index.ts` 启动处 `setStyleKit(createStyleKit({ id: 'dsh-task-ledger' }))`；再把 `ui.ts` 的 Button/Segmented/Input/Picker/Chip（ui.ts:271/316/340/368/405/500）换成 core 同名件。

## 过程

- 客户端 UI 全在 5 文件：`index.ts` / `board-home.ts` / `ui.ts` / `tokens.ts` / `task-row.ts`，均为 `h()` + 手写 CSS；官方 primitive 目前只用 Tooltip + 图标。
- 现有控件：Button(ui.ts:316) / IconButton(:340 死码) / Segmented(:271「滑动选择」) / Select(:368 原生 select) / SearchInput(:405) / Tag(:500 7 tone) / Chip(:469 死码) / EmptyState(:532) / StatCard(:433) / 图表(:614,:755)。
- 排除区：StatCard、GroupedBarChart、ChartLegend、`.dtl-stats`/`.dtl-gchart*` 皮肤、`board-home.ts:292-430` 统计+图表容器；「只看我的」checkbox 位于图表卡内（`board-home.ts:367`），随区块保留。
- core API 核对：`Button` 10 variant × 3 size；`Segmented` variant `default|inset` + size + `items{badge,count}`（与现有近 1:1）；`Chip` tone 仅 5 档；`Input` size 默认 sm；`Picker` 单选/多选/搜索/clearable；`WorkspacePicker` 自动订宿主工作区。
- 样式：`createStyleKit({ id })` 仅 `id`，`CSS_PREFIX='dshpc'` 写死（`design/style-kit.ts:7,12-15`）；`ensureControls()` 会挂上全部控件 CSS。
- `ui/index.ts` 不含 CodeViewer；只 import `dsh-plugin-core/ui` 不会拖 codemirror（其 JS 在单独子路径 `./ui/code-viewer`）。

## 结论

调查完成，映射与缺口已列；待用户确认缺口后进入替换实现。

## 执行记录

<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。
     补记用 progress.py log --id <任务号> --note "一句话"。 -->
- 2026-10-26 17:46:05 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 创建任务并认领
- 2026-10-26 17:48:40 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 调查完成：客户端 UI 全在 5 文件；待替换 Button/Segmented/Input/Picker/Chip/Tag/EmptyState 等，排除统计+图表区；4 个缺口待确认（Tag 7→5 tone、空态/横幅、表格行、LedgerIcon）
