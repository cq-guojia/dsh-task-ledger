# 接口契约：数据层 / 业务层 / 驱动外壳（Go 实现）

> **状态**：🟢 落码（2026-10-27 全量 Go 化完成；命令行、git 同步、语义合并、终端交互都在 `packages/skill/src/`）
> **来源**：用户 2026-10-22「完全重构，不是最小改动」+ 2026-10-27「脚本改用 Go 重写」
> **配套**：数据形状见 [`ledger-data.md`](ledger-data.md)；分层纪律见 [`code-conventions.md`](code-conventions.md)；系统不变量见 [`architecture.md`](architecture.md)
>
> **本文只讲三件事**：每一层有哪些方法、各自负责什么、哪些事不许做。
> **签名以源码为准**（下表是 2026-10-27 抽取的现状快照）；语义有疑问时先读 `packages/skill/src/internal/<层>/`，别按本文猜实现。
>

## 〇、先把词说清楚

| 文档里的说法 | 人话 |
|---|---|
| **数据层**（`internal/store/`） | 只跟文件打交道的代码。一种文件一个对象，负责读出来、改好、写回去。**它不知道业务规矩**——不懂「这个任务该不该由你改」，也不懂「结案要同时写三个文件」。 |
| **业务层**（`internal/actions/`） | 一个动作一个函数：建任务、认领、释放、交接、记进展、结案。**它决定顺序**——先写哪个文件、后写哪个、崩在中间怎么补。 |
| **外壳**（`internal/shell/`） | 跑一条命令时的外围杂事：解析命令行、跑之前取最新、跑完提交推送、把结果打印出来、决定退出码。**它不懂业务**。 |
| **工具层**（`internal/core/`） | 纯换算：时间格式、路径拼接、任务号生成、标签校验、markdown 文本增删行。**不读文件、不写文件、不联网、不打印。** |
| **`internal/env/`** | 唯一被允许确认「我现在是谁」的地方（读 `$TASK_LEDGER_HOME/.taskledger/identity.json` 或 `~/.taskledger/identity.json` 的 `uuid` / `name`）。 |
| **`internal/notices/`** | 进程级提示收集器：**只收文本，永不打印**，最后由 `shell/render.go` 一次性打到 stderr。 |
| **`internal/jsonfmt/`** | 只服务 `--json` 的**屏幕输出**（唯一调用点 `shell/render.go` 的 `jsonOut`）：两空格缩进、中文不转 `\uXXXX`、空容器写 `{}` / `[]`。键序按字典序，下游按 JSON 解析。**写台账文件不走它**，走 `store.DumpLedgerJSON`。 |

**依赖只能从上往下，不许反向**：

```
main.go                    ← 只把 argv 与退出码转给 shell.Main
   ↓
shell/                    ← 取最新 → 自举 → 调动作 → 打印 → 提交推送 → 退出码
   ↓
actions/                  ← 一个动作一个函数：定顺序、定重跑规则、开事务
   ↓
store/                    ← 一种文件一个对象：读它、改它、原子写回
   ↓
core/                     ← 只做文本和时间的换算，一个文件都不碰
```

外壳**不是第三层业务**，它是进程边界。三条硬理由：

1. **git 会反噬业务数据**：推送被拒会自动 rebase，冲突合并**直接改磁盘上的文件**；这时业务层手里还握着改之前读出来的那份数据，下一次整份写回就会把别人刚合进来的任务抹掉。
2. **业务函数要能被界面单独调**：看板按一下「释放」不能顺带跑参数解析、退出码、git 提交。动作一旦带 `fmt.Print` / `os.Exit` / `gitRun`，就永远只能被命令行用。
3. **两边各管各的状态**：外壳只知道「这次改了哪些文件」和「返回了什么结果」；业务层不碰进程状态。越界一次，顺序和回滚就会重新散回每个命令里。

### 准入规则（能机械检查）

