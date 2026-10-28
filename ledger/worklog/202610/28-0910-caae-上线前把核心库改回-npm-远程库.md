# 20261028-0910-caae-上线前把核心库改回-npm-远程库：上线前把核心库改回 NPM 远程库

- **标签**：dsh-plugin-core、本地链接、依赖切换
- **状态**：doing · 2026-10-28 15:40:26 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **创建**：2026-10-28 09:10:47 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6

<!-- 头部四行由脚本维护，顺序固定：标签 → 状态 → 创建 → 封卷。
     「- **标签**：…」按 new --tags 插在最上面，没有标签就不写（分类只进台账与历史，不进本文档）；
     「- **封卷**：…」在结案时加在最后。 -->

## 背景

开发期 `packages/plugin/package.json` 用 `file:../../../dsh-plugin-core` 本地链接核心库（改完本地立即生效、避开 npm 发布几分钟的传播延迟）。**发版前必须切回 NPM 远程库**，否则发布物依赖本地路径、消费者装不上。触发原话：用户「上线前需要把本地引用的核心库变成 NPM 上的远程库」。

## 待办

- 核心库 `dsh-plugin-core` 先 `npm publish` 到 ledger 使用的 registry（dev 目前用本地 0.7.4）。
- 把 `packages/plugin/package.json`（dependencies 段）的 `"dsh-plugin-core"` 从 `file:../../../dsh-plugin-core` 改为远程版本（`latest` 或精确版本）。
- 确认 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 含该发布版本（pnpm 只认精确版本，否则被「最小发布年龄」挡回旧版）。
- `pnpm install` 后确认解析到 `node_modules/.pnpm/dsh-plugin-core@<ver>`（无 `file+`），再 build/verify。
- 可选：评估「dev 本地 / 发版远程」自动化（`workspace:*` + pnpm publish 自动替换版本，或 `pnpm.overrides` 指向本地、发布前移除）。

## 下一步

发版时依次：核心 `npm publish` → 改 `packages/plugin/package.json` 依赖为远程版本 → `pnpm update dsh-plugin-core` → `npm run verify`。

## 过程

<!-- 踩坑与证据：带 revision + 文件:行号 或符号名 -->

## 结论

<!-- 做成了什么、留了什么坑 -->

## 执行记录

<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。
     补记用 progress log --id <任务号> --note "一句话"。 -->
- 2026-10-28 09:10:47 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 创建任务
- 2026-10-28 15:40:26 · claim · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 认领 → doing
