# 文档索引

按 `koc-code-docwriter` 的固定槽位组织。本文件是唯一索引，目录树由 `tree` 生成、每行 `#` 后的说明手写，槽位下不再建索引。任务进度与过程叙事不入 `docs/`，由 `task-ledger` 台账管理（`ledger/`）。

## 目录

```text
docs/                                               # 项目文档库入口：固定槽位与唯一索引
├── architecture/                                   # 系统组成、读写链路与不可破的不变量
│   ├── host-data-plane.md                          # host 三层分工、降级与缓存语义、当前路由清单
│   └── overview.md                                 # 单仓双包、读写链路、七步流程与不可破的不变量
├── features/                                       # 用户可感知的页面、入口行为与边界
│   ├── board-home.md                               # 三段视图、统计卡、趋势图、筛选与任务动作
│   ├── identity-settings.md                        # 身份闸门、花名册、安装 Skill 引导与页面边界
│   ├── ledger-dirs.md                              # 机器级清单、`dirs` 命令面与添加目录判据
│   ├── plugin-listing.md                           # 标题 / 图标 / 说明的品牌值与宿主读取口径
│   ├── plugin-settings.md                          # 入口位置、显示名、两个外链的字段与版式
│   └── rules-injection.md                          # 会话规则注入的开关、文案、注入时机与不重复判据
├── api/                                            # 台账脚本的方法签名、准入规则与命令行参数
│   └── ledger-api.md                               # 四层职责、准入规则、逐方法签名与命令行参数表
├── data/                                           # 台账持久化形状、字段约束与崩溃恢复写序
│   └── ledger-files.md                             # 目录布局、任务表 / 历史 / 过程文档字段与崩溃恢复写序
├── development/                                    # 本地开发的分层纪律、构建产物与样式规矩
│   ├── code-conventions.md                         # 目录分层、导入铁律、产物构建、脚本分层与文档写作约定
│   └── ui-style.md                                 # 明暗判据、token 层、核心控件分工与文案真源
└── dependencies/                                   # 宿主与外部依赖的已核实行为及复核方式
    ├── agent-skill-install.md                      # 各客户端用户级 / 项目级扫描目录与证据强度
    ├── client-ui-layout.md                         # 全槽位清单、官方元件与 `--dsw-*` 设计变量
    ├── dsh-plugin-core-explorer.md                 # `pickWorkspaceFile` 与只读 FS 路由的签名和边界
    ├── dsh-prestep-injection.md                    # pre-step 事件、消息契约、动态区淡出与待核实项
    ├── dsh-session-handoff.md                      # 起会话唯一已验证链路与两条预置提示词模板
    ├── dsh-skill-registration.md                   # `register` 的分层语义、必填字段与失效通知
    ├── dsh-workspace-registry.md                   # `list()` 返回实体与台账根判定口径
    ├── host-webserver.md                           # 原始 req/res、SSE、压缩与鉴权边界
    └── npm-trusted-publishing.md                   # OIDC 触发条件、tag 取版本与 `repository.url` 约束
```

## 更新日志

- 2026-11-10 21:35:29：新增会话规则注入与 pre-step 注入链路两篇文档
- 2026-11-10 22:12:21：按 1.2.0 规范化为四段形态，写作约定迁入 development/code-conventions.md