| 规则 | 怎么查（在 `packages/skill/src/` 下跑） |
|---|---|
| 业务层不许反向依赖外壳 | `grep -rn "internal/shell" internal/actions/` 必须为 **0** |
| 数据层不许依赖业务层 / 外壳 | `grep -rn "internal/actions\|internal/shell" internal/store/` 必须为 **0** |
| 工具层只许 `notices` 与自己同包 | `grep -rn "internal/" internal/core/ \| grep -v "internal/core\|internal/notices"` 必须为 **0** |
| 只有外壳跑 git | `grep -rn "exec.Command" internal/ --include='*.go' \| grep -v internal/shell \| grep -v _test.go` 必须为 **0** |
| 只有外壳打印 | `grep -rn "fmt.Print\|os.Stdout" internal/core internal/store internal/actions` 必须为 **0** |
| 只有业务层的 `Atom` 加锁 | `grep -rn "store.LedgerLock\|store.ProgressLock" internal/ \| grep -v "internal/actions/scope.go"` 必须为 **0** |
| 动作之间不许互相调用，唯一例外 `set_task.go` 路由到 `release/release_task` / `handoff` / `claim` / `relabel` | `grep -rn "actions\.\(Release\|Handoff\|Claim\|Relabel\)(" internal/actions/ \| grep -v set_task.go` 必须为 **0** |

## 一、目录树

```
packages/skill/
├── SKILL.md                     ← 给 agent 的说明书（命令、口径、坑）
├── README.md                    ← 给装 skill 的人看
├── assets/worklog.md            ← 过程文档六节模板（真源只有这一份）
├── references/                  ← init-identity / state-model / log-note / troubleshooting
├── scripts/                     ← 运行时要用的东西，只有这两项
│   ├── progress                 ← 入口 shim：认平台 → 校验可执行位 → exec 二进制
│   └── bin/ledger-<os>-<arch>[.exe]   ← 三平台静态产物（linux/amd64、darwin/arm64、windows/amd64）
│
└── src/                         ← 实现源码（目录名与语言无关）
    ├── go.mod                   ← Go 模块清单
    ├── main.go                  ← 6 行：os.Exit(shell.Main(os.Args[1:]))
    └── internal/                ← 各层实现都在这（internal = 只许本模块内部引用）
        ├── shell/               ← 外壳：cli / runner / gitops / merge / render / help / presync / term_*
        ├── actions/             ← 业务层：一个动作一个文件 + registry / scope / guard / query
        ├── store/               ← 数据层：atomic / dirty / locks(+平台) / jsonstore / 四张表
        ├── core/                ← 工具层：time / paths / ids / identity / labels / worklog_md / history_md / roots / rowmap
        ├── env/                 ← 我是谁
        ├── notices/             ← 提示收集
        └── jsonfmt/             ← `--json` 输出排版
```

**分发时不带 `src/`**：`package.json` 的 `files` 只列 `scripts/`、`assets/`、`references/`、`SKILL.md`、`README.md`；插件内嵌副本（`packages/plugin/skill/`）也只同步这几项运行时，源码不进副本。

### 1.1 拆包时最容易踩的四条

1. **包的初始化顺序不许承载逻辑**：`notices` / `env` 都是纯函数 + 全局，不靠 `init()` 做副作用。
2. **`store.Bound(log)` 是进程级的**：进 runner 时绑定一次、`defer` 解绑；别在业务层再绑第二个，否则提交集合会分裂。
3. **`core` 不许接收「一整条任务」当参数**（吃了整条就会开始判 owner/status）。要字段就让调用方传字段。
4. **平台相关的文件必须凑齐「每个平台都有实现」**：`locks.go`（`linux || darwin`）/ `locks_windows.go`（`windows`）/ `locks_unsupported.go`（其余）、`term_unix.go` / `term_windows.go` / `term_unsupported.go`、`sigpipe_unix.go`（`!windows`）/ `sigpipe_windows.go`。tag 许宽了会在没适配的平台报「undefined: syscall.Flock」这类错（`aix` 就这样），许窄了会缺函数 —— 两边都编不过。

## 二、数据层 `store/`

### 2.1 原子写（`atomic.go`）

