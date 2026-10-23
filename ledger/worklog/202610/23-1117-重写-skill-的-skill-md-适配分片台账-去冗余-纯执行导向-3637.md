# 20261023-1117-重写-skill-的-skill-md-适配分片台账-去冗余-纯执行导向-3637：重写 skill 的 SKILL.md：适配分片台账、去冗余、纯执行导向

> **创建**：2026-10-23 11:17:54（@cqguojia@hotmail.com）
> **分类**：文档 ｜ **标签**：skill、提示词

<!-- 「> **分类**：… ｜ **标签**：…」行由脚本按 new --category / --tags 插入；两者皆空则不写。 -->

## 背景

用户要求重写 `packages/skill/SKILL.md`：代码已全量重构为分片台账（ledgerkit 四层包），文档还按重构前逻辑写，且冗余。用户原话：「下面的按需读，别全读」「他要理解为什么？他要不要理解理解人类的起源啊」——执行者不需要设计原理，照做即可。本轮只梳理、不动手，重写等授权。

## 待办

- 用户拍板：release 语义按代码事实改（唯一释放路径是 `set --owner ""`）；`set --owner <别人>` 仍定为看板/维护者通道、agent 不用
- 用户拍板：`references/design.md` 的去向（删出 skill 包；WHY 论证并入仓库 `docs/design/` 还是直接删）
- 用户拍板：references 定为 3 个（log-note / troubleshooting / state-model），worklog.md / taxonomy.md 并回 SKILL.md
- 授权后：重写 SKILL.md（守住 smoke.mjs:934-968 七条断言）→ 校正 state-model.md / troubleshooting.md → 删 design.md / worklog.md / taxonomy.md → `packages/plugin` 跑 build:host 重建内嵌副本 → check-skill-copy + verify
- 发版前：SKILL.md frontmatter version 与 package.json 同步；AGENTS.md 要求改 skill 须同时升 skill-v 与 plugin-v 两个 tag（等用户明说发版）

## 下一步

等用户对本轮梳理拍板 → 重写草稿先在对话里过一遍 → 落盘 → build:host → verify

## 过程

专家组会诊（三位并行只读专家）+ 主持人复核：

- 提示词专家：SKILL.md 143 行 / 13 KB；「只由脚本写」重复 4 处、「改正文必配 log」同一规则出现 3 遍、tags 归并流程写 2 遍；design.md 17.8 KB 纯 WHY，是用户暴怒点
- 过程逻辑专家：通读 ledgerkit 全量，列出 SKILL.md vs 代码 17 处硬伤（结论节列 operationally 关键的）
- skill 专家：smoke.mjs:934-968 七条断言是重写护栏；check-skill-copy 当前已红（插件内嵌副本过期：README 25.61 KB vs 源 3.22 KB、缺 design.md 行、脚本字节差异）；verify.yml:51 引用了不存在的 packages/skill/tests/test_git_merge.py
- 主持人实测复核：set_task.py:42-49（release 走 `set --owner ""`）、release.py:31-37（释放不清 started）、worklog_md.py:88-96（执行记录行 = fmt_local 本机本地时间）、gitops.py:191-225（无「自动补推再写」，未推送台账提交直接 Fail）

## 结论

**硬伤 top 6**（全文 17 处，详见各组报告）：

1. release 语义整节错：文档说 `set --status open` 搬回 pool.json——实际只改状态、任务仍留我的分片；真释放 = `set --owner ""`（空串）。且 SKILL.md:74 把 `set --owner` 当「死代码，agent 一律不得使用」，照文档执行的 agent 连唯一释放路径都不敢用
2. 时间口径错：SKILL.md:95 说执行记录时间是 UTC——实际是本机本地时间（worklog_md.py:88-96）；UTC 的只有台账 JSON、任务号、文件名、历史行、worklog 头「创建」行
3. `list` 没有 `--all`（默认即池 + 全部分片）；`--owner me` 不存在（精确邮箱匹配）；`--status blocked` 一条都匹配不到（读侧归一为 doing）
4. 「未推送台账提交先自动补推再写」不存在：写前 guard 直接 Fail（gitops.py:212-218）
5. owner 读不到不报错：兜底链 USER/LOGNAME/getpass/主机名/"default"（env.py:55-84）
6. 返回形态错：`show` 全文仅 `show --json` 给；claim/set 不回 worklog；commit 失败退 1 不是 0，只有 push 失败退 0

**目标结构（已裁两位专家分歧）**：

- SKILL.md 砍到 ~105 行 / 8 KB：意图→命令表修硬伤后保留为核心；铁律压 6 条、删理由从句；worklog/taxonomy 的执行必备内容并回正文；出错即停压 4 条
- references 6 → 3：留 log-note（拿不准时查）、troubleshooting（扩，吸收同步机制段）、state-model（留但按代码校正）；删 design.md（WHY 无受众，独有执行口径先搬 state-model）、worklog.md、taxonomy.md（并回 SKILL.md）
- 不新增 commands.md：`--help` 就是参数真源，手写第二份必腐烂——本次 17 处硬伤大部分正是手写参数面的腐化
- design.md 的 WHY 部分归仓库 docs/design/（人看的世界），执行口径搬 state-model.md

## 执行记录

<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。
     补记用 progress.py log --id <任务号> --note "一句话"。 -->
- 2026-10-23 19:17:54 · new · @cqguojia@hotmail.com · 创建任务
- 2026-10-23 19:30:51 · log · @cqguojia@hotmail.com · 专家组会诊+代码复核：SKILL.md 与分片台账 17 处硬伤（release 语义/时区/list 参数/自动补推/traceback 边…），定目标结构：正文 ~105 行纯执行、references 6→3、design.md 移出；等用户拍板后重写
