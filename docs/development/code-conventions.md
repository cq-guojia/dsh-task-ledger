# 方法规范：client 分层 + 脚本两层

只记不写就会做错的约定，不写通用编码常识。系统不变量见 [overview.md](../architecture/overview.md)，数据契约见 [ledger-files.md](../data/ledger-files.md)，脚本签名见 [ledger-api.md](../api/ledger-api.md)，样式规矩见 [ui-style.md](ui-style.md)。

## 一、目录分层（`packages/plugin/src/`）

```text
packages/plugin/src/                                # 插件源码根
├── index.ts                                        # 插件入口（`apply`）
├── host/                                           # Node 侧：读台账 / 聚合 / 路由（不得 import `client/`）
├── client/                                         # 浏览器侧：只经 HTTP 取数（不得 import `host/`、不得直接摸文件系统）
└── skill/                                          # 构建时从 `packages/skill/` 纳入的内嵌副本（只含运行时；真源在 `packages/skill/`）
```

`client/` 内部按职责分：

| 文件 | 只装什么 |
|---|---|
| `index.ts` | 装配：locale 注册 + 槽位注册（`sidebar.panellist` 侧栏条目、`main` 整页），不写业务逻辑 |
| `tokens.ts` | `--dtl-*` 定义（唯一落点） |
| `ui.ts` | 样式基础层注入 + 共用元件 |
| `locales.ts` | 文案字典（唯一落点） |
| `api.ts` | client → host 的全部 HTTP（唯一取数出口） |
| `store.ts` | 看板状态仓（订阅 / 刷新 / 筛选条件） |
| `rows.ts` | 列表行的筛选与排序（纯函数） |
| `format.ts` | 时间口径（唯一：补零 / 时刻串 / 时间范围 → since-until） |
| `types.ts` / `primitives.d.ts` | 路由响应的客户端投影 / 宿主官方模块的本地结构化声明 |
| `board-home.ts` / `settings-page.ts` / `config-panel.ts` / `task-row.ts` 等 | 页面、配置区与行视图 |

同一样东西只有一份实现：改样式先想是不是该进 `ui.ts` / `tokens.ts`，改取数先想是不是该进 `api.ts`。

上界面的文字一律走 `t()`：组件里用 props 的 `t`，非组件代码（`api.ts` 的错误消息、失败原因）用 `locales.ts` 的 `globalT` 席位，由 `index.ts` 在 locale 就绪时注入。连标点也走词典（`metaDivider`），不在代码里硬编码中文小字或分隔符。

`host/` 内部按路由层 / 服务层 / 仓储层分，依赖方向单向向下，唯一 spawn 点在 `repositories/`，见 [host-data-plane.md](../architecture/host-data-plane.md)。

## 二、模块导入的两条铁律

1. `client/` 不 import `host/`，也不 import 官方包（rc 接口会无声变 ⇒ 只本地结构化声明）。
2. `client/` 内部相对导入一律带 `.ts` 扩展名：`tsconfig.client.json` 开了 `allowImportingTsExtensions`，tsdown 单文件打包与 Node 剥类型都认；不带扩展名时 Node 的 ESM 解析器找不到，纯逻辑模块也无法直测。

## 三、取数与刷新

- 所有请求走 `api.ts` 的 `fetchJson`，超时且 abort 带 `reason`；不带 reason 时浏览器把错误写成 `signal is aborted without reason`，看不出是超时。
- 不轮询：刷新 = 挂载首读 + 手动刷新按钮（`store.refresh()` 唯一入口，入口与整页共用同一份快照）。
- 失败不造兜底假值：返回什么渲染什么，失败显示错误态 + 重试。

## 四、工程与产物

