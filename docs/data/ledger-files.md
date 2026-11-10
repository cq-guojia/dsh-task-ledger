# 台账文件格式

本项目不自建数据库：插件只读各工作区的台账文件。格式真源在 `packages/skill/src/internal/` 与 `packages/skill/assets/worklog.md`，本文档只做索引级说明；字面值以代码为准。运行链路见 [overview.md](../architecture/overview.md)，分层签名见 [ledger-api.md](../api/ledger-api.md)。

## 一、目录布局（每个工作区根下）

工作区根 = **直接含有 `ledger/` 的那个目录**；`ledger/` 本身不是根（`--repo` 指到它会被拒绝）。

```text
<工作区>/                                              # 工作区根（直接含 `ledger/`）
└── ledger/                                         # 台账目录
    ├── pool.json                                   # 公共池：未认领任务（`owner=null`、`status=open`）
    ├── owners.json                                 # 索引：身份 uuid → 分片文件（`name` 只做显示）
    ├── owners/<hash12>.json                        # 每人一份分片：自己名下的任务
    ├── history/<年月>.md                             # 已结案索引，按结案时间分月（16 列）
    └── worklog/<年月>/                               # 过程正文，一任务一篇
        └── <日>-<时分>-<说明>-<随机码>.md                  # 单篇过程文档
```

五类文件只由脚本写。历史只认 16 列（`Worklog` 后追加 `Deleted` / `Deleted By` / `Deleted By Name` / `Deleted At` 四列），列数不对或时间不合法的行静默跳过：不告警、不提示迁移、不双读、不写升级命令；平铺历史文件不再读。

## 二、任务表：`pool.json` 与 `owners/*.json`

两者是同一张表（任务表）的两个落点：`pool.json` = `owner` 为空的分区，分片 = 某人名下的分区。所以「认领 / 释放 / 交接」都是跨分区搬移，不是「新建一条 + 删除一条」两笔独立记录。

形状：`version`（格式版本）+ 可选 `identity`（仅分片有）+ `tasks` 对象（键 = 任务号 `年月日-时分-标题要素-随机码`）。**写盘格式是契约**：`tasks` 里一个任务一行，其余字段各压一行（`store.DumpLedgerJSON(data, expand)` 的 `expand` 参数），这是多人合并与 git 行级 diff 的前提，不许改成缩进美化格式。

| 字段 | 值样例 | 说明 |
|---|---|---|
| `title` | 熟悉项目初衷并搭建初始文档架构 | 任务标题 |
| `status` | `open` / `doing` | `done` 只能由 close 产生 |
| `creator` / `owner` | uuid | 身份 uuid（小写，与 `~/.taskledger/identity.json` 同一个值）；池里的行 `owner` 为 null |
| `created` / `started` / `updated` / `finished` | `YYYY-MM-DD HH:MM:SS` | 存盘一律 UTC、不带偏移量；脚本输出时转本机时区，`--json` 与人话同一个值。`finished` 结案前为 null，`updated` 老数据可能缺失（看板回退到 `started` / `created`） |
| `category` | 建设 | 单值分类 |
| `tags` | `["文档架构","初始化"]` | 1~5 个；`new` 必填（空则报错），老任务可能为空 |
| `worklog` | `worklog/202610/16-1742-…-5563.md` | 相对 `ledger/` 的过程文档路径 |

版本字段 `version` 与当前格式不符只告警不拦（退出时汇总一条）；只有 `tasks` 不是对象才直接报错；要写回的文件缺 `version` 时补当前值。落点写死在 `packages/skill/src/internal/store/jsonstore.go`：读盘与 `core.FormatVersion` 不符 ⇒ `JSONStore.checkVersion` 走 `notices.Note` 一次（进程级去重、不拦），写盘一律带当前值。

不变量：池里的行恒为 `open` 且 `owner` 为空；分片里的行 `owner` 必须等于该分片主人（`validate` 查）。

## 三、索引：`owners.json`