```go
func WriteTextAtomic(path, text string, track bool) error
func EnsureDir(path string) error
func Fingerprint(path string) string
func Snapshot(path string) ([]byte, bool, error)
func Restore(path string, before []byte, had bool) error
func RemoveIfExists(path string) error
```

- **怎么写的**：同目录建临时文件 → 写入 → 刷盘 → 改权限 → 改名替换 → 刷父目录。任何 IO 错误包成 `core.Fail`。
- **`track` 是什么意思**：`true` = 这是我改的，记进记账本；`false` = 这次写不进提交集合。全仓只有 **三处**用 `false`，各有各的理由：
  - `store.Restore`（`atomic.go`）—— 失败回滚，把文件按字节还原，本来就不该进提交；
  - `actions.InitIdentity`（`init_identity.go`）—— 写的是 `~/.taskledger/identity.json`，在仓库之外，根本不能进提交集合；
  - `shell.ResolveLedgerConflict`（`merge.go`）—— 写 rebase 冲突的合并结果，由 `git rebase --continue` 自己提交。
  除这三处，外壳与业务层都不许用 `false`。
- **`SyncDown` 不写盘**（这点最容易被误解）：取最新由 `git checkout <upstream> -- <rel>` 让 git 改工作树，它只返回 `[]SyncEntry{Path, Before, Had}`，由 runner 逐条 `log.RecordPresync` 补记进记账本 —— 所以「远端刷下来的内容」照样随本次提交入库。
- **不许做的事**：不替人建父目录（建目录只有 `EnsureDir`）；不写符号链接（是链接就拒绝）。
- **`Snapshot` / `Restore`**：结案要同时动三个文件，这是唯一的兜底手段，不引 journal。

### 2.2 记账本（`dirty.go`）

```go
type WriteLog struct { Changed, Created []string; Presync []PresyncRecord; CommitStarted bool }
func (w *WriteLog) Record(path string, track, created bool)
func (w *WriteLog) RecordPresync(path string, before []byte, had bool)
func (w *WriteLog) CommitSet() []string
func (w *WriteLog) HasWrites() bool
func (w *WriteLog) RollbackPresync() []string
func (w *WriteLog) DiscardCreated() []string
func (w *WriteLog) Clear()
func Bound(log *WriteLog) func()   // 绑定/解绑进程级记账本
func Current() *WriteLog
```

- **提交集合只看 `CommitSet()`**，不看动作返回的结果。它 = 本次改动 + 取最新刷过的（去重保序）。
- **`Presync` 反而必须提交**：远端拉下来的新内容若留在工作树里，下一条写命令会被写前 guard 拦死。
- **失败收尾两套**：`RollbackPresync`（按备份恢复，逆序）、`DiscardCreated`（删本次新建）。`CommitStarted` 一旦为真就不许再回滚 —— 那时数据已经进 git 了。

### 2.3 锁（`locks*.go`）

```go
func ProgressLock(path string) (func(), error)   // 单文件互斥：阻塞、不重入
func SyncLock(dir string, timeout time.Duration) (func(), error)  // 整条命令：锁文件在 git 目录
func LedgerLock(repo string, rels ...string) (func(), error)      // 多文件：去重 → 排序 → 依次加
```

- 平台实现：`locks.go`（tag `linux || darwin`）是 `flock`，`locks_windows.go` 是 `LockFileEx`（同样的「按绝对路径 hash 到临时目录开 `<hash>.lock`」思路），`locks_unsupported.go` 给其余平台返回空解锁 —— 只保证能编译，不要指望它保护并发。
- **数据层禁止调用**，只有业务层的 `Atom` 用。原因：认领写序「分片→池」、释放「池→分片」，两向相反，各自加锁 = ABBA 死锁。
- **任何失败补偿都只能在同一 `Atom` 内做完**，不许再开一个。

### 2.4 JSON 台账底座（`jsonstore.go`）

