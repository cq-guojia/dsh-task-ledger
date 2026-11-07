# 接口契约：数据层 / 业务层 / 驱动外壳（Go 实现）

本文只讲三件事：每一层有哪些方法、各自负责什么、哪些事不许做。签名以 `packages/skill/src/internal/<层>/` 源码为准，语义有疑问时先读源码。数据形状见 [ledger-files.md](../data/ledger-files.md)，分层纪律见 [code-conventions.md](../development/code-conventions.md)，系统不变量见 [overview.md](../architecture/overview.md)。

## 〇、先把词说清楚

| 文档里的说法 | 人话 |
|---|---|
| 数据层（`internal/store/`） | 只跟文件打交道：一种文件一个对象，负责读出来、改好、写回去。不懂业务规矩，不懂「结案要同时写三个文件」 |
| 业务层（`internal/actions/`） | 一个动作一个函数：建任务、认领、释放、交接、记进展、结案。决定顺序、重跑规则与中途失败怎么补 |
| 外壳（`internal/shell/`） | 跑一条命令的外围杂事：解析命令行、取最新、提交推送、打印结果、决定退出码。不懂业务 |
| 工具层（`internal/core/`） | 纯换算：时间格式、路径拼接、任务号生成、标签校验、markdown 增删行。不读写文件、不联网、不打印 |
| `internal/env/` | 唯一被允许确认「我现在是谁」的地方（`~/.taskledger/identity.json` 的 `uuid` / `name`） |
| `internal/notices/` | 进程级提示收集器：只收文本、永不打印，最后由 `shell/render.go` 一次性打到 stderr |
| `internal/jsonfmt/` | 只服务 `--json` 的屏幕输出（唯一调用点 `shell/render.go` 的 `jsonOut`）：两空格缩进、中文不转 `\uXXXX`、空容器写 `{}` / `[]`，键序按字典序。写台账文件不走它，走 `store.DumpLedgerJSON` |

依赖只能从上往下，不许反向：

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

外壳不是第三层业务，是进程边界：① 推送被拒会自动 rebase，冲突合并直接改磁盘文件，业务层若握着改前数据，下一次整份写回会抹掉别人刚合进来的任务；② 业务函数要能被界面单独调，按一下「释放」不能顺带跑参数解析、退出码与 git 提交；③ 外壳只管「这次改了哪些文件」和「返回什么结果」，越界一次顺序与回滚就散回每个命令里。

### 准入规则（能机械检查）

| 规则 | 怎么查（在 `packages/skill/src/` 下跑） |
|---|---|
| 业务层不许反向依赖外壳 | `grep -rn "internal/shell" internal/actions/` 必须为 0 |
| 数据层不许依赖业务层 / 外壳 | `grep -rn "internal/actions\|internal/shell" internal/store/` 必须为 0 |
| 工具层只许 `notices` 与自己同包 | `grep -rn "internal/" internal/core/ \| grep -v "internal/core\|internal/notices"` 必须为 0 |
| 只有外壳跑 git | `grep -rn "exec.Command" internal/ --include='*.go' \| grep -v internal/shell \| grep -v _test.go` 必须为 0 |
| 只有外壳打印 | `grep -rn "fmt.Print\|os.Stdout" internal/core internal/store internal/actions` 必须为 0 |
| 只有业务层的 `Atom` 加锁 | `grep -rn "store.LedgerLock\|store.ProgressLock" internal/ \| grep -v "internal/actions/scope.go"` 必须为 0 |
| 动作之间不许互相调用，唯一例外 `set_task.go` 路由 | `grep -rn "actions\.\(Release\|Handoff\|Claim\|Relabel\)(" internal/actions/ \| grep -v set_task.go` 必须为 0 |

## 一、目录树