另一形状：`workers` 对象，键 = 归一化身份，值 = `{"file": "<sha256前12位>.json", "name": …, "joined": …}`。

- 分片文件名 = `sha256(归一化身份)[:12] + ".json"`；索引是唯一入口，目录里有、索引没登记的分片对他人等于不存在（`validate` 报出来；自己读自己那份会提示「没登记」）。
- `name` 是给人看的被动显示字段，首次登记时写进 `owners.json`，任何归属判定都不读它。
- 冗余的 `owner_name` / `creator_name` 只用于显示与 `--owner-name` 模糊筛，两处都落盘：任务行（池 + 分片）在认领 / 建任务那一刻写死；历史行在结案那一刻写死。冗余就是快照：改名不回写旧记录，旧任务仍显示当时那个名字。

## 四、已结案：`history/<年月>.md`

十六列：`Finished | Created | Title | Category | Tags | Owner | Owner Name | Creator | Creator Name | Summary | Result | Worklog | Deleted | Deleted By | Deleted By Name | Deleted At`。

`Worklog` 列是相对 history 文件所在目录算出的路径（不是相对 `docs/`）；它后面跟着删除四列。

- `owner` / `creator` 两列写裸标识、不加 `@`：裸标识就是台账里那套归一化身份（与 `task["owner"]` 同一个值）。加 `@` 的只有紧随其后的名字列。`core.ParseHistory` 读回来时把两边的 `@` 都剥掉，所以 `--owner` / `--mine` 的比较一律在裸标识上做精确相等，不做前缀或子串匹配。
- 紧随其后的 `owner_name` / `creator_name` 两列落盘显示名快照（写「`@` + 名字」），名字是结案那一刻从任务行带过来的，改名不回写旧行。`--owner-name` 直接比这两列；老行没有名字时按名册兜底补一次展示值，不回写文件。
- 按**结案时间**分月落文件，行序按创建时间；首列是结案时间、次列才是创建时间。
- 正常结案只追加新行：不删行、不原地改行、不做整表重排。唯一例外是 `delete --src/--line`：原地只改该行末尾四格，前十二列原值不动。
- 删历史行要带行指纹（`--expect`，取自 `history --json` 每条记录的 `fingerprint` = 整行原文 sha256 前 12 hex）：行号只是坐标，指纹对不上就整条拒绝、一个字节都不写。`--expect` 可省（手工 CLI 用），插件删行必须带；重复删已删除的行按幂等回「已经删除过了」。
- `Result` 列取值 `done` / `cancelled` / 空：`done` 正常结案，`cancelled` 是 `close --cancel`，空是在办任务直接删除。取消行的 `owner` / `owner_name` 是执行取消的人，备注（可省）落 `Summary`，原创建者仍在 `creator` / `creator_name`。
- 删除四列：`Deleted` 只取 `yes` / 空（唯一判据），`Deleted By` 存删除人裸 uuid，`Deleted By Name` 存落盘时的显示名快照（`@名字`，读时剥 `@`），`Deleted At` 存 UTC 时间；未删四列留空。`Deleted == "yes"` 的行在所有读侧整行跳过（历史明细与趋势统计都不计入），原始行仍留在文件里，没有开关、没有恢复、没有查询入口。`Result` 原值保留，`done`+删除 / `cancelled`+删除 / 空+删除 三分可辨。
- 表头与一级标题写英文（`# History (closed)`）。

## 五、过程文档：`worklog/<年月>/*.md`

固定六节：**Background / To Do / Next / Process / Conclusion / Execution Log**。模板真源是 `packages/skill/assets/worklog.md`。

头部是四行无序列表，顺序固定（`core.HeadKeyOrder = ["meta","status","created","frozen"]`，插入位置由 `core.insertHeadLine` 按 `rankOf` 算），值一律 `字段: 值 · 值 · 值`：

