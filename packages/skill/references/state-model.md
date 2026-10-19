# 状态与时间模型

> TL;DR：状态只有 `open` / `doing`；`done` 由 `close` 产生。逾期 = `started` 满 14 天、停滞 = `updated` 满 3 天、积压 = `created` 满 30 天仍 `open`，看板算、不存字段。`updated` 由 `new/claim/set/log` 刷新。owner 只取当前 git 身份。

## 状态机

```
open ──claim──> doing ──close──> ledger/history（移出状态表）
doing ──set --status open──> open          # 释放认领，执行记录类型 release
```

- `open`：已建、等认领。`doing`：已认领、在做。`done` 只由 `close` 产生。
- **没有 `blocked` 状态**（2026-10-19 取消）。旧数据里残留的 `blocked` 读侧当进行中：`list --status blocked` 可捞出，用 `set --status doing` 归位；新写入一律拒绝。

## 三个标记（看板计算，不是状态）

| 标记 | 依据 | 阈值 |
|---|---|---|
| 积压 | `created`（建了）至今仍 `open`（没人认领） | 满 30 天 |
| 逾期 | `started`（接任务）至今，中途更新不影响 | 满 14 天 |
| 停滞 | `updated`（最后推进）至今 | 满 3 天 |

- 真源：`packages/plugin/src/host/services/home.service.ts` 的 `BACKLOG_DAYS = 30` / `OVERDUE_DAYS = 14` / `STALE_DAYS = 3`；看板随响应下发三个天数，界面文案不硬编码。
- 脚本不算这三个值，`progress.json` 里也不存；agent 要回答「哪些停太久」时用 `list --json` 的 `created` / `updated` / `started` 与当前时间比。
- 老数据没有 `updated` 时，读侧回退到 `started`，再到 `created`。

## 时间

- **精度**：任务号、worklog 目录与文件名到分（`年月日-时分`）；其余记录到秒（`YYYY-MM-DD HH:MM:SS`）。
- **默认不传**：`new` 创建、`claim` / `set` 推进、`log` 刷新 `updated`、`close` 结案，脚本都取当前时刻。
- **只在补录过去时间时传**：`new --created`、`close --finished`。格式 `YYYY-MM-DD[ HH:MM[:SS]]`，脚本补全到秒；非法值拒绝。
  **`new --created` 补录时 `updated` 会一并等于该时间**，之后记得补一条 `log`，否则看板算它停滞。
- **筛选语义**：`list` / `history` 的 `--since` / `--until` 按**创建时间**；只给日期时，起 = 当天 `00:00:00`、止 = 当天 `23:59:59`（含整天）。
- **history 列序**：第一列结案时间、第二列创建时间；排序按创建时间。

## 任务号

`年月日-时分` + 标题里的字母/数字/汉字 + 4 位随机码（如 `20261015-1430-登录接入-sso-7f3a`）。要指定就传 `--id`（小写字母、数字、汉字、连字符）。

## 身份

- owner 恒取 `git config user.name`；读不到直接报错，**不做兜底**（先让用户配好 git）。
- 取身份的命令：`new`（记 creator）、`claim`、`set`、`close`、`log`、`list --mine`、`history --mine`。`history --owner <别人>` 是只读查询，不校验身份。
- `set` / `close` / `log` 都校验「owner 是不是你」；不是你的、或任务还没人认领，直接拒绝。
