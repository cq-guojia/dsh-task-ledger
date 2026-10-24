# 功能总索引

> **状态**：🔵 首页已落码、统计报表 tab 待建（2026-10-16 初建；2026-10-16 深夜首页方案已拍板，见表内状态）
> **来源**：用户立项需求（调研任务背景节）+ 调研结论「三个 UI 功能的数据源全部就绪」+ 面板需求讨论结案结论
> **配套**：架构见 [`architecture.md`](architecture.md)；数据格式见 [`ledger-data.md`](ledger-data.md)

---

## 一、界面功能

| 功能 | 干什么 | 状态 | 详细文档 |
|---|---|---|---|
| **台账看板首页** | 左侧栏条目（`sidebar.panellist`）+ `main` 整页入口；8 统计卡（2×4，不可点）+ 近 8 周趋势图 + 统一任务列表（历史查询 = 「已结案」筛选态，不单开 tab）+ 筛选行 + 任务按钮矩阵（认领并开始 / 继续 / 移交 / 结束任务 / 放弃） | 🔵 首页已落码并改版（2026-10-17：8 统计卡 + 近 8 周趋势图 + 两区列表）。写入路径 2026-10-18 已拍板（B 分流）；**结束任务的 host 方法已落地**（`POST /close` + 预置提示词），按钮界面与认领 / 释放的 host 直写待做 | [`features/board-home.md`](features/board-home.md) |
| **统计报表** | 独立「统计」tab：分类分布、按人完成数、本周 / 累计趋势、时间线（同源聚合）；首页已落码的 8 统计卡 + 趋势图不在此列 | 📝 待设计（首页统计卡与趋势图已落码，本行特指独立统计 tab） | 待建 `features/board-stats.md` |

## 二、非界面功能（规划）

| 功能 | 干什么 | 状态 | 详细文档 |
|---|---|---|---|
| **skill 全局集成** | 装插件即把 `task-ledger` 注册进 dsh 全局（`ctx.skills.register`） | 📝 待设计 | 事实见 [`external/dsh-skill-registration.md`](external/dsh-skill-registration.md) |
| **台账数据面** | host 进程跨工作区读 `ledger/` 文件，经 webServer 路由供 UI 消费（JSON，按需查询，无 SSE 推送） | 📝 待设计 | 事实见 [`external/host-webserver.md`](external/host-webserver.md) |
| **skill 独立分发** | `task-ledger` npm 包零代码直发，供 CodeBuddy / 其他 agent 安装 | 📝 待设计 | 发布事实见 [`external/publish-oidc.md`](external/publish-oidc.md) |

---

## 三、维护规矩

- **新增功能**：在 `features/` 下建一个文件（kebab-case），并在本表加一行。
- **改功能**：先改 `features/<功能>.md`，再在本表同步状态。
- 本表只写「有什么 / 干什么 / 在哪」；**实现过程与踩坑一律进 `ledger/worklog/`**。
