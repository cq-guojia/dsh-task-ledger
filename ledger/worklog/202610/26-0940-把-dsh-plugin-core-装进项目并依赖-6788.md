# 20261026-0940-把-dsh-plugin-core-装进项目并依赖-6788: 把 dsh-plugin-core 装进项目并依赖

- **Tags**: 重构, dsh-plugin-core, 依赖安装, 基础组件
- **Status**: done · 2026-10-26 09:45:56 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **Created**: 2026-10-26 09:40:36 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **Sealed**: 2026-10-26 09:45:56 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

用户决定把 UI 重构建立在自有基础包 `dsh-plugin-core` 之上（DSH 插件的 UI / 控件 / 工作区组件底座），本任务是先把该库装进本仓库、让插件包依赖它，属 UI 重构的前置步骤，不改具体 UI。

## To Do

- 后续 UI 改写时才 `import` `dsh-plugin-core/ui`、`/design`；届时检查 tree-shaking 与 `dist/client.js` 体积。
- dsh-plugin-core 再发新版时，pnpm 的 minimumReleaseAge 冷却会拦新版本，需按需在 `pnpm-workspace.yaml` 追加 `minimumReleaseAgeExclude`。

## Next

在 `packages/plugin/src/client/` 内按需引入 `dsh-plugin-core/ui`（先接一个组件验证渲染与样式注入），并对比构建前后 `dist/client.js` 体积。

## Process

- 2026-10-26：`pnpm --filter ./packages/plugin add dsh-plugin-core` 首次只解析到 `0.3.0`（0.4.0 于 09:23Z 刚发布，被 pnpm 12 的 minimumReleaseAge 供应链冷却挡下）；改为显式 `dsh-plugin-core@0.4.0` 后装上，pnpm 自动在 `pnpm-workspace.yaml` 写入 `minimumReleaseAgeExclude: [dsh-plugin-core@0.4.0]`。
- 结果：`packages/plugin/package.json` 增加 `dependencies.dsh-plugin-core: ^0.4.0`，实装 `0.4.0`；`pnpm-lock.yaml` +476 行；`packages/skill` 未改动。
- 构建侧事实：`packages/plugin/tsdown.client.config.ts:12-22` 的 `PLATFORM_MODULES` 不含 `dsh-plugin-core`，`alwaysBundle`（:43-44）会把它及依赖内联进单文件 `dist/client.js`；react 在 `PLATFORM_MODULES` 内保持 `require` 外部化，不重复打包。

## Conclusion

- 已用 pnpm 从 npm registry 把 `dsh-plugin-core@0.4.0` 装进 `packages/plugin`，依赖已锁定；`packages/skill` 不受影响。
- 本次仅声明依赖、尚无代码 import，构建产物未变化；体积 / 样式等风险在后续真正引入组件时才显现。

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id <id> --note "...". -->
- 2026-10-26 17:40:36 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · created and claimed
- 2026-10-26 17:41:58 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · pnpm add 装 dsh-plugin-core@0.4.0 到 packages/plugin（package.json ^0.4.0，lock +476 行）；0.4.0 被 minimumReleaseAge 冷却拦过，已在 pnpm-workspace.yaml 记 exclude；skill 包未动
- 2026-10-26 17:45:56 · close · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · sealed
