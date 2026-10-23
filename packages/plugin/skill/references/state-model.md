# 状态与时间模型

> TL;DR：状态只有 `open` / `doing`；`done` 由 `close` 产生。认领即 `doing`（`claim` / `new --self` 都直接置）。`started` = 首次认领时间，释放不清、重新认领不刷新。`updated` 由 `new/claim/set/log` 刷新。身份由脚本自取，agent 不传 owner。

## 状态机

```
new               → 公共池（open，没人认领）
new --self        → 自己名下（doing，记 started）
公共池 ──claim──▶ 自己名下（doing；started 空则补 now）
set --owner ""    → 公共池（open，没人认领；started 保留）
set --owner 别人   → 对方名下（预留转接通道，agent 不用）
close             → 历史层 + 封卷 + 移出自己名下
```

- **`started` 是外卖计时器**：首次认领盖上之后，释放（`set --owner ""`）不清、重新认领不刷新 —— 逾期时钟从首次认领一口气跑到结案，转手不重置。防的是「眼看要超时，释放掉再认领回来洗时钟」；全链路没有重置 `started` 的命令（`claim` 的 `or now()` 只在它为空时才盖值；`set` 原样保留）。接手一个已超时的任务，一接单即逾期：单子已经迟了，谁端着谁负责；责任归属看执行记录流水（谁认领 / 谁释放逐笔有记录），计时器只回答「这单迟没迟」。
- 旧数据里的 `blocked`：读侧按 `doing` 算 —— `list --status doing` 能捞出，`--status blocked` 反而一条都匹配不到；没有归位命令，也不需要（只是读数）。
- 认领 / 释放 / 交接一律先写目标、再删原处，崩在中间会同一任务号短暂出现在两处 —— 重跑一次同一条命令即幂等收敛（`already_done`），或按 `validate` 的提示删掉多余那份。

## 时间

- **精度**：任务号、worklog 目录与文件名到分（`年月日-时分` / `YYYYMM`）；其余记录到秒（`YYYY-MM-DD HH:MM:SS`）。
- **默认不传**：`new` / `claim` / `set` / `log` / `close` 都取当前时刻。
- **只在补录过去时间时传**：`new --created`、`close --finished`。格式 `YYYY-MM-DD[ HH:MM[:SS]]`，按本地墙钟给、脚本内部转 UTC。`new --created` 补录时 `updated` 一并等于该时间 —— 之后补一条 `log` 把 `updated` 刷回当前。
  - 注意：任务号前缀与 worklog 月份目录按 **UTC** 推 —— UTC+8 下裸日期 `--created 2026-01-05` 存成 `2026-01-04 16:00:00`，任务号前缀变成 `20260104-1600`；临午夜补录要连时间一起传。
- **筛选语义**：`list` / `history` 的 `--since` / `--until` 按**创建时间**；只给日期时起 = 当天 `00:00:00`、止 = 当天 `23:59:59`（含当天）。
- **时区**：存盘为 UTC 的只有 —— 任务号、worklog 目录 / 文件名、台账 JSON 的 `created`/`started`/`updated`/`finished`、history 行、worklog 头部「创建」行。**执行记录行、封卷行、`list` / `history` 的人话输出都是本机本地时间**（给人看的日志行）；`--json` 原样给 UTC，由消费方自己转。存量老数据（2026-10-22 前）写的是写入者本地时间、无标记，无法与 UTC 区分。
- **history 文件 9 列**：结案时间 / 创建时间 / 工作包（= `new --title` 的任务标题）/ 分类 / 标签 / owner / creator / 摘要 / 过程文档；排序与 `--since` / `--until` 按创建时间。（`history` 命令的人话输出只展示其中几列：结案时间、负责人、标题。）

## 任务号

`年月日-时分` + 标题里的字母 / 数字 / 汉字 + 4 位随机码（如 `20261015-1430-登录接入-sso-7f3a`）。随机码必须保留：任务号只在在办任务里去重，而 worklog 结案后仍留在磁盘上，去掉随机码会让新任务与已结案的过程文档同名、覆盖历史。想自己指定就传 `--id`（小写字母、数字、汉字、连字符）。

## 身份

- 主键 = **git 邮箱**（`git var GIT_COMMITTER_IDENT` 里的 email，退回 `git config user.email`），归一化（去空白 + 小写）后比对。
- 读不到邮箱**不报错**：走兜底链（`USER`/`LOGNAME` → `getpass` → 主机名 → 字面 `default`）并出一条提示，命令照常跑完。看到提示要告诉用户配好 git，否则任务记到兜底身份名下。
- `owners.json` 里的 `aliases` 会并进身份比对；`list --owner` / `history --owner` 是归一化后的**精确匹配**，没有 `me` 缩写，「自己」用 `--mine`。
- `set` / `close` / `log` 只在自己名下找任务：不是你的、或还在公共池里，直接拒绝。

## 历史层

- 按**结案时间**分月存放，9 列（creator 在 owner 之后）；`close` 从任务直写分类 / 标签终值。
- 存量平铺历史文件只读兼容、永不重写；`history` 合并全部来源，行里的 worklog 链接相对该行所在文件解析。
- `history --json` 直接按文件现状解析，旧行没有的列不编造；`close` 追加历史行时才会把旧行升级补上 creator。
