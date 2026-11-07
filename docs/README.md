# 文档索引

按 `koc-code-docwriter` 的固定槽位组织。本文件是唯一索引，目录树由 `tree` 生成、行尾备注手写，槽位下不再建索引。任务进度与过程叙事不入 `docs/`，由 `task-ledger` 台账管理（`ledger/`）。

## 目录

- architecture/
  - [host 数据面](architecture/host-data-plane.md) — host 三层分工、降级与缓存语义、当前路由清单
  - [架构总览](architecture/overview.md) — 单仓双包、读写链路、七步流程与不可破的不变量
- features/
  - [看板首页](features/board-home.md) — 三段视图、统计卡、趋势图、筛选与任务动作
  - [身份与设置页](features/identity-settings.md) — 身份闸门、花名册、安装 Skill 引导与页面边界
  - [台账目录清单与隐藏](features/ledger-dirs.md) — 机器级清单、`dirs` 命令面与添加目录判据
  - [插件在官方插件页的呈现](features/plugin-listing.md) — 标题 / 图标 / 说明的品牌值与宿主读取口径
  - [插件详情页配置区](features/plugin-settings.md) — 入口位置、显示名、两个外链的字段与版式
- api/
  - [接口契约：数据层 / 业务层 / 驱动外壳（Go 实现）](api/ledger-api.md) — 四层职责、准入规则、逐方法签名与命令行参数表
- data/
  - [台账文件格式](data/ledger-files.md) — 目录布局、任务表 / 历史 / 过程文档字段与崩溃恢复写序
- development/
  - [方法规范：client 分层 + 脚本两层](development/code-conventions.md) — 目录分层、导入铁律、产物构建与脚本分层纪律
  - [样式规范](development/ui-style.md) — 明暗判据、token 层、核心控件分工与文案真源
- dependencies/
  - [各 agent 的 skill 安装位置（SKILL.md 生态）](dependencies/agent-skill-install.md) — 各客户端用户级 / 项目级扫描目录与证据强度
  - [宿主 client UI：入口槽位、元件与设计变量](dependencies/client-ui-layout.md) — 全槽位清单、官方元件与 `--dsw-*` 设计变量
  - [核心 explorer：选目录 + 只读文件面（dsh-plugin-core）](dependencies/dsh-plugin-core-explorer.md) — `pickWorkspaceFile` 与只读 FS 路由的签名和边界
  - [宿主会话交接 API：把任务交给大模型的可行链路](dependencies/dsh-session-handoff.md) — 起会话唯一已验证链路与两条预置提示词模板
  - [宿主 skill 注册接口（ctx.skills）](dependencies/dsh-skill-registration.md) — `register` 的分层语义、必填字段与失效通知
  - [宿主工作区注册表（ctx.workspaceRegistry）](dependencies/dsh-workspace-registry.md) — `list()` 返回实体与台账根判定口径
  - [宿主 webServer 路由与流式（SSE）能力](dependencies/host-webserver.md) — 原始 req/res、SSE、压缩与鉴权边界
  - [npm 信任发布（OIDC）链路](dependencies/npm-trusted-publishing.md) — OIDC 触发条件、tag 取版本与 `repository.url` 约束

## 写作约定

- 文档只写长期成立的事实与约束；日期、过程词、用户原话、方案取舍、验收判据、待办与分期都不进正文。
- 可变正文只有一个真源，其余处只放标识、最小摘要和链接，不复制正文。
- 文档与源码冲突时以源码为准，先核实再改文档。
- 外部事实必须带适用版本、版本真源与复核日期，并按各自的复核方式定期重查。
- 命名用纯 ASCII 小写 kebab-case，不带日期与版本号；只有根 `docs/README.md` 一份索引，结构行由 `tree` 生成，人只写每行 `—` 后的备注。
- 描述文件 / 目录结构时一律用「树 + 每行 `—` 备注」，不另起一套代码框目录树。
