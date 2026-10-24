# 20261022-2107-progress-py-分层重构-把内联动作抽成单功能方法-f033：progress.py 分层重构：把内联动作抽成单功能方法

> **✅ 完成封卷**：2026-10-23 00:38:37（@cqguojia@hotmail.com）
> **创建**：2026-10-22 21:07:23（@cqguojia@hotmail.com）
> **分类**：重构 ｜ **标签**：台账、脚本、分层

<!-- 「> **分类**：… ｜ **标签**：…」行由脚本按 new --category / --tags 插入；两者皆空则不写。 -->

## 背景

**触发**：2026-10-22 晚在加固 `packages/skill/scripts/progress.py`（A 类 12 条 + B1/B2 已入库 `fa1c0b3` / `dce20f4`；
按用户要求做了两路只读审查，得 9 条新问题，其中 #4 计数口径、#7 封卷判定已修并推 `05fe693`）。
讨论剩下那条（「只想看看会改哪些，结果仓库被改了并自动提交」）时，用户指出根因不是单条 bug，而是**脚本的结构**：

> 脚本应该提供单个功能。像「释放」应该只是调用三个单功能：改 worklog、删掉我台账里那一条、写回公共池。
> 现在全串到一块儿了。

据此**停掉 A/B 加固**，单开本任务做分层重构。

**为什么这不是洁癖**（现状的三个实际危害）：
1. 回滚能力不一致：`new` 有撤回、`close` 有局部备份恢复，而 `claim` / `set` / `log` / `tags --rename` 崩在中途就留半截。
2. 锁顺序各写各的：初始化锁 3 个路径、`close` 锁分片+历史、`set` 交接另锁对方分片、`tags` 锁 1 个 —— 顺序不统一，迟早互相等锁。
3. 动作无法复用：UI 想按一下「释放」，只能把整条命令跑一遍（连参数校验、写后提交一起跑），因为「释放」不是一个可以被调用的东西。

## 待办

> 现状盘点已完成（2026-10-22 多轮只读评审，结论见「过程」末节），下面按**新方案**的阶段排。

1. **阶段一 · L1 落地**：抽 5 个文件对象（`JsonStore` / `HistoryStore` / `WorklogStore` / `OwnersIndex` / 复用 `JsonStore` 的分片），方法只用 `get/put/drop/all/fingerprint`。纯机械替换，对外零行为变化。
2. **阶段二 · L2 逐个搬**：先 `release`（最小、只碰 pool + 我的分片 + 一篇 worklog），再 `claim` / `set` / `log` / `close` / `new` / `rename_label`。每个动作开头一个 `with atom(...)`，搬一个跑一次验证。
3. **阶段三 · 外壳收口**：业务返回结果对象（`changed` / `where` / `already_done` / `message`），由外壳统一打印；git 三步（sync_down / commit / push）只留外壳两个位置；`_write_targets` 的按命令名分派收敛成一个 `presync_scope(action, args)`。
4. **阶段四 · 删旧机制**：4 套回滚 → 1 套（`atom` + 写序 + 幂等）；补 `fsync` 父目录；修 `close` 跨月时 presync 只刷单月历史的上界缺陷（改「当月 + 上月」）。
5. **每步验证**：单测（`packages/skill/tests`）→ 临时仓手工场景 → `koc-codelint` → 内嵌副本同步（`npm run build:host` + `node scripts/check-skill-copy.mjs`）。

## 下一步

开工第一件事：**只做阶段一的 `JsonStore` + `atom` 两个东西**（其余不动），跑一遍现有单测证明零行为变化。第二个提交再把 `release` 搬成 L2 函数（`cmd_set` 的释放分支先改成调它），验证三条：释放后 pool 有、分片无、worklog 多一行，以及「崩在两步之间重跑只补删」。

行号会随改动漂移，以**符号名**为准（2026-10-22 的坐标：`cmd_new`≈3139、`cmd_claim`≈3230、`cmd_set`≈3329、`cmd_log`≈3455、`cmd_close`≈3483、`cmd_tags`≈3862）。

## 过程

**2026-10-22 已核实的现状**（供开工直接用，不必重查）：