```go
func QuoteJSON(s string) string              // JSON 字符串字面量：中文原样
func DumpJSON(v any) string                  // 紧凑 JSON：键按字典序
func DumpLedgerJSON(data map[string]any, expand string) string  // 一条一行 + version
func ReadJSONFile(path string) (map[string]any, bool, error)

type JSONStore struct{ ... }
func NewJSONStore(path, expand string, def map[string]any) *JSONStore
func (s *JSONStore) Data() (map[string]any, error)
func (s *JSONStore) Get(key string) (map[string]any, bool, error)
func (s *JSONStore) All() (map[string]map[string]any, error)
func (s *JSONStore) Put(key string, value map[string]any) error
func (s *JSONStore) Drop(key string) error
func (s *JSONStore) Flush(data map[string]any) error
func (s *JSONStore) EnsureFile() (bool, error)
```

- **「一条一行」是硬要求**，不是排版偏好：多人同时改同一份台账，靠它把冲突缩到单条任务。
- **版本检查只在这里**：读盘发现 `version` 与 `core.FormatVersion` 不符 ⇒ `notices.Note("提示：…")` 一次（进程级去重，不拦）；写盘一律带当前版本（缺就补）。别在动作层各自判断。

### 2.5 四张表

```go
func NewTaskStore(repo, rel string, identity *core.Identity) *TaskStore   // pool.json + 某人的分片，同一个类
func NewOwnersIndex(repo string) *OwnersIndex
func NewHistoryStore(repo string) *HistoryStore
func NewWorklogStore(repo string) *WorklogStore
```

| 表 | 关键方法 | 要点 |
|---|---|---|
| `TaskStore` | 内嵌 `JSONStore` 的 `All/Get/Put/Drop/Flush/EnsureFile` | 公共池与分片只是 `rel` 不同。`identity` **只用于写盘格式**（分片顶部那个可选 `identity` 字段），不参与任何判断 |
| `OwnersIndex` | `Get/All/Ensure/KeysOfName/Shards/DiskShards/AssertPresent` | `Ensure` 只登记一次（写 `file/name/joined`），已登记零写。`DiskShards` 是全仓唯一扫 `owners/` 目录的地方，只给 `validate` 用 |
| `HistoryStore` | `Sources/MonthKey/PathFor/Read/HasLog/AppendRow/Write` | 「算新全文」(`AppendRow`) 与「落盘」(`Write`) 是两个方法：结案要控顺序。`HasLog` 是结案重跑认账的依据 |
| `WorklogStore` | `Template/Find/ByName/All/Read/HeadMeta/Create/Write/AppendExec` | `Create` 建六节骨架；`AppendExec` 写不进只返回 `false`，**不抛**；模板读 `assets/worklog.md`，读不到用内置骨架并 `notices.Note`（模板不许在代码里再抄一份） |

趋势缓存（`trendcache.go`）**不是台账表**：它落在 `~/.taskledger/cache/trend/<仓库哈希>/<offset>/<YYYYMM>.json`，本机私有、不进 git，随时可删。

```go
func TrendCacheDir(home, repo string, offsetSeconds int) string      // 一月一文件；offset 编码成 +0800
func LoadTrendMonth(dir, ym string, algo int) (*TrendMonth, bool)    // 不存在 / 坏 JSON / algo 不符 ⇒ (nil,false)
func SaveTrendMonth(dir, ym string, m *TrendMonth) error             // 原子写（temp + rename）
func TrendSourcesMatch(repo string, sources []TrendSource) bool      // size + mtime_ns，任一个变了就重算
func LoadTrendAnchors(dir string, algo int) *TrendAnchors            // 月度锚：每月末未结（全局 + 按人）
func SaveTrendAnchors(dir string, a *TrendAnchors) error             // 原子写；写不进去只是下次重算
```

要点：缓存只加速、不承担正确性 —— 读不出来当没有、写不进去静默降级；校验只认**该本地月自己的**源文件指纹（本地月可能横跨两个 UTC 月文件，两个都记）；`algo` 一变全部过期；当月永远实时算、不写缓存。

**两层缓存（2026-10-29）**：整月缓存只写用户查的那几个月（不再全跨度预热）；`anchors.json` 记每个月末的未结（全局 + 按人，几十字节/月），倒推时顺手补上。读取时优先「最近的左锚 + 那一段的流水」正向累计，只有没有锚（第一次查某段历史）才从今天的在办快照往回推。正向与倒推必须给出同一个结果，有测试钉住。

