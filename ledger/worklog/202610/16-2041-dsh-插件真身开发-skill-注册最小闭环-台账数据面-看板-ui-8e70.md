# 20261016-2041-dsh-插件真身开发-skill-注册最小闭环-台账数据面-看板-ui-8e70：DSH 插件真身开发：skill 注册最小闭环 → 台账数据面 → 看板 UI

> **创建**：2026-10-16 20:41:15（@GuoJia-Agent）
> **分类**：建设 ｜ **标签**：DSH、插件、开发

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

先落 host 最小闭环：建 `packages/plugin` 构建工程（package.json 依赖/脚本 +
tsconfig，产物 `dist/` 入仓），实现 apply 注册内嵌 skill；宿主接口一律先读
`docs/design/external/` 已核实事实，查不到再 `npm pack` 亲验，不猜签名。

## 过程

<!-- 踩坑、定位、证据。带 revision 和 文件:行号 或符号名（行号会漂移）。
     例：rc4f2a1 的 src/host.ts:112 返回 null，是因为没等 ready 事件就发了请求 -->

## 结论

<!-- 收尾时填：做成了什么、留了什么坑。
     例：已修复，但只覆盖 UTF-8；GBK 另开任务 -->