- `dist/` 入仓；`pnpm run build` = host（`clean-dist` → `tsc` → `copy-skill`）+ client（`tsc --noEmit` → `tsdown`）；改了参与编译的代码就 build，再跑验证脚本与 typecheck。
- 浏览器产物是 CJS 闭包工厂（`window.__ModuleLoader__.load`），平台模块必须保留成 `require()`，其余内联。
- 无 DOM 依赖的纯逻辑模块允许剥类型直读源码直测。
- pnpm 只认 `pnpm-workspace.yaml`，不读 `package.json` 的 `workspaces` 字段；改 workspace 结构别只改一处。
- skill 侧：`cd packages/skill/src && go vet ./... && go test ./...`；四平台（linux/amd64、darwin/arm64、darwin/amd64、windows/amd64）都要编得过；产物矩阵漏一份由 `copy-skill.mjs` 在构建期直接报错。

## 五、脚本侧：两层 + 一个外壳

目录结构、每个文件的职责、逐方法签名全在 [ledger-api.md](../api/ledger-api.md)，本节只记纪律。

物理落点：`scripts/progress`（POSIX shim：认平台 → 校验可执行位 → `exec`）→ `packages/skill/src/main.go`（只把参数与退出码转给 `shell.Main`）→ `src/internal/` 下四个子包 `core/`（纯换算）、`store/`（数据层）、`actions/`（业务层）、`shell/`（驱动），加三个旁路包 `notices`（只收不打印）、`env`（我是谁）、`jsonfmt`（`--json` 屏幕输出排版）。入口路径与产物目录 `scripts/bin/` 都不许改名（宿主与 `SKILL.md` 按它们调）。

```
外壳  shell.Main / shell.Run / runCommand   解析参数 → 取最新 → 自举 → 调一个业务函数 → 打印 → 提交 → 推送
  ↑
业务层  每个动作一个函数（actions/）        由外壳包住调用；函数内只串数据层、定写序与幂等判据、返回 Result
  ↑
数据层  每个文件一个对象（store/）          只读写自己那个文件：编码 / 格式 / 原子写 / 权限 / 指纹
```

事务不是第三层，是外壳拿在手里、包住业务调用的一个闭包：`actions.Atom(repo, rels...)` 按路径排序加锁、`defer` 解锁；业务函数自己不碰锁。没有 journal、没有 recover、没有 Unit of Work 类。锁有两级（整条命令级 + 单文件级），口径见 [overview.md](../architecture/overview.md)。

### 5.1 三条铁律

| 铁律 | 为什么 |
|---|---|
| 数据层绝不自己加锁 | 认领写序「分片→池」、释放「池→分片」，两向相反；数据层各自加锁会 ABBA 死锁。`ProgressLock` 阻塞无超时、不重入，同进程同路径第二次加会自死锁 ⇒ 任何失败补偿只能在同一 `Atom` 内做完 |
| 业务层不直接碰文件 | 出现 `os.WriteFile` / `os.Create` / `store.LedgerLock`（`packages/skill/src/internal/actions/scope.go` 的 `Atom` 除外）/ `fmt.Print` / `exec.Command` 就是塌回老样子，写序与回滚会重新散落 |
| 数据层不做业务判断 | `RequireOwner` 这类判定留在业务层（`packages/skill/src/internal/actions/guard.go`）；数据层懂 `owner` 就等于每个文件都会判「谁能改」 |

数据层不做什么：不加锁、不判 `owner`/`status`、不打印、不碰 git、不问「这次该写哪些文件」。四条容易写错的纪律：

- 工具层（`core/`）里的函数不算层：`AppendExecLog` / `StampFrozen` / `RewriteLabelLine` / `HasFrozenLine` / `RewriteStatusLine` / `ReadStatus`。
- `HistoryStore.Write` 的唯一调用点是结案的第 2 步。业务不得用它整篇改写历史（`AppendRow` 只负责算全文，落盘是 `Write`）。
- `WorklogStore` 只有锚点能力（建篇 / 追加执行记录 / 改头部标签行 / 封卷标记）：写回的永远是「锚点编辑后的新全文」，没有「用一段正文覆盖前五节」这种能力。
- `store.Fingerprint` 必须是内容 sha256，不是 `(mtime, size)` —— 后者在同一时间精度内连写两次会漏判。

