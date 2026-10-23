# 20261023-1117-重写-skill-的-skill-md-适配分片台账-去冗余-纯执行导向-3637：重写 skill 的 SKILL.md：适配分片台账、去冗余、纯执行导向

> **创建**：2026-10-23 11:17:54（@cqguojia@hotmail.com）
> **分类**：文档 ｜ **标签**：skill、提示词

<!-- 「> **分类**：… ｜ **标签**：…」行由脚本按 new --category / --tags 插入；两者皆空则不写。 -->

## 背景

用户要求重写 `packages/skill/SKILL.md`：代码已全量重构为分片台账（ledgerkit 四层包），文档还按重构前逻辑写，且冗余。用户原话：「下面的按需读，别全读」「他要理解为什么？他要不要理解理解人类的起源啊」——执行者不需要设计原理，照做即可。本轮只梳理、不动手，重写等授权。

## 待办

- 用户 review 新落的 4 个文件（种子 132 行 / 12.3 KB；references 3 个共 15.5 KB），按反馈改
- README.md 待同步：references 索引（6→3）、design.md 死链（用户明确「其他文件不用管」，暂未动）
- design.md 的 WHY 论证（在 references.bak/design.md）要不要进仓库 docs/design/，待用户定
- 重建插件内嵌副本前先删 SKILL.md.bak 与 references.bak/，否则会被 copy-skill 拷进插件、check-skill-copy 报 extra
- 发版前：版本 bump（SKILL.md frontmatter 与 package.json 现均为 1.3.0，保持同值再升）+ AGENTS.md 要求的 skill-v / plugin-v 双 tag（等用户明说发版）

## 下一步

等用户对本轮梳理拍板 → 重写草稿先在对话里过一遍 → 落盘 → build:host → verify

## 过程

专家组会诊（三位并行只读专家）+ 主持人复核：

- 提示词专家：SKILL.md 143 行 / 13 KB；「只由脚本写」重复 4 处、「改正文必配 log」同一规则出现 3 遍、tags 归并流程写 2 遍；design.md 17.8 KB 纯 WHY，是用户暴怒点
- 过程逻辑专家：通读 ledgerkit 全量，列出 SKILL.md vs 代码 17 处硬伤（结论节列 operationally 关键的）
- skill 专家：smoke.mjs:934-968 七条断言是重写护栏；check-skill-copy 当前已红（插件内嵌副本过期：README 25.61 KB vs 源 3.22 KB、缺 design.md 行、脚本字节差异）；verify.yml:51 引用了不存在的 packages/skill/tests/test_git_merge.py
- 主持人实测复核：set_task.py:42-49（release 走 `set --owner ""`）、release.py:31-37（释放不清 started）、worklog_md.py:88-96（执行记录行 = fmt_local 本机本地时间）、gitops.py:191-225（无「自动补推再写」，未推送台账提交直接 Fail）

第二轮（按用户指令备份 + 清空 + 通读 + 定结构）：

- 备份 `SKILL.md → SKILL.md.bak`、`references/ → references.bak/`（md5 逐字节核验一致），随后清空原目录（原件已删，可随时从 .bak 或 git 恢复）
- 通读全部 7 个备份文件，新增定性 3 处文档 vs 代码矛盾：① 身份读不到 git 邮箱**不报错**，走兜底链 + 一条提示、命令照常成功（env.py:74-84；SKILL.md:73 / state-model.md:59 / design.md:91 / troubleshooting.md:17 四处全错）；② `new --self` 建出来 `status=open` 不是 doing（new_task.py:67；state-model.md:17 错）；③ `tags --all` 输出是 `键(值)` 计数不是两列表、统计对象含已封卷文档（render.py:182-190；SKILL.md:56/:119 错）

第三轮（用户授权「按照你说的先落」，只管 skill、不碰其他文件）：

- 落盘 4 个文件：`SKILL.md`（种子，纯执行导向，20 处硬伤全修）+ `references/state-model.md` + `references/troubleshooting.md` + `references/log-note.md`（原样保留）；worklog.md / taxonomy.md 的必备内容并入种子；design.md 未重建（全部旧文件在 *.bak 里）
- 验证：复刻 smoke.mjs:934-968 文档断言 8/8 过（name / description>20 / `# task-ledger` / progress.py / claim / 占位符全替换 / python3 行正则 + 脚本真实存在 / version 与 package.json 一致）；残留错误口径扫描 3 处命中均为校正后的否定句（`tags --all` 误报 / `--status blocked` 匹配不到 / 没有自动补推）
- 体积：种子 143 行 13.4 KB → 132 行 12.3 KB；references 6 个 37.5 KB → 3 个 15.5 KB；design.md 17.8 KB 移出包。种子降幅有限是因为并入了 worklog / taxonomy 的每次必备内容 —— 赢在零重复规则 + 按需分支真的按需

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

