# task-ledger

> 给人看的概览与索引。给 agent 的执行说明在 `SKILL.md`（每次会话整份注入），两者不重复；本文件不进 agent 上下文、不占 token。

## 它做什么

管一个工作区 / 项目的任务进度（开发活、琐事、调研、备忘都算），一共三件东西：

- **谁在做、做到哪**：状态只在台账 JSON —— `ledger/pool.json`（公共池）+ 每人一份 `ledger/owners/<hash>.json` 分片，索引 `ledger/owners.json`。
- **过程正文**：全在 `ledger/worklog/<年月>/<日>-<时分>-<说明>-<码>.md`（六节），agent 直接编辑前五节，末节「执行记录」只由脚本写。
- **已结案**：一行一条在 `ledger/history/<年月>.md`（9 列），只由脚本写。

状态改动与正文重写分开、全部经脚本改 —— 不另建副本、不手改状态表和历史。覆盖动作：建任务、认领、交接、改状态、结案、查在办、查历史、体检。

## 文件布局（脚本只写这些）

| 文件 | 装什么 |
|---|---|
| `ledger/pool.json` | 公共池：未认领任务（owner 空） |
| `ledger/owners.json` | 索引：git 邮箱身份 → 分片文件 |
| `ledger/owners/<hash>.json` | 每人一份分片：自己认领的任务 |
| `ledger/worklog/<年月>/*.md` | 任务正文（六节） |
| `ledger/history/<年月>.md` | 已结案（一行一条，9 列） |

## 为什么这么设计

跨项目固定用 `ledger/`（不占项目的 `docs/`）；状态用 JSON 而非 Markdown（改动面最小）；状态与过程正文分离（互不踩）；一人一份分片把并发冲突面从整份文件缩到池里几行；时间全链路 UTC、显示才回本地。**完整论证见 [`references/design.md`](references/design.md)。**

## 怎么用（执行规则在 SKILL.md）

直接跑：

```bash
python3 <SKILL.md 所在目录>/scripts/progress.py <子命令> --repo <当前工作区>
```

子命令：`new` `claim` `set` `log` `close` `list` `history` `show` `tags` `validate`。意图→命令路由、铁律、写操作红线、出错即停全在 `SKILL.md`；参数细节看 `<子命令> --help`（不要凭记忆编）。

## 深入参考（references/，按需读）

| 文件 | 看什么 |
|---|---|
| [`references/design.md`](references/design.md) | 设计为什么这样：目录 / JSON / 分片 / 时区 / 并发 / 历史归档… 的完整论证 |
| [`references/state-model.md`](references/state-model.md) | 状态机、三个时间标记（积压 / 逾期 / 停滞）、时间精度与 UTC、任务号、身份 |
| [`references/worklog.md`](references/worklog.md) | 过程文档六节结构、「执行记录」只由脚本追加 |
| [`references/log-note.md`](references/log-note.md) | 执行记录什么算一个节点、`--note` 怎么写（正 / 反例） |
| [`references/taxonomy.md`](references/taxonomy.md) | 分类与标签口径（单值 vs 0~5、精确 vs 包含） |
| [`references/troubleshooting.md`](references/troubleshooting.md) | 退出码、常见错误、硬约束、环境要求（git ≥ 2.27） |

## 本仓自己的台账

本仓库（`dsh-task-ledger`）也用 ledgerkit 管自己的活，台账数据在 `ledger/`；它和本 skill 源码 `packages/skill/` 是两回事 —— **改 skill 请别动 `ledger/`**。
