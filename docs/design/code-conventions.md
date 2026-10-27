# 方法规范：client 分层 + 脚本两层

> **状态**：🔵 落码（脚本「两层 + 外壳」重构 2026-10-23 落地，2026-10-27 全量 Go 化，见 §五）
> **来源**：用户 2026-10-17「该抽象出来的东西一定要抽象出来」；2026-10-22「两层，清清楚明了，不要搞复杂」
> **配套**：系统不变量见 [`architecture.md`](architecture.md)；数据契约见 [`ledger-data.md`](ledger-data.md)；样式规矩见 [`ui-style.md`](ui-style.md)

本文件只记**不写就会做错**的约定，不写通用编码常识。

## 一、目录分层（`packages/plugin/src/`）

```
index.ts            # 插件入口（apply）
host/               # Node 侧：读台账 / 聚合 / 路由（不得 import client/）
client/             # 浏览器侧：只经 HTTP 取数（不得 import host/、不得直接摸文件系统）
skill/              # 构建时从 packages/skill/ 纳入的内嵌副本（只含运行时；真源在 packages/skill/）
```

`client/` 内部（实际 12 个文件）：

| 文件 | 只装什么 |
|---|---|
| `index.ts` | 装配：locale 注册 + 槽位注册（`sidebar.panellist` 侧栏条目、`main` 整页）。**不写业务逻辑** |
| `tokens.ts` | `--dtl-*` 定义（**唯一**落点） |
| `ui.ts` | 样式基础层注入 + 共用元件（卡 / chip / 下拉 / 搜索框 / 空态） |
| `locales.ts` | 文案字典（**唯一**落点） |
| `api.ts` | client → host 的全部 HTTP（**唯一**取数出口） |
| `store.ts` | 看板状态仓（订阅 / 刷新 / 筛选条件） |
| `rows.ts` | 列表行的筛选与排序（**纯函数**） |
| `format.ts` | 时间口径（**唯一**：补零 / 时刻串 / 时间范围 → since-until） |
| `types.ts` | 路由响应的客户端投影 |
| `primitives.d.ts` | 宿主官方模块的本地结构化声明（不 import 官方包） |
| `board-home.ts` / `task-row.ts` | 页面与行视图 |

**同一样东西只有一份实现**：改样式先想「是不是该进 `ui.ts` / `tokens.ts`」；改取数先想「是不是该进 `api.ts`」。

## 二、模块导入的两条铁律

1. `client/` **不 import `host/`**，也不 import 官方包（rc 接口会无声变 ⇒ 只本地结构化声明，见 `primitives.d.ts`）。
2. `client/` 内部相对导入**一律带 `.ts` 扩展名**：`tsconfig.client.json` 开了 `allowImportingTsExtensions`，tsdown 单文件打包与 Node 剥类型都认；不带扩展名时 Node 的 ESM 解析器找不到，纯逻辑模块也无法直测。

## 三、取数与刷新

- 所有请求走 `api.ts` 的 `fetchJson`，超时且 abort 带 `reason` —— 不带 reason 时浏览器把错误写成「signal is aborted without reason」，看不出是超时。
- **不轮询**：刷新 = 挂载首读 + 手动刷新按钮（`store.refresh()` 唯一入口，入口与整页共用同一份快照）。
- 失败**不造兜底假值**：返回什么渲染什么，失败显示错误态 + 重试。

## 四、工程与产物

- `dist/` 入仓；`npm run build` = host(`clean-dist` → `tsc` → `sync-skill-version` → `copy-skill`) + client(`tsc --noEmit` → `tsdown`)。
- 浏览器产物是 CJS 闭包工厂（`window.__ModuleLoader__.load`），平台模块必须保留成 `require()`，其余内联；dist 入仓产物守这条。
- `npm run build` 打 `dist/`；无 DOM 依赖的纯逻辑模块允许剥类型直读源码直测。
- **pnpm 只认 `pnpm-workspace.yaml`**，不读 `package.json` 的 `workspaces` 字段（后者留给 npm 生态）。改 workspace 结构别只改一处。

## 五、脚本侧：两层 + 一个外壳（🔵 落码，2026-10-27 全量 Go 化）

**目录结构、每个文件的职责、逐方法签名全在 [`ledger-api.md`](ledger-api.md)；本节只记纪律。**