```markdown
- **Tags**: 建设, DSH, 台账
- **Status**: doing · YYYY-MM-DD HH:MM:SS · @某人 · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **Created**: YYYY-MM-DD HH:MM:SS · @某人 · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **Sealed**: YYYY-MM-DD HH:MM:SS · @某人 · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
```

- `Tags` 行 `new` 建篇时必写，之后 `set --tags` / `close --tags` 改写（分类不进过程文档，只进分片字段与历史行）；`Sealed` 行只在结案时写；状态行与创建行必有。
- 正文（前五节）由人 / agent 写；脚本只有「建篇」（`WorklogStore.Create` → `core.RenderWorklog`）加四处锚点编辑：`AppendExecLog`（执行记录追加一行）、`StampFrozen`（封卷行）、`RewriteLabelLine`（标签行）、`RewriteStatusLine`（状态行，与追加记录同一次写盘）。整篇写回只走 `WorklogStore.Write`，传入的必须是锚点编辑后的新全文，没有「整篇替换既有正文」这种能力。
- 状态行取值 `open` / `doing` / `done` / `cancelled` / `deleted`。它是镜像：状态与归属的权威在公共池 / 分片，这行只让 `show` 读文档就能回答；由脚本在每次状态变更时顺手替换，人不手改。
- 末节「执行记录」只由脚本追加：一行固定 `- 时间 · 类型 · @谁 · uuid · 说明`，类型有 `new` / `claim` / `set` / `release` / `log` / `close` / `cancel` / `delete`（交接记的是 `set`，没有 `handoff`），只增不改。
- 身份一律落「名字 + uuid」两个值（`core.Identity.Stamp()`）：头部创建行与状态行、封卷行、每条执行记录都是这个串，不靠历史表回链。文档是最终产物，创建人和封卷人可能不是同一个人，也可能中途改过名，所以两个都留。
- 结案时封卷，此后不再修改。存盘时间一律 UTC：创建行、状态行、封卷行、每条执行记录行与 JSON 里的 `created`/`updated`/`finished` 同口径；文档正文原样返回，任务字段的时间由脚本输出时转本机时区。

## 六、写序 = 崩溃恢复协议

每个动作的写序不是实现细节，是数据契约。崩在中间留下的状态，必须能靠「重跑一次」收敛。

| 动作 | 函数 | 写序 | 崩在中间 | 重跑怎么收敛 |
|---|---|---|---|---|
| 自举 | `Bootstrap` | 目录与池（缺则建）→ 我的分片 → 索引 | 留孤儿分片 | 已登记零写；未登记由下次写命令补登记（`validate` 先报出孤儿分片） |
| 建任务 | `NewTask` | 过程文档 → 台账 | 留孤儿文档 | 不自愈：文档已在、台账没落 ⇒ 拒绝并说明「可能崩在中间」，换号重建 |
| 认领 | `Claim` | 我分片 → 删池那行 → 执行记录 | 两边都有 | 分片已有 ⇒ 只补删池 |
| 释放 | `Release` | 写回池 → 删我分片那行 → 执行记录 | 两边都有 | 池里已有同号且是干净空位 ⇒ 不写回、只补删我 |
| 交接 | `Handoff` | 对方分片 → 删我分片 → 执行记录 | 两边都有 | 内容一致 ⇒ 只补删我；不同 ⇒ 拒绝交人 |
| 记进展 | `LogProgress` | 分片 `updated` → worklog 追加 | 文档没写 | 不算失败：警告一句 + 退出码 0，已刷的分片照常提交（`AppendExec` 写不进返回 `false`、不抛） |
| 结案 | `CloseTask` | 改标签行（给了 `--tags` 才做）→ 历史行 → 封卷 worklog → 最后删分片 | 历史多一行 / 已封卷 | 历史按 worklog 名去重（`HasLog`）、封卷认标记行（`HasFrozenLine`）、分片已删且历史有这行 ⇒ 「已结案，无需重复」退出码 0；判不出来（`HasLog` 回 `undecidable`）⇒ Fail 并指到当月历史文件 |

