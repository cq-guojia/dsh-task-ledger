# 20261028-0910-caae-上线前把核心库改回-npm-远程库：上线前把核心库改回 NPM 远程库

- **标签**：dsh-plugin-core、本地链接、依赖切换
- **状态**：doing · 2026-10-28 15:41:03 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **创建**：2026-10-28 09:10:47 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6

<!-- 头部四行由脚本维护，顺序固定：标签 → 状态 → 创建 → 封卷。
     「- **标签**：…」按 new --tags 插在最上面，没有标签就不写（分类只进台账与历史，不进本文档）；
     「- **封卷**：…」在结案时加在最后。 -->

## 背景

开发期 `packages/plugin/package.json` 用 `file:../../../dsh-plugin-core` 本地链接核心库（改完本地立即生效、避开 npm 发布几分钟的传播延迟）。**发版前必须切回 NPM 远程库**，否则发布物依赖本地路径、消费者装不上。触发原话：用户「上线前需要把本地引用的核心库变成 NPM 上的远程库」。

## 待办

（已全部做完，见「结论」；只剩可选那一条自动化没做，见下）

- 可选（未做）：「dev 本地 / 发版远程」自动化（`workspace:*` + pnpm publish 自动替换版本，或 `pnpm.overrides` 指向本地、发布前移除）——现在仍是**手工切一次**，切完要记得 `pnpm install` 更新 lockfile。

## 下一步

发版前按同一顺序再走一遍：核心 `npm publish` → 改 `packages/plugin/package.json` 依赖为远程版本 → `pnpm-workspace.yaml` 白名单补该版本 → `pnpm install` → `npm run verify`。

## 过程

- 触发：GitHub Actions `Verify` 连续几笔提交都在第一步红掉 —— `pnpm install --frozen-lockfile` 报 `ENOENT: no such file or directory, scandir '/home/runner/work/dsh-task-ledger/dsh-plugin-core'`。CI 只 checkout 本仓，仓库**外**那个 `file:` 目录不存在，装都装不上。
- 切换（`ea7348e`）：`packages/plugin/package.json` 的 `"dsh-plugin-core"` 由 `file:../../../dsh-plugin-core` 改回 `^0.8.3`（registry `dist-tags.latest` 实测就是 0.8.3，与本地核心同版本）；`pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 并集补 `0.8.3`（pnpm 12 默认「最小发布年龄」，不在白名单会被挡回旧版）；`pnpm install` 更新 lockfile（原 `dsh-plugin-core@file:../dsh-plugin-core` 条目变成 `dsh-plugin-core@0.8.3`，全库再无 `file:` 引用）。
- 验证：`pnpm install --frozen-lockfile` 过（就是 CI 报红的那一步）、`pnpm --filter dsh-task-ledger run verify` 过（build + 双 tsc）、codelint 六层全过；`dist/` 按远程版 0.8.3 重建并入库。
- 版本口径：CI 用 pnpm v9、本机 12.3.4，但 lockfile 仍是 `9.0` 格式、没有写进只有 12 认得的 settings ⇒ `--frozen-lockfile` 两边通用。

## 结论

`packages/plugin` 已改为依赖 NPM 远程库 `dsh-plugin-core@^0.8.3`，CI 的安装步骤不再指向仓外目录；`ea7348e` 已推送。留下的坑：核心库改版后要**手工**走「publish → 改版本 → 补白名单 → install → verify」，没有自动化（可选那条待办）。

## 执行记录

<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。
     补记用 progress log --id <任务号> --note "一句话"。 -->
- 2026-10-28 09:10:47 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 创建任务
- 2026-10-28 15:40:26 · claim · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 认领 → doing
- 2026-10-28 15:41:03 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 认领并收尾：依赖由 file: 改回 npm ^0.8.3、白名单补 0.8.3、lockfile 更新；frozen-install + verify + codelint 全过，ea7348e 已推送
