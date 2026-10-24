# 20261023-1117-重写-skill-的-skill-md-适配分片台账-去冗余-纯执行导向-3637：重写 skill 的 SKILL.md：适配分片台账、去冗余、纯执行导向

> **创建**：2026-10-23 11:17:54（@cqguojia@hotmail.com）
> **分类**：文档 ｜ **标签**：skill、提示词

<!-- 「> **分类**：… ｜ **标签**：…」行由脚本按 new --category / --tags 插入；两者皆空则不写。 -->

## 背景

用户要求重写 `packages/skill/SKILL.md`：代码已全量重构为分片台账（ledgerkit 四层包），文档还按重构前逻辑写，且冗余。用户原话：「下面的按需读，别全读」「他要理解为什么？他要不要理解理解人类的起源啊」——执行者不需要设计原理，照做即可。本轮只梳理、不动手，重写等授权。

## 待办

- 讨论轮结论（用户不懂 skill 编写，要求自行参考专业规范裁定，不再问用户）：① 命令参考内联种子（pdf 按频率拆分 + <500 行预算 + 用户偏好）；② 纪律三合一（数据完整性/人类授权/故障处置，mgechev 反模式依据）；③ 举例只在命令参考、生命周期只写何时调什么；④ 书写体改命令式祈使句（skill-creator + mgechev 明确要求）；⑤ claim/doing 文档按代码现状写，bug 单独报
- **claim 不置 doing 已修复**（第六轮，用户拍板「改」）：claim.py:56 认领即置 doing（旧 blocked 池里任务也可认领、非 open/blocked 拒绝并指向 validate），执行记录写「认领 → doing」；new_task.py:67/73 `--self` 建出来即 doing + started（「建并认领」一个命令组合完成，不留半成品）；smoke.py 补 4 条断言（new --self 三状 + claim 后 doing）。4 个测试文件全过、koc-codelint 仅剩 .bak 一条（用户指令保留，提交/重建前删）
- **release 不清 started —— 拍板：不改，这是特性**（用户外卖模型）：逾期时钟从**首次认领**跑到结案，转手不重置——「释放→再认领刷新时钟」是作弊向量（眼看要超时，释放掉再领回来就不逾期了），现代码全程没有重置 started 的路径（release 不清、claim 的 `or now()` 只在空时盖、set 只在空时补），正好防住。用户原话：「中间骑手随便转单，我只看出餐到我手有没有超时」「他没做好你接了，就是超时了，你俩都算超时，责任怎么看是看板的事」。责任归属数据在执行记录流水（谁认领 / 谁释放逐笔有记录），计时器只回答「这单迟没迟」
- **因此变陈旧的四处**（文档修正时处理，不动代码）：插件注释 ledger-write.service.ts:39-42「owner / started 清空」、旧 state-model.md:18「释放清 started」、旧 SKILL.md 同类表述。新 references/state-model.md 写正确语义：started = 首次认领时间、释放不清、重新认领不刷新
- 用户 review 第一版 4 文件后的结构意见已进骨架草案 v2，定稿后重写
- README.md 待同步：references 索引（6→3）、design.md 死链（用户明确「其他文件不用管」，暂未动）
- design.md 的 WHY 论证（在 references.bak/design.md）要不要进仓库 docs/design/，待用户定
- 重建插件内嵌副本前先删 SKILL.md.bak 与 references.bak/，否则会被 copy-skill 拷进插件、check-skill-copy 报 extra
- 发版前：版本 bump（SKILL.md frontmatter 与 package.json 现均为 1.3.0，保持同值再升）+ AGENTS.md 要求的 skill-v / plugin-v 双 tag（等用户明说发版）

## 下一步

- 插件内嵌副本重建（packages/plugin 跑 build:host）：先删 SKILL.md.bak 与 references.bak/，否则会被 copy-skill 拷进插件、check-skill-copy 报 extra；重建后跑 check-skill-copy + npm run verify
- README.md 同步：references 索引（6→3）、design.md 死链
- 插件注释 ledger-write.service.ts:39-42「owner / started 清空」按外卖计时器模型改口（动了插件要重建）
- 发版前：版本 bump（frontmatter 与 package.json 现均为 1.3.0）+ skill-v / plugin-v 双 tag（等用户明说发版）

## 结论（补充）