没有「改状态」这个动作：状态只随命令语义变（认领 → `doing`、释放 → `open`、结案 → 进历史）；`list --status` 是只读筛选。已知且接受的例外：跨月重跑 `close` 会在两个月各记一行；交接撞上内容不同直接拒绝，不做自动裁决；重跑同一动作会在「执行记录」里再追加一行。

## 七、跨包契约：JSON 模式必须始终输出 JSON

插件调脚本的唯一出口把「输出不是 JSON」当失败：

| 规则 | 边界 |
|---|---|
| 带 `--json` 时，空结果也要出 JSON | `history --json` → `{"count":0,"filters":{…},"records":[],"warnings":[],"capped":false}`；`list --json` → `{}`。空台账工作区不能让看板打不开 |
| 人话只走 stdout 的非 JSON 模式或 stderr | 提示类信息本来就在 stderr，别混进 stdout |
| 真失败照旧非零退出 + stderr 原文 | 空是合法数据，错才是错；空 ≠ 错 |

`history --json` 的 `capped` 为 true 表示 `--limit` 把列表截断了（`count` 是返回条数，截断前总数只能靠放宽 `--limit` 再查）。统计口径一律走 `stats --trend` 的桶（自带区间裁剪与月缓存）。

三个给界面喂数的只读命令同样守「空也要出 JSON」：空台账下 `stats --json` 出全 0 计数 + `thresholds` 回显、`owners --json` 出 `{"count":0,"owners":{}}`、`root --json` 出 `{"root":false,"repo":null,"ledger":null,"reason":…}`（目录不存在也算「不是根」，不报错、不退非零）。

派生值（`stale` / `overdue` / `backlog` 与 `age_days` / `idle_days` / `waiting_days`）只活在 `list` / `stats` 的输出里，任务表与历史行里一概不写。改动脚本 = 动这条契约，「空台账工作区」必须是受支持的行为（只读不得就地建台账）。

插件与 skill 是同一份契约（参数表 + 输出形状 + 退出码），升级必须成对：skill 删 / 改一个参数，旧插件就会拿着老参数撞用法错，导致每个工作区都进 `degraded`。

## 八、插件消费方式

- 待办 = `pool.json` + 索引登记的全部分片里 `open` / `doing`；同一任务号出现在两个文件是搬移中断的中间态，读侧「后读到为准」只显示一次，同号多文件不进 `validate`。
- 「后读到」的顺序定死：先池、再按索引键排序后的各分片 ⇒ 同一号一定由分片那份胜出。顺序不确定会让同一份数据两次查给出不同结果。
- 写入前的防撞：`claim` / `set --owner` 落盘前挡一道（别人分片里已有同号 / 目标分片已有不同内容 ⇒ 拒绝），但跨机同时抢仍有窗口。
- 历史 = 16 列（owner = 负责人筛选面；creator = 发起人，`owner` 可被 claim 改走、「谁建的」不变）。
- 报表只有一个来源：全部由宿主从 `history --json` / `list --json` / `stats --json` 的返回聚合。脚本只按在办层开一个统计入口 `stats`（按状态 + 年龄阈值计数），周期趋势类聚合仍由宿主自己做。分类 / 标签要么在在办任务对象里、要么在历史行里，不需要逐篇扫过程文档。
- 宿主侧台账判定经内嵌脚本 `root --json`（判据 = 目录直接含 `ledger/`），待办 / 历史一律经内嵌脚本读取，不再直接读台账文件；工作区清单来源见 [dsh-workspace-registry.md](../dependencies/dsh-workspace-registry.md)。

## 更新日志

- 2026-11-07 23:03:03：按 koc-code-docwriter 槽位迁移，剔除过程稿并统一标题头
- 2026-11-08 01:29:50：目录结构改为树 + 每行备注，样例时间改为格式串
- 2026-11-08 23:04:19：目录结构统一为字符画树，逐行补说明
- 2026-11-10 22:37:28：统一正文树说明列宽，源码路径补全为仓库内完整路径