物理落点：`scripts/progress`（POSIX shim：认平台 → 校验可执行位 → `exec`）→ `src/main.go`（只把参数与退出码转给 `shell.Main`）→ `src/internal/` 下四个子包 `core/`（纯换算）、`store/`（数据层）、`actions/`（业务层）、`shell/`（驱动：cli / runner / gitops / merge / render / help / presync / term_*），加三个旁路包 `notices`（进程级提示收集，只收不打印）、`env`（我是谁：读 `identity.json`，不问 git 也不解析台账）、`jsonfmt`（`--json` 屏幕输出排版）；错误类型 `core.Fail` 在 `core`，退出码常量（`ExitOK` / `ExitBusiness` / `ExitUsage` / `ExitUnexpected` / `ExitInterrupted`）在 `shell/runner.go`。入口路径与产物目录 `scripts/bin/` 都不许改名（宿主与 SKILL.md 按它们调）。

逻辑形状是：

```
外壳  shell.Main / shell.Run / runCommand   解析参数 → 取最新 → 自举 → 调一个业务函数 → 打印 → 提交 → 推送
  ↑
业务层  每个动作一个函数（actions/）        由外壳用 withAtom(...) 包住调用；函数内只串数据层、定写序与幂等判据、返回 Result
  ↑
数据层  每个文件一个对象（store/）          只读写自己那个文件：编码 / 格式 / 原子写 / 权限 / 指纹
```

**事务不是第三层**，是外壳拿在手里、包住业务调用的一个闭包：`shell.withAtom(repo, rels, fn)` 调 `actions.Atom(repo, rels...)` 按路径排序加锁、`defer` 解锁；业务函数自己不碰锁。没有 journal、没有 recover、没有 Unit of Work 类。锁有两级（整条命令级 + 单文件级），口径与「哪级谁来拿」见 [`architecture.md`](architecture.md) 的「两级锁」那条不变量。

### 5.1 数据层只提供这几种方法

**方法清单不在这里重复**（`ledger-api.md` 是唯一目录树与唯一签名表）：机制件 `store/atomic.go`（含 `Snapshot`/`Restore`）/ `store/dirty.go` / `store/locks*.go`、`JSONStore` 基类、四张表的完整签名见 [`ledger-api.md`](ledger-api.md) §二。

这里只留四条**不写就会做错**的纪律：

- 工具层（`core/`）里的函数不算层：`core.AppendExecLog`、`core.StampFrozen`、`core.RewriteLabelLine`、`core.HasFrozenLine`（外加 `core.RewriteStatusLine` / `core.ReadStatus`）。
- `HistoryStore.Write` 的唯一调用点是结案的第 2 步。业务不得用它整篇改写历史（`AppendRow` 只负责算全文，落盘是 `Write`）。
- `WorklogStore` 只有锚点能力（建篇 / 追加执行记录 / 改头部标签行 / 封卷标记）：写回的永远是「锚点编辑后的新全文」，**没有「用一段正文覆盖前五节」这种能力**。
- `store.Fingerprint` 必须是**内容 sha256**，不是 `(mtime, size)` —— 后者在同一时间精度内连写两次会漏判。

**数据层不做什么**：不加锁、不判 `owner`/`status`、不打印、不碰 git、不问「这次该写哪些文件」。

### 5.2 业务动作清单

`Bootstrap`（旧名 `ensure_ledger`：要写 3 个文件，由外壳单独一个 atom 包住、它自己不开事务，**必须在业务动作的 atom 之前单独跑，不得与业务动作合并进同一个 atom**）、`NewTask`、`Claim`、`Release`、`Handoff`、`Relabel`、`LogProgress`、`CloseTask`。`SetTask` 不是动作而是**路由**：`set_task.go` 只按 `--release` / `--owner` / `--tags` 分派到 `Release` / `Handoff` / `Relabel`（动作间互调的唯一例外）。`InitIdentity`（`init` 命令）只在真终端交互，不走 runner 七步。
只读不进事务：`ListTasks` / `ShowTask` / `QueryHistory` / `Validate`。

签名一律 `(repo string, me core.Identity, ...)`：写动作 `-> (*Result, error)`（**唯一例外 `Bootstrap` → `(core.Identity, error)`**），只读动作 `-> 各自的视图对象 + error`；**参数里没有 git、也没有命令行 namespace**（查询条件用 `ListQuery` / `HistoryQuery`，各动作入参是 `NewTaskParams` / `CloseTaskParams` 这类结构体）。`Result` 里的 `Changed` / `Where` / `AlreadyDone` / `Message` / `Worklog` / `Notices` **只供打印**；**提交集合只认数据层记账本记的脏集**，两者不是一回事，别拿 `Changed` 去算 git 提交范围。

### 5.3 三条铁律

