# 数据说明：台账文件格式

> **状态**：🔵 落码（数据格式与写序均为现状，写序表里的函数名即 `packages/skill/src/internal/actions/` 实际实现）
> **来源**：`task-ledger` skill（`packages/skill/src/internal/` + `assets/worklog.md`）是格式真源
> **配套**：运行逻辑见 [`architecture.md`](architecture.md)；脚本分层见 [`code-conventions.md`](code-conventions.md)

本项目**不自建数据库**：插件只读各工作区的台账文件。格式真源在 skill 代码，本文档只做索引级说明；字面值以代码为准。

## 一、目录布局（每个工作区根下）

> 工作区根 = **直接含有 `ledger/` 的那个目录**；`ledger/` 本身不是根（`--repo` 指到它会被拒绝）。

```
<工作区>/
├── ledger/
│   ├── pool.json                  # 公共池：未认领任务（owner=null、status=open）
│   ├── owners.json                # 索引：身份 uuid → 分片文件（name 只做显示）
│   ├── owners/<hash12>.json       # 每人一份分片：自己名下的任务
│   ├── history/<年月>.md          # 已结案索引，按结案时间分月（12 列）
│   └── worklog/<年月>/            # 过程正文，一任务一篇
│       └── <日>-<时分>-<说明>-<随机码>.md
```

以上五类文件**只由脚本写**（L1 落盘、业务层定写序）。

⚠️ **本仓（`dsh-task-ledger` 自己）已迁到分片布局**：`pool.json` / `owners.json` / `owners/<hash>.json` 已是新分片格式，在办任务在各人分片（未认领的在 `pool.json`）；`history/`（11 列）与 `worklog/`（六节）同步为新布局。老工作区（仍用扁平 `ledger/progress.json`）由 agent 逐个手工迁；脚本读到旧布局会在 stderr 提示，旧任务在迁完之前对它等于不存在。**脚本不做任何旧格式兼容**：历史只认 12 列（十二列是本仓当前口径；11 列旧文件不再兼容，将统一迁移），平铺历史文件不再读 —— 存量九列的历史文件按 `docs/history-creator-upgrade.md` 那份手册一次性升级。

## 二、任务表：`pool.json` 与 `owners/*.json`

**两者是同一张表（任务表）的两个落点**：`pool.json` = `owner` 为空的那个分区，分片 = 某人名下那个分区。所以「认领 / 释放 / 交接」都是**跨分区的搬移**，不是「新建一条 + 删除一条」两笔独立记录。

形状：`version`（格式版本）+ 可选 `identity`（仅分片有）+ `tasks` 对象（键 = 任务号 `年月日-时分-标题要素-随机码`）。

**写盘格式是契约**：`tasks` 里**一个任务一行**，其余字段各压一行（`store.DumpLedgerJSON(data, expand)` 的 `expand` 参数）。这是多人合并与 git 行级 diff 的前提，不许改成缩进美化格式。

| 字段 | 值样例 | 说明 |
|---|---|---|
| `title` | 熟悉项目初衷并搭建初始文档架构 | 任务标题 |
| `status` | `open` / `doing` | `done` 只能由 close 产生 |
| `creator` / `owner` | `0c1e…-…`（uuid） | **身份 uuid**（小写，与 `~/.taskledger/identity.json` 同一个值）；池里的行 `owner` 为 null |
| `created` / `started` / `updated` / `finished` | `2026-10-16 17:42:22` | **存盘一律 UTC、不带偏移量**（2026-10-22 前写的是写入者本地时间且无标记，两类无法区分）；**脚本输出时转本机时区**，`--json` 与人话同一个值。`finished` 结案前为 null；`updated` = 最后一次推进，老数据可能缺失（看板回退到 `started` / `created`） |
| `category` | 建设 | 单值分类 |
| `tags` | `["文档架构","初始化"]` | 0~5 个 |
| `worklog` | `worklog/202610/16-1742-…-5563.md` | 相对 `ledger/` 的过程文档路径 |