## 三、业务层 `actions/`

### 3.1 共用件

```go
type Result struct {                     // 写动作的返回；字段名是公开契约，外壳不许重算
    Changed     []string      // 改了哪些字段名（不是文件名、不是任务号）
    Where       *string       // 主要落在哪个文件（相对 repo）
    AlreadyDone bool          // 重跑发现已经做过 ⇒ 退出码仍是 0
    Message     *string       // git 提交说明；nil ⇒ 外壳用默认模板
    Worklog     *WorklogView  // {Path, Text, Error}
    Payload     map[string]any
    Notices     []string
}
type Params struct {                     // 外壳把命令行装成它，动作各取所需
    Title, Tid, Created string
    Category *string
    Tags []string
    Mine bool
    Owner *string
    Release bool
    Note, Summary, Finished string
    Deep bool
    List *ListQuery; History *HistoryQuery; Trend *TrendQuery
}

func Atom(repo string, rels ...string) (func(), error)        // 拿锁 → 干活 → 放锁；失败也要放
func LockScope(repo string, me core.Identity, action string, params map[string]any) (Scope, error)
func SpecOf(command string) (ActionSpec, error)
func IsReadOnly(command string) bool
```

- **`ActionSpec`** 是外壳怎么调动作的唯一接口：`Render`（渲染函数名）、`ReadOnly`、`LockAction`、`Params`（挑哪些键）、`Run`。**外壳不许自己 switch 命令名**，一律查名册。
- **`Scope`** = 这次要碰的台账文件（`Files`）+ 要刷的目录（`Dirs`）；锁集与取最新都用它，**算锁集只有 `LockScope` 一处**。
- **`RequireUUID` / `RequireTask` / `RequireOwner` / `IsMine`**：归属与前置判定的唯一入口，别在动作里手搓。

### 3.2 写动作（8 个）

| 动作 | 签名 | 写序（崩在中间的收敛判据见 [`ledger-data.md`](ledger-data.md) §六） |
|---|---|---|
| 自举 `Bootstrap` | `(repo, me) (core.Identity, error)` | 目录与池（缺则建）→ 我的分片 → 索引；幂等，零写也要能重跑 |
| 建任务 `NewTask` | `(repo, me, NewTaskParams) (*Result, error)` | 建当月文档目录 → 过程文档（含首条记录）→ 台账（池或分片）。任务号由外壳算好传进来（`core.MakeID` 防撞），业务层不许现算 |
| 认领 `Claim` | `(repo, me, tid) (*Result, error)` | 我的分片 → 删池里那行 → 过程文档记一笔（先加后删，崩在中间只是重复登记） |
| 释放 `Release` | `(repo, me, tid) (*Result, error)` | 写回池（已有同号就不覆盖）→ 删我分片那行 → 过程文档记一笔（方向与认领相反，死锁靠排序锁避免） |
| 交接 `Handoff` | `(repo, me, tid, to) (*Result, error)` | 对方分片 → 删我分片那行 → 过程文档记一笔；只收 uuid，`to` 必须已在索引里登记 |
| 改标签 `Relabel` | `(repo, me, tid, tags) (*Result, error)` | 算最终值 → 过程文档（标签行 + 执行记录 + 状态行，一次写）→ 分片。**分类不可改**（2026-10-27 拍板，`new` 时定死） |
| 记进展 `LogProgress` | `(repo, me, tid, note) (*Result, error)` | 刷分片 `updated` → 过程文档追加一行 |
| 结案 `CloseTask` | `(repo, me, tid, CloseTaskParams) (*Result, error)` | 改标签行（给了 `--tags` 才做）→ 历史加一行 → 封卷 → 删分片（**永远最后一步**）；多步失败靠 `Snapshot`/`Restore` |

### 3.3 只读动作（7 个）