- 原子层**已有**且基本干净：`write_text_atomic`、`write_ledger_json`、`read_ledger`、`load_pool`、`load_shard`、
  `record_exec`（往过程文档追加一条）、`write_worklog`、`append_exec_log`、`stamp_frozen`、`append_history_line`
  （只算新内容、不落盘）、`find_worklog`、`ledger_lock`、`has_frozen_line`、`history_has_log`。
- 业务动作**全部内联**在 `cmd_*` 里，没有独立方法：建任务、认领、改状态、释放、交接、记进展、结案、归并标签。
- 重复点：「读分片 → 改 dict → 写回」5 处；「读池 → 改 → 写回」2 处；「读对方分片 → 写」1 处。
- 「释放」与「交接」都塞在 `cmd_set` 的分支里；「结案」是一个约 100 行的函数（备份 → 写历史 → 封卷 → 删我那行 → 失败逐个恢复）。

**已拍板口径（改造时不许推翻）**：

- 结案只由 `close` 这个指令决定，**不许拿文档文字判断**（2026-10-22 拍板，`05fe693` 已落地）。
- 封卷只认「以 `> **` 开头且含标记的那一行」；正文/标题/执行记录提到不算。
- `close` 三步各自幂等；跨月重跑直接再记一行，**严禁扫全年历史**（2026-10-22 明确）。
- 不写旧布局兼容 / 迁移程序；不考虑用户手改文件、手删文件、手写执行记录。

**主要风险**：约 600–700 行会重组。每条动作的**写序就是它的崩溃恢复协议**（释放必须「先写池再删我」、交接必须「先写对方再删我」、结案必须「最后删分片」），搬家时顺序错了就是丢数据。

### 2026-10-22 方案定稿：两层 + 外壳

> 用户 2026-10-22 拍板：**只要两层，不要框架**。之前讨论过的 L0/L1/L2/L3 四层、Unit of Work 类、journal + recover 全部作废，下面这版为准。

**一句话**：L1 管文件、L2 管业务、git 归外壳。事务不是一层，是 L2 手里一个 10 行的 `atom`；崩溃不靠日志，靠「固定写序 + 重跑幂等」。

#### 1. 三层职责（业务两层 + 一个不算层的外壳）

| 层 | 干什么 | 禁止 |
|---|---|---|
| **L1 基础**（每个文件一个对象） | 读好、写好自己那个文件：编码、格式、原子落盘、权限、指纹 | 加锁、懂 `owner`/`status`、打印、碰 git |
| **L2 业务**（每个动作一个函数） | 开头 `with atom(repo, *涉及文件)`，串若干 L1 调用，写序 + 幂等判据，返回结果对象 | 直接落盘（`write_*`/`open`）、自己拼锁、`print`、碰 git |
| **外壳**（`cmd_*` + `_run_once`） | 解析参数 → 取最新 → 调一个 L2 → 提交 → 推送 → 打印 | 自己算写序、自己回滚 |

#### 2. L1 接口（5 个对象，方法越少越好）

```python
class JsonStore:          # pool / owners / 我的分片 共用
    def get(self) -> dict
    def put(self, data) -> None
    def drop(self, key) -> None          # 只改内存？否 —— L1 自己落盘，一次一个文件
    def all(self) -> dict
    def fingerprint(self) -> str | None  # stat_key，供 L2 写前复查

class OwnersIndex(JsonStore):            # 索引：人 → 分片文件
    def register(self, me) -> None
    def shard_of(self, who) -> Path

class HistoryStore:                      # markdown 行，不是 JSON 表
    def all(self) -> list[Path]          # history_sources
    def get(self, path) -> str
    def put(self, path, text) -> None
    def append(self, path, row, *, log_name) -> tuple[str, int, bool]  # 新全文/升级行数/是否重复

class WorklogStore:                      # 文档，不是表
    def get(self, tid, task) -> str | None
    def put(self, path, text) -> None
    def new(self, tid, task) -> Path
    def all(self) -> list[Path]
```

纯函数保持模块级（不算层）：`append_exec_log`、`stamp_frozen`、`rewrite_label_line`、`has_frozen_line`。

#### 3. L2 业务（8 个函数，签名里永远没有 git）

