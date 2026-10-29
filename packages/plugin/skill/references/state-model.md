# 状态与时间模型

> TL;DR：状态只有 `open` / `doing`；`done`（正常结案）/ `cancelled`（取消，`close --cancel`）由 `close` 产生。认领即 `doing`（`claim` / `new --self` 都直接置）。`started` = 首次认领时间，释放不清、重新认领不刷新。`updated` 由 `new/claim/set/log` 刷新。身份由脚本自取，agent 不传 owner。

## 状态机

```
new               → 公共池（open，没人认领）
new --self        → 自己名下（doing，记 started）
公共池 ──claim──▶ 自己名下（doing；started 空则补 now）
set --release      → 公共池（open，没人认领；started 保留）
set --owner 别人   → 对方名下（预留转接通道，agent 不用）
close             → 历史层 + 封卷 + 移出自己名下
```

- **`started` 是外卖计时器**：首次认领盖上之后，释放（`set --release`）不清、重新认领不刷新 —— 逾期时钟从首次认领一口气跑到结案，转手不重置。防的是「眼看要超时，释放掉再认领回来洗时钟」；全链路没有重置 `started` 的命令（`claim` 的 `or now()` 只在它为空时才盖值；`set` 原样保留）。接手一个已超时的任务，一接单即逾期：单子已经迟了，谁端着谁负责；责任归属看执行记录流水（谁认领 / 谁释放逐笔有记录），计时器只回答「这单迟没迟」。
- 状态只有 `open` / `doing` 两种在办值；`done` / `cancelled` 由 `close` 产生（任务从池或分片消失，只留在历史里；`cancelled` 是 `close --cancel`）。**没有 `blocked`**，也没有改状态的命令。
- 认领 / 释放 / 交接一律先写目标、再删原处，崩在中间会同一任务号短暂出现在两处 —— 重跑一次同一条命令即幂等收敛（`already_done`），或按 `validate` 的提示删掉多余那份。

## 时间

- **精度**：任务号、worklog 目录与文件名到分（`年月日-时分` / `YYYYMM`）；其余记录到秒（`YYYY-MM-DD HH:MM:SS`）。
- **默认不传**：`new` / `claim` / `set` / `log` / `close` 都取当前时刻。
- **只在补录过去时间时传**：`new --created`、`close --finished`。格式 `YYYY-MM-DD[ HH:MM[:SS]]`，按本地墙钟给、脚本内部转 UTC。`new --created` 补录时 `updated` 一并等于该时间 —— 之后补一条 `log` 把 `updated` 刷回当前。
  - 注意：任务号前缀与 worklog 月份目录按 **UTC** 推 —— UTC+8 下裸日期 `--created 2026-01-05` 存成 `2026-01-04 16:00:00`，任务号前缀变成 `20260104-1600`；临午夜补录要连时间一起传。
- **筛选语义**：`list` 的 `--since` / `--until` 按**创建时间**；`history` 的按**结案时间**（历史文件按结案月归档，按创建时间比较会漏「上月建、本月结」的记录）。只给日期时起 = 当天 `00:00:00`、止 = 当天 `23:59:59`（含当天）。
- **时区**：**存盘一律 UTC，出门一律本机时区**。
  - 存盘：任务号、worklog 目录 / 文件名、台账 JSON 的 `created`/`started`/`updated`/`finished`、history 行、worklog 头部「创建」行与「状态」行、封卷行、每条执行记录行。
  - 出门：`list` / `show` / `history` 的输出（人话表格与 `--json` 同一个值）都是本机时区，**拿到的就是能直接显示的**，不要再转。
  - 进门：`--since` / `--until` / `--created` / `--finished` 按本机墙钟给，脚本内部转 UTC 再比较 / 落盘；除这四个参数没有任何地方要调用方传时间。
  - **过程文档正文不动**：`show --json` 的 `worklog.text` 是原文，里面的时间是当时写进去的 UTC。
  - 存量老数据写的是写入者本地时间、无标记，无法与 UTC 区分（JSON 是 2026-10-22 前，执行记录行是 2026-10-27 前）。
