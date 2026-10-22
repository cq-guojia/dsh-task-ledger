# 架构总览

> **状态**：📝 待拍板（2026-10-16 初建；2026-10-16 深夜 UI 方案拍板后同步：入口 / 页面 / 按钮矩阵定稿见 features/board-home.md；剩余待拍板见 §五）
> **来源**：NAS-Docker 台账调研任务（2026-10-16 结案，结论三点全部可行）+ 用户立项指示
> **配套**：数据格式见 [`ledger-data.md`](ledger-data.md)；功能清单见 [`features.md`](features.md)；宿主接口事实见 [`external/`](external/)

## 一、项目是什么

一个 DSH（DeepSeek Harness）插件，把 `task-ledger` skill 变成：

1. **skill 全局集成**：装插件即把该 skill 注册进 dsh 全局（模型可 load）；
2. **台账管理 UI**：待办查询、历史追溯（= 列表「已结案」筛选态）、统计报表（入口与页面定稿见 [`features/board-home.md`](features/board-home.md)）；
3. skill 本身可脱离 dsh 单独安装（npm / git）给其他 agent 用。

**单仓双包**（pnpm workspaces，已落地；仓库根为 private workspace 根，不发布）：

| 包 | 内容 | 发布触发 |
|---|---|---|
| `dsh-task-ledger`（插件包，`packages/plugin/`） | host 半（skill 注册 + webServer 路由 + 跨工作区读台账）+ client 半（右上浮标入口 + 主面板 UI）+ `cordis.patch.yml`；`dist/` 入仓 | tag `plugin-v*` |
| `task-ledger`（skill 包，`packages/skill/`） | 零代码：SKILL.md + scripts + assets 直发（files 白名单），供 CodeBuddy / 其他 agent 用 | tag `skill-v*` |

两包独立 semver。skill 内容唯一真源在 `packages/skill/`，插件包构建时纳入（内嵌副本与独立包必须同源）。

版本线：`task-ledger` 已发 1.0.0（2026-10-16，后续走 `skill-v*`）；`dsh-task-ledger` 的 npm 占位 0.0.3 已发，插件真身自 `packages/plugin/` 起、下一版 0.0.4 走 `plugin-v*`。workspace 声明走根 `pnpm-workspace.yaml`（**pnpm 只认这个，不读 package.json 的 `workspaces` 字段**——2026-10-17 实测 pnpm 12.3.4；root package.json 里的 `workspaces` 字段留给 npm 生态读）。

## 二、运行逻辑

```
┌─ 各工作区（宿主进程之外的文件系统）──────────────────┐
│  <工作区>/ledger/pool.json                待认领任务   │
│  <工作区>/ledger/owners.json + owners/*   索引 + 每人分片 │
│  <工作区>/ledger/history/<年月>.md        已结案索引   │
│  <工作区>/ledger/worklog/<年月>/*.md      过程正文     │
└────────────────────────┬─────────────────────────────┘
                         │ host 经内嵌 skill 脚本（Python 子进程）只读
                         ▼
┌─ dsh-task-ledger host 半（插件进程内）───────────────┐
│  · apply 时 ctx.skills.register 注册内嵌 skill       │
│  · ctx.webServer.register 挂数据面路由（JSON + SSE） │
│  · 跨工作区枚举 ledger 文件、聚合、推送变更           │
│  · 按钮引发的台账写入路径【待定】见不变量 1           │
└────────────────────────┬─────────────────────────────┘
                         │ HTTP（Desktop 走 IPC bridge，两边通用）
                         ▼
┌─ client 半（宿主 UI 进程）──────────────────────────┐
│  · 右上浮标入口（shell.overlay list 条目，带计数角标）│
│  · 主面板整页（main keyed 槽）：任务 / 统计两 tab     │
└──────────────────────────────────────────────────────┘
```

按钮的会话交接链路（浏览器半无自由文本发送 API）：client POST host 路由 → host `ctx.agents.create()` 起会话 + `agent.send()` 发预置提示词 → client `uiWorkspace.openSession` 跳转。事实见 [`external/dsh-session-handoff.md`](external/dsh-session-handoff.md)。

## 三、分层职责边界

