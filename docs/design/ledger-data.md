# 数据说明：台账文件格式（插件唯一数据源）

> **状态**：✅ 已核实（2026-10-16，对照真实工作区文件 + skill 源码）
> **来源**：`task-ledger` skill（`scripts/progress.py` + `assets/worklog.md`）为格式真源；样例取自 NAS-Docker 工作区与本仓 `ledger/`
> **配套**：架构见 [`architecture.md`](architecture.md)；skill 分发见 [`external/dsh-skill-registration.md`](external/dsh-skill-registration.md)

本项目**不自建数据库**：插件只读各工作区的台账文件。格式真源在 skill 侧；history 列数等字面值若随 skill 调整，以 skill 代码为准回改本文。

## 一、目录布局（每个工作区根下）

```
<工作区>/
├── ledger/
│   ├── progress.json              # 在办任务状态表（只由 skill 脚本写）
│   ├── history/<年月>.md          # 已结案索引，按结案时间分月（9 列，2026-10-17 起）
│   └── worklog/<年月>/            # 过程正文，一任务一篇
│       └── <日>-<时分>-<说明>-<随机码>.md
```

## 二、progress.json（在办）

`tasks` 对象，键 = 任务号（`年月日-时分-标题要素-随机码`）。真实样例（本仓 `ledger/progress.json`）：

| 字段 | 值样例 | 说明 |
|---|---|---|
| `title` | 熟悉项目初衷并搭建初始文档架构 | 任务标题 |
| `status` | `open` / `doing` | `done` 只能由 close 产生；`blocked` 是旧数据，读侧当进行中（2026-10-19 起逾期改由时间判定） |
| `creator` / `owner` | GuoJia-Agent | git 身份 |
| `created` / `started` / `updated` / `finished` | `2026-10-16 17:42:22` | `finished` 结案前为 null；`updated` = 最后一次推进（建 / 认领 / 改状态 / 交接 / 补执行记录），老数据可能缺失（看板回退到 `started` / `created`） |
| `category` | 建设 | 单值分类 |
| `tags` | ["文档架构","初始化","调研"] | 1~5 个 |
| `worklog` | `worklog/202610/16-1742-…-5563.md` | 相对 `ledger/` 的过程文档路径 |

## 三、history/<年月>.md（已结案，9 列）

> 存量 8 列文件的手动升级步骤（逐文件清单 + 一键命令）：见 [`docs/history-creator-upgrade.md`](../history-creator-upgrade.md)。

| 结案时间 | 创建时间 | 工作包 | 分类 | 标签 | owner | creator | 完成了什么 | 过程文档 |
|---|---|---|---|---|---|---|---|---|
| 2026-10-16 09:18:12 | 2026-10-16 08:22:40 | koc-ledger-progress 改造为 DSH 插件调研… | 调研 | DSH、台账、NPM | @GuoJia-Agent | @GuoJia-Agent | 调研完成并落地：… | [../worklog/202610/16-0822-….md](../worklog/202610/16-0822-….md) |

- 按**结案时间**分月落文件；排序按创建时间；**首列是结案时间、次列才是创建时间**（筛选口径别搞反）。
- 存量 `ledger/PROGRESS-HISTORY.md` 只读兼容、永不重写。

## 四、worklog 过程文档

固定六节：**背景 / 待办 / 下一步 / 过程 / 结论 / 执行记录**；头部带创建时间、分类 / 标签行；结案时脚本打封卷标记，此后不再修改。模板真源 = skill 的 `assets/worklog.md`。

末节「执行记录」**由脚本维护、禁手改**：`new` / `claim` / `set` / `close` 各自自动追加一行，agent 改完正文后用 `log --id <任务号> --note "…"` 补一条。每行固定 `- 时间 · 类型 · @谁 · 说明`，类型取 `new` / `claim` / `set` / `release`（`set --status open` 单列）/ `log` / `close`；**只追加、不改旧行**，移交后旧记录仍记在原负责人名下。升级前建的老 worklog 没有这一节：首次记录时脚本在文末自动补一节（正文不迁移）；过程文档丢失则 `log` 报错，不静默成功。

## 五、插件消费方式（规划）

- 待办 = 各工作区 `progress.json` 的 `open` / `doing`（`blocked` 旧数据按进行中收）；
- 历史 = `history/<年月>.md` 9 列（owner = 负责人 / 提交人筛选面；creator = 发起人，2026-10-17 新增——
  owner 可被 claim 改走，「谁建的」不变；看板「新增（我的）= 我创建的」靠它，与完成/未结(mine) 的 owner 口径区分）；
- 报表 = 同源聚合（category 计数、时间线、按人工作日志）；
- skill 的 `list` / `history` 子命令已有 `--json` 结构化输出，插件可评估「调脚本」与「自解析文件」两条路（未拍板）。

## 六、跨包契约：JSON 模式必须**始终**输出 JSON

插件调 skill 脚本只有一个出口（`host/script.ts::runLedgerScript`），它把「输出不是 JSON」当失败。因此：

| 规则 | 反例（2026-10-17 真机 500） |
|---|---|
| 带 `--json` / `--count-only` 时，**空结果也要出 JSON**（`{"count":0,"records":[]}`） | `history` 在「没有任何历史文件」时直接 print 人话后 return ⇒ 插件 `getClosedCounts` 抛错 ⇒ `/board` 整条 500。**一个空台账工作区就能让整个看板打不开** |
| 人话只走 stdout 的非 JSON 模式，或 stderr | 提示类信息本来就在 stderr，别混进 stdout |
| 真失败照旧非零退出 + stderr 原文（不伪装成空 JSON） | 空 ≠ 错：空是合法数据，错才是错 |

改动 skill 脚本 = 动这条契约 ⇒ 冒烟必须带上「空台账工作区」用例（`smoke.mjs` 已有，勿删）。