| 动作 | 签名 |
|---|---|
| 列表 `ListTasks` | `(repo, me, ListQuery) (*ListResult, error)` |
| 统计 `StatsTasks` | `(repo, me, ListQuery) (*StatsResult, error)` |
| 趋势 `TrendStats` | `(repo, me, TrendQuery) (*TrendResult, error)` |
| 花名册 `ListOwners` | `(repo, me) (*OwnersResult, error)` |
| 台账根检测 `DetectRoot` | `(dir) (*RootResult, error)` |
| 详情 `ShowTask` | `(repo, me, tid) (*ShowResult, error)` |
| 历史 `QueryHistory` | `(repo, me, HistoryQuery) (*HistoryResult, error)` |
| 体检 `Validate` | `(repo, deep bool) (*ValidationReport, error)` |

只读动作**不取最新、不自举、不提交、不拿整命令锁**；`validate` 有 problems ⇒ 退出码 1。

- **`ListQuery` 是 list 与 stats 共用的同一套查询条件**（范围 / 状态 / 分类 / 标签 / 创建时间 + 三个年龄阈值），合并与筛选也共用 `selectTasks`（`list_tasks.go`）—— 两边口径不许各写一份。
- **年龄阈值一律可选**：`StaleDays` / `OverdueDays` / `BacklogDays` 是 `*int`，没给就由 `ListQuery.StaleDaysOf()` 等回内置默认（`DefaultStaleDays` 3 / `DefaultOverdueDays` 14 / `DefaultBacklogDays` 30）；给了才覆盖。派生值由 `ApplyAge`（`age.go`）写进任务字典，`stats` 只是数它们的个数。
- **派生值只进输出、不进台账**：`stale` / `overdue` / `backlog` 与 `age_days` / `idle_days` / `waiting_days` 是 `--json` 契约的一部分，落盘字段表里没有它们。
- `StatsTasks` 与 `ListTasks` **不合并**：一个吐行、一个吐计数，界面按需要各调一次（可以接受重复读）。
- `DetectRoot` 签名里没有 repo / me：它是「定位仓库之前」的问题，只在目录结构（`core.HasLedger` / `core.RootOf`）上判定，与 `core.AsRoot` 同口径。

## 四、外壳 `shell/`

```go
// gitops.go：全仓唯一跑 git 的地方
func (g *GitRepo) IsGitRepo() bool
func (g *GitRepo) Upstream() string
func (g *GitRepo) CheckRepoState() error          // rebase/merge 中间态 ⇒ Fail
func (g *GitRepo) GuardBeforeWrite(scope actions.Scope) error
func (g *GitRepo) SyncDown(scope actions.Scope) ([]SyncEntry, error)
func (g *GitRepo) Commit(files []string, message string) error
func (g *GitRepo) Push(maxAttempts int, deadline time.Time)  // 失败只提示、不抛
func (g *GitRepo) ResolveConflicts() bool

// merge.go：rebase 撞冲突时的接管
func MergeTaskDicts(base, ours, theirs string) (map[string]any, []string)
func UnionMerge(base, ours, theirs string) string
func ConflictMarked(rel, base, ours, theirs string) (string, []string, bool)
func ResolveLedgerConflict(path, text string) bool
func Owns(rel string) bool

// presync.go / runner.go / cli.go / render.go / help.go / term_*.go
func PresyncScope(repo string, me core.Identity, action string, params map[string]any) (actions.Scope, actions.Scope, error)
func Run(command string, args *Args) int
func Main(argv []string) int
func RenderList(res *actions.ListResult, asJSON bool)
func RenderStats(res *actions.StatsResult, asJSON bool)
func RenderOwners(res *actions.OwnersResult, asJSON bool)
func RenderRoot(res *actions.RootResult, asJSON bool)
func printHelp(command string)
func (t *termState) readKey() key
```

**七步不可换序**（`runner.go`）：绑记账本 → 取最新 → 自举 → 调动作 → 打印 → 提交 → 推送。

