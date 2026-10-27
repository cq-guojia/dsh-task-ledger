# task-ledger

> 给人看的概览与索引。给 agent 的执行说明在 `SKILL.md`（每次会话整份注入），两者不重复；本文件不进 agent 上下文、不占 token。

## 它做什么

管一个工作区 / 项目的任务进度（开发活、琐事、调研、备忘都算），一共三件东西：

- **谁在做、做到哪**：状态只在台账 JSON —— `ledger/pool.json`（公共池）+ 每人一份 `ledger/owners/<hash>.json` 分片，索引 `ledger/owners.json`。
- **过程正文**：全在 `ledger/worklog/<年月>/<月日>-<时分>-<说明>-<码>.md`（六节），agent 直接编辑前五节，末节「执行记录」只由脚本写。
- **已结案**：一行一条在 `ledger/history/<年月>.md`（9 列），只由脚本写。

状态改动与正文重写分开、全部经脚本改 —— 不另建副本、不手改状态表和历史。覆盖动作：建任务、认领、释放、结案、查在办、查历史、标签归并、体检。

## 文件布局（脚本只写这些）

| 文件 | 装什么 |
|---|---|
| `ledger/pool.json` | 公共池：未认领任务（owner 空） |
| `ledger/owners.json` | 索引：身份 uuid → 分片文件（`name` 只做显示 / 模糊筛） |
| `ledger/owners/<hash>.json` | 每人一份分片：自己认领的任务 |
| `ledger/worklog/<年月>/*.md` | 任务正文（六节） |
| `ledger/history/<年月>.md` | 已结案（一行一条，9 列） |

## 为什么这么设计

跨项目固定用 `ledger/`（不占项目的 `docs/`）；状态用 JSON 而非 Markdown（改动面最小）；状态与过程正文分离（互不踩）；一人一份分片把并发冲突面从整份文件缩到公共池里几行；**所有存盘时间（含过程文档里的日志行）一律 UTC**，脚本输出时统一转本机时区（人话与 `--json` 一致）。

## 怎么用（执行规则在 SKILL.md）

直接跑：

```bash
<SKILL.md 所在目录>/scripts/progress <子命令> --repo <工作区根>
```

`scripts/progress` 按平台 exec `scripts/bin/ledger-<os>-<arch>`（静态二进制；已带 linux/amd64、darwin/arm64 与 windows/amd64）。

**不需要安装任何东西**：直接执行上面那个路径就行。它是个 `sh` 脚本——若某个安装环节丢了可执行位（报 `Permission denied`），前面加 `sh ` 照样能跑：`sh <SKILL.md 所在目录>/scripts/progress <子命令> --repo <工作区根>`。

子命令：`new` `claim` `set` `log` `close` `list` `history` `show` `whoami` `validate`。命令参考（参数 / 一句话 / 举例）、任务生命周期、纪律（数据完整性 / 人类授权 / 故障处置）全在 `SKILL.md`；参数细节看 `<子命令> --help`（不要凭记忆编）。

## 深入参考（references/，按需读）

| 文件 | 看什么 |
|---|---|
| [`references/state-model.md`](references/state-model.md) | 状态机、时间口径（UTC / 本地、补录、筛选）、任务号、身份 |
| [`references/log-note.md`](references/log-note.md) | 执行记录什么算一个节点、`--note` 怎么写（正 / 反例） |
| [`references/troubleshooting.md`](references/troubleshooting.md) | 退出码、常见错误、硬约束、环境要求（git ≥ 2.27） |

## 本仓自己的台账

本仓库（`dsh-task-ledger`）也用自己的这套脚本（`scripts/progress` → `src/` 编译出的二进制）管自己的活，台账数据在 `ledger/`；它和本 skill 源码 `packages/skill/` 是两回事 —— **改 skill 请别动 `ledger/`**。
