# 20261021-1108-修复写前预同步覆盖-worklog-正文-改为定向取最新-eca0：修复写前预同步覆盖 worklog 正文（改为定向取最新）

> **创建**：2026-10-21 11:08:43（@GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6）
> **状态**：closed · @GuoJia-Agent（8d557c6d-7c93-43ac-8c73-5d623e82e1c6） · 更新 2026-10-21 11:46:55
> ✅ 完成封卷：2026-10-21 11:46:55（@GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6）
> **分类**：基建 ｜ **标签**：台账、同步、数据安全

<!-- 「> **分类**：… ｜ **标签**：…」行由脚本按 new --category / --tags 插入；两者皆空则不写。 -->

## 背景

兄弟工作区 dsh-plugin-core 的 Agent 反馈：写满 worklog 正文后，每跑一次 `log`，正文就变回模板骨架，只有「执行记录」稳定累积。现场证据——该 worklog 的提交历史里 `new` 是 +32 行骨架，之后每次 `claim`/`log` 都只有 +1 行，正文从未进入任何一次提交。

根因在写前预同步：`git_presync()` 对**整个 `ledger/`** 执行 `git checkout <upstream> -- ledger/`，用远端版本覆盖工作树，本地未提交的正文被直接丢弃且无法恢复（从未 `git add` 过就没有 blob 可捞）。而 `SKILL.md:78` 教的就是「改完正文立刻 log」，两者必然相撞。`record_exec` 的「读全文→只追加末节」本身没问题，它读到的是已经被覆盖后的骨架。

## 待办

- 待用户验收：看 `npm run verify` 的 28 项（新增「写前同步」与「内嵌副本一致」两条）、看 `packages/skill/scripts/progress.py` 里 `_presync_guard` 的三道中止条件
- 版本号与 tag 等用户统一指令，本轮未 bump（`SKILL.md` 的 version 行仍是 1.2.6，统一升级时一并处理）

## 下一步

先补 `packages/plugin/scripts/smoke.mjs` 的 git 远端用例（bare remote + 两份 clone），再改文档，最后 build + verify。

## 过程

- 判定：不是编辑工具未落盘、不是 BOM。`record_exec` 是「基于磁盘当前内容追加」，若磁盘是满的就会保留；真正丢正文的是它前面的 `git checkout`。
- 采用「定向取最新」：只取 `ledger/progress.json` 与 `ledger/history/`（脚本独占写），`ledger/worklog/` 只补远端有、本地缺的新文件，已有文件一个字不碰。
- 实现方式改为读 blob 再落盘（`git cat-file blob <upstream>:<path>` + `write_text_atomic(track=False)`）：只碰工作树、不动 index，因此不依赖 `git restore`（2.23+），也不需要 `git reset` 收尾。
- 三道中止护栏：有未推送的台账提交、已跟踪文件有未提交改动、本地未入库但远端同名——命中就报错，绝不静默覆盖。未推送提交那条防的是「取最新把上次 push 失败的提交内容回退掉」。
- 连带修复：`cmd_close` 不再在 worklog 丢失时按模板造空骨架封卷；`validate` 对「正文仍是骨架」打印提示（不改退出码）；`cmd_new` 失败撤销时清空 `CHANGED_FILES`，避免提交半成品；`git add` 返回码补检查；`append_exec_log` 的 `rstrip()` 收窄为 `rstrip("\n")`；`find_repo` 对子目录入参向上找台账根。
- `git_sync` 的推送兜底改成「工作树干净才自动 rebase，冲突立刻 abort」：各自改各自的任务时按行自动合并，同一条任务冲突就干净失败，不留 rebase 中间态。
- 验证：新增 smoke 用例覆盖六类场景（`packages/plugin/scripts/smoke.mjs` 的「写前同步」）；`npm run verify` 28 项通过；`koc-codelint` 六层全过。ruff 报的 PLW1510 / PIE810 已修，`.ruff_cache` 已清。
- 另有独立提交：上次失败中断留下的 `updated` 残留先补齐提交并推送，才继续后续写操作（新护栏要求台账先干净）。

- 收窄历史层刷新范围（用户要求「只刷要写的那一个文件」）：不再枚举 `ledger/history/` 整个目录，只有 `close` 按结案月（`--finished` 补录旧月份就用那个月）刷一个文件；其他写命令完全不动历史层。
- 收窄时踩到两个连带坑：① presync 补下的 worklog 新文件如果不入 `CHANGED_FILES`，会以未跟踪状态留在工作树，之后 `git rebase` 直接被它挡住（`untracked working tree files would be overwritten by checkout`）——改成 `track=True` 随本次提交入库；② `_rebase_retry` 的干净检查改为 `--untracked-files=no`，只看已跟踪文件的改动，避免无关未跟踪文件阻止自动合并。
- 另一个认知：`rebase` 是整仓操作，会把远端那次提交里的其他月历史文件和别人的 worklog 一并合进工作树——所以「只刷目标月」只约束写前同步的主动写入，验证用结构断言（`smoke.mjs` 的「history 不整目录枚举」）守，不用运行时断言。

## 结论

- 写前同步改为**定向取最新**：只刷 `ledger/progress.json` 与 `ledger/history/`，`worklog/` 只补本地缺的新文件。实测「手写正文 → log」正文原样保留、执行记录正常追加，原 bug 不再复现。
- 三道中止护栏实测生效：脏 `progress.json` 时非 0 退出且文件字节不变；有未推送台账提交时非 0 退出且 HEAD 不变；`--no-sync` 与离线场景仍能正常写。
- 连带修复：`cmd_close` 不再造空骨架封卷；`validate` 对骨架正文给提示；`cmd_new` 失败撤销时清 `CHANGED_FILES`；`git add` 返回码补检查；`find_repo` 对子目录入参向上找台账根。
- 遗留：内嵌副本与源在 `SKILL.md` version 行上仍未对齐（等统一升版一并处理）；跨机同时改同一条任务仍需人工合并（已按用户口径写进 README / troubleshooting）。
- **本轮未发版**，版本号与 tag 等用户统一指令。

## 执行记录

<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。
     补记用 progress.py log --id <任务号> --note "一句话"。 -->
- 2026-10-21 11:08:43 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 创建任务（doing）
- 2026-10-21 11:11:27 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 重写写前预同步：只定向取 progress.json 与 history，worklog 只补缺失新文件，另加三道中止护栏
- 2026-10-21 11:18:17 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 补 smoke 六场景用例、verify.yml、副本一致性检查；verify 28 项与 codelint 全过，正文保留已验证
- 2026-10-21 11:36:42 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 历史层收窄为 close 只刷结案月文件；补下 worklog 改为入库、rebase 干净检查排除未跟踪；verify 29 项与 codelint 全过
- 2026-10-21 11:46:55 · close · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 结案：写前同步改为定向取最新：只刷 progress.json 与结案月历史，worklog 只补本地缺的新文件；三道护栏（未推送提交／未提交改动／未入库同名）命中即中止；29 项 smoke 通过，原 bug 不复现