- **取最新必须早于自举**：旧索引会盖掉远端新登记。
- **`Push` 任何失败只提示、不抛**：提交已经落下去了，抛业务错会让 runner 走失败收尾，把已提交的内容从工作树抹掉。
- **rebase 的 stage 语义与直觉相反**：`:1` 共同祖先、`:2` 上游（别人的）、`:3` 本机正在重放的提交；冲突标记里**左=远端、右=本机**，标反了会让人照着标记把别人的版本留下来。
- **打印只在 `render.go`**，`notices` 在 `Main` 的 `defer` 里统一 flush 一次。
- **终端交互**：画布与输入框在 `term_canvas.go`（跨平台：自己记账光标行/列，`drawRows` / `redraw` / `eraseBlock` 管「画一块 / 重画 / 抹掉」，`lineEditor` 管逐键输入与收尾）；raw 模式在 `term_unix.go`（termios raw + ESC 序列）/ `term_windows.go`（控制台模式 + 扫描码，VT 输入输出都可用时走同一套 ESC 解析）。**收尾约定**：确认 = 留下提示行当记录、抹掉空行与帮助行；取消 = 整块抹掉、光标回块顶 —— 屏幕上不留残迹。

## 五、工具层 `core/`

| 文件 | 关键函数 |
|---|---|
| `time.go` | `NormalizeTime(value, field, tid, dateOnlyRef)`、`ToUTC`、`TimeKey`、`FmtLocal`、`Now`、`DaysSince(stamp, now)`（距今天数，向下取整、未来记 0、不可解析回 nil）；`Fail` / `Failf` 也定义在这里 |
| `paths.go` | `ToRepoRel` / `ToLedgerRel` / `ToHistoryRel` / `ShardRel` / `MonthOf` / `WorklogDirFor` / `WorklogName` / `WorklogRel` / `HistoryPathFor` / `SkillDir` / `WorklogTemplate` |
| `ids.go` | `Slugify`、`IDStamp`、`MakeID(title, tasks, created)`、`RequireTaskID` |
| `identity.go` | `Identity{uuid,name}`、`Normalize`、`LooksLikeUUID`、`IsMe`、`Label`、`Stamp` |
| `labels.go` | `NormalizeLabel`、`ParseTags`、`SplitTags`、`LabelLine`、`ParseLabelLine` |
| `worklog_md.go` | 建篇：`RenderWorklog`（套六节模板）、`RenderStatusLine` / `RenderStatusBody`；锚点编辑：`AppendExecLog`、`StampFrozen` / `HasFrozenLine`、`RewriteLabelLine`、`RewriteStatusLine` / `ReadStatus`；读：`HeadMeta` / `HeadTitle` / `HeadCreated` / `HeadFrozen` / `HeadCreator` / `HeadCreatorUUID`；校验：`SectionHeads` / `FormatProblems` / `DuplicatedSections` / `LacksExecSection` / `IsSkeleton`；顺序：`HeadKeyOrder` / `insertHeadLine` |
| `history_md.go` | `HistoryLine`（十二列一行）、`ParseHistory`（只认十二列）、`SplitRow`、`IsSepRow`、`EscCell` |
| `roots.go` | `AsRoot`（校验 `--repo`）、`RootOf`（从 cwd 往上找 `ledger/`）、`IsDir`、`AbsDir`、`HasLedger`（直接含 `ledger/`）、`UnderLedger`（在台账目录里） |
| `rowmap.go` | `Row.ToMap()`（历史行 → JSON 形状） |

**时间口径**：存盘一律 UTC（`ToUTC`），对外输出（人话与 `--json`）都过 `FmtLocal` 转本机时区；只给日期时 `--since` 顶 `00:00:00`、`--until` 顶 `23:59:59`。

## 六、错误、退出码、输出

| 退出码 | 含义 | 触发 |
|---|---|---|
| `0` | 成功 | — |
| `1` | 业务错 | `core.Fail`：任务不存在、不是你的、参数不合法、仓库中间态；`validate` 有 problems |
| `2` | 用法错 | 命令/参数不认识、必填缺失 |
| `3` | 未预期异常 | 非 `Fail` 的 error |
| `130` | 中断 | Ctrl-C（提交开始前会回滚） |

