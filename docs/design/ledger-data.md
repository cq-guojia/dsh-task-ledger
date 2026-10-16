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
│   ├── history/<年月>.md          # 已结案索引，按结案时间分月（8 列）
│   └── worklog/<年月>/            # 过程正文，一任务一篇
│       └── <日>-<时分>-<说明>-<随机码>.md
```

## 二、progress.json（在办）

`tasks` 对象，键 = 任务号（`年月日-时分-标题要素-随机码`）。真实样例（本仓 `ledger/progress.json`）：

| 字段 | 值样例 | 说明 |
|---|---|---|
| `title` | 熟悉项目初衷并搭建初始文档架构 | 任务标题 |
| `status` | `open` / `doing` / `blocked` | `done` 只能由 close 产生 |
| `creator` / `owner` | GuoJia-Agent | git 身份 |
| `created` / `started` / `finished` | `2026-10-16 17:42:22` | `finished` 结案前为 null |
| `category` | 建设 | 单值分类 |
| `tags` | ["文档架构","初始化","调研"] | 1~5 个 |
| `worklog` | `worklog/202610/16-1742-…-5563.md` | 相对 `ledger/` 的过程文档路径 |

## 三、history/<年月>.md（已结案，8 列）

| 结案时间 | 创建时间 | 工作包 | 分类 | 标签 | owner | 完成了什么 | 过程文档 |
|---|---|---|---|---|---|---|---|
| 2026-10-16 09:18:12 | 2026-10-16 08:22:40 | koc-ledger-progress 改造为 DSH 插件调研… | 调研 | DSH、台账、NPM | @GuoJia-Agent | 调研完成并落地：… | [../worklog/202610/16-0822-….md](../worklog/202610/16-0822-….md) |

- 按**结案时间**分月落文件；排序按创建时间；**首列是结案时间、次列才是创建时间**（筛选口径别搞反）。
- 存量 `ledger/PROGRESS-HISTORY.md` 只读兼容、永不重写。

## 四、worklog 过程文档

固定五节：**背景 / 待办 / 下一步 / 过程 / 结论**；头部带创建时间、分类 / 标签行；结案时脚本打封卷标记，此后不再修改。模板真源 = skill 的 `assets/worklog.md`。

## 五、插件消费方式（规划）

- 待办 = 各工作区 `progress.json` 的 `open` / `doing` / `blocked`；
- 历史 = `history/<年月>.md` 8 列（owner 列即「创建人 / 提交人」筛选面）；
- 报表 = 同源聚合（category 计数、时间线、按人工作日志）；
- skill 的 `list` / `history` 子命令已有 `--json` 结构化输出，插件可评估「调脚本」与「自解析文件」两条路（未拍板）。
