# 20261019-0955-skill-模板增强-progress-最后更新时间-worklog-执行记录-78e3：skill 模板增强：progress 最后更新时间 + worklog 执行记录

> **创建**：2026-10-19 09:55:09（@GuoJia-Agent）
> **分类**：建设 ｜ **标签**：skill、task-ledger、worklog

<!-- 「> **分类**：… ｜ **标签**：…」行由脚本按 new --category / --tags 自动插在创建行后；
     两者皆空则不写此行。close 时可用 --category / --tags 覆盖修正。 -->

## 背景

用户 2026-10-19 提出对 task-ledger skill 模板的两处增强（原话要点）：

1. progress 板块增加「最后更新时间」（即最后一次执行的时间），看板列表可能要加一列；
2. worklog 模板最下面增加「执行记录」节：记某人某时间做了什么，任务每推进一个节点记一条；
3. 功能尽量用脚本实现——模板仍由人/AI 手动改，但改完某块内容后要同时提交一条修改日志，由脚本把该日志记上；
4. 老的 worklog 不迁移：有「执行记录」节就显示，没有就不显示（该块本来就不被程序读）；
5. progress 老数据无所谓（项目自测中，只有用户在用）；稍后用户给项目清单，写一次性脚本把各项目「最后更新时间」统一补成创建时间；
6. 本轮只做：落工作记录 → 专家团讨论（合理性 / 会不会出错 / 更好方案）→ 汇报，不动代码。

## 待办

- [x] 专家团讨论：需求合理性、风险点、更优方案
- [x] 脚本 + 模板 + host 判定实现（执行记录节 / `log` 子命令 / `updated` / 阻塞 7 天 + 停滞 3 天）
- [ ] UI：阻塞 / 停滞两枚标记与统计卡怎么排（用户最后统一调）
- [ ] 一次性迁移脚本：把各项目老 `progress.json` 的 `updated` 补成 `created`（等用户给项目清单）
- [ ] 设置项：阻塞 7 天 / 停滞 3 天做成用户可配（本轮写死默认值）

## 下一步

等用户定 UI 排布；拿到项目清单后跑迁移脚本；两阈值按需做成设置项。

## 过程

已核实的代码事实（结论依据）：

- 插件看板不解析 `progress.json`：`runLedgerScript` spawn 内嵌 skill 脚本取数（`packages/plugin/src/host/repositories/runner.ts:36`，脚本路径 `packages/plugin/skill/scripts/progress.py`，build 时由 `scripts/copy-skill.mjs` 从 `packages/skill` 拷贝）。
- 解析入口元素级宽松：`TaskRecord` 全字段可选，缺字段放行（`packages/plugin/src/host/repositories/records.ts:31`、`packages/plugin/src/host/types.ts:19`）——新字段旧数据不炸，但看板要显示必须补类型 + 前端列 + 文案 + 样式。
- skill 脚本写字段点：`cmd_new`（`packages/skill/scripts/progress.py:1214` 建 task dict）、`cmd_claim`（:1274）、`cmd_set`（:1314）、`cmd_close`（:1336 起）；`updated` 需在这些点 + 新 log 子命令里维护。
- worklog 模板有两份拷贝必须同步改：`packages/skill/assets/worklog.md` 与脚本内 `FALLBACK_TEMPLATE`（progress.py:71）。
- 封卷即不可变：`close` 把 worklog 标记冻结（progress.py:1162 起 `seal_worklog`）——「执行记录」若允许结案后追加，与封卷语义冲突，需定边界。
- SKILL.md / README.md 记载「五节」结构契约，加第六节要同步改文档。

### 拍板与实现（2026-10-19）

用户拍板：

1. **阻塞 / 停滞分开判**，两个阈值先写死、后续做设置项：阻塞 = 接任务（`started`）至今满 7 天还没结案，中途更新不影响；停滞 = `updated` 至今满 3 天没更新。`updated` 只喂停滞，不参与 `ageDays`。
2. `close` 自动补一条结案记录，封卷后不再追加。
3. 执行记录放正文最末（第六节），**脚本维护、禁手改**；agent 改完正文跑 `log` 补一条。
4. 老 worklog 没有这一节就不追加（不迁移）。
5. UI 排布最后再调。

实现落点：

- `packages/skill/scripts/progress.py`：`EXEC_HEAD` / `EXEC_HINT`、`exec_line` / `append_exec_log` / `record_exec`（调用方须已持 `progress_lock`，与封卷互斥）；新增 `cmd_log` + `log` 子命令；`updated` 在 `cmd_new` / `cmd_claim` / `cmd_set` / `cmd_log` 维护；`cmd_close` 封卷前补结案记录。
- `packages/skill/assets/worklog.md` + `FALLBACK_TEMPLATE`：末节「执行记录」模板（含禁手改提示）。
- `packages/plugin/src/host/services/home.service.ts`：`STALE_DAYS` 3 改吃 `updated`（缺则回退 `started` / `created`），新增 `OVERDUE_DAYS` 7 与 `BoardTask.overdue`。
- `packages/plugin/src/host/types.ts` / `client/types.ts`：`TaskRecord.updated`、`BoardTask.overdue`。
- `packages/plugin/scripts/smoke.mjs`：`staleDays` 断言改 3，加 `overdue` 类型断言。
- 文档：`SKILL.md`（六节契约、`log` 子命令、写操作红线）、skill `README.md`、`docs/design/ledger-data.md`。