- `packages/skill/` — skill 包根
  - `SKILL.md` — 给 agent 的说明书（命令、口径、坑）
  - `README.md` — 给装 skill 的人看
  - `assets/worklog.md` — 过程文档六节模板（真源只有这一份）
  - `references/` — init-identity / state-model / log-note / troubleshooting
  - `scripts/` — 运行时要用的东西，只有两项
    - `progress` — 入口 shim：认平台 → 校验可执行位 → exec 二进制
    - `bin/ledger-<os>-<arch>[.exe]` — 三平台静态产物（linux/amd64、darwin/arm64、windows/amd64）
  - `src/` — 实现源码（目录名与语言无关）
    - `go.mod` — Go 模块清单
    - `main.go` — 只把 argv 与退出码转给 `shell.Main`
    - `internal/` — 各层实现都在这
      - `shell/` — 外壳：cli / runner / gitops / merge / render / help / presync / term_*
      - `actions/` — 业务层：一个动作一个文件 + registry / scope / guard / query
      - `store/` — 数据层：atomic / dirty / locks(+平台) / jsonstore / 四张表
      - `core/` — 工具层：time / paths / ids / identity / labels / worklog_md / history_md / roots / rowmap
      - `env/` — 我是谁
      - `notices/` — 提示收集
      - `jsonfmt/` — `--json` 输出排版

分发时不带 `src/`：`package.json` 的 `files` 只列 `scripts/`、`assets/`、`references/`、`SKILL.md`、`README.md`；插件内嵌副本（`packages/plugin/skill/`）也只同步这几项。

### 1.1 拆包时的四条约束

1. 包的初始化顺序不许承载逻辑：`notices` / `env` 都是纯函数 + 全局，不靠 `init()` 做副作用。
2. `store.Bound(log)` 是进程级的：进 runner 时绑定一次、`defer` 解绑；业务层不许再绑第二个，否则提交集合会分裂。
3. `core` 不许接收「一整条任务」当参数（吃了整条就会开始判 owner/status）；要字段就让调用方传字段。
4. 平台相关文件必须「每个平台都有实现」：`locks.go`（`linux || darwin`）/ `locks_windows.go` / `locks_unsupported.go`、`term_unix.go` / `term_windows.go` / `term_unsupported.go`、`sigpipe_unix.go`（`!windows`）/ `sigpipe_windows.go`。tag 宽了会在未适配平台报 `undefined: syscall.Flock`，窄了会缺函数。

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

同目录建临时文件 → 写入 → 刷盘 → 改权限 → 改名替换 → 刷父目录，任何 IO 错误包成 `core.Fail`。`track=true` 记进记账本；`false` 全仓只有三处：`store.Restore`（失败回滚）、`actions.InitIdentity`（写在仓库外的身份文件）、`shell.ResolveLedgerConflict`（由 `git rebase --continue` 自己提交）。其余一律不许用 `false`。

`SyncDown` 不写盘：取最新由 `git checkout <upstream> -- <rel>` 改工作树，它只返回 `[]SyncEntry{Path, Before, Had}`，由 runner 逐条 `log.RecordPresync` 补记进记账本，所以远端刷下来的内容照样随本次提交入库。原子写不替人建父目录（只有 `EnsureDir`）、不写符号链接。`Snapshot` / `Restore` 是结案等多文件动作的兜底手段，不引 journal。

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
func Bound(log *WriteLog) func()
func Current() *WriteLog
```

提交集合只看 `CommitSet()`（本次改动 + 取最新刷过的，去重保序），不看动作返回结果。`Presync` 必须提交，否则远端拉下来的新内容留在工作树里，下一条写命令会被写前 guard 拦死。失败收尾两套：`RollbackPresync`（按备份逆序恢复）、`DiscardCreated`（删本次新建）；`CommitStarted` 为真后不许再回滚。

### 2.3 锁（`locks*.go`）

```go
func ProgressLock(path string) (func(), error)   // 单文件互斥：阻塞、不重入
func SyncLock(dir string, timeout time.Duration) (func(), error)  // 整条命令：锁文件在 git 目录
func LedgerLock(repo string, rels ...string) (func(), error)      // 多文件：去重 → 排序 → 依次加
```

平台实现：`locks.go`（tag `linux || darwin`）走 `flock`，`locks_windows.go` 走 `LockFileEx`（同样按绝对路径 hash 到临时目录开 `<hash>.lock`），`locks_unsupported.go` 返回空解锁、只保证能编译。数据层禁止调用，只有业务层的 `Atom` 用：认领写序是「分片→池」、释放是「池→分片」，两向相反，各自加锁会 ABBA 死锁。任何失败补偿都只能在同一 `Atom` 内做完。

### 2.4 JSON 台账底座（`jsonstore.go`）

```go
func QuoteJSON(s string) string
func DumpJSON(v any) string
func DumpLedgerJSON(data map[string]any, expand string) string
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