| 层 | 谁 | 能做什么 | 不能做什么 |
|---|---|---|---|
| 数据源 | 各工作区 `ledger/` 文件 | 被读 | 手改台账文件（写入真源是 skill 脚本，由会话里的 Agent 执行） |
| host 半 | 本插件（进程内） | 注册 skill、挂路由、读台账文件、聚合数据、起会话发预置提示词 | 不手改任何工作区的台账文件（按钮写入路径待定，见不变量 1） |
| client 半 | 宿主 UI | 展示与交互 | 不直连文件系统（一律经 host 路由）；不自行 retain `mainView` |

## 四、关键约束（不变量）

1. **台账写路径（✅ 2026-10-18 用户拍板：B 混合制，按动作分流）**：
   - **底线不变**：写台账**只经 skill 脚本**（`scripts/progress.py`），插件与 host **都不许手改** `progress.json` / `history` / worklog。所谓「host 直写」= host 代跑同一个脚本，不是自己动文件。
   - **按动作分流**（用户原话：「认领是要直接认领，只要别人没认领他就应该自己认领」「释放了就完了，就没有人了」「这个不能让他再开多少框，太麻烦了」）：

     | 动作 | 谁执行 | 要不要起会话 |
     |---|---|---|
     | 认领 | host 代跑脚本（前置：任务 `open` 且无人认领，否则报错） | **否** |
     | 释放（owner 置空） | host 代跑脚本 | **否** |
     | 移交（owner 换人） | 按同一口径 host 代跑（用户未单独表态，实现时按其字面确认） | 否（待确认） |
     | 结束 | **起会话**：弹框收用户留言 + 可选模型 ⇒ 首条消息 = 预置提示词 + 留言 | **是** |
     | 继续 | 起会话，首条 = 「读过程文档『下一步』接着做」 | 是 |

     - **为什么结束必须走会话**：要带用户留言、要读过程文档判断「待办是否真做完、结论怎么写」，还需要模型自己执行 close —— 这几件事没有判断量之外的确定性，不能由 host 代跑。
   - **会话侧两条硬约束**（实测结论，详见 [`external/dsh-session-handoff.md`](external/dsh-session-handoff.md)）：① `agents.create` 必须 mount preset，否则会话没有 fs/bash 工具、模型跑不了脚本；② `provider + model` 必须成对显式给，不填不等于走宿主默认（用户不选模型时由插件读 `agentDefaultModel` 补）。
   - **实现状态**：结束任务的**方法**已落地（`POST /api/task-ledger/close` + 预置提示词，界面未做）；认领 / 释放的 host 直写待接（需先核实宿主进程下的 git 身份取法）。
2. **skill 内容单一真源**：`packages/skill/` 是唯一真源；插件内嵌副本由构建纳入，独立 npm 包 `task-ledger` 同源发布 —— 两处内容必须一致（这是单仓双包、而非两仓的根本理由）。
3. **开发基线 = 宿主 0.2.0-rc.2**（用户 2026-10-16 拍板；npm `next` 线，勿用 `latest`）：宿主 rc 接口会无声变，所有宿主能力以 [`external/`](external/) 文档为准（带适用版本），升级后按各文档「复核方式」重跑；不得凭方法名猜签名。
4. **dist 入仓**：DSH 生态 git 直装、pnpm 不跑构建脚本；推送前必须 build + 冒烟（发布链路见 [`external/publish-oidc.md`](external/publish-oidc.md)）。
5. **明暗主题只认宿主**：`body[data-ds-dark-theme]`，插件禁用 `prefers-color-scheme`（见 [`ui-style.md`](ui-style.md)）。
6. **路由自持鉴权**：宿主 webServer 无 server-wide auth（默认回环绑定）；若部署暴露非回环地址，闸门由插件路由方自持（待拍板）。

## 五、待拍板（未验证，不作结论）

- 工作区**补充源**（宿主 registry 未收录的目录，如从未在 dsh 里添加过的项目）的配置形态 —— 主来源已定 = `ctx.workspaceRegistry.list()`（见 [`external/dsh-workspace-registry.md`](external/dsh-workspace-registry.md)）；
- UI API 路由的鉴权方案；
- Desktop（Electron）表面真机表现；
- **结束会话的收尾**（模型跑完 ⇒ 自动归档那个会话 + 通知用户）：需要「模型这一轮跑完了」的信号（宿主 `agent/status` 等事件），且通知位在界面侧。用户 2026-10-18：**先放着**，后面可能引入一个专门的「和模型会话」弹窗一并解决。