版本字段 `version` 的处理：与当前格式不符**只告警不拦**（退出时汇总一条）；只有 `tasks` 不是对象才直接报错；要写回的文件缺 `version` 时补当前值。
**落点写死在 `store/jsonstore.go`**：读盘发现版本与 `core.FormatVersion`（`core/labels.go`）不符 ⇒ `JSONStore.checkVersion` 走 `notices.Note("提示：…")` 一次（进程级去重，不拦）；写盘一律带当前 `FormatVersion`（缺就补）。别在动作层各自判断。

不变量：池里的行恒为 `open` 且 `owner` 为空；分片里的行 `owner` 必须等于该分片主人（分区键与字段不能打架，`validate` 查）。

## 三、索引：`owners.json`

另一形状：`workers` 对象，键 = 归一化身份，值 = `{"file": "<sha256前12位>.json", "name": …, "joined": …}`。

- 分片文件名 = `sha256(归一化身份)[:12] + ".json"`；**索引是唯一入口** —— 目录里有、索引没登记的分片对它人等于不存在（`validate` 报出来；自己读自己那份会提示「没登记」）。
- `name` 是给人看的被动显示字段：首次登记时写进 `owners.json`，**任何归属判定都不读它**。冗余的 `owner_name` / `creator_name` 只用于显示与 `--owner-name` 模糊筛，**两处都落盘**：
  - **任务行**（池 + 分片）：认领 / 建任务那一刻写死；
  - **历史行**（§四）：结案那一刻写死。

  冗余就是**快照**：改名不回写旧记录，旧任务仍显示当时那个名字 —— 签名签的是当时的名字，不是身份证号。

## 四、已结案：`history/<年月>.md`

| Finished | Created | Title | Category | Tags | Owner | Owner Name | Creator | Creator Name | Summary | Result | Worklog |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-29 09:56:46 | 2026-10-29 09:56:39 | 格式冒烟 | 功能 | 甲、乙、丙 | 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 | @GuoJia-Agent | 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 | @GuoJia-Agent | 冒烟通过 | done | `../worklog/202610/29-0956-…-8ce9.md` |

末列是**相对 history 文件所在目录**算出的链接（不是相对 `docs/`），所以这里用代码格式展示，别当成本页的链接。

**owner / creator 两列写裸标识、不加 `@`**：裸标识就是台账里那套归一化身份（`identity.normalize` 的结果，与 `task["owner"]` 同一个值）。加 `@` 的只有紧随其后的名字列，与过程文档 `@名字 · uuid` 同一口径。`core.ParseHistory` 读回来时把两边的 `@` 都剥掉，所以 `--owner` / `--mine` 的比较一律在裸标识上做（**精确相等**，不做前缀或子串匹配）。

**紧随其后的 `owner_name` / `creator_name` 两列落盘显示名快照**（**写「`@` + 名字」** —— `@` 只属于名字这两列）：名字是结案那一刻从任务行带过来的（`task["owner_name"]` / `task["creator_name"]`），**改名不回写旧行**。`--owner-name` 直接比这两列（读时已剥 `@`）；老行（升级前落的）没有名字时按名册兜底补一次展示值，不回写文件。

- 按**结案时间**分月落文件，行序按创建时间；**首列是结案时间、次列才是创建时间**（筛选口径别搞反）。
- 这是**只追加**的表：没有删除、没有原地改行，也不做整表重排 —— 否则手写格式与 git 行级 diff 全坏。
- **写盘与读取都只认十二列**（2026-10-29 加 `Result` 列）：11 列及更早的旧文件不再兼容、统一迁移；列数不对的行跳过并警告。存量九列的文件按 `docs/history-creator-upgrade.md` 一次性升级（在 owner 后插 `owner_name`、creator 后插 `creator_name`）。
- **`Result` 列**取值 `done` / `cancelled`：`done` = 正常结案，`cancelled` = `close --cancel`。取消行的 `owner` / `owner_name` 是**执行取消的人**，备注（可省）落 `Summary` 列，原创建者仍在 `creator` / `creator_name`。
- 表头与一级标题自 2026-10-29 起写英文（`# History (closed)`）；旧中文表头不再兼容，将统一迁移。

