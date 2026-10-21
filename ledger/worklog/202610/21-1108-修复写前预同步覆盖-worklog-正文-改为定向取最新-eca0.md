# 20261021-1108-修复写前预同步覆盖-worklog-正文-改为定向取最新-eca0：修复写前预同步覆盖 worklog 正文（改为定向取最新）

> **创建**：2026-10-21 11:08:43（@GuoJia-Agent）
> **分类**：基建 ｜ **标签**：台账、同步、数据安全

<!-- 「> **分类**：… ｜ **标签**：…」行由脚本按 new --category / --tags 插入；两者皆空则不写。 -->

## 背景

兄弟工作区 dsh-plugin-core 的 Agent 反馈：写满 worklog 正文后，每跑一次 `log`，正文就变回模板骨架，只有「执行记录」稳定累积。现场证据——该 worklog 的提交历史里 `new` 是 +32 行骨架，之后每次 `claim`/`log` 都只有 +1 行，正文从未进入任何一次提交。

根因在写前预同步：`git_presync()` 对**整个 `ledger/`** 执行 `git checkout <upstream> -- ledger/`，用远端版本覆盖工作树，本地未提交的正文被直接丢弃且无法恢复（从未 `git add` 过就没有 blob 可捞）。而 `SKILL.md:78` 教的就是「改完正文立刻 log」，两者必然相撞。`record_exec` 的「读全文→只追加末节」本身没问题，它读到的是已经被覆盖后的骨架。

## 待办

- 补齐 smoke 用例（远端取最新 / 正文保留 / 脏中止 / 未推送中止 / worklog 补缺 / --no-sync / 只读不触发 / 离线）
- 新增 `.github/workflows/verify.yml`（push/PR 跑 `npm run verify`），不动 publish.yml
- 文档四份改口径：`packages/skill/README.md`、`SKILL.md`、`references/troubleshooting.md`、`--no-sync` help
- `npm run build:host` 同步内嵌副本 → `npm run verify` + `koc-codelint`
- 版本号与 tag 等用户统一指令，本轮不 bump

## 下一步

先补 `packages/plugin/scripts/smoke.mjs` 的 git 远端用例（bare remote + 两份 clone），再改文档，最后 build + verify。

## 过程

- 判定：不是编辑工具未落盘、不是 BOM。`record_exec` 是「基于磁盘当前内容追加」，若磁盘是满的就会保留；真正丢正文的是它前面的 `git checkout`。
- 采用「定向取最新」：只取 `ledger/progress.json` 与 `ledger/history/`（脚本独占写），`ledger/worklog/` 只补远端有、本地缺的新文件，已有文件一个字不碰。
- 实现方式改为读 blob 再落盘（`git cat-file blob <upstream>:<path>` + `write_text_atomic(track=False)`）：只碰工作树、不动 index，因此不依赖 `git restore`（2.23+），也不需要 `git reset` 收尾。
- 三道中止护栏：有未推送的台账提交、已跟踪文件有未提交改动、本地未入库但远端同名——命中就报错，绝不静默覆盖。未推送提交那条防的是「取最新把上次 push 失败的提交内容回退掉」。
- 连带修复：`cmd_close` 不再在 worklog 丢失时按模板造空骨架封卷；`validate` 对「正文仍是骨架」打印提示（不改退出码）；`cmd_new` 失败撤销时清空 `CHANGED_FILES`，避免提交半成品；`git add` 返回码补检查；`append_exec_log` 的 `rstrip()` 收窄为 `rstrip("\n")`；`find_repo` 对子目录入参向上找台账根。
- `git_sync` 的推送兜底改成「工作树干净才自动 rebase，冲突立刻 abort」：各自改各自的任务时按行自动合并，同一条任务冲突就干净失败，不留 rebase 中间态。

## 结论

核心改动已落地并通过语法检查与只读命令验证；待补测试与文档。**本轮尚未发版**，版本号与 tag 等用户统一指令。

## 执行记录

<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。
     补记用 progress.py log --id <任务号> --note "一句话"。 -->
- 2026-10-21 11:08:43 · new · @GuoJia-Agent · 创建任务（doing）
- 2026-10-21 11:11:27 · log · @GuoJia-Agent · 重写写前预同步：只定向取 progress.json 与 history，worklog 只补缺失新文件，另加三道中止护栏
