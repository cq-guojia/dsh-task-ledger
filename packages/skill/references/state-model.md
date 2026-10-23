# 状态与时间模型

> TL;DR：状态只有 `open` / `doing`；`done` 由 `close` 产生。逾期 = `started` 满 14 天、停滞 = `updated` 满 3 天、积压 = `created` 满 30 天仍 `open`，看板算、不存字段。`updated` 由 `new/claim/set/log` 刷新。owner = 当前 git 邮箱。

## 状态机

```
new              → ledger/pool.json（open，owner 空）
pool ──claim──> 自己的分片（doing，owner = 我）──close──> ledger/history（移出分片）
doing ──set --status open──> 搬回 pool.json（open，owner 与 started 都清空）   # 执行记录类型 release
```

- **一人一份**：`ledger/owners/<hash>.json`。认领 / 释放一律**搬文件**（先写目标、再删原处），
  所以同一任务号可能因中途崩溃短暂出现在两个文件里 —— 再跑一次同一条命令即可（幂等），
  或者用 `validate` 报出来再手动删多余那份。
- 池里的任务只读：要改先 `claim`。`tags --rename` / `set` 只作用于自己分片。
- `new --self` 直接写进自己分片（doing）；`new` 不带 `--self` 写进 `pool.json`（open）。
- **释放会连带清空 `started`**：别人重新 `claim` 时按新的接单时间重算 `started` —— 逾期 14 天从「他接的那天」算起，
  不是从第一次接单算。要看任务总共搁了多久用 `created`。

- `open`：已建、等认领。`doing`：已认领、在做。`done` 只由 `close` 产生。
- **没有 `blocked` 状态**（2026-10-19 取消）。旧数据里残留的 `blocked` 读侧当进行中：`list --status blocked` 可捞出，用 `set --status doing` 归位；新写入一律拒绝。

## 三个标记（看板计算，不是状态）

| 标记 | 依据 | 阈值 |
|---|---|---|
| 积压 | `created`（建了）至今仍 `open`（没人认领） | 满 30 天 |
| 逾期 | `started`（接任务）至今，中途更新不影响 | 满 14 天 |
| 停滞 | `updated`（最后推进）至今 | 满 3 天 |

- 真源：`packages/plugin/src/host/services/home.service.ts` 的 `BACKLOG_DAYS = 30` / `OVERDUE_DAYS = 14` / `STALE_DAYS = 3`；看板随响应下发三个天数，界面文案不硬编码。
- 脚本不算这三个值，台账里也不存；agent 要回答「哪些停太久」时用 `list --json` 的 `created` / `updated` / `started` 与当前时间比。
- 老数据没有 `updated` 时，读侧回退到 `started`，再到 `created`。

## 时间

- **精度**：任务号、worklog 目录与文件名到分（`年月日-时分`）；其余记录到秒（`YYYY-MM-DD HH:MM:SS`）。
- **默认不传**：`new` 创建、`claim` / `set` 推进、`log` 刷新 `updated`、`close` 结案，脚本都取当前时刻。
- **只在补录过去时间时传**：`new --created`、`close --finished`。格式 `YYYY-MM-DD[ HH:MM[:SS]]`，脚本补全到秒；非法值拒绝。
  **`new --created` 补录时 `updated` 会一并等于该时间**，之后记得补一条 `log`，否则看板算它停滞。
- **筛选语义**：`list` / `history` 的 `--since` / `--until` 按**创建时间**；只给日期时，起 = 当天 `00:00:00`、止 = 当天 `23:59:59`（含整天）。
- **history 列序**：第一列结案时间、第二列创建时间；排序按创建时间。
- **时区：全链路 UTC**（2026-10-22 起）。存盘值（任务号 / worklog 文件名、分片与 `pool.json` 的 `created`/`started`/`updated`/`finished`、history 行、分月归档）一律 UTC，不带偏移量后缀 —— `2026-10-22 02:30:00` 语义即 UTC。
  - **写**：`now()` 取 UTC；`--created` / `--finished` 按**本地墙钟**录入，脚本内部转 UTC 再存。
  - worklog 的「执行记录」行时间、封卷行时间、worklog 头部「创建时间」同样存 UTC。
  - **读/筛**：`--since` / `--until` 也收本地时间，内部转 UTC 比较；人看的输出（`list` / `history` 文本）转回本机时区显示，`--json` 原样给 UTC。
  - **存量老数据**（2026-10-22 前）写的是写入者本地时间、无标记，无法与 UTC 区分：显示会偏后若干小时、`--since` / `--until`
    也会整体偏一个时区，按「无后缀 = 写入者本地」兼容读；迁移口径见本仓工作日志「台账数据面改分片」那条的迁移注记。

## 任务号

`年月日-时分` + 标题里的字母/数字/汉字 + 4 位随机码（如 `20261015-1430-登录接入-sso-7f3a`）。要指定就传 `--id`（小写字母、数字、汉字、连字符）。

## 身份

- 身份主键 = **git 邮箱**（`git var GIT_COMMITTER_IDENT` 里的 email，取不到退回 `git config user.email`），
  归一化（去空白 + 小写）；分片文件名 = `sha256(归一化身份)[:12] + ".json"`。
- 目录在 git 仓库里却读不到邮箱 ⇒ 直接报错（git 自己也提交不了，报错与之对齐）；判「在不在仓库里」用的是
  `--repo` 指向的那个目录，不是当前工作目录。
  不在仓库里 / 没装 git 才走兜底链（系统用户名 → 主机名 → `default`），并提示一次身份是猜的。
- 取身份的命令：`new`（记 creator）、`claim`、`set`、`close`、`log`、`tags --rename`、`list`（默认范围与 `--mine` / `--owner me`）、`history --mine`。
  `list --owner <身份>` / `history --owner <身份>` 是只读查询，不校验身份。
- `set` / `close` / `log` 只在自己分片里找任务：**不是你的、或还在 `pool.json` 里，直接拒绝**。

## 文件结构

- `pool.json` = `{version, tasks}`；`owners.json` = `{version, workers{身份: {file, name, joined}}}`；
  分片 = `{version, identity{email, name, joined}, tasks}` —— 分片自带 `identity` 是为了索引丢了能自证。
- `version` = **文件格式版本号**（`FORMAT_VERSION`，形如 `20261022000000`，用时间戳拼成、但压成紧凑数字串，**不**像可阅读的日期）：
  建文件时原样抄常量，运行时永不自己算；读到不一致只提示不改，缺了也照读、写回时补当前值。