**结构定稿（通读后的分派）**：skill 包 = **1 种子 + 3 分支，共 4 个说明文件**。判据三选一：每次任务都要用 → 种子；特定情况才用 → 分支；执行者永远不需要（WHY / 维护信息）→ 踢出 skill 包。

- 种子 `SKILL.md`（~105 行）：意图→命令表（17 处硬伤全修）+ 铁律 6 条 + 收工三步 + 过程文档（worklog.md 并入：六节表 / 执行记录格式 / 编辑三步 / 封卷）+ 分类与标签（taxonomy.md 并入）+ 写操作红线表 + 出错即停 4 条。守住 smoke.mjs:934-968 七条断言（name / description>20 / `# task-ledger` / progress.py / claim / 占位符全替换 / 命令行可解析）
- 分支 `references/troubleshooting.md`：任何非 0 退出、退出码 0 但有提示、并发冲突、validate 报错时读。退出码表 + 错误→处置映射（校正：无自动补推、log 丢文档只提示不退 1、validate 不查 pool 缺失/历史列数）+ 同步机制段（取最新范围 / guard 三查 / 仓级锁 / --no-sync 与 TASK_LEDGER_NO_SYNC / git≥2.27）
- 分支 `references/state-model.md`：传 --created/--finished 补录、见旧 blocked、答「停太久」、看 --json 时间字段时读。状态机全图（校正：release = `set --owner ""`、不清 started、new --self 是 open）+ 三标记 + 时间口径（校正：执行记录/封卷行是本机本地时间，UTC 的只有 JSON/任务号/文件名/历史行/头部创建行）+ 任务号 + 身份（校正：兜底链不报错）。砍掉「文件结构 / JSON schema」段——执行者被禁读这些文件，属维护信息
- 分支 `references/log-note.md`：拿不准一条记录够不够格、--note 不会写时读。原样保留（6 个里最合格的一个）
- 删 `design.md`（纯 WHY）。删前必搬 6 处独有执行口径：① 任务号 4 位随机码的理由（防与已结案文档同名）→ state-model；② 时区全链路 → state-model（按代码校正）；③ 历史列序 / 按月归档 / 存量 PROGRESS-HISTORY 只读 → state-model；④ worklog 头部只写不会变的东西（状态/owner 以 JSON 为准）→ 种子；⑤ 结案原子顺序 + 失败整体回滚 → troubleshooting；⑥ 分类/标签行由脚本插入、两者皆空则不写 → 种子
- WHY 本体归仓库 docs/design/（并入 architecture.md / ledger-data.md 还是单独一篇登记进 docs/README.md，待用户定）
- 不新增 commands.md：`--help` 就是参数真源，手写第二份必腐烂——本次 20 处硬伤大部分源自手写参数面

## 执行记录

<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。
     补记用 progress.py log --id <任务号> --note "一句话"。 -->
- 2026-10-23 19:17:54 · new · @cqguojia@hotmail.com · 创建任务
- 2026-10-23 19:30:51 · log · @cqguojia@hotmail.com · 专家组会诊+代码复核：SKILL.md 与分片台账 17 处硬伤（release 语义/时区/list 参数/自动补推/traceback 边…），定目标结构：正文 ~105 行纯执行、references 6→3、design.md 移出；等用户拍板后重写
- 2026-10-23 19:48:28 · log · @cqguojia@hotmail.com · 备份+清空+通读 7 文件：结构定为 1 种子+3 分支共 4 个；新定性 3 处矛盾（身份兜底不报错/new --self=open/tags 计数）；design.md 6 处口径列了搬迁清单
- 2026-10-23 20:00:58 · log · @cqguojia@hotmail.com · 落盘 4 文件：种子 132 行纯执行（20 处硬伤全修）+ references 6→3；smoke 等价断言 8/8 过；design.md 未重建等用户定去向；README/版本/插件副本按「其他文件不用管」未动