- `--help` 是「要看用法」，**退出码 0**；参数错误才是 2。
- `--json` 一律给 JSON，键按字典序（与旧版一致即可，下游按 JSON 解析）。形状两类：`list` 是 `{任务号: 任务对象}`；`stats` / `owners` / `history` / `root` 是带 `count` 或其它并列键的封装对象。
- **`map` 里不许放指针**：`jsonfmt` 只认普通值，`*int` / `*string` 会被渲染成 `0xc000…` 的地址串。派生值要进 JSON 时先解引用（`age.go` 的 `intOrNil`），没有就放**无类型** `nil`（渲染成 `null`）。嵌套字典也得转成 `map[string]any`（见 `RenderOwners`）—— `map[string]map[string]any` 同样不在它的 case 里。

## 七、防塌线（改完必跑）

| 检查 | 命令 |
|---|---|
| 分层没反向 | 见 §〇 的 `grep` 表，全部为 0 |
| 没有第二处 git / 打印 / 加锁 | 同上 |
| 构建与静态检查 | `cd packages/skill/src && go vet ./... && go test ./...` |
| 趋势上限口径 | `MaxHistoryFiles`（13）只归 `history`；`stats --trend` 用 `TrendMaxDays`（3660 天 ≈ 10 年）+ `TrendMaxDayBuckets`（365 天），**按时间不按文件数** |
| 三平台编得过 | `GOOS=linux GOARCH=amd64 go build ./...`、`GOOS=darwin GOARCH=arm64 …`、`GOOS=windows GOARCH=amd64 …` |
| 命令可用性 | 在临时 git 仓库按 §八 跑一遍 new → claim → log → close 全流程，再 `validate --deep` |

## 八、命令行参数 → 动作参数

| 命令 | 参数 | 落到哪 |
|---|---|---|
| `new` | `--title`（必填）、`--id`、`--created`、`--category`、`--tags`、`--self` | `NewTaskParams`；`--self` ⇒ `Mine=true`，否则进公共池 |
| `claim` | `--id`（必填） | `Claim(repo, me, tid)` |
| `set` | `--id`（必填）+ `--release` / `--owner` / `--tags` 三选一 | `Release` / `Handoff` / `Relabel`（`set_task.go` 只做路由） |
| `log` | `--id`、`--note`（都必填） | `LogProgress` |
| `close` | `--id`、`--summary`（必填）、`--finished`、`--tags` | `CloseTaskParams` |
| `list` | `--mine` / `--pool` / `--owner` / `--owner-name` / `--status` / `--category` / `--tag` / `--since` / `--until` / `--stale-days` / `--overdue-days` / `--backlog-days` / `--json` | `ListQuery`（范围优先级 mine → pool → owner；阈值可选，不传回默认） |
| `stats` | 与 `list` 完全同名的那套（含三个阈值） / `--json` | `StatsTasks`（共用同一个 `ListQuery`） |
| `stats --trend` | `--trend <day\|week\|month\|quarter\|year>` + `--since` / `--until` 或 `--last <N><d\|w\|m\|y>`（默认 `8w`）+ `--mine` / `--owner <uuid>[,<uuid>]` / `--by-owner` | `TrendQuery` ⇒ `TrendStats`；**不认** `--pool` / `--owner-name` / `--status` / `--category` / `--tag` / 三个阈值 / `--json`（自带 JSON），给了就是用法错 |
| `owners` | `--json` | `ListOwners` |
| `show` | `--id`、`--json` | `ShowTask` |
| `history` | `--owner` / `--owner-name` / `--mine` / `--category` / `--tag` / `--since` / `--until` / `--months` / `--limit` / `--json` | `HistoryQuery` |
| `validate` | `--deep`、`--json` | `Validate(repo, deep)` |
| `root` | `--dir <目录>`、`--json` | `DetectRoot`（**定位之前**旁路调用，不认 `--repo`、不依赖身份） |
| `whoami` | `--json` | 直接读 `env`，不解析台账 |
| `init` | `--claim` / `--new` / `--name` / `--yes`（禁用） | `InitIdentity`，只在真终端交互 |

公共：`--repo <工作区根>`（命令前后都认）、`--no-sync`（**挂顶层**，放子命令后面是用法错）、`TASK_LEDGER_NO_SYNC=1`。