「一条一行」是硬要求：多人同时改同一份台账，靠它把冲突缩到单条任务。版本检查只在这里：读盘发现 `version` 与 `core.FormatVersion` 不符 ⇒ `notices.Note` 一次（进程级去重、不拦）；写盘一律带当前版本。动作层不各自判断。

### 2.5 四张表

```go
func NewTaskStore(repo, rel string, identity *core.Identity) *TaskStore
func NewOwnersIndex(repo string) *OwnersIndex
func NewHistoryStore(repo string) *HistoryStore
func NewWorklogStore(repo string) *WorklogStore
```

| 表 | 关键方法 | 要点 |
|---|---|---|
| `TaskStore` | 内嵌 `JSONStore` 的 `All/Get/Put/Drop/Flush/EnsureFile` | 公共池与分片只是 `rel` 不同；`identity` 只用于写盘格式，不参与判断 |
| `OwnersIndex` | `Get/All/Ensure/KeysOfName/Shards/DiskShards/AssertPresent` | `Ensure` 只登记一次；`DiskShards` 是全仓唯一扫 `owners/` 目录的地方，只给 `validate` 用 |
| `HistoryStore` | `Sources/MonthKey/PathFor/Read/HasLog/AppendRow/Write` | 「算新全文」与「落盘」是两个方法，结案要控顺序；`HasLog` 是结案重跑认账依据 |
| `WorklogStore` | `Template/Find/ByName/All/Read/HeadMeta/Create/Write/AppendExec` | `Create` 建六节骨架；`AppendExec` 写不进只返回 `false`、不抛；模板读 `assets/worklog.md`，读不到用内置骨架并 `notices.Note` |

趋势缓存（`trendcache.go`）不是台账表，落 `~/.taskledger/cache/trend/<仓库哈希>/<offset>/<YYYYMM>.json`，本机私有、不进 git、随时可删。

```go
func TrendCacheDir(home, repo string, offsetSeconds int) string
func LoadTrendMonth(dir, ym string, algo int) (*TrendMonth, bool)
func SaveTrendMonth(dir, ym string, m *TrendMonth) error
func TrendSourcesMatch(repo string, sources []TrendSource) bool
func LoadTrendAnchors(dir string, algo int) *TrendAnchors
func SaveTrendAnchors(dir string, a *TrendAnchors) error
```

缓存只加速、不承担正确性：读不出来当没有，写不进去静默降级；校验只认该本地月自己的源文件指纹（`size + mtime_ns`），`algo` 一变全部过期；当月永远实时算、不写缓存。整月缓存只写用户查过的月份，`anchors.json` 记每个月末的未结（全局 + 按人），倒推时顺手补上：优先「最近的左锚 + 那一段流水」正向累计，只有没有锚才从今天的在办快照往回推，两者必须同结果。当月与**有在办任务创建的月份**不进整月缓存 —— 在办任务只存在公共池 / 分片，源文件指纹查不到它的增删，固化进缓存会让该月起的未结永远多 1，这类月份的「新增」只能每次现算。

## 三、业务层 `actions/`

### 3.1 共用件

```go
type Result struct {
    Changed     []string      // 改了哪些字段名（不是文件名、不是任务号）
    Where       *string       // 主要落在哪个文件（相对 repo）
    AlreadyDone bool          // 重跑发现已经做过 ⇒ 退出码仍是 0
    Message     *string       // git 提交说明；nil ⇒ 外壳用默认模板
    Worklog     *WorklogView  // {Path, Text, Error}
    Payload     map[string]any
    Notices     []string
}
type Params struct {
    Title, Tid, Created string
    Category *string
    Tags []string
    Mine bool
    Owner *string
    Release bool
    Note, Summary, Finished string
    Cancel bool
    Deep bool
    List *ListQuery; History *HistoryQuery; Trend *TrendQuery
}

func Atom(repo string, rels ...string) (func(), error)
func LockScope(repo string, me core.Identity, action string, params map[string]any) (Scope, error)
func SpecOf(command string) (ActionSpec, error)
func IsReadOnly(command string) bool
```

`ActionSpec` 是外壳调动作的唯一接口（`Render` / `ReadOnly` / `LockAction` / `Params` / `Run`），外壳不许自己 switch 命令名，一律查名册。`Scope` = 这次要碰的文件（`Files`）+ 要刷的目录（`Dirs`），锁集与取最新都用它，算锁集只有 `LockScope` 一处。`RequireUUID` / `RequireTask` / `RequireOwner` / `IsMine` 是归属与前置判定的唯一入口。