```python
@contextmanager
def atom(repo, *rels):                   # 就是现在的 ledger_lock，排序加锁
    with ledger_lock(repo, *rels):
        yield

def release(repo, tid) -> Result:
    with atom(repo, POOL_REL, my_shard_rel, my_worklog_rel):
        task = shard.get()[tid]
        pool.put({**pool.get(), tid: task.released()})   # 1 先写目标
        shard.drop(tid)                                   # 2 删永远最后
        return Result(changed=[...], where=POOL_REL)
```

动作清单：`bootstrap`（原 `ensure_ledger`，自己就是一个 3 文件事务）、`new_task`、`claim`、`set_task`、`release`、`handoff`、`log_progress`、`close_task`、`rename_label`。
只读不进事务：`list_tasks` / `query_history` / `show_task`。

#### 4. 外壳：git 只在这两个位置

| 步骤 | 谁做 | 范围从哪来 |
|---|---|---|
| 取最新 `sync_down` | 外壳，业务**之前** | 静态上界 `presync_scope(action, args)`（宁宽勿窄） |
| 改文件 | L2 + L1 | 业务自己 |
| 提交 `commit` | 外壳，业务**之后** | **L1 的脏集**（`CHANGED_FILES`），不由业务返回 |
| 推送 `push` | 外壳，最后 | — |

```python
def run(action, args):
    git = GitRepo(repo)
    git.sync_down(presync_scope(action, args))
    try:
        result = ACTIONS[action](repo, args)      # L2，不 import git
        git.commit(dirty_files(), result.message)  # 后验精确
        git.push()
    except Fail:
        rollback(); raise
```

**为什么 git 不能进 L2**：推送被拒会触发 `rebase --autostash` + 冲突合并**直接写盘**，而 L2 手里还握着改前的 dict；下一次整份写回就会把别人刚合进来的任务整条抹掉，且 `track=False` 连「已改未提交」都不登记。现状「git 永远在业务返回之后」是结构性保护，不许拆。

#### 5. 三条铁律

1. **L1 绝不自己加锁** —— 认领写序是「分片→池」、释放是「池→分片」，L1 各自加锁就是 ABBA 死锁。锁只在 L2 的 `atom` 里。
2. **L2 不直接碰文件** —— 出现 `write_ledger_json` / `open(` / `ledger_lock` / `print` / `git_` 就是塌回去了。
3. **L1 不做业务判断** —— `require_owner` 这类必须上移 L2。

#### 6. 防塌线（grep 可验，改完必跑）

| 判据 | 现在 | 目标 |
|---|---|---|
| `cmd_*` 函数体里 `write_ledger_json\|read_ledger\|ledger_lock` | 17 / 9 处 | **0** |
| `cmd_*` 里 `print(` | ≥73 处 | **0**（返回结果，外壳打印） |
| L1 类里 `progress_lock\|ledger_lock` | — | **0** |
| 非 L2 函数里 `get("owner")\|get("status")` | 5 处 | **0** |
| `git_sync\|git_presync` 出现在 L2 | 0 | **0**（别污染） |
| `with ledger_lock(` 出现在 `atom` 之外 | 9 处 | **0** |

#### 7. 已否定，别再提

| 方案 | 为什么否 |
|---|---|
| 四层（L0 原语 / L1 单文件 / L2 复合 / L3 命令） | 用户拍板只要两层；原子读写本来就属于 L1 的内部实现 |
| `Unit of Work` 类 / `Txn` 对象 / 脏集类 | 就是 `atom` + 内存 dict，建类只会变成空壳套娃 |
| journal + `recover()` | 6 个动作的中间态都能靠写序 + 幂等收敛；再加一套就是四套回滚打架 |
| `worklog` 当表 | 正文人写，只能当 opaque 文档（锚点编辑三处） |
| `history` 整表序列化 | 会重排所有行、重算转义 → 手写格式与 git 行级 diff 全坏；只能「行追加 + 受控整文件变换」 |
| `history` 查询强制时间范围（2~3 月） | 文件按**结案月**分、过滤按**创建时间**，强制窄窗漏「早建晚结」；插件趋势要 13 个月 |
| O_EXCL 单锁文件替代 flock | `kill -9` 留死锁且无存活判据；继续用 flock |
| `files()` / 业务返回文件集给 git | presync 在业务之前、算不出；精确集 L1 已经记了 |
| 每表 CRUD 四件套 | 工业界 Repository 是非对称的，没有的动作不写 |

