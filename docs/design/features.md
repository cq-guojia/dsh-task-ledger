# 功能总索引

> **状态**：📝 规划中（2026-10-16 初建；功能设计尚未开始，本表只登记「要做什么」）
> **来源**：用户立项需求（调研任务背景节）+ 调研结论「三个 UI 功能的数据源全部就绪」
> **配套**：架构见 [`architecture.md`](architecture.md)；数据格式见 [`ledger-data.md`](ledger-data.md)

---

## 一、界面功能（规划）

| 功能 | 干什么 | 状态 | 详细文档 |
|---|---|---|---|
| **待办查询** | 各工作区在办任务，按 A/B/C/CD 工作区分组展示（open / doing / blocked） | 📝 待设计 | 待建 `features/todo-board.md` |
| **历史追溯** | 已结案任务，按创建人 / 提交人（owner）筛选，8 列索引 | 📝 待设计 | 待建 `features/history.md` |
| **日志与报表** | 同源聚合：分类计数、时间线、某人工作日志 | 📝 待设计 | 待建 `features/reports.md` |
| **侧栏入口 + 主面板** | 侧栏条目进整页看板（`sidebar.panellist` + `main` 槽） | 📝 待设计 | 待建 `features/main-panel.md` |

## 二、非界面功能（规划）

| 功能 | 干什么 | 状态 | 详细文档 |
|---|---|---|---|
| **skill 全局集成** | 装插件即把 `koc-ledger-progress` 注册进 dsh 全局（`ctx.skills.register`） | 📝 待设计 | 事实见 [`external/dsh-skill-registration.md`](external/dsh-skill-registration.md) |
| **台账数据面** | host 进程跨工作区读 `ledger/` 文件，经 webServer 路由供 UI 消费（JSON + SSE） | 📝 待设计 | 事实见 [`external/host-webserver.md`](external/host-webserver.md) |
| **skill 独立分发** | `koc-ledger-progress` npm 包零代码直发，供 CodeBuddy / 其他 agent 安装 | 📝 待设计 | 发布事实见 [`external/publish-oidc.md`](external/publish-oidc.md) |

---

## 三、维护规矩

- **新增功能**：在 `features/` 下建一个文件（kebab-case），并在本表加一行。
- **改功能**：先改 `features/<功能>.md`，再在本表同步状态。
- 本表只写「有什么 / 干什么 / 在哪」；**实现过程与踩坑一律进 `ledger/worklog/`**。