| 铁律 | 为什么 |
|---|---|
| **数据层绝不自己加锁** | 认领写序「分片→池」、释放「池→分片」，两向相反；数据层各自加锁 = ABBA 死锁（`store.LedgerLock` 因此按路径排序后依次加）。`store.ProgressLock` 还是阻塞无超时、不重入，同进程同路径第二次加会自死锁 ⇒ **任何失败补偿都只能在同一 `Atom` 内做完，不许再开一个** |
| **业务层不直接碰文件** | 出现 `os.WriteFile` / `os.Create` / `store.LedgerLock`（`actions/scope.go` 的 `Atom` 除外，它是唯一的加锁点）/ `fmt.Print` / `exec.Command` 就是塌回老样子，写序与回滚会重新散落 |
| **数据层不做业务判断** | `RequireOwner` 这类判定留在业务层（`actions/guard.go`）；数据层懂 `owner` 就等于每个文件都会判「谁能改」 |

### 5.4 三个必须保住的隐藏语义（照文档实现最容易丢）

| 机制 | 语义 | 丢了会怎样 |
|---|---|---|
| `store.WriteTextAtomic(…, track=false)` | **全仓只有三处**：`store.Restore`（失败回滚）、`actions.InitIdentity`（写仓库外的 `~/.taskledger/identity.json`）、`shell.ResolveLedgerConflict`（写合并结果，由 `git rebase --continue` 提交）。**`SyncDown` 不在此列**——它不写盘，走 `git checkout <upstream> -- <rel>` 让 git 改工作树 | 拿 `false` 去写「取最新刷下来的内容」，那些内容不会进提交集合 ⇒ 远端拉下来的东西留在工作树里，下次写被 guard 拦死。现状靠 `SyncDown` 返回 `Before` 字节 + runner `RecordPresync` 补记避开这个坑 |
| `WriteLog.RecordPresync` | 取最新时刷过的文件，**反而必须**随本次提交入库（自举要碰的文件也先 `Snapshot` 再记一次） | 远端拉下来的新内容留在工作树里，下次写被 guard 拦死 |
| `WriteLog.RollbackPresync` / `DiscardCreated` | 失败收尾两套：前者恢复被覆盖内容，后者删本次新建的文件；`CommitStarted` 之后一律不做 | 失败后把该恢复的不恢复、把该留的删掉；或在提交已开始时回滚，吃掉刚写的台账 |

另外：`store.WriteTextAtomic` 还负责拒绝写符号链接、继承原文件 mode（临时文件建出来是 0600）。这些性质搬到数据层时必须逐条保住。

### 5.5 防塌线

**判据不在这里重复**——唯一一份在 [`ledger-api.md`](ledger-api.md)：准入规则是可机械检查的 `grep` 表（§〇，全部必须为 0），改完必跑的检查清单在 §七。本节只记两件事：

- 判据全部按**目录**扫（`grep -rn … internal/<层>/`），不按函数体扫；每层一条「不许依赖谁」，命中即为塌回老样子。
- 入口那两行的口径：`scripts/progress` 只做三件事（认平台 / 校验可执行位 / `exec`），`src/main.go` 只做一件事（`os.Exit(shell.Main(os.Args[1:]))`）——谁都不许在里面写业务。见 `ledger-api.md` §一。

### 5.6 脚本不做的事（别再提）

journal + recover、四层分层、Unit of Work 类、每表 CRUD 四件套、业务返回文件集给 git、`O_EXCL` 单锁文件替代 flock、`worklog` 当表、`history` 整表序列化、`history` 查询强制时间范围。理由与论证见对应任务的 worklog 正文（台账里查）。

> `store.Snapshot` / `store.Restore` **不是** journal/recover：它不落日志文件、不扫残留、不做启动恢复，只在**一次动作的失败分支**里把刚碰过的文件按字节还回去，然后进程退出。别顺着它长回事务框架。

### 5.7 处理范围：这些不归脚本管（用户 2026-10-22 拍板）

| 情形 | 处理方式 |
|---|---|
| **用户手工删错 / 改坏台账文件**（删了行、改了字段、写坏 JSON） | **不处理**。不做自愈、不做修复命令、不做"检测用户改过什么"的兜底。`validate` 报出来即可，改不改、怎么改由人决定 |
| **多台机器同时改同一个工作区**（跨机并发写同一份台账） | **不处理**。脚本的前提是**一台机器串行执行**；跨机冲突交给 git 本身，脚本不写合并策略之外的任何补偿逻辑 |
| **改动文档或代码前要读多个文件** | **先向用户报备并获准**，批准后才读；能靠一次检索定位的，不要为"多了解点上下文"批量通读 |

前两条是**非目标**，不是待办：今后谁提"加个修复命令""加个并发保护"，直接引这一节否掉。第三条是对维护者（人 / agent）的协作约定，不写进代码。