## 五、过程文档：`worklog/<年月>/*.md`

固定六节：**Background / To Do / Next / Process / Conclusion / Execution Log**（2026-10-29 起写英文，旧中文节名不再兼容，将统一迁移）。模板真源 = skill 的 `assets/worklog.md`。

头部是**四行无序列表**，顺序固定（`core.HeadKeyOrder = ["meta","status","created","frozen"]`，插入位置由 `core.insertHeadLine` 按 `rankOf` 算），值一律 `字段: 值 · 值 · 值`：

```markdown
- **Tags**: 建设, DSH, 台账
- **Status**: doing · 2026-10-27 09:12:33 · @某人 · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **Created**: 2026-10-26 23:38:02 · @某人 · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **Sealed**: 2026-10-27 09:20:10 · @某人 · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
```

- **Tags** 行只在给了 `--tags` 时写（**分类不进过程文档**，只进分片字段与历史行；标签可涵盖分类）；**Sealed** 行只在结案时写；状态行与创建行必有。

- 旧中文头部（`- **标签**：…` 等）与 `> **状态**：…` 引用块格式都不再兼容，将统一迁移。
- 正文（前五节）由人 / agent 写；脚本只有「建篇」（`WorklogStore.Create` → `core.RenderWorklog`）+ **四处锚点编辑**：往「执行记录」节追加一行（`core.AppendExecLog`）、封卷时加「封卷」行（`core.StampFrozen`）、改写「标签」行（`core.RewriteLabelLine`；`new` 建篇时写、`set --tags` 随时改、`close` 写终值）、改写「状态」行（`core.RewriteStatusLine`，与追加记录同一次写盘）。整篇写回只走 `WorklogStore.Write`，且传入的必须是锚点编辑后的新全文 —— 没有「整篇替换既有正文」这种能力，也不要给它加。
- **状态行**（2026-10-27 加）取值只有 `open` / `doing` / `done` / `cancelled`（英文全链路统一，中文只在界面翻译层）。
  - **它是镜像**：状态与归属的权威在公共池 / 分片，这行只是让 `show` 读文档就能回答，不必翻索引；
  - 由脚本在每次状态变更时顺手替换（`new` / `claim` / 释放 / 交接 / `log` 刷时间 / `close`），**人不手改**；
  - 完全没有状态行的旧文档已不再兼容：`show --json` 不再标 `legacy`，旧文件需统一迁移。
- 末节「执行记录」**只由脚本追加**：一行固定 `- 时间 · 类型 · @谁 · uuid · 说明`，类型只有六种 `new` / `claim` / `set` / `release` / `log` / `close`（**交接记的是 `set`**，没有 `handoff` 这个类型）；只增不改。
- **身份一律落「名字 + uuid」两个值**（`core.Identity.Stamp()` = `名字 · uuid`）：头部「创建」行与「状态」行、结案的封卷行、每条执行记录都是这个串，**不靠历史表回链**。
  文档是最终产物 —— 创建人和封卷人可能不是同一个人，也可能中途改过名，所以两个都留。读回来时 `head_creator` 取名字、`head_creator_uuid` 取 uuid，老文档只有名字时后者返回空。
- 结案时封卷，此后不再修改。**存盘时间一律 UTC**：创建行、状态行、封卷行、每条执行记录行与 JSON 里的 `created`/`updated`/`finished` 同口径；**文档正文原样返回**（脚本不重写、不转换），任务字段的时间由脚本在输出时转成本机时区。
- 存量老数据的执行记录行（`4ee6268` 之前写的）是写入者本地时间且无标记，与新的 UTC 行混在同一篇文档里无法区分 —— 已知例外，不回写、不猜测。