#### 8. 社区依据（2026-10-22 核实）

| 我们的做法 | 对应先例 |
|---|---|
| L1 = 只管存取 | Fowler **Repository**（2003）：「用集合式接口中介领域层与数据映射层」，该页全文不提事务 |
| L2 + 事务 | Fowler **Unit of Work**：「维护受业务事务影响的对象清单，事务结束时统一写出」，明确反对每改一次就写一次 |
| 事务边界在业务层 | 通行共识：事务必须放在「操作多个表的最小业务动作」那一层（Spring 的 `@Service` + `@Transactional`） |
| git 在命令头尾 | **jujutsu**：命令**开头** snapshot 工作区、**结尾**再更新一次，业务中间零 git |
| git 在系统操作边界 | **etckeeper**：挂在 apt 钩子里统一提交 |
| git 进业务层的反例 | **pass**：每个 `cmd_*` 自己 `git add`+`commit` —— 成立的前提是它**全脚本没有 pull/rebase/fetch/merge/push**，我们不具备 |
| 单文件原子写 | `write tmp → fsync(file) → rename → fsync(父目录)`；**我们现在缺最后一步** |
| 多文件事务 | **Mercurial**：journal 记录每个被碰文件事务前长度，中止时截断回滚（本仓不采用，见 §7） |
| 临时状态放哪 | **git-annex** 放 `.git/annex/journal` → 永不进工作树 |

#### 9. 顺手要修的两个现实缺陷

1. `write_text_atomic` 只 `fsync` 了文件、没 `fsync` 父目录 → 掉电可能丢 rename 的目录项。
2. `close` 不带 `--finished` 时，presync 用一次 `now()`、`close` 自己再用一次 → 跨月那一瞬会「刷 9 月、写 10 月」= 漏刷 = 覆盖远端。改法：`close` 的 presync 上界取「当月 + 上月」。

## 结论

- **方案已定稿**（2026-10-22）：两层 + 外壳，见「过程」末节；现状盘点与多轮评审结论也都在那一节。
- **设计文档已定稿**：`docs/design/` 四份（新增 `ledger-api.md`，同步 `architecture.md` / `code-conventions.md` / `ledger-data.md`）落到「照着就能写 `ledgerkit/`」的粒度；专家评审共 7 轮，最后两轮收敛到 0 条新增问题。
- **已在文档里锁死的三条口径**：① 事务 = 外壳 `with atom(...)` 包住业务调用，动作自己不拿锁；② 提交集合只认记账本，`already_done` 不跳提交、只有 `dry_run` 跳；③ `code-conventions.md` §5.7 记了不处理清单 —— 用户手改坏文件、多机并发冲突、改前读多个文件不报备。
- **尚未动代码**：`progress.py` 仍是 4657 行原样，零改动。本任务到此结案，实施 `ledgerkit/` 另开新任务。

## 执行记录

<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。
     补记用 progress.py log --id <任务号> --note "一句话"。 -->
- 2026-10-22 21:07:23 · new · @cqguojia@hotmail.com · 创建任务（doing）
- 2026-10-22 21:07:54 · log · @cqguojia@hotmail.com · 建档：背景/待办/下一步/过程写清现状与已拍板口径；下一步先出六命令写入序列盘点表
- 2026-10-22 21:45:08 · log · @cqguojia@hotmail.com · 方案定稿：两层（L1 文件 / L2 业务）+ git 归外壳，否掉 journal 与四层；写入过程末节
- 2026-10-23 00:38:22 · log · @cqguojia@hotmail.com · 文档定稿：ledger-api.md 新建，另三份同步，评审 7 轮收敛到 0 条；结论节写明结案、实施另开任务
- 2026-10-23 00:38:37 · close · @cqguojia@hotmail.com · 结案：设计文档定稿：docs/design/ 四份（新增 ledger-api.md）落到可直接照写 ledgerkit 的粒度，专家评审 7 轮收敛到 0 条新增问题；锁死外壳拿锁、提交集合只认记账本、§5.7 不处理清单三条口径。代码零改动，实施工作另开新任务。
