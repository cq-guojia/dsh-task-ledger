# 20261021-2120-log-close-写-worklog-前定向取最新-fc2d：log/close 写 worklog 前定向取最新

> **创建**：2026-10-21 21:20:18（@GuoJia-Agent）
> **分类**：修复 ｜ **标签**：同步、worklog

## 背景

用户原话：「log 可不一样，你不获取很容易忘的好吗？」——两台机器（家里 / 公司）各写 worklog，忘了 `git pull` 就接着写，`log` 会基于旧版「读全文 → 追加 → 写回」，把远端那次改动整段写没。

写前同步原本只刷 `progress.json` 与 `close` 的月历史文件（`managed` 列表），`worklog/` 只补「本地缺的新文件」，已有正文一个字不碰 —— 这是 20261021-1108 为防覆盖手写正文做的取舍，代价是同一 worklog 被别处改过时无人兜底。

## 待办

- 待用户验收：两台机器改同一 worklog 的场景，远端内容必须保住。

## 下一步

用户验收该看两件事：① 远端干净、本地落后时 `log` 自动快进、远端正文进得来；② 本地有手写未提交时 `log` 提示走 stash 叠回，合不了就中止并给处理步骤。

## 过程

**实证 bug 存在。** 临时仓复现：b 侧改 worklog 并推送 → a 侧（落后）手写正文未提交 → a 跑 `log`，结果 `REMOTE-MARK` 出现 0 次、`git status` 为 `ahead 1, behind 1`，rebase 撞冲突后 abort，远端那次改动在磁盘上消失。

**根因。** `git_presync` 的 `managed` 只含 `progress.json`，`record_exec`（`packages/skill/scripts/progress.py:2056-2061`）却是「读工作区全文 → 追加 → 全量写回」。`log` 必写 worklog、`close --category/--tags` 也写（`:2415-2418`），两者都基于旧版。

**方案分两层。** ① 本地干净时：ff 失败分支里对目标 worklog 走 `_stash_ff_worklog`（stash push → merge --ff-only → stash pop），手写内容与远端内容都保住，真冲突就留给 git 标出来；② 收尾处 `_presync_fetch_file` 兜一次单文件刷新，与 `progress.json` 同一口径。

**踩坑：第一版写成了死代码。** 最初只在 ff 之后加「干净才刷」，但 ff 成功时远端早已随 ff 进来，而 ff 失败恰恰因为 worklog 脏 —— 脏就跳过，等于永不触发。改成在 ff 失败分支里做 stash 叠回才真正覆盖场景。

**验证。** 同一临时仓复跑：`REMOTE-MARK` 1 次、`LOCAL-HANDWRITE` 1 次、`stash list` 有 1 条、状态 `UU` 且给出「解决冲突 → `git add` → `git stash drop`」的处理顺序。`npm run verify` 31 项通过（新增两条用例）；`koc-codelint` 六层全过（L3 格式经 `--fix` 后重跑）。

## 结论

- `log` / `close` 写已有 worklog 前，会先把它刷成远端最新；本地有手写改动时走 stash 叠回，两边内容都不丢。
- 两边真的改了同一处 → 中止本次命令、保留冲突标记与 stash，提示按「编辑 → `git add` → `git stash drop`」收尾；不允许静默用旧版覆盖。
- 新增用例压住回归：`写前同步：手写 worklog 撞远端同改，两边内容都保住`。
- 遗留：`close` 不带 `--category/--tags` 时不写 worklog 正文，不触发刷新（本就不需要）。

## 执行记录

<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。
     补记用 progress.py log --id <任务号> --note "一句话"。 -->
- 2026-10-21 21:20:18 · new · @GuoJia-Agent · 创建任务（doing）
- 2026-10-21 21:24:58 · log · @GuoJia-Agent · 写前对目标 worklog 走 stash 叠回，两边内容都保住；verify 31 项通过