## 六、写序 = 崩溃恢复协议

每个动作的写序不是实现细节，是数据契约。崩在中间留下的状态，必须能靠「重跑一次」收敛。「函数」列即 `packages/skill/src/internal/actions/` 的实际业务函数名（每个动作一个文件）。

| 动作 | 函数 | 写序 | 崩在中间 | 重跑怎么收敛 |
|---|---|---|---|---|
| 自举（登记自己） | `Bootstrap`（`bootstrap.go`） | 目录与池（缺则建）→ 我的分片 → 索引 | 留孤儿分片（索引里还没我） | 已登记 ⇒ 零写；未登记 ⇒ 下次写命令补登记（`validate` 会先报出孤儿分片） |
| 建任务 | `NewTask`（`new_task.go`） | 过程文档 → 台账 | 留孤儿文档 | **不自愈**：文档已在、台账没落 ⇒ 拒绝并说明「可能是上次崩在中间」（判不出这篇文档是谁的，绝不替人收编）；换号重建 |
| 认领 | `Claim`（`claim.go`） | 我分片 → 删池那行 → 执行记录 | 两边都有 | 分片已有 ⇒ 只补删池 |
| 释放 | `Release`（`release_task.go`） | 写回池 → 删我分片那行 → 执行记录 | 两边都有 | 池里已有同号且是干净空位 ⇒ **不写回**、只补删我 |
| 交接 | `Handoff`（`handoff.go`） | 对方分片 → 删我分片 → 执行记录 | 两边都有 | 内容一致 ⇒ 只补删我；内容不同 ⇒ 拒绝交人 |
| 记进展 | `LogProgress`（`log_progress.go`） | 分片 `updated` → worklog 追加 | 文档没写 | **不算失败**：警告一句 + 退出码 0，已刷的分片照常提交（`WorklogStore.AppendExec` 写不进返回 `false`，不抛） |
| 结案 | `CloseTask`（`close_task.go`） | 改标签行（给了 `--tags` 才做）→ 历史行 → 封卷 worklog → **最后**删分片（分类取任务原值，不可改） | 历史多一行 / 已封卷 | 历史按 worklog 名去重（末列为空的旧行改按「创建时间 + 标题」两列判，`HistoryStore.HasLog`）、封卷认标记行（`core.HasFrozenLine`）、分片已删且历史有这行 ⇒ 返回「已结案，无需重复」、退出码 0；判不出来（`HasLog` 回 `undecidable`）⇒ **Fail 并指到当月历史文件**，不猜不重复追加 |

**没有「改状态」这个动作**：状态只随命令语义变（认领 → `doing`、释放 → `open`、结案 → 进历史）。`set --status` 已于 2026-10-23 删除 —— 它能造出「归我名下、状态却是待认领」的坏状态；`list --status` 是只读筛选，仍在。

已知且接受的例外：跨月重跑 `close` 会在两个月各记一行；交接撞上内容不同直接拒绝，不做自动裁决；重跑同一动作会在「执行记录」里再追加一行（日志行只增不改，不做去重）。

## 七、跨包契约：JSON 模式必须**始终**输出 JSON

插件调脚本的唯一出口把「输出不是 JSON」当失败，所以：

| 规则 | 反例（2026-10-17 真机 500） |
|---|---|
| 带 `--json` 时，**空结果也要出 JSON**：`history --json` → `{"count":0,"filters":{…},"records":[],"warnings":[],"capped":false}`、`list --json` → `{}`（任务号为键的对象） | `history` 在「没有任何历史文件」时直接打人话就 return ⇒ 插件抛错 ⇒ 整条看板 500。**一个空台账工作区就能让看板打不开** |
| 人话只走 stdout 的非 JSON 模式，或 stderr | 提示类信息本来就在 stderr，别混进 stdout |
| 真失败照旧非零退出 + stderr 原文（不伪装成空 JSON） | 空 ≠ 错：空是合法数据，错才是错 |