### 5.2 三个必须保住的隐藏语义

| 机制 | 语义 |
|---|---|
| `store.WriteTextAtomic(…, track=false)` | 全仓只有三处：`store.Restore`（失败回滚）、`actions.InitIdentity`（写仓库外的身份文件）、`shell.ResolveLedgerConflict`（写合并结果，由 `git rebase --continue` 提交）。`SyncDown` 不在此列 —— 它不写盘，走 `git checkout <upstream> -- <rel>` 让 git 改工作树 |
| `WriteLog.RecordPresync` | 取最新时刷过的文件反而必须随本次提交入库（自举要碰的文件也先 `Snapshot` 再记一次），否则远端内容留在工作树里，下次写被 guard 拦死 |
| `WriteLog.RollbackPresync` / `DiscardCreated` | 失败收尾两套：前者恢复被覆盖内容，后者删本次新建的文件；`CommitStarted` 之后一律不做 |

`store.WriteTextAtomic` 还负责拒绝写符号链接、继承原文件 mode（临时文件建出来是 0600）。

### 5.3 防塌线

准入规则按**目录**扫（`grep -rn … internal/<层>/`），不按函数体扫，全部必须为 0；唯一一份表在 [ledger-api.md](../api/ledger-api.md) §〇。入口两行的口径：`scripts/progress` 只做三件事（认平台 / 校验可执行位 / `exec`），`packages/skill/src/main.go` 只做一件事（`os.Exit(shell.Main(os.Args[1:]))`），谁都不许在里面写业务。

### 5.4 非目标

- 不做 journal + recover、四层分层、Unit of Work 类、每表 CRUD 四件套、业务返回文件集给 git、`O_EXCL` 单锁文件替代 flock、`worklog` 当表、`history` 整表序列化、历史查询强制时间范围。
- `store.Snapshot` / `store.Restore` 不是 journal/recover：不落日志文件、不扫残留、不做启动恢复，只在一次动作的失败分支里把刚碰过的文件按字节还回去。
- 用户手工删错 / 改坏台账文件：不处理，不做自愈、不做修复命令，`validate` 报出来即可。
- 多台机器同时改同一个工作区：不处理，脚本前提是「一台机器串行执行」，跨机冲突交给 git。

前两条是架构边界，后两条是明确非目标；今后提「加个修复命令」「加个并发保护」直接引这一节。

## 六、文档写作约定

- 文档只写长期成立的事实与约束；日期、过程词、用户原话、方案取舍、验收判据、待办与分期都不进正文。
- 可变正文只有一个真源，其余处只放标识、最小摘要和链接，不复制正文。
- 文档与源码冲突时以源码为准，先核实再改文档。
- 外部事实必须带适用版本、版本真源与复核日期，并按各自的复核方式定期重查。
- 命名用纯 ASCII 小写 kebab-case，不带日期与版本号；只有根 `docs/README.md` 一份索引，结构行由 `tree` 生成，人只写每行 `#` 后的说明。
- 描述文件 / 目录结构一律用「`text` 代码块里的字符画树 + 每行 `#` 说明」，不另起一套缩进列表；`#` 固定在第 53 列（左列宽 52），README 结构行由 `tree` 生成，正文里的树按同一格式手写。

## 更新日志

- 2026-11-07 23:03:04：按 koc-code-docwriter 槽位迁移，剔除过程稿并统一标题头
- 2026-11-07 23:04:17：标题去过程词
- 2026-11-08 01:29:50：目录分层改为树 + 每行备注
- 2026-11-08 23:04:19：目录结构统一为字符画树，逐行补说明
- 2026-11-10 22:12:21：从根索引迁入文档写作约定，并按 1.2.0 统一树说明列口径
- 2026-11-10 22:37:28：源码路径补全为仓库内完整路径