验证：`npm run verify` 25 项通过；临时仓库手跑 `init → new → log → set → close`，执行记录四条按时间顺序落盘；`koc-codelint` 六层全过。

**修正专家评审一条**：「`set --owner` 会刷 `started`」不成立——`cmd_set` 交接分支只做 `started or now()`（缺失才补），交接不会清零 `ageDays`；真正清 `started` 的只有 `--status open`（退回未认领）。

### 执行记录格式定稿（2026-10-19，用户拍板）

- **一行一条，不做 Markdown 表格**：时间戳竖着扫更快；长说明自然换行；追加 = 末尾加一行，git diff 只多一行；按类型 grep 统计天然可行。表格的列对齐反而要求重排，且说明里出现 `|` 会毁表。
- 每行固定四段：`- 时间 · 类型 · @谁 · 说明`。
- **类型 = 脚本子命令名**（`new` / `claim` / `set` / `log` / `close`），纯 ASCII、不需要翻译，和命令行一一对应；说明里不再重复类型词。
- **只追加、不改旧行**：移交后旧记录仍记在原负责人名下；`@谁` 记的是本次动手的人（`set` 交接记原 owner 发起、说明里写 `owner A → B`），不是任务现 owner。
- 功能刚上线、尚无存量老记录，**没有迁移问题**（早前「老 worklog 不迁移」的兼容策略保留，将来混排也不影响）。

落点：`exec_line` / `record_exec` 增 `kind` 与 `who` 参数，`new` / `claim` / `set` / `log` / `close` 各自传入；模板注释、`SKILL.md`、`docs/design/ledger-data.md` 同步写清格式与「只追加」约束。

### 专家团讨论（2026-10-19，3 个子代理并行评审，只读）

共识结论：

1. **合理且现实**：数据面几乎零成本（`list --json` 原样 dump task dict，progress.py:1586-1590；插件解析元素级宽松）；worklog 正文不被程序解析、只有详情页读全文（ledger.repository.ts:74），加节是纯展示增量。
2. **最严重风险 = `updated` 刷新语义**：停滞判定吃 `started ?? created`（home.service.ts:26，STALE_DAYS=14）。若 `updated` 跟着 claim/set 刷，界面会出现「最后更新：刚刚」+「已进行 21 天」+停滞红标的自相矛盾；`updated` 只做展示，绝不喂 ageDays/stale。
3. **封卷冲突**：close 冻结 worklog（stamp_frozen，progress.py:1161-1171）且任务移出状态表（:1379-1380）⇒ 结案后不能记，而结案本身是最大节点。拟定的边界：封卷后禁 log，结案记录由 close 自动补一条。
4. **并发写 worklog**：今天 worklog 不在任何锁内（SKILL.md:120 明文不走锁），progress_lock 只锁 progress.json；log 子命令若「读全文→拼行→整写」会并发丢记录，还会触发 close 的文件指纹复核中止（progress.py:1441-1450）。需给 worklog 加锁或把 log 并入 progress 锁内。
5. **断点风险**：「AI 手改正文 + 跑脚本记日志」最可能断在 AI 忘记跑脚本（静默缺记录）。缓解：new/claim/set/close 四节点由脚本自动记，agent 只在编辑正文后手动 log 一次。
6. **加列真实成本**：不是「加一列」——client/types + host/types + task-row.ts + locales.ts（中英）+ ui.ts/tokens.ts + docs 共 5-6 个文件，且窄屏下 title 是唯一弹性列会被挤压（全部待办行已三格定宽）。
7. **迁移脚本要点**：幂等（只填缺失）、备份（.bak.<时间戳>）、progress_lock + read_guarded/commit_guarded、--dry-run、created 也缺就跳过并列报告。
8. **版本混装**：改了 packages/skill 忘 build ⇒ 看板仍跑旧内嵌脚本（runner.ts:9 解析插件包内路径）；旧 skill 无 log 子命令会 argparse 报退出码 2；旧 validate 不报未知字段、旧 close 重写不删新字段 ⇒ 兼容不炸。
9. **更优方案两条**：A=不加列，把「推进于 Y」并进最右时间槽/mine 卡 tooltip；B=取消新节，脚本自动往「过程」节顶部追加里程碑行（AI 零动作，五节契约不动）。
10. **顺手发现的既存坑**（不属本任务）：`set --owner`/`claim` 会刷 `started`（progress.py:1276/1328）⇒ 交接即清零 ageDays，换 3 次手的任务永远不停滞。

## 结论

<!-- 收尾时填：做成了什么、留了什么坑。
     例：已修复，但只覆盖 UTF-8；GBK 另开任务 -->