第七轮文档重写落地（4 文件定稿）：SKILL.md 253 行 / 17.2 KB，7 节结构 —— 什么时候用 / 台账文件（表 + 禁手改与唯一可手写两条边界）/ 命令参考（10 方法各：参数表 + 干什么 + 举例；分类标签口径并入 new）/ 怎么调用（纯机制）/ 任务生命周期（9 步，含「我们来做 X」决策树：先 list --mine → 池里有先问「未认领，认领吗」→ 都没有才 new --self）/ 过程文档（唯一可手写 + 六节表 + 收工三步）/ 纪律（数据完整性 / 人类授权 / 故障处置三子块，每规一条只出现一次）/ references（3 行）。state-model.md 校正（认领即 doing、new --self 即 doing、started 外卖计时器不清）；troubleshooting.md、log-note.md 沿用已校正版。验证：smoke 等价断言 8/8 + 祈使句无「你」+ 陈旧口径零残留 + 「禁手改」规则全文仅 1 处

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

第四轮（用户对第一版提结构意见「写到哪算哪没逻辑」+ 外部调研 + 代码核实）：

- 用户目标结构：文件结构（表 + 禁手改/可手写各一句）→ 命令参考（每方法：参数含义 / 一句话 / 举例）→ 怎么调用（纯机制）→ 纪律（只留脚本管不了的）→ 过程文档（唯一可手写 + 六节）→ 生命周期；分类标签并入命令参考当参数文档；「铁律 / 写操作红线 / 出错即停」三锅分清
- 外部调研（GitHub 写得好的）：① nickolasclarke/writing-cli-skills —— SKILL.md 管工作流与判断、references 管命令语法；Explore→Query / Find→Inspect→Operate 两范式；<500 行；引 `--help` 不罗列 flag；② mgechev/skills-best-practices —— <500 行、祈使句、JIT 指针、反模式清单（散文式指令 / 冗余逻辑）；③ anthropics/skills 的 pdf —— 按频率拆分：高频操作内联 + Quick Reference 表、长尾外移；④ webapp-testing —— 决策树 + 脚本黑盒 + Common Pitfall
- **代码核实（建 / 认领）**：`new` 无 `--self` → pool.json（open、owner 空、started 空）；`new --self` → 自己分片（owner=我、**status 仍是 open**）；`claim` → 搬进自己分片、补 started/updated，**status 不动**。旧版 progress.py:2148-2155 的 claim 会校验 open 并置 `doing` —— 新 claim.py 两样都丢了（state-model.md:9 状态机图还写着 claim→doing；活证据：本任务 `status=open`、`started=None`）。看板侧证据见下条，定性为 bug 待修

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
- 2026-10-23 20:30:18 · log · @cqguojia@hotmail.com · 外部调研 4 源定骨架 v2（命令参考/生命周期/纪律三锅分清/分类标签并入参数）；代码核实：claim 不置 doing 是分片重构回归（旧 progress.py:2155 置 doing），待用户定修代码还是改语义
- 2026-10-23 20:39:30 · log · @cqguojia@hotmail.com · 五项结构争议自行裁定完（命令参考内联/纪律三合一/分工线/祈使句/claim 按现状）；claim 不置 doing 定性为看板可见的真 bug（home.service.ts:48-79），建议修 claim.py 待用户发话
- 2026-10-23 21:02:16 · set · @cqguojia@hotmail.com · 状态改为 doing
- 2026-10-23 21:02:26 · log · @cqguojia@hotmail.com · 代码修复落地：claim 认领即 doing+open 守卫、new --self 建即 doing+started、smoke 补 4 断言；4 测试全过、codelint 仅剩 .bak；另发现 release 不清 started（插件注释与旧文档都说清），一行待修
- 2026-10-23 21:23:06 · log · @cqguojia@hotmail.com · 拍板 release 不清 started 是特性非 bug：外卖计时器模型——逾期从首次认领跑到结案、转手不重置，防「释放再认领洗时钟」作弊；责任归属看执行记录流水。四处陈旧表述列了修正清单
- 2026-10-23 21:33:23 · log · @cqguojia@hotmail.com · 4 文档定稿落地：SKILL.md 7 节 253 行（命令参考内联/生命周期含决策树/纪律三合一/祈使句）；smoke 等价断言 8/8、无「你」、陈旧口径零残留；待重建插件副本+同步 README
- 2026-10-23 21:53:46 · log · @cqguojia@hotmail.com · 已提交并推送 ac950aa（66 文件）：文档重写+认领即 doing+副本/dist 追平；门禁全绿（skill 4 测试/插件 smoke 32/typecheck/codelint/check-skill-copy）
- 2026-10-23 22:04:52 · log · @cqguojia@hotmail.com · 按用户反馈重写种子+state-model：禁自建台账/任务、删分片与文件表现内部细节、建vs建并认领判定规则（仅明确「并开始做/并执行」才 --self）、owner 全程不传、删看板阈值、台账失败不挡主任务；门禁全绿，未提交等用户发话
- 2026-10-23 22:30:44 · log · @cqguojia@hotmail.com · 二轮反馈落地：开头加数据落点+状态词典（待认领/进行中/已结案）、标题 4~20 字备注、--created 白话化、set 改纯释放（放一放≠释放）、close 两层确认（含糊必须反问）+close 后禁写、确认 log 自动刷 updated；门禁全绿未提交
- 2026-10-23 22:49:41 · log · @cqguojia@hotmail.com · 三轮反馈落地：多人并行 Git 分界（同 clone 靠锁/跨机必须 Git+无 Git 提醒）、--created/--finished 白话化、删 init 废话句、执行记录禁手写加重、tags --rename 补场景说明、拿不定问用户；另发现 --status 无任何产品调用方建议删
- 2026-10-23 23:02:11 · log · @cqguojia@hotmail.com · 删除 --status 落地（用户拍板）：cli/registry/set_task 重写/handoff 去参、3 测试改路、SKILL.md 与 state-model 同步；四路由手工验证（无 owner 退1/指向自己=认领/claim→doing/释放回池 started 保留）；门禁全绿未提交
- 2026-10-23 23:03:57 · log · @cqguojia@hotmail.com · 修用户指出的口径矛盾：开口径「不碰数据文件」改精确表述「状态与归属只经命令改、唯一手写是过程文档前五节」，三处口径（开头/手写边界/过程文档）达成一致；门禁全绿未提交
- 2026-10-23 23:48:33 · log · @cqguojia@hotmail.com · 专家组审查（提示词8/结构8/逻辑9项相符）后修复：裸 tags 退3改退1人话（真bug）、history 第二列改负责人、allowed-tools 补Edit、五处重复规则收敛、清60秒/release字样/退出码泄漏、README 清死链、删 CI 幽灵测试行；门禁全绿
- 2026-10-24 00:35:49 · log · @cqguojia@hotmail.com · 二轮专家组（提示词7.5/结构8/逻辑85）修复：Git 前提、history 第三列、log 归属、rename 仅自己名下、失败三分支、建台账闭环、troubleshooting 引文全换真串；实跑抓出并修掉真 bug：_apply 用 category=None 当没命中，导致有标签没分类的任务 rename 永远改不到（dry-run 报 0/真跑静默跳过），改显式哨兵+回归测试；门禁全绿，按用户要求未提交等审
- 2026-10-24 01:01:32 · log · @cqguojia@hotmail.com · 用户三条例 + 代码修复：①无 git 必须能用——_finalize 遇非 git 目录跳过提交推送只提示、env 按 FileNotFound 处理（无二进制也不崩），实跑双路径通过；②--months 改自然月窗口（自己算最近 N 个月读存在文件）；③--no-sync 改显式开关，有无远端/离线由脚本判断；各补回归测试；门禁全绿未提交等审
- 2026-10-24 01:16:52 · log · @cqguojia@hotmail.com · 三轮专家组（提示词8.5/技能终审/项目7）：按用户三把尺子砍种子 14 处废话（机制解释/不言自明/元说明），17.9→17.0 KB，用户要求的 4~20 字保留；术语统一（工作包=标题）、成果→过程文档、手动 pull 路径去掉按任务号合并的过度承诺（文档+脚本提示同步）、CI 注释幽灵修正；门禁全绿未提交等审
- 2026-10-24 16:42:50 · log · @cqguojia@hotmail.com · SKILL.md 对齐 history 实际口径：--since/--until 按结案时间（含当天）、--months 与二者互斥、默认近 3 个自然月、一次最多读 13 个历史文件（超限报错且不读任何文件）、缺月跳过；同步命令表/示例/查询速查/正文回链/参考索引 6 处，references/state-model.md 原有内容已覆盖无需改；copy-skill 同步内嵌副本，check-skill-copy 通过