`history --json` 的 `capped`：为 true 表示 `--limit` 把列表截断了（`count` 是**返回条数**，截断前总数只能靠放宽 `--limit` 再查）。`--count-only`（以及封顶常量 `actions.CountCap`）已于 2026-10-29 删除 —— 统计口径一律走 `stats --trend` 的桶（自带区间裁剪与月缓存）。

三个给界面喂数的只读命令同样守「空也要出 JSON」：空台账下 `stats --json` 出全 0 计数 + `thresholds` 回显、`owners --json` 出 `{"count":0,"owners":{}}`、`root --json` 出 `{"root":false,"repo":null,"ledger":null,"reason":…}`（目录不存在也算「不是根」，不报错、不退非零）。

派生值（`stale` / `overdue` / `backlog` 与 `age_days` / `idle_days` / `waiting_days`）**只活在 `list` / `stats` 的输出里**，任务表与历史行里一概不写 —— 想改粗细就用 `--stale-days` / `--overdue-days` / `--backlog-days` 换阈值，不许指望「存一个标记字段」。

改动脚本 = 动这条契约 ⇒ 「空台账工作区」必须是受支持的行为（只读不得就地建台账）。

**插件与 skill 是同一份契约**（参数表 + 输出形状 + 退出码），**升级必须成对**：skill 删 / 改一个参数，旧插件就会拿着老参数撞「认这个参数」的用法错，导致每个工作区都进 `degraded`。2026-10-29 真机即此例（插件 ≤ `0.0.119` 仍在传 `--count-only`，skill `1.3.44` 已删）。发版规则见 `AGENTS.md`：动 skill ⇒ `skill-v*` 与 `plugin-v*` 两个 tag 同升。

## 八、插件消费方式

- 待办 = `pool.json` + 索引登记的全部分片里 `open` / `doing`；同一任务号出现在两个文件是搬移中断的中间态，读侧「后读到为准」只显示一次（`list` 只显示一行；`show` 文档优先，不点名同号多文件），同号多文件也不进 `validate`（写侧已有防护）。
- **「后读到」的顺序是定死的**：先池、再按索引键排序后的各分片 ⇒ 同一号一定由分片那份胜出。顺序不确定会让同一份数据两次查给出不同结果。
- 写入前的防撞：`claim` / `set --owner` 会在落盘前挡一道（别人分片里已有同号 / 目标分片已有不同内容 ⇒ 拒绝），但跨机同时抢仍有窗口。
- 历史 = `history/<年月>.md` 12 列（owner = 负责人筛选面；creator = 发起人，`owner` 可被 claim 改走、「谁建的」不变；两列后各跟一列落盘的显示名快照）。
- 报表只有一个来源：全部由宿主从 `history --json` / `list --json` / `stats --json`（`actions.QueryHistory` / `actions.ListTasks` / `actions.StatsTasks`）的返回聚合（时间线、按人工作日志、状态分布、分类 / 标签计数）。脚本**只按在办层**开一个统计入口 `stats`（按状态 + 年龄阈值计数；周期趋势类的聚合仍由宿主自己做）—— 分类 / 标签要么在在办任务对象里、要么在历史行的分类 / 标签列里，都不需要逐篇扫过程文档。
- 宿主侧消费（见 `external/dsh-workspace-registry.md`）：台账判定经内嵌脚本 `root --json`（判据 = 目录直接含 `ledger/`），待办 / 历史一律经内嵌脚本（已分片感知）读取，不再直接读台账文件；老工作区未迁完前，脚本读到旧布局会在 stderr 提示，旧任务在迁完前对它等于不存在。