### 3.2 写动作

| 动作 | 签名 | 写序 |
|---|---|---|
| 自举 `Bootstrap` | `(repo, me) (core.Identity, error)` | 目录与池（缺则建）→ 我的分片 → 索引；幂等，零写也要能重跑 |
| 建任务 `NewTask` | `(repo, me, NewTaskParams) (*Result, error)` | 建当月文档目录 → 过程文档（含首条记录）→ 台账（池或分片）。任务号由外壳算好传进来；标签必填，`ParseTags` 后为空即 Fail |
| 认领 `Claim` | `(repo, me, tid) (*Result, error)` | 我的分片 → 删池里那行 → 过程文档记一笔（先加后删，崩在中间只是重复登记） |
| 释放 `Release` | `(repo, me, tid) (*Result, error)` | 写回池（已有同号不覆盖）→ 删我分片那行 → 过程文档记一笔（方向与认领相反，靠排序锁避免死锁） |
| 交接 `Handoff` | `(repo, me, tid, to) (*Result, error)` | 对方分片 → 删我分片那行 → 过程文档记一笔；只收 uuid，`to` 必须已在索引里登记 |
| 改标签 `Relabel` | `(repo, me, tid, tags) (*Result, error)` | 算最终值 → 过程文档（标签行 + 执行记录 + 状态行，一次写）→ 分片；分类不可改，`new` 时定死 |
| 记进展 `LogProgress` | `(repo, me, tid, note) (*Result, error)` | 刷分片 `updated` → 过程文档追加一行 |
| 结案 `CloseTask` | `(repo, me, tid, CloseTaskParams) (*Result, error)` | 改标签行（给了 `--tags` 才做）→ 历史加一行 → 封卷 → 删分片（永远最后一步）；多步失败靠 `Snapshot`/`Restore` |
| 删除在办 `DeleteTask` | `(repo, me, tid, DeleteTaskParams) (*Result, error)` | 只做转接：`CloseTask{Delete: true}`，写序与崩溃恢复和结案同一套；结果列留空、删除四列落值 |
| 删历史行 `DeleteHistoryRow` | `(repo, me, DeleteHistoryParams) (*Result, error)` | 读历史文件 → 「已删过」判重 → 行指纹核对（`Expect` 与 `core.RowStamp` 不符即中止、零写入）→ 只改该行末尾四格 → 过程文档追加一条 `delete` 执行记录 |

### 3.3 只读动作

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

只读动作不取最新、不自举、不提交、不拿整命令锁；`validate` 有 problems ⇒ 退出码 1。`ListQuery` 是 `list` 与 `stats` 共用的查询条件（范围 / 状态 / 分类 / 标签 / 创建时间 + 三个年龄阈值），合并与筛选共用 `selectTasks`。年龄阈值是可选 `*int`，没给就由 `ListQuery.StaleDaysOf()` 等回内置默认（3 / 14 / 30 天），派生值由 `ApplyAge` 写进任务字典、只进输出不进台账。`StatsTasks` 与 `ListTasks` 不合并：一个吐行、一个吐计数。`DetectRoot` 签名里没有 repo / me，它是「定位仓库之前」的问题。

## 四、外壳 `shell/`

