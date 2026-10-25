# 20261016-2041-dsh-插件真身开发-skill-注册最小闭环-台账数据面-看板-ui-8e70：DSH 插件真身开发：skill 注册最小闭环 → 台账数据面 → 看板 UI

> **✅ 完成封卷**：2026-10-16 22:57:17（@8d557c6d-7c93-43ac-8c73-5d623e82e1c6）
> **创建**：2026-10-16 20:41:15（@8d557c6d-7c93-43ac-8c73-5d623e82e1c6）
> **分类**：设计 ｜ **标签**：DSH、看板、需求

<!-- 「> **分类**：… ｜ **标签**：…」行由脚本按 new --category / --tags 自动插在创建行后；
     两者皆空则不写此行。close 时可用 --category / --tags 覆盖修正。 -->

## 背景

前任务「monorepo 落地：迁入 koc-ledger-progress skill 并发布可安装包」已结案：
`task-ledger@1.0.1` 经 `skill-v1.0.1` tag 由 GitHub Actions OIDC 信任发布上线
（latest=1.0.1），monorepo 双包就位（root private workspace + `packages/skill/` 真源 +
`packages/plugin/` 占位 0.0.4）。

用户既定规划（原话）：「把 skill 安装弄好之后，我们再去做 DSH 的插件」——即本任务。
产品目标（源自立项调研，已定稿）：DSH 插件 = ① skill 全局集成（装插件即把
`task-ledger` 注册进 dsh 全局，模型可 load）；② 台账管理 UI（待办查询按 A/B/C/CD
工作区分组、历史追溯按创建人/提交人筛选、日志与报表）。

已就绪的前置（不用重做）：

- 架构与不变量：`docs/design/architecture.md`（单仓双包、host/client 两半、6 条不变量）
- 宿主外部事实（0.2.0-rc.2 基线，源码亲验）：`docs/design/external/` 四份 ——
  skill 注册（`ctx.skills.register`）、webServer 路由/SSE、UI 入口三件套
  （`sidebar.panellist` + `main` + `selectPanel`）、OIDC 发布
- skill 内容真源：`packages/skill/`（构建时纳入插件包）
- 台账数据格式：`docs/design/ledger-data.md`（progress.json / history 8 列 / worklog 五节）

## 待办

- **host 半最小闭环（先做）**：`packages/plugin` 工程化（TS 构建、dist 入仓）+
  `apply` 时 `ctx.skills.register` 注册内嵌 skill 副本 ⇒ 验收点：装插件 → 模型能
  load skill（skill 正文相对资源解析二选一未拍板：插值安装目录 or `resourceBase`）
- **台账数据面**：host 进程跨工作区读 `ledger/` 文件 + `ctx.webServer.register`
  JSON 路由（SSE 后续）
- **client 半**：侧栏条目（`sidebar.panellist`）+ `main` 整页看板（待办 / 历史 /
  报表三 tab，列表行自绘——宿主无表格件）
- **待拍板项**（架构文档 §五）：工作区根路径（A/B/C/CD）配置形态（`ctx.settings`）、
  UI 路由鉴权方案、Desktop/Web 双表面真机验证
- 发布前：`publish.yml` 的 plugin job 补 install + build（注释已留位）；版本走
  `plugin-v*`（现 0.0.4）

## 下一步

**已拍板**（2026-10-16 深夜，用户原话「全按你推荐的来，该落文档就落文档」）：

- 入口 = `shell.overlay` 右上角浮标（唯一入口，角标计数驱动；备选 panellist 底部条目未采用）；
- 首页 = 4 统计卡（可点联动筛选）+ 统一任务列表（历史查询折叠为「已结案」筛选态，不单开 tab）；
- 右上两 tab：任务 / 统计；
- 按钮矩阵五动作：认领并开始 / 继续 / 移交 / 结束任务 / 放弃 —— 确定性写（claim / set / close）
  由 host 调 skill 脚本执行（用户点击 = 明确指令），判断型动作（结束）起会话交模型；
- 设计落盘：`docs/design/features/board-home.md`（主文档）、`external/client-ui-layout.md`
  （补全槽位清单）、新增 `external/dsh-session-handoff.md`、`architecture.md` 不变量 1 随之修订；
