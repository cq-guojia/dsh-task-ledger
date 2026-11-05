# 20261105-0839-aaca-跟随-dsh-plugin-core-升级重构调整引用: 跟随 dsh-plugin-core 升级重构调整引用

- **Tags**: dsh-plugin-core, 依赖升级, 引用路径
- **Status**: doing · 2026-11-05 08:42:25 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **Created**: 2026-11-05 08:39:55 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6

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

- [x] `pnpm --filter ./packages/plugin add dsh-plugin-core@0.33.1`
- [x] 逐项核对本项目对核心的全部 import（27 处 / 36 个符号），确认子路径与符号未变
- [x] `docs/design/external/dsh-plugin-core-explorer.md` 按新版复核（版本号 + 源码路径 + 行号）
- [x] build + typecheck + dist 产物重建

## Next

待用户验收。**观察项（不是我方待办）**：核心 `0.33.1` 的 `exports` 仍是 `./explorer` / `./session`，
而其台账已拍板改用 `dsh-plugin-core/adv/explorer` / `adv/session`；若核心后续真改，本项目需跟着改
6 处 specifier（`client/board-home.ts:33,39`、`client/settings-page.ts:20`、`client/index.ts:16`、`index.ts:13`）。

## Process

- 核心这次重构（其台账 `20261105-0600-bde5-整理控件归类与文档结构`，提交 `257c945`）：`src/ui` 按七类归档、
  `src/explorer` → `src/adv/explorer`、`src/session` → `src/adv/session`、183 个文件迁移。
- **对外没变**：`dsh-plugin-core@0.33.1` 与 `0.32.0` 的 `package.json` 的 `exports` 逐条相同
  （`./design ./ui ./ui/official ./ui/code-viewer ./ui/host ./utils ./explorer ./explorer/preview ./session ./host`），
  打包里 `dist/explorer`、`dist/session` 与 `dist/adv/*` 并存 ⇒ 消费方子路径照旧可用。
- 逐入口比导出符号集合（0.32.0 vs 0.33.1）：10 个入口全等（`ui` 229、`explorer` 39、`session` 30、`utils` 31 …），无删无增。
- `d.ts` 内容比对（剥掉 import 行）：唯一实质变化是 `src/utils/i18n.ts:1568` 的
  `setLocale(locale: Locale | null)`（新增「传 null 恢复跟随宿主」），属放宽，向后兼容。
- 本项目引用面：`dsh-plugin-core/ui` 19 处、`/session` 3、`/explorer` 3、`/design` 1、`/host` 1；
  **无 deep import**（`src/` 里没有任何 `dsh-plugin-core/dist/…`）。36 个导入符号逐个对照入口导出，全部存在。
- 升级后 `pnpm --filter ./packages/plugin run verify` 零代码改动通过；`dist/client.js` 因内联新核心实现而重建（+1163/−322 行）。
- 文档行号随目录重构失效，已按 0.33.1 实包重核：`dist/explorer/open.d.ts` 的 `pickWorkspaceFile` 105→136、
  `placement` 75-92→105、`PickFilter` 170-175→170-173、`PickedPath` 161-172→161-168；
  源码出处 `src/explorer/*` → `src/adv/explorer/*`（「选当前目录」541-556→702-705，`translate` 137→145，i18n 字典 849-864→548,1058）。

## Conclusion

`dsh-plugin-core` 0.32.0 → 0.33.1 升级完成，**本项目源码零改动**：核心这次是内部目录重组 + 文档重组，
对外子路径与全部导出符号不变，唯一签名变化（`setLocale` 接受 `null`）我们没用到。
落盘变更：`packages/plugin/package.json`（`^0.33.1`）、`pnpm-lock.yaml`、重建的 `dist/client.js(.map)`、
`docs/design/external/dsh-plugin-core-explorer.md`（版本 + 路径 + 行号复核）。

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261105-0839-aaca-跟随-dsh-plugin-core-升级重构调整引用 --note "...". -->
- 2026-11-05 08:39:55 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · created and claimed
- 2026-11-05 08:42:25 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 升 dsh-plugin-core 0.32.0→0.33.1（packages/plugin/package.json ^0.33.1）；核心 exports 与 10 个入口导出符号和 0.32.0 全等、36 个导入符号齐 ⇒ 源码零改动，build+typecheck 过；external 文档行号按新包重核
