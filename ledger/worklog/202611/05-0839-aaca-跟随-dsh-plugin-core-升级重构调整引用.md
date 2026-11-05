# 20261105-0839-aaca-跟随-dsh-plugin-core-升级重构调整引用: 跟随 dsh-plugin-core 升级重构调整引用

- **Tags**: dsh-plugin-core, 依赖升级, 引用路径
- **Status**: done · 2026-11-05 09:37:50 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **Created**: 2026-11-05 08:39:55 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **Sealed**: 2026-11-05 09:37:50 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

用户 2026-11-05 原话：

> 我们用的基础核心空间包，那个包做了升级和很大面积的重构，有一些地方都变了。这个任务就是要跟随那个变化去调整我们的项目。
> 先把包更新到最新，把背景写到这个任务里，接着开始做。仔细读他的文档，和我们现在的用的代码比较一下，
> 主要是位置变了，里面的引用方式应该是几乎是没变的。每个都核对一下，我们用的地方都把它改过来。

背景事实：

- 核心包 = `dsh-plugin-core`（本机 `/code/dsh-plugins/dsh-plugin-core`），本项目唯一消费者是 `packages/plugin`（`packages/skill` 零依赖，不涉及）。
- 升级前：`packages/plugin/package.json` 写 `^0.32.0`，实装 0.32.0；npm 最新 0.33.1（2026-11-05 发版）。
- 核心这次重构（其台账 `20261105-0600-bde5-整理控件归类与文档结构`）：`src/ui` 按动作 / 录入 / 展示 / 反馈 / 布局 / 导航 / infra 七类归档，
  `src/explorer` → `src/adv/explorer`、`src/session` → `src/adv/session`，`dist/` 按新结构重建。

## To Do

- [x] `pnpm --filter ./packages/plugin add dsh-plugin-core@0.33.1`（第一跳，纯内部重组，零改动）
- [x] 逐项核对本项目对核心的全部 import（27 处 / 36 个符号）
- [x] 核心发 **0.33.2**（提交 `2b8cc55`：`exports` 改 `./adv/*`、清 624 个孤儿产物、build 加 prune-dist）→ 升 0.33.2 并改 6 处 specifier
- [x] `docs/design/external/dsh-plugin-core-explorer.md` + `docs/design/features/ledger-dirs.md` 按 0.33.2 复核
- [x] build + typecheck + dist 产物重建

## Next

无（用户 2026-11-05 决定结案，随本轮 `plugin-v*` 发版）。
遗留：文件预览（`adv/explorer`）与会话预览（`adv/session`）两条链路没有单独真机复验过 ——
改的是模块 specifier，打包能过只证明解析得到，真机才证明面板拉得起来。

## Process

- 核心这次重构（其台账 `20261105-0600-bde5-整理控件归类与文档结构`，提交 `257c945`）：`src/ui` 按七类归档、
  `src/explorer` → `src/adv/explorer`、`src/session` → `src/adv/session`、183 个文件迁移。
- **第一跳（0.32.0 → 0.33.1）对外没变**：两版 `exports` 逐条相同，打包里 `dist/explorer`、`dist/session`
  与 `dist/adv/*` 并存 ⇒ 子路径照旧可用。10 个入口导出符号集合全等（`ui` 229、`explorer` 39、`session` 30、`utils` 31 …）。
- `d.ts` 内容比对（剥掉 import 行）：唯一实质变化是 `src/utils/i18n.ts:1568` 的
  `setLocale(locale: Locale | null)`（新增「传 null 恢复跟随宿主」），属放宽，向后兼容；本项目没用到。
- 本项目引用面：`dsh-plugin-core/ui` 19 处、`/session` 3、`/explorer` 3、`/design` 1、`/host` 1；
  **无 deep import**（`src/` 里没有任何 `dsh-plugin-core/dist/…`）。
- **0.33.1 的坑**：`dist/explorer`、`dist/session` 是重构前构建的 224 个孤儿产物（build 无 clean，且已入 git），
  `exports` 仍指向它们 ⇒ 消费方拿到的是旧副本（实测 js 等价，仅一行注释路径不同，但下次改 `src/adv/*` 会改了不发）。
  已在核心侧修掉（`2b8cc55`）。
- **第二跳（0.33.1 → 0.33.2）是真 break**：`exports` 变为
  `./design ./ui ./ui/official ./ui/code-viewer ./ui/host-toast ./utils ./adv/explorer ./adv/explorer/preview ./adv/session ./host`，
  `dist/` 只剩 `adv design host ui utils`。`./ui/host` 一并改名 `./ui/host-toast`（本项目未用）。
- 已改 6 处 specifier：`client/board-home.ts:33,39`、`client/settings-page.ts:20`、`client/index.ts:16,43`、
  `client/close-session.ts:24`（`/explorer`→`/adv/explorer`、`/session`→`/adv/session`）。
- 改后 `pnpm --filter ./packages/plugin run verify` 通过；36 个导入符号在 0.33.2 下逐个复核仍在（0 个缺失）。
- 文档行号复核结果：目录改名但行号不变（`open.d.ts` 的 `pickWorkspaceFile` 136、`placement` 105、
  `types.d.ts` 的 `PickedPath` 161-168 / `PickFilter` 170-173、`FileBrowser.js` 392,455、`open.js` 94,268）。

## Conclusion

`dsh-plugin-core` 0.32.0 → 0.33.2 完成。第一跳零改动，第二跳（0.33.2 把子路径搬进 `adv/`）改了本项目 6 处 import；
36 个导入符号全部仍在，build + typecheck 通过。
落盘变更：`packages/plugin/package.json`（`^0.33.2`）、`pnpm-lock.yaml`、6 个 client 源文件的 specifier、
重建的 `dist/client.js(.map)`、`docs/design/external/dsh-plugin-core-explorer.md`、
`docs/design/features/ledger-dirs.md`（一处旧路径）。

结案时（2026-11-05）状态：代码与产物已在 `main` 上，文件预览 / 会话预览两条链路未单独真机复验 ——
这条验收动作没做，属已知遗留，不写成已验。

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261105-0839-aaca-跟随-dsh-plugin-core-升级重构调整引用 --note "...". -->
- 2026-11-05 08:39:55 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · created and claimed
- 2026-11-05 08:42:25 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 升 dsh-plugin-core 0.32.0→0.33.1（packages/plugin/package.json ^0.33.1）；核心 exports 与 10 个入口导出符号和 0.32.0 全等、36 个导入符号齐 ⇒ 源码零改动，build+typecheck 过；external 文档行号按新包重核
- 2026-11-05 09:08:47 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 升 dsh-plugin-core 0.33.2（核心 2b8cc55：exports 改 ./adv/*、清 624 孤儿产物）；改 6 处 specifier 为 adv/explorer、adv/session（board-home.ts:33,39 / settings-page.ts:20 / index.ts:16,43 / close-session.ts:24）；36 符号复核全在，build+typecheck 过；文档同步
- 2026-11-05 09:11:51 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 发版：插件 0.0.132，提交 6d87f92 已推 main、tag plugin-v0.0.132 已推；未动 skill 故不升 skill-v*；build/typecheck/codelint 均过，待真机验收文件预览与会话预览
- 2026-11-05 09:37:33 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 收尾：Next 改为结案，遗留「文件预览/会话预览未真机复验」写进 Conclusion（不写成已验）
- 2026-11-05 09:37:50 · close · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · sealed: dsh-plugin-core 0.32.0→0.33.2，6 处 specifier 改到 adv/explorer、adv/session，36 个导入符号复核全在，build+typecheck 过；文件/会话预览未单独真机复验