```go
// gitops.go：全仓唯一跑 git 的地方
func (g *GitRepo) IsGitRepo() bool
func (g *GitRepo) Upstream() string
func (g *GitRepo) CheckRepoState() error
func (g *GitRepo) GuardBeforeWrite(scope actions.Scope) error
func (g *GitRepo) SyncDown(scope actions.Scope) ([]SyncEntry, error)
func (g *GitRepo) Commit(files []string, message string) error
func (g *GitRepo) Push(maxAttempts int, deadline time.Time)
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

七步不可换序（`runner.go`）：绑记账本 → 取最新 → 自举 → 调动作 → 打印 → 提交 → 推送。取最新必须早于自举（旧索引会盖掉远端新登记）；`Push` 任何失败只提示不抛（提交已落下，抛业务错会让 runner 走失败收尾把已提交内容从工作树抹掉）；rebase 的 stage 语义与直觉相反（`:1` 共同祖先、`:2` 上游、`:3` 本机重放的提交，冲突标记左=远端、右=本机）；打印只在 `render.go`，`notices` 在 `Main` 的 `defer` 里统一 flush 一次。

终端交互：画布与输入框在 `term_canvas.go`（跨平台，自己记账光标行/列）；raw 模式在 `term_unix.go`（termios raw + ESC 序列）/ `term_windows.go`（控制台模式 + 扫描码）。收尾约定：确认 = 留下提示行当记录、抹掉空行与帮助行；取消 = 整块抹掉、光标回块顶，屏幕不留残迹。

## 五、工具层 `core/`

| 文件 | 关键函数 |
|---|---|
| `time.go` | `NormalizeTime(value, field, tid, dateOnlyRef)`、`ToUTC`、`TimeKey`、`FmtLocal`、`Now`、`DaysSince(stamp, now)`；`Fail` / `Failf` 也定义在这里 |
| `paths.go` | `ToRepoRel` / `ToLedgerRel` / `ToHistoryRel` / `ShardRel` / `MonthOf` / `WorklogDirFor` / `WorklogName` / `WorklogRel` / `HistoryPathFor` / `SkillDir` / `WorklogTemplate` |
| `ids.go` | `Slugify`、`IDStamp`、`MakeID(title, tasks, created)`、`RequireTaskID` |
| `identity.go` | `Identity{uuid,name}`、`Normalize`、`LooksLikeUUID`、`IsMe`、`Label`、`Stamp` |
| `labels.go` | `NormalizeLabel`、`ParseTags`、`SplitTags`、`LabelLine`、`ParseLabelLine` |
| `worklog_md.go` | 建篇 `RenderWorklog` / `RenderStatusLine` / `RenderStatusBody`；锚点编辑 `AppendExecLog` / `StampFrozen` / `HasFrozenLine` / `RewriteLabelLine` / `RewriteStatusLine` / `ReadStatus`；读 `HeadMeta` / `HeadTitle` / `HeadCreated` / `HeadFrozen` / `HeadCreator` / `HeadCreatorUUID`；校验 `SectionHeads` / `FormatProblems` / `DuplicatedSections` / `LacksExecSection` / `IsSkeleton`；顺序 `HeadKeyOrder` / `insertHeadLine` |
| `history_md.go` | `HistoryLine`（十六列一行）、`ParseHistory`（只认十六列）、`SplitRow`、`IsSepRow`、`EscCell`、`RowStamp`（整行指纹，sha256 前 12 hex） |
| `roots.go` | `AsRoot`（校验 `--repo`）、`RootOf`（从 cwd 往上找 `ledger/`）、`IsDir`、`AbsDir`、`HasLedger`（直接含 `ledger/`）、`UnderLedger` |
| `rowmap.go` | `Row.ToMap()`（历史行 → JSON 形状，含 `fingerprint`） |

时间口径：存盘一律 UTC（`ToUTC`），对外输出（人话与 `--json`）都过 `FmtLocal` 转本机时区；只给日期时 `--since` 顶 `00:00:00`、`--until` 顶 `23:59:59`。

## 六、错误、退出码、输出

| 退出码 | 含义 | 触发 |
|---|---|---|
| `0` | 成功 | — |
| `1` | 业务错 | `core.Fail`：任务不存在、不是你的、参数不合法、仓库中间态；`validate` 有 problems |
| `2` | 用法错 | 命令/参数不认识、必填缺失 |
| `3` | 未预期异常 | 非 `Fail` 的 error |
| `100` | 没身份 | `core.FailCode(core.FailIdentityMissing, …)`；刻意远离 1/2/3 与 128+n 信号区，插件 host 据此给 `LEDGER_IDENTITY_MISSING` |
| `130` | 中断 | Ctrl-C（提交开始前会回滚） |

`--help` 是「要看用法」，退出码 0；参数错误才是 2。`--json` 一律给 JSON，键按字典序，形状两类：`list` 是 `{任务号: 任务对象}`；`stats` / `owners` / `history` / `root` 是带 `count` 或其它并列键的封装对象。

`map` 里不许放指针：`jsonfmt` 只认普通值，`*int` / `*string` 会被渲染成地址串。派生值要进 JSON 先解引用（`age.go` 的 `intOrNil`），没有就放无类型 `nil`；嵌套字典也得转成 `map[string]any`。

## 七、命令行参数 → 动作参数

| 命令 | 参数 | 落到哪 |
|---|---|---|
| `new` | `--title`（必填）、`--tags`（必填，至少 1 个）、`--id`、`--created`、`--category`、`--self` | `NewTaskParams`；`--self` ⇒ `Mine=true`，否则进公共池 |
| `claim` | `--id`（必填） | `Claim(repo, me, tid)` |
| `set` | `--id`（必填）+ `--release` / `--owner` / `--tags` 三选一 | `Release` / `Handoff` / `Relabel`（`set_task.go` 只做路由） |
| `log` | `--id`、`--note`（都必填） | `LogProgress` |
| `close` | `--id`、`--summary`（正常结案必填，取消可省）、`--cancel`、`--finished`、`--tags` | `CloseTaskParams` |
| `delete` | `--id`（在办任务）或 `--src` + `--line`（历史行，二选一）；历史行可加 `--expect <指纹>`、`--summary <留言>` | `DeleteTask` ⇒ `CloseTask{Delete: true}`；`--src` ⇒ `DeleteHistoryRow`，`--expect` 与 `core.RowStamp(该行原文)` 不符即整条拒绝、零写入 |
| `list` | `--mine` / `--pool` / `--owner` / `--owner-name` / `--status` / `--category` / `--tag` / `--since` / `--until` / `--stale-days` / `--overdue-days` / `--backlog-days` / `--json` | `ListQuery`（范围优先级 mine → pool → owner；阈值不传回默认） |
| `stats` | 与 `list` 完全同名的那套（含三个阈值） / `--json` | `StatsTasks`（共用同一个 `ListQuery`） |
| `stats --trend` | `--trend <day\|week\|month\|quarter\|year>` + `--since` / `--until` 或 `--last <N><d\|w\|m\|y>`（默认 `8w`）+ `--mine` / `--owner <uuid>[,<uuid>]` / `--by-owner` | `TrendQuery` ⇒ `TrendStats`；不认 `--pool` / `--owner-name` / `--status` / `--category` / `--tag` / 三个阈值 / `--json` |
| `owners` | `--json` | `ListOwners` |
| `show` | `--id`、`--json` | `ShowTask` |
| `history` | `--owner` / `--owner-name` / `--mine` / `--category` / `--tag` / `--keyword` / `--since` / `--until` / `--months` / `--limit` / `--json` | `HistoryQuery`（`--keyword` 是标题 / 摘要 / 标签的子串匹配） |
| `validate` | `--deep`、`--json` | `Validate(repo, deep)` |
| `root` | `--dir <路径>`、`--json` | `DetectRoot`（定位之前旁路调用，不认 `--repo`、不依赖身份） |
| `whoami` | `--json` | 直接读 `env`，不解析台账 |
| `init` | `--claim` / `--new` / `--name` / `--yes`（禁用） | `InitIdentity`，只在真终端交互 |
| `dirs` | `--dir <路径>` + `--add` / `--rename <新名>` / `--hide` / `--unhide` / `--remove`（动作只能给一个）、`--name`、`--all`、`--json` | `AddDir` / `RenameDir` / `SetHidden` / `RemoveDir` / `ListDirs`；机器级清单，不碰台账、不读身份 |
| `forget` | `--id <uuid>`（必填）、`--keep-identity`、`--json` | `ForgetOwner`：摘名册与分片；`--keep-identity` 只摘台账、不动本机身份文件 |
| `logout` | `--json` | `Logout`：只清 `~/.taskledger/identity.json`，走只读路径（不取最新、不提交） |
| `switch` | `--claim=<uuid>` / `--new --name=<名字>` / `--rename <新昵称>` 三选一，`--json` | `SwitchIdentity` / `RenameSelf`；只给界面用、不进 `SKILL.md` |

公共：`--repo <工作区根>`（命令前后都认）、`--no-sync`（挂顶层，放子命令后面是用法错）、`TASK_LEDGER_NO_SYNC=1`。

趋势上限口径：`MaxHistoryFiles`（13）只归 `history`；`stats --trend` 用 `TrendMaxDays`（3660 天）+ `TrendMaxDayBuckets`（365 天），按时间不按文件数。

## 更新日志

- 2026-11-07 23:03:03：按 koc-code-docwriter 槽位迁移，剔除过程稿并统一标题头
- 2026-11-08 01:29:50：目录结构改为树 + 每行备注
