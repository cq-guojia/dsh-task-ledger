# 架构总览

> **状态**：📝 待拍板（2026-10-16 初建；布阵已定稿，实现未开始）
> **来源**：NAS-Docker 台账调研任务（2026-10-16 结案，结论三点全部可行）+ 用户立项指示
> **配套**：数据格式见 [`ledger-data.md`](ledger-data.md)；功能清单见 [`features.md`](features.md)；宿主接口事实见 [`external/`](external/)

## 一、项目是什么

一个 DSH（DeepSeek Harness）插件，把 `task-ledger` skill 变成：

1. **skill 全局集成**：装插件即把该 skill 注册进 dsh 全局（模型可 load）；
2. **台账管理 UI**：待办查询（按 A/B/C/CD 工作区分组）、历史追溯（按创建人 / 提交人筛选）、日志与报表；
3. skill 本身可脱离 dsh 单独安装（npm / git）给其他 agent 用。

**单仓双包**（pnpm workspaces，已定稿）：

| 包 | 内容 | 发布触发（规划） |
|---|---|---|
| `dsh-task-ledger`（插件包） | host 半（skill 注册 + webServer 路由 + 跨工作区读台账）+ client 半（侧栏条目 + 主面板 UI）+ `cordis.patch.yml`；`dist/` 入仓 | tag `plugin-v*` |
| `task-ledger`（skill 包） | 零代码：SKILL.md + scripts + assets 直发（files 白名单），供 CodeBuddy / 其他 agent 用 | tag `skill-v*` |

两包独立 semver。skill 内容唯一真源在 `packages/skill/`，插件包构建时纳入（内嵌副本与独立包必须同源）。

## 二、运行逻辑

```
┌─ 各工作区（宿主进程之外的文件系统）──────────────────┐
│  <工作区>/ledger/progress.json            在办任务状态 │
│  <工作区>/ledger/history/<年月>.md        已结案索引   │
│  <工作区>/ledger/worklog/<年月>/*.md      过程正文     │
└────────────────────────┬─────────────────────────────┘
                         │ host 进程直读本地文件（只读）
                         ▼
┌─ dsh-task-ledger host 半（插件进程内）───────────────┐
│  · apply 时 ctx.skills.register 注册内嵌 skill       │
│  · ctx.webServer.register 挂数据面路由（JSON + SSE） │
│  · 跨工作区枚举 ledger 文件、聚合、推送变更           │
└────────────────────────┬─────────────────────────────┘
                         │ HTTP（Desktop 走 IPC bridge，两边通用）
                         ▼
┌─ client 半（宿主 UI 进程）───────────────────────────┐
│  · 侧栏条目（sidebar.panellist，只画图标）            │
│  · 主面板整页（main keyed 槽）：待办 / 历史 / 报表    │
└──────────────────────────────────────────────────────┘
```

## 三、分层职责边界

| 层 | 谁 | 能做什么 | 不能做什么 |
|---|---|---|---|
| 数据源 | 各工作区 `ledger/` 文件 | 被读 | 写入真源是 skill 脚本（`scripts/progress.py`），插件只读不改 |
| host 半 | 本插件（进程内） | 注册 skill、挂路由、读台账文件、聚合数据 | 不写任何工作区的台账文件 |
| client 半 | 宿主 UI | 展示与交互 | 不直连文件系统（一律经 host 路由） |

## 四、关键约束（不变量）

1. **插件对台账只读**：台账写入真源是 `task-ledger` skill 的 `scripts/progress.py`；插件任何界面操作都不得改写 `progress.json` / `history` / worklog。
2. **skill 内容单一真源**：`packages/skill/` 是唯一真源；插件内嵌副本由构建纳入，独立 npm 包 `task-ledger` 同源发布 —— 两处内容必须一致（这是单仓双包、而非两仓的根本理由）。
3. **开发基线 = 宿主 0.2.0-rc.2**（用户 2026-10-16 拍板；npm `next` 线，勿用 `latest`）：宿主 rc 接口会无声变，所有宿主能力以 [`external/`](external/) 文档为准（带适用版本），升级后按各文档「复核方式」重跑；不得凭方法名猜签名。
4. **dist 入仓**：DSH 生态 git 直装、pnpm 不跑构建脚本；推送前必须 build + 冒烟（发布链路见 [`external/publish-oidc.md`](external/publish-oidc.md)）。
5. **明暗主题只认宿主**：`body[data-ds-dark-theme]`，插件禁用 `prefers-color-scheme`（见 [`ui-style.md`](ui-style.md)）。
6. **路由自持鉴权**：宿主 webServer 无 server-wide auth（默认回环绑定）；若部署暴露非回环地址，闸门由插件路由方自持（待拍板）。

## 五、待拍板（未验证，不作结论）

- 工作区根路径（A/B/C/CD）走插件配置项 + `ctx.settings` 命名空间的具体形态；
- UI API 路由的鉴权方案；
- Desktop（Electron）表面真机表现。