- 开发拆分为 5 个后续任务（见进度表）：插件工程化与 skill 注册 → 台账数据面 → 看板首页 →
  任务按钮与会话交接 → 统计报表。

## 过程

### 2026-10-16 深夜：看板 UI 立项调研（入口选型 + 页面构想，用户要求「先讨论不动手」）

**入口槽位全清单**（`@deepseek-ai/dsh-client-ui-layout` / `-sidebar` @0.2.0-rc.2
`npm pack` 解包亲验，比外部事实文档的「三件套」更全）：

| 槽位 | 类型 | 状态 | 能否作「右上角小图标」 |
|---|---|---|---|
| `shell.overlay` | list / root | **开放可注册** | ✅ 就是它 |
| `sidebar.panellist` | list / root | 开放（参考插件在用，order 30） | 备选 |
| `main` | keyed / root | 开放（整页看板） | — |
| `rightbar` | single / root | 被会话右侧栏占用 | ❌ |
| `shell.leading` | single / root | 被 ui-sidebar 占用（左上） | ❌ |
| `sidebar` | single / root | 被 SidebarRoot 占用 | ❌ |
| `sidebar.toggle.badge` | single / root | 仅折叠栏展开钮内、不可交互 | ❌ |
| `sidebar.footer.action` | list / root | 开放（设置行旁的脚注行） | 次备选 |

- `shell.overlay` 实现（layout `lib/client.js`）：`.overlayLayer{position:absolute;
  inset:0;z-index:20;pointer-events:none}` + `.overlayLayer>*{pointer-events:auto}`；
  宿主发布 `--dsh-frame-overlay-top`（= 标题栏净空 + 20px，全屏时 20px）供条目
  自定位。类型注释原文：*"a badge, a toast stack or a status pill all belong
  here… a fresh `id` is added beside the shipped entries"*。
  ⇒ 右上角小图标 = 注册 list 条目自绘 `position:absolute;top:var(--dsh-frame-overlay-top);
  right:12px`，默认点击穿透不挡应用；角标计数由 host 侧 SSE 推送驱动（宿主无推送
  通知 API，grep 两包无 notification 字样）。
- 参考插件入口注册模式（dispatch-table `src/client/index.ts:1998-2011`）：
  `panellist` 条目只画图标（props: size/active），行按钮/点击/激活态全归侧栏；
  `main` 同 id 整页；`selectPanel(null)` 回会话。

**「把任务交给大模型」的可行链路**（浏览器半无自由文本发送 API，已核实）：

- 浏览器半：`remote.commands.execute` 只吃斜杠命令（正则 `^/[a-z][a-z0-9_-]*`）；
  `uiWorkspace.openSession(id)` 导航；`sessions.fork` 开分支。社区插件
  （dsh-quick-actions 一键发送预置文本）用的 API 本地未验证。
- host 半（Node）：`ctx.agents.create(...)`（自建会话并驱动，参考插件
  `src/dispatch.ts:519-548` 实证）+ `agent.send(message, target, wakeup)`
  （`src/dispatch.ts:627-634`）+ `goals.create(agent, {objective})`。
- ⇒ 按钮的正确形态：浏览器 POST host HTTP 路由 → host 跑 skill 脚本写台账
  （claim 等确定性操作）+ `agents.create` 起会话发预置提示词 → 浏览器
  `openSession` 跳过去。与参考插件「立即执行」同构。

**参考插件 UI 成熟模式**（dispatch-table，用户已接受的观感）：卡片行 = 左缘
6px 状态色条 + 标题/编号/创建时间 + 右缘小 pill + 开关 + 展开箭头；整行点击展开
（有选区则不展开）；筛选行 = 左 Segmented 状态档 + 右搜索/下拉；空态三分
（未就绪/真空引导卡/筛选空）；确认框自绘；数据 = HTTP 增量（rev）+ SSE 单例
（无轮询）；`--tdt-*` token 一律映射 `--dsw-*`。

## 结论

<!-- 收尾时填：做成了什么、留了什么坑。
     例：已修复，但只覆盖 UTF-8；GBK 另开任务 -->

## 执行记录

<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。
     补记用 progress.py log --id <任务号> --note "一句话"。 -->