- **history 文件 12 列**：Finished / Created / Title / Category / Tags / Owner / Owner Name / Creator / Creator Name / Summary / Result / Worklog（2026-10-29 起写英文表头；11 列旧文件不再兼容：读时跳过该行并告警，结案往里追加会直接报错要求先迁移）；排序与 `--since` / `--until` 按**结案时间**。（`history` 命令的人话输出只展示其中几列：结案时间、负责人、标题。）
- **owner / creator 两列存的是 uuid**（与任务里一致，身份只认 uuid）；紧随其后的 `owner_name` / `creator_name` 两列**落盘**结案那一刻的显示名 —— 改名不回写旧行，看历史看到的就是当时那个名字。老行（升级前落的）没有名字时按名册兜底补一次展示值，**不回写文件**。

## 任务号

`年月日-时分` + 标题里的字母 / 数字 / 汉字 + 4 位随机码（如 `20261015-1430-登录接入-sso-7f3a`）。随机码必须保留：任务号在**公共池、我自己的分片**两处查重（并发安全闸门），并直接判**过程文档路径** `worklog/<创建月>/<去前缀名>.md` 是否已存在 —— 在办、已结案任务的文档都留在磁盘上，命中即号被占过（复用会撞同一篇文档、日后让 `close` 误判 `already_done` 变僵尸）。O(1)，不必扫历史。想自己指定就传 `--id`（小写字母、数字、汉字、连字符）。

## 身份

- 主键 = **本机 UUID**（`~/.taskledger/identity.json` 里的 `uuid`），归一化后比对；`name` 只用于显示与 `--owner-name` 模糊筛。
- 没有 `identity.json`（未初始化）**直接报错**，提示先跑 `init`（一台机器一次）；不再有兜底身份，也不读 git / 环境变量。
- 全站只认 UUID 这一个身份键；`list --owner` / `history --owner` **只收 uuid**（形态不是 UUID 直接报错，不静默返回空），没有 `me` 缩写，「自己」用 `--mine`。
- **名字不进任何判定**：按人模糊找只能走 `--owner-name <片段>`（对名册里的 `name` 做子串、不分大小写匹配，换成 uuid 集合再筛），它只是查询便利，认领 / 释放 / 交接 / 「我的」一律只比 uuid。任务上的 `owner_name` 是冗余显示字段，改名不影响归属。
- `log` 只对自己名下的任务生效；`close` 对自己名下的做结案/取消，对公共池任务只能 `--cancel`（`close --cancel`），别人名下的拒绝；`set --release` 对已在公共池里的任务是幂等空转（退 0）；`set --owner <自己>` 会把公共池里的任务认领到自己名下。

## 历史层

- 按**结案时间**分月存放，12 列（列序：Owner 之后是 `Owner Name`，再是 Creator、`Creator Name`，Summary 之后是 Result，末列 Worklog）；`close` 写历史行时：分类用任务原值（**建任务后不可改**），标签用终值。
- 存量平铺历史文件只读兼容、永不重写；`history` 连同它在内、按下面的月份区间合并。
- **查询区间**：`history` 先由时间参数算出要读的月份文件，再逐个「存在才读、缺月跳过」，不扫磁盘。无时间参数默认最近 3 个自然月；`--months N`（近 N 月）与 `--since/--until`（结案时间闭区间）二选一；一次最多读 13 个历史文件（按月分文件，不区分连续/分散，只数总数），超出直接报错、不读任何文件。末列文档链接只按**文件名**消费（取 basename），链接里的 `../worklog/<年月>/` 前缀只为阅读器跳转服务，解析时忽略。
- `history --json` 直接按文件现状解析，旧行没有的列不编造（名字列为空就按名册补展示值，不回写）；存量九列的历史文件按 `docs/history-creator-upgrade.md` 一次性升级，脚本不认旧列数。
