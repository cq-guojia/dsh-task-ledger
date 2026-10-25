# 接口契约：脚本两层（数据层 / 业务层）+ 驱动外壳

> **状态**：🔵 落码（脚本「两层 + 外壳」重构已于 2026-10-23 落地，本文档的目录树与方法表即现状；`progress.py` 现为 ≤40 行入口 shim，实际逻辑全在 `ledgerkit/`）
> **来源**：用户 2026-10-22「完全重构，不是最小改动」「上面要树形结构，下面再定义每个方法的参数」
> **配套**：数据形状见 [`ledger-data.md`](ledger-data.md)；分层纪律见 [`code-conventions.md`](code-conventions.md)；系统不变量见 [`architecture.md`](architecture.md)
>
> **2026-10-22 评审补全（两轮）**：
> 第一轮——补齐 6 个原本没有落点的角色（`core/identity.py` 的 `Identity`、`actions/query.py` 的查询对象、`shell/cli.py` 的 `resolve_repo`、`store/atomic.py` 的 `snapshot`/`restore`、顶层 `notices.py` 的提示通道、`WorklogStore.template()` 的模板读取）；消解 4 处规则互斥（`set_task` 的跨动作 import 白名单、`close_task` 锁集含过程文档、`render_worklog` 不再吃整条 task、防塌线的 owner/status 判定口径）；补齐只读动作的返回契约与 `--json` 形状。
> 第二轮——补 `HistoryStore.write`（结案落盘口）、`Result.dry_run`、`ActionSpec`（外壳怎么调动作）、`COUNT_CAP`、`aliases` 的持久化位置（该字段已移除，身份只认 uuid）、路径基准约定（磁盘相对 `ledger/`、输出相对 repo）、`scan_worklogs` 与报表的归属；统一 `release` 的重跑收敛、`rename_label` 的 `old/new` 落法、全部动作签名收 `me`。
> 第三～八轮——修正**流程顺序**（记账本 → 取最新 → 自举 → 动作 → 打印 → 提交 → 推送；取最新必须早于自举，否则旧索引盖掉远端新登记）、补 `atomic.ensure_dir` / `WorklogStore.by_name` / `GitRepo.guard_before_write` / `OwnersIndex.__init__` 等缺签名的方法、把「锁」拆成「最小写集 + `lock_scope` 实际加锁」并补齐四条锁集总则、`dry_run` 定为整条命令零写（含跳过自举）、`snapshot`/`restore` 的豁免名单、`history --json` 与 `list --json` 的形状统一、历史末列与执行记录时间的转换落点写死。
> **契约以 §二~§五 为准**；§七 搬迁地图只作施工参考。

## 〇、先把词说清楚

| 文档里的说法 | 人话 |
|---|---|
| **数据层**（`store/`，旧称 L1） | 只跟文件打交道的代码。每一种文件一个对象，负责把它读出来、改好、写回去。**它不知道业务规矩**——不懂「这个任务该不该由你改」，也不懂「结案要同时写三个文件」。 |
| **业务层**（`actions/`，旧称 L2） | 一个动作一个函数：建任务、认领、改状态、释放、交接、记进展、结案、归并标签。**它决定顺序**——先写哪个文件、后写哪个、崩在中间怎么补。 |
| **外壳**（`shell/`） | 跑一条命令时的外围杂事：读命令行参数、跑之前取最新、跑完提交推送、把结果打印出来、决定退出码。**它不懂业务**，也不知道台账里有什么字段的含义。 |
| **工具层**（`core/`） | 纯换算：时间格式、路径拼接、任务号生成、标签校验、markdown 文本的增删行。**不读文件、不写文件、不联网、不打印。** |
| **`env.py`** | 唯一被允许确认「我现在是谁」的地方（读机器级身份文件 `~/.taskledger/identity.json` 的 `uuid`）。 |
| **`errors.py`** | 只放「出错就抛出这个」，以及退出码的数字。 |

为什么非要分这四块：改「文件存成什么样」和改「业务先后顺序」是两件不相干的事。重构前这些逻辑混在同一个大文件里，改任何一处都得通读全局；拆分之后，前者只看 `store/`，后者只看 `actions/`。

**只有两层业务，加一个外壳**：

```
入口 progress.py（一条命令进来的地方）
   ↓
外壳 shell/        ← 取最新 → 自举 → 调动作 → 打印 → 提交推送 → 退出码
   ↓
业务层 actions/    ← 一个动作一个函数：定顺序、定重跑规则、开事务
   ↓
数据层 store/      ← 一种文件一个对象：读它、改它、原子写回
   ↓
工具层 core/       ← 只做文本和时间的换算，一个文件都不碰
   ↓
errors.py
```

外壳**不是第三层业务**，它是进程边界。三条硬理由：

1. **git 会反噬业务数据**：推送被拒时会自动 rebase，冲突合并**直接改磁盘上的文件**；这时业务层手里还握着改之前读出来的那份数据，下一次整份写回就会把别人刚合进来的任务抹掉。
2. **业务函数要能被界面单独调**：看板要按一下「释放」，不能顺带跑参数解析、退出码、git 提交。动作一旦带 `print`/`exit`/`commit`，就永远只能被命令行用。
3. **两边各管各的状态**：外壳只知道「这次改了哪些文件」和「返回了什么结果」；业务层不碰进程状态。越界一次，顺序和回滚就会重新散回每个命令里。

**依赖只能从上往下，不许反向**：

| 规则 | 怎么查 |
|---|---|
| 外壳可以调业务层、数据层、工具层、`env`、`notices` | — |
| 业务层只能调数据层、工具层、`env`、`notices`、`errors` | `grep -rn "shell" actions/` 必须为 **0** |
| 数据层只能调工具层、`env`、`notices`、`errors` | `grep -rn "actions\|shell" store/` 必须为 **0** |
| 工具层只许 `errors` / `notices` / **同包兄弟模块**（`from .paths import …`，`history_md` 就要调 `paths.to_history_rel`）+ 标准库 | `grep -rn "from ledgerkit" core/` 只能命中 `errors` / `notices` 这两个，其余一律相对 import `from .x` |
| 两个动作文件之间不许互相 import。**唯一例外**：`set_task.py` 可以 import `release.py` / `handoff.py` / `claim.py`（它只做路由，不碰文件） | `grep -rn "from \. import \(release\|handoff\|claim\)" actions/ \| grep -v set_task.py` 必须为 **0** |
| `notices.py` 任何层都可以 import，但它**只收、不打** | `grep -rn "notices\.\(warnings\|clear\)(" store/ actions/ core/` 必须为 **0**（取清单与清空只有 `render.py` / `runner.py` 能做）；`print(` 在这三个目录里同样是 0 |

## 一、目录树（完全重构后）

```
packages/skill/scripts/
│
├── progress.py                ← 程序入口，就 4 件事：关掉字节码、把自己塞进 sys.path、调 main、
│                                 把返回码交给系统。只用绝对导入（`from ledgerkit…`）。
│                                 硬限制 ≤ 40 行。宿主、SKILL.md 都按这个路径调，不许改名挪位。
│
└── ledgerkit/                 ← 除入口外的全部代码
    │
    ├── __init__.py            ← 空的。故意什么都不放：一旦这里 re-export，人人 import 它，
    │                             它就变成一个隐形的"全局层"，依赖方向立刻失效。
    │                             四个子包（core / store / actions / shell）也各有一个空的
    │                             `__init__.py`，同一条纪律：只做包标记，不放代码、不做 re-export。
    │
    ├── errors.py              ← 只放两样东西：`Fail`（业务出错就抛它，外壳接住转成"错误：…"）
    │                             和退出码数字（0 成功 / 1 业务错 / 2 用法错 / 3 未预期 / 130 中断）。
    │
    ├── notices.py             ← 进程级提示收集器：`note(text)` 收一条、"同一句只说一次"去重、
    │                             `warnings()` 取清单、`clear()` 清空。**只收文本，永不打印**。
    │                             各层都能往里放（数据层读盘时的版本告警、env 的兜底身份、
    │                             业务层的兜底提示），最后由 `shell/render.py` 一次性打到 stderr。
    │
    ├── env.py                 ← 唯一允许确认"我是谁"（读 `$TASK_LEDGER_HOME/.taskledger/identity.json`
    │                             的 `uuid` / `name`；默认 `~/.taskledger/identity.json`），
    │                             组装成 `core/identity.py` 的 `Identity` 返回。**不读 git、不读环境变量**；
    │                             没有身份文件直接 Fail 并提示去跑 `init`（没有兜底身份）。
    │
    ├── core/                  ← 工具层：纯换算，零文件读写
    │   │                         进门规则：只许 import errors / notices / 同目录兄弟和标准库；不许 open/写文件/跑子进程/打印；
    │   │                         不许接收"一整条任务"当参数（吃了整条就会开始判 owner/status）。
    │   │
    │   ├── time.py            ← 本地时间和 UTC 互转、补零、格式化给人看。
    │   │                         所有存盘时间都是 UTC，所有人话显示都过这里转本地。
    │   ├── paths.py           ← 路径怎么拼：某人的分片文件叫什么名、某月的历史放哪、
    │   │                         某月的 worklog 放哪、任务号怎么变成文件名。
    │   ├── ids.py             ← 任务号：从标题生成「日期-时分-标题-四位随机」、查重、形态校验。
    │   ├── identity.py        ← 身份这个值对象本身：`uuid` + `name`、归一化（小写去空白）、
    │   │                         uuid 形态校验、"这条算不算我的"。**只做字符串换算，不读文件**。
    │   ├── labels.py          ← 分类和标签：长度/数量上限的校验、头部那行"分类/标签"的拼和拆。
    │   ├── worklog_md.py      ← 过程文档的文本操作：套六节模板、往执行记录节追加一行、
    │   │                         盖章（封卷）、改头部标签行。全部是"给一段文字，返回新文字"。
    │   └── history_md.py      ← 历史表格的文本操作：九列一行怎么拼、表格怎么解析。
    │                             它自己不开文件（读 worklog 的事留在 store / 业务层）。
    │
    ├── store/                 ← 数据层：唯一写文件的地方，一种文件一个对象
    │   │                         进门规则：不许打印、不许跑 git、不许自己加锁、
    │   │                         不许判断 owner/status、不许决定"这次要写哪几个文件"。
    │   │
    │   ├── atomic.py          ← 怎么安全地写一个文件：先写临时文件、刷盘、再改名替换。
    │   │                         顺带管：拒绝覆盖符号链接、保留原文件权限、
    │   │                         写完通知 dirty 记一笔、以及"算文件指纹"（内容 sha256）。
    │   │                         还管"写之前留一份字节、失败时原样还回去"（`snapshot` / `restore`）——
    │   │                         结案要同时动三个文件，这是它唯一的兜底手段，不引入 journal。
    │   │                         以及建目录（`ensure_dir`）——全仓唯一建目录的地方，
    │   │                         写文件本身不替人建父目录。
    │   ├── dirty.py           ← 记账本：这一轮改了哪些文件、新建了哪些文件、
    │   │                         取最新时刷过哪些文件（这些反而必须一起提交）、失败时按备份恢复。
    │   │                         只返回清单和数量，不打印（打印归外壳，否则反向依赖）。
    │   ├── locks.py           ← 文件锁：单文件互斥（`progress_lock`）和"多个文件按固定顺序一起锁"
    │   │                         （`ledger_lock`）。数据层禁止调用它，只有业务层的 atom 用。
    │   ├── json_store.py      ← 所有 JSON 台账的共用底座：读、按条取、按条写、按条删、指纹，
    │   │                         以及"任务一个一行"的写盘格式（多人 git 合并靠它，不是排版偏好）。
    │   ├── task_store.py      ← 任务表：公共池 `pool.json` 和某个人的分片用的是同一个类，
    │   │                         只是路径不同（谁的文件由调用方告诉它）。
    │   ├── owners_index.py    ← 索引 `owners.json`：谁是登记过的人、各自的分片文件是哪个、
    │   │                         新人的登记与改名。分片只认索引，不扫目录。
    │   ├── history_store.py   ← 历史 `history/<年月>.md`：列出全部历史文件、读一篇、
    │   │                         算"追加一行后的新全文"、按调用方指定的时机写回（结案要控顺序，
    │   │                         所以"算"和"落"是两个方法）、
    │   │                         以及"这一个月的历史里有没有这条记录"（结案重跑靠它认）。
    │   └── worklog_store.py   ← 过程文档 `worklog/**`：找到某任务的文档、读、列全部、
    │                             建新篇、写回、追加执行记录（写不进只返回 false，不抛）、
    │                             取六节模板（读 skill 的 `assets/worklog.md`，读不到用内置骨架
    │                             并 `notices.note("提示：…")`——模板不许在代码里再抄一份）。
    │
    ├── actions/               ← 业务层：一个动作一个文件
    │   │                         进门规则：不许直接碰文件（读写都走 store）、不许打印、
    │   │                         不许跑 git、不许自己拼锁（只能调 atom）、不许决定退出码。
    │   │
    │   ├── __init__.py        ← 空的。跟 `ledgerkit/__init__.py` 一个道理：名册不放这里，
    │   │                         否则 `import actions.guard` 会被迫先把全部动作加载一遍。
    │   ├── registry.py        ← 动作名册：命令写法 → `ActionSpec(业务函数, 渲染函数名, 是否只读)` 三元组。
    │   │                         **渲染函数只存名字（字符串），不 import `shell/render.py`** —— 否则
    │   │                         actions → shell 的依赖就反了；由 runner 用 `getattr(render, name)` 取。
    │   │                         外壳靠它：只读决定跳过取最新/提交，渲染函数名决定第 ⑤ 步打哪个。
    │   │                         只有 `shell/cli.py` 与 `shell/runner.py` 会 import 它，动作模块之间谁也不碰。
    │   ├── query.py           ← 查询条件长什么样：`ListQuery` / `HistoryQuery`。
    │   │                         外壳把命令行参数装成它，界面直接构造它——动作层不认识 argparse。
    │   ├── result.py          ← 动作的返回值长什么样：写了哪些字段、落在哪个文件、
    │   │                         是不是"重跑发现已经做过"、提交用什么消息、要额外显示什么；
    │   │                         以及只读动作那几种结果（列表 / 单条 / 历史 / 体检 / 统计）。
    │   ├── atom.py            ← 事务的唯一入口，20 行：把这次要碰的文件按固定顺序一次锁住。
    │   │                         只加锁，不管写盘、不碰 git、不打印。
    │   ├── guard.py           ← 业务校验的共用件：任务号形态、任务存不存在、
    │   │                         "这条任务是不是你的"、"两份内容是不是只差时间戳"。
    │   ├── bootstrap.py       ← 开工前的自举：台账文件不存在就建，没登记过就把自己登记进去、
    │   │                         建自己的分片。这三份由外壳单独一个 atom 包住（它自己不开事务），
    │   │                         必须在别的动作之前单独跑。
    │   ├── new_task.py        ← 建任务：拿外壳算好的任务号写过程文档、写进池（或直接写进自己分片）。
    │   │                         中途失败要把已写的撤掉。
    │   ├── claim.py           ← 认领：先写进我的分片，再删池里那行。顺序反了任务会凭空消失。
    │   ├── set_task.py        ← 改状态的入口：只看参数、决定走哪个动作，自己不加锁、不改文件；
    │   │                         唯一允许 import `release.py` / `handoff.py` / `claim.py` 的动作（它只做路由）。
    │   ├── release.py         ← 释放：写回公共池，再删我分片那行，再记一笔。
    │   ├── handoff.py         ← 交接：先写进对方分片，再删我分片那行，再记一笔。
    │   ├── log_progress.py    ← 记进展：刷分片的"最后更新"，再往过程文档追加一行。
    │   ├── close_task.py      ← 结案：写历史 → 封卷过程文档 → 最后删分片。
    │   │                         写之前先核对三个文件有没有被别人动过；失败按字节恢复。
    │   │
    │   ├── list_tasks.py      ← 只读：查在办任务（池 + 分片，后读到的为准）
    │   ├── show_task.py       ← 只读：单任务详情 + 过程文档全文
    │   ├── query_history.py   ← 只读：查已结案（按月文件逐个读、过滤、合并、倒序）
    │   ├── validate.py        ← 只读：体检（索引与文件对不对得上、池里有没有越权、字段是否合法），
    │   │                         外加三类"只提示、不判错"的信号：骨架文档 / 历史行格式坏 / 历史已结案仍在办
    │   └── validate.py 的骨架判定与 `query_history` 的回链共用 `worklog_md.head_meta`
    │
    └── shell/                 ← 外壳：唯一跑 git、唯一打印、唯一决定退出码
        │
        ├── cli.py             ← 命令行参数定义。动作名和"哪些是只读"从 actions 的名册里取，
        │                         不在这里重复写一遍；把参数装成 `ListQuery` / `HistoryQuery`；
        │                         再负责"这次到底是哪个工作区"（`resolve_repo`）。
        ├── runner.py          ← 一次命令的全流程（见 §四）：
        │                         绑记账本 → 取最新 → 自举 → 调动作 → 打印 → 提交 → 推送；
        │                         定位与整命令锁在 cli.main 里先做完。失败统一回滚并给退出码。
        │                         顺序不能换：取最新必须早于自举（否则旧索引盖掉远端新登记）。
        │                         记账本只在这里创建一次。
        ├── presync.py         ← 跑之前取最新：算出"这条命令可能碰哪些文件"（宁可算宽），
        │                         逐个把远端版本刷下来；刷下来的内容不算本次改动。
        ├── gitops.py          ← git 操作本身：取最新、提交指定文件、推送；
        │                         推送被拒时 rebase 重试；以及整条命令的进程级互斥锁（60 秒超时）。
        ├── merge.py           ← 两台机器改了同一份台账时的三方合并与冲突裁决。
        │                         冲突会直接写盘，所以只能在外壳里做。
        └── render.py          ← 唯一打印的地方：人话排版（表格、颜色、缩进）和 --json 输出。
```

**为什么按「文件种类」分目录、不按「功能」分**：这个项目几乎所有的改动都落在横切面上——写盘格式、原子写规则、锁、git 时机。按功能分（`task/`、`history/`、`worklog/` 各带自己的读写与业务），这些规则会被复制四份，正是现在"崩在中间各留半截"的成因。

**只读动作为什么不单独一层**：它们要用 `guard`、`store`、`Result`，单独开一个目录就会和 `actions/` 互相 import。所以放在 `actions/` 里，用"只读名单"显式标出来。

### 1.1 每个目录的准入规则（能机械检查）

两个顶层文件（`errors.py` / `notices.py`）**任何层都可以 import**，反过来它们只能 import 标准库。

| 目录 | 允许 | 禁止 |
|---|---|---|
| `core/` | 标准库、`errors`、`notices`、同目录 | 读/写文件、跑子进程、加锁、打印；接收整条 task dict 当主参；单文件超 300 行 |
| `store/` | `core`、`env`、`notices`、`errors`、同目录 | 打印、跑 git、**调用**锁（`locks.py` 只负责定义，调用权归 `atom.py`）、判断 `owner`/`status`、接收"要写哪些文件"的指示；单方法超 25 行 |
| `actions/` | `store`、`core`、`env`、`notices`、`errors`、同目录；**唯一跨动作引用**：`set_task.py → release.py` / `handoff.py` / `claim.py` | `open`/`read_bytes`/`read_text`/`write_text_atomic`/`print`/`subprocess`/`git_`/`json.dumps`/自己拼锁（例外只有两处：`atom.py` 里的 `ledger_lock`；`atomic.snapshot`/`restore` 只许在 `close_task.py` / `new_task.py` 里出现） |
| `shell/` | 全部 | 做业务判断；在 `render.py` 之外打印；在 `runner.py` 与 `render.py` 之外读 `notices` |

**为什么备份/恢复算 store 的活**：结案失败要「按字节还回去」，而 actions 不许碰文件。`atomic.snapshot/restore` 是唯一的还手之地 —— 别在 `close_task.py` 里自己 `read_bytes`。

### 1.2 拆包前必须先做的四件事（否则会静默出错）

| 项 | 要做什么 | 不做的后果 |
|---|---|---|
| 字节码 | `progress.py` 第一行（**在任何 import 之前**）设 `sys.dont_write_bytecode = True`；`.gitignore` 加 `__pycache__/`、`*.pyc`；`copy-skill.mjs` 的 filter 加 `__pycache__`（**保留原有对 `tests/` 的排除**） | 一旦有了 `import`，`.pyc` 会被 `cp -r` 拷进 `packages/plugin/skill/` 并入库；而 `check-skill-copy` 恰好忽略它 ⇒ **校验通过、脏文件已经进去了**。另：这条只能挡住 `ledgerkit/**`，挡不住 `progress.py` 自己 |
| 入口能自己找到包 | 入口里加 `sys.path.insert(0, os.path.dirname(os.path.realpath(__file__)))`，并且**只用绝对导入** `from ledgerkit.shell.cli import main` | 默认行为下 `sys.path[0]` 就是脚本目录，能跑；但 `-P` / `PYTHONSAFEPATH=1`（3.11+）/ `-I` 会取消这个默认 ⇒ `ModuleNotFoundError`。相对导入在脚本模式下必炸 |
| 测试与文档 | 测试只从**公开位置** import（`from ledgerkit.shell.merge import merge_task_dicts`），不摸私有名；本文档就是唯一的目录树，`code-conventions` 只留链接 | 改了名测试全红；两份目录树打架 |

## 二、数据层 `store/`：方法定义

### 2.1 原子写（`atomic.py`）

```python
def write_text_atomic(path: Path, text: str, *, track: bool = True) -> None
```

- **做什么**：把一段文字安全地写进一个文件。同目录建临时文件 → 写入 → 刷盘 → 改权限 → 改名替换 → 刷父目录。
- **参数**：`path` 目标文件；`text` 完整的新内容；`track=True` 表示"这是我改的"，记进记账本的"本次改动"；`track=False` 只给 **`restore`** 与**外壳那两条受控通道**（见下条）用 —— 它们要么是在复原世界，要么由 git 自己提交。
- **额外行为**：目标是符号链接就拒绝写；沿用原文件权限，新文件 0644；任何 IO 错误都包成 `Fail`；文件原本不存在时额外记"新建"。
- **谁调它**：正常调用者是各个 store（含 `restore`）。**外壳只有两条受控通道**，都用 `track=False`、都不进记账本：① `GitRepo.sync_down`（刷下来的内容由 runner 走 `record_presync` 补记，连"刷之前"的字节一起）；② `shell/merge.resolve_ledger_conflict`（rebase 冲突的合并结果，写完由紧跟的 `git rebase --continue` 自己提交）。除这两处，外壳与业务层都不许调。
- **「取最新」不走 `track=False`**：远端刷下来的内容虽然不算"业务改动"，但**必须一起提交**，所以走 `WriteLog.record_presync(path, before)`。两件事分别有各自的入口，别混。

```python
def ensure_dir(path: Path) -> None
def fingerprint(path: Path) -> str | None
def snapshot(path: Path) -> bytes | None
def restore(path: Path, before: bytes | None) -> None
```

- **`ensure_dir` 是唯一建目录的地方**：`mkdir -p` 语义、已存在就什么都不做。`write_text_atomic` **不自动建父目录**（写文件就是写文件，建目录单独一步，出问题好查）。
- **`fingerprint` 做什么**：算文件内容的 sha256，用来判断"我读完之后，别人有没有动过这个文件"。
- **`fingerprint` 返回三种，互不相等**：正常 → sha256 串；文件不存在 → `None`；文件在但读不了 → `"unreadable"`。**三者比较时永远不相等**（结案「指纹变了就中止」靠这条）。
- **注意**：不是比 `mtime + 大小`——同一秒内连写两次会漏判。
- **`snapshot` / `restore` 做什么**：写之前把原文读成字节留下，失败时原样还回去。`restore(path, None)` 表示"这个文件原本不存在"，此时删掉它；恢复本身**不进记账本**（`track=False`），因为它只是把世界复原。
- **为什么放在 `atomic.py`**：结案要同时改三个文件，这是唯一的兜底手段。不引入 journal、不引入 recover、不引入事务类。

### 2.2 记账本（`dirty.py`）

```python
class WriteLog:
    def record(self, path, *, track=True, created=False)      # 记一次写
    def record_presync(self, path, before: bytes | None)      # 记"取最新时刷过这个文件"（附改前备份）
    def commit_set(self) -> list[Path]                        # 最后要提交的文件：本次改动 + 取最新刷过的
    def has_writes(self) -> bool
    def rollback_presync(self) -> list[Path]                  # 按备份把被覆盖的内容恢复回去
    def discard_created(self) -> list[Path]                   # 删掉本次新建的文件
    def clear(self)

def current() -> WriteLog                    # 当前这一轮的记账本（没绑定时给一个空账本）
def bound(log: WriteLog) -> ContextManager   # 测试用；生产只在 runner 里绑一次
```

- **为什么不用四个全局列表**：现在这四个是模块级变量，导致测试互相污染、失败分支要知道四个名字、谁记的账查不出来。
- **只返回清单，不打印**：打印归外壳，否则 `dirty` 要 import `shell`，依赖反向。

### 2.3 锁（`locks.py`）

```python
def progress_lock(path: Path) -> ContextManager
```

- **做什么**：给一个台账文件加互斥锁（`flock`），阻塞等待、**没有超时**、**不可重入**（同一进程同一路径第二次加锁会自己卡死）。
- **锁的不是文件本身**：按该文件绝对路径的 hash 在系统临时目录开 `koc-progress-<16 位 hash>.lock` 再 `flock`。这样**目标文件还不存在也能锁**（锁集里本来就允许有"还不存在"的路径），仓库里也不会多出锁文件。
- **降级**：系统没有 `fcntl`/`msvcrt` 时**直接不加锁**（只读、单人场景的取舍）。

```python
def ledger_lock(repo: Path, *rels: Path) -> ContextManager
```

- **做什么**：把多个文件路径去重、按字母排序，然后依次加锁（每个文件都走上一条的临时目录锁文件）——保证两个人同时改两个文件时不会互相等死。
- **谁调它**：只有 `actions/atom.py`。

> 另一把锁在 `shell/gitops.py`：`repo_sync_lock`，锁的是"整条命令"，有 60 秒超时，拿不到就明确报错。它和文件锁是两回事。

### 2.4 JSON 台账底座（`json_store.py`）

```python
class JSONStore:
    def __init__(self, path: Path, *, default: dict, expand: str = "tasks")
    def get(self, key: str) -> dict | None
    def all(self) -> dict[str, dict]
    def put(self, key: str, value: dict) -> None     # 改一条，其余原样保留
    def drop(self, key: str) -> None                 # 删一条
    def fingerprint(self) -> str | None
    def data(self) -> dict                           # 整份只读视图（升级/体检用）
    def ensure_file(self) -> bool                    # 文件不存在就按构造时的 default 写一份、存在就不动
                                                     # （自举的唯一建文件口；返回"这次建了没有"）

def write_ledger_json(path: Path, data: dict, *, expand: str = "tasks") -> None
```

- **`expand`**：指定哪个字典要"一条一行"（`tasks` 或 `workers`），其余字段各占一行。这是**格式契约**：多人同时改同一份台账时，git 才能按行合并。
- 首次读盘后缓存在实例里；`put`/`drop` 写盘并更新缓存。
- **`ensure_file` 是唯一建台账文件的地方**（建目录归 `atomic.ensure_dir`，建文件归它，各管一件事）：不存在就写一份 `default`，存在就一个字节都不写；业务层不必也不许为了"建个空文件"去碰 `write_ledger_json`。

### 2.5 四张表

```python
class TaskStore(JSONStore):
    def __init__(self, repo: Path, rel: Path, *, identity: Identity | None = None)
```

- **管什么**：公共池 `ledger/pool.json` 与某个人的分片 `ledger/owners/<hash>.json`——**同一个类，只是路径不同**（调用方传 `rel`）。
- **`identity` 用来干什么**：只用于**写盘格式**——分片文件顶部有一个可选 `identity` 字段，补它 / 名字变了更新它。它**不参与任何判断**（不判归属、不改 `updated`、不判状态）。
- **不管什么**：不改 `updated`、不判状态、不判归属（`owner` 判定归 `guard`）。

```python
class OwnersIndex:
    def __init__(self, repo: Path)
    def get(self, who: str) -> dict | None
    def all(self) -> dict[str, dict]
    def ensure(self, me: Identity) -> tuple[bool, dict]   # 首次登记（写 file/name/joined）；已登记零写；返回(是否写了, 记录)
    def shards(self) -> dict[str, Path]                   # 身份 → 分片绝对路径（只信索引，不扫目录）
    def disk_shards(self) -> list[Path]                   # 扫 owners/ 下全部 *.json；只有 validate 用它比对索引
```

- **`ensure` 只登记一次**：`workers[<uuid>] = {file, name, joined}`；已登记身份零写，`name` 之后不再回写（改名不影响归属，`name` 只是显示）。
- **`disk_shards()` 是全仓唯一扫目录的地方**：平时「分片只认索引」，只有 `validate` 拿它找「目录里有、索引没登记」的分片，别把它当发现机制用。

```python
class HistoryStore:
    def __init__(self, repo: Path)
    def sources(self) -> list[Path]                       # 按月的 history/*.md + 存量平铺的 legacy 文件（只读）
    def read(self, path: Path) -> str
    def append_row(self, path: Path, row: dict) -> dict   # 只算新全文，不落盘
    def has_log(self, path: Path, *, log_name: str | None,
                created: str | None, title: str | None) -> str
                                                          # "hit" / "miss" / "undecidable"（见下条判重规则）
    def write(self, path: Path, text: str) -> None        # 受控写回：唯一调用点是结案第 2 步
```

- **`row` 的九个键**（与 `ledger-data.md` §四 的九列一一对应，顺序也一致）：
  `{"finished", "created", "title", "category", "tags", "owner", "creator", "summary", "worklog"}`
  ——`tags` 是 `tuple[str, …]`（拼成「、」分隔的一格），`worklog` 是**相对 `ledger/`** 的路径。
  ——`owner` / `creator` 传**裸标识**（`task["owner"]` 那个值）：`history_line` 自己加 `@`、`parse_history` 自己剥，外面别先加，否则落盘成 `@@`（`ledger-data.md` §四）。
- **`append_row` 返回两个键**：
  - `text` = 追加后的新全文（调用方决定什么时候落盘）；
  - `duplicate` = 这一行已经存在，**判重规则与 `has_log` 完全一致**（共用一份实现：有末列比文件名，末列空比「创建时间 + 工作包」两列）。
- **历史表只有九列这一种格式**（开发期没发布，不做旧列数迁移）：列数不对的行由 `parse_history` 跳过并警告，`append_row` 永远按九列追加。
- **`append_row` 算、`write` 落**：结案的顺序是「历史 → 封卷 → 删分片」，写盘时机必须由业务层控，所以拆成两个方法。`write` 是历史表唯一的写回口，除"结案追加"之外不许调。
- **当月第一次结案（文件还不存在）由 `append_row` 起表**：文件不存在（或 `read` 回空串）⇒ 它自己按 `ledger-data.md` §四 的九列表头 + 分隔行开头，再接这一行。表头的真源只有 `history_md` 一处，别在业务层拼。
- `has_log` **只看传进来的那一个月文件**，不扫全年（跨月重跑会在两个月各记一行，这是已知且接受的例外）。
- **末列那格路径的基准换算只调 `core/paths.py::to_history_rel`**：`history_line` 接到的 `worklog` 是 `task["worklog"]` 原值（相对 `ledger/`），由它调 `to_history_rel` 换成相对 `ledger/history/` 的 `../worklog/…` 形式（深度固定，但拼 `..` 只许在这一处）。`has_log` 只比**文件名**（末列的 basename），不比整条路径——这样两边谁也不用猜对方的基准。**末列为空的行**（这条任务本来就没过程文档）没有文件名可比，改按「创建时间 + 工作包」两列判重，否则结案重跑会把同一行追加两次。
- **`has_log` 三态返回**：`"hit"` 已有这一行、`"miss"` 确实没有、`"undecidable"` 表里有末列为空的行而调用方没给 `created` / `title`（分片已删时就是这样）—— 看不清就明说，别拿 `False` 冒充"没有"。

```python
class WorklogStore:
    def __init__(self, repo: Path)
    def template(self) -> str                    # 六节模板；读不到 assets/worklog.md → 内置骨架 + 提示
    def find(self, tid, worklog_rel: str | None) -> Path | None   # worklog_rel 是 task["worklog"] 的原值（相对 ledger/）；先按它找，找不到再扫目录
    def by_name(self, log_name: str) -> Path | None               # 按文件名找（历史末列回链用）
    def read(self, path) -> str
    def head_meta(self, path) -> dict            # {"created","creator","category","tags"}；读不出给空值
    def all(self) -> list[Path]                  # 递归列出全部过程文档
    def create(self, *, tid, title, created, creator, category, tags,
               first_exec: str | None = None) -> Path   # 一次写完整篇（含首条记录）
    def write(self, path, text) -> None          # 写回的是「锚点编辑后的新全文」；不许用它替换前五节正文
    def append_exec(self, path, line) -> bool    # 写不进返回 False，不抛
```

- **`template()` 是模板的唯一读者**：模板真源是 skill 的 `assets/worklog.md`（`core/paths.py` 给路径）。工具层不许读文件，所以「套模板」这个动作拆成两半：store 取文本，`core/worklog_md.render_worklog(...)` 只做字符串替换。
- **`head_meta(path)`**：从一篇过程文档头部抽出 `created` / `creator` / 分类 / 标签四样，供历史回链与标签统计共用（这两个用途原本分散在两处，收成一个方法）。
- **骨架检测不走 `head_meta`**：那是判定"正文有没有填"的文本问题，`validate` 用 `read()` 拿到全文后调 `core/worklog_md.is_skeleton(text)`。

## 三、业务层 `actions/`：方法定义

### 3.1 四个共用件

**返回值只有两种形状**：写动作返回 `Result`，只读动作返回各自的视图对象（§3.3）。每个返回类型自己带提示字段（写动作与列表用 `notices`、历史用 `warnings`、体检用 `problems`+`notices`），**不再套一层统一的壳**——少一层包装就少一处翻译。

```python
# result.py
@dataclass(frozen=True)
class WorklogView:                 # 「这条任务的过程文档要怎么显示」
    path: str | None               # 相对 repo
    text: str | None               # 全文；读不到时为 None
    error: str | None              # 读不到的原因（缺失 / 读不了），给人看

@dataclass(frozen=True)
class Result:                      # 写动作的返回
    changed: tuple[str, ...]       # 改了哪些**字段名**（不是文件名、不是任务号）；只用于显示
    where: str | None              # 主要落在哪个文件（**相对 repo**）
    already_done: bool             # 重跑发现已经做过 ⇒ 退出码仍是 0
    message: str | None            # git 提交说明；None ⇒ 外壳用默认模板
    worklog: WorklogView | None    # 要顺手把过程文档全文打出来的动作才填
    payload: dict                  # 各动作自己的附加数据（见各动作条目）
    notices: tuple[str, ...]
```

- **`already_done` 不改变提交/推送**：它只说"这次没有新的活"（`changed` 留空、退出码 0），但动作**照样可能补写了文件**（`release` 重跑就只补删我分片那行）。这些文件必须照常提交并推送，否则下一条写命令会被写前 guard 拦死。
- **要不要提交，唯一判据是记账本空不空**（`--no-sync` 才整段跳过提交与推送）。

- `changed` / `where` / `worklog` / `payload` / `notices` **只用于显示**；`message` 只用于 git 提交说明。
- **要提交哪些文件，只看记账本**（`commit_set()`），和 `changed` 无关。
- **提示两条路**：动作自己产生的走 `Result.notices` / 视图对象的 `notices`；数据层与 `env` 产生的走 `notices.note()`（进程级去重）。`render` 把两者合并后打 stderr，动作自己不打印。

```python
# query.py —— 查询条件。外壳把命令行装成它，界面直接构造它，动作层不认识 argparse
@dataclass(frozen=True)
class ListQuery:
    scope: str = "all"                    # "all" / "pool" / "mine" / "owner"
    owner: str | None = None              # scope="owner" 时生效
    statuses: tuple[str, ...] = ()
    category: str | None = None
    tag: str | None = None
    since: str | None = None              # UTC 串，闭区间
    until: str | None = None                # 同上
    # `since` / `until` **一律比 `created`**（含边界，只给其一也行），不比 `started` / `updated`；
    # `HistoryQuery` 同名两字段同口径（与 §3.3「history 按创建时间过滤」一致）

@dataclass(frozen=True)
class HistoryQuery:
    owner: str | None = None
    mine: bool = False
    category: str | None = None
    tag: str | None = None
    since: str | None = None
    until: str | None = None
    limit: int | None = None
    months: int | None = None             # 只看最近 N 个月的文件
    count_only: bool = False              # 只要计数，不要 records

COUNT_CAP = 10_000                        # --count-only 的封顶：超过就 capped=True，别把整表读进内存
```

```python
# atom.py —— 事务的唯一入口
@dataclass(frozen=True)
class Scope:
    files: tuple[Path, ...]      # 要加锁的文件（允许尚不存在）；sync_down 也逐个刷它们
    dirs: tuple[Path, ...]       # 只用来刷盘：展开成该目录下已存在的文件，**不加锁**
    def __or__(self, other: "Scope") -> "Scope"     # 合并（runner 把自举与动作两份并起来）

def lock_scope(repo, me, action: str, params: dict) -> Scope
def atom(repo: Path, *rels: Path) -> ContextManager      # 20 行：按序锁住这次要碰的文件
```

- **`Scope` 两个字段各管一头**：`files` 既给 `atom` 加锁、也给 `sync_down` 刷；`dirs` 只给 `sync_down`（目录本身不 flock，由它展开成目录里已存在的文件）。
- **`action` 的取值域就六个**：`"bootstrap"` / `"new"` / `"claim"` / `"set"` / `"log"` / `"close"`，与 §四 的刷取范围表逐行对应。传进来的不是命令行原文，而是 `ActionSpec.lock_action`（默认同命令名）。`set` 的三个分支（`release` / `handoff` / `claim`）共用 `"set"` 这一行，按"宁可算宽"取并集。
- **谁调它、什么时候调**：`runner` 在**第 ② 步「取最新」开头**调一次 `presync_scope`（见 §四），拿回**两份** `Scope`——自举那份与动作那份（`presync_scope` 内部各调一次 `lock_scope`，别处不许再调）：
  - 两份**合并**（`boot | act`）交给 `GitRepo.sync_down`；
  - 自举那份 `with atom(repo, *boot.files)` 包住第 ③ 步的自举；
  - 动作那份 `with atom(repo, *act.files)` 包住第 ④ 步的动作调用（不加自举那几份，自举已经单独做过）。
  动作内部不再自己算一遍、也不自己加锁。
- **`lock_scope` 在锁外跑**，它可以读索引、读任务，算出"这次可能碰哪些文件"（宁可算宽）。返回的是**快照**。
- **`params` 是已经装好的动作参数**（`{"tid": …, "finished": …}`），**不是 argparse 的 namespace** —— 外壳装好之后才交给它。
- **「只算一次」的东西由外壳先算好再往下传，不靠返回值回传**，两处都是这个套路，且**都先过 `core/time.to_utc`**：`--created` / `--finished` 在 `runner` 里转，`--since` / `--until` 在 `cli.to_query` 里转（用户写的都是本地墙钟字符串）。**转 UTC 是外壳的事**，`to_utc` 只出现在外壳这两处，业务层拿到的永远是 UTC 串；月份目录、历史文件月份、锁集全按归一化后的值算，漏了跨月必错：
  - `close` 的 `finished`：`runner` 算一次（`to_utc(args.finished, field="--finished")` 或 `now()`），同时交给 `lock_scope`（算历史文件路径）和 `close_task`；
  - `new` 的 `tid` 与 `created`：`runner` 先算（`args.id or ids.make_id(args.title, tasks 快照, created)`、`args.created or now()`），同时交给 `lock_scope`（算那篇过程文档的路径，否则锁集漏文件）和 `new_task`。锁外定的号在锁内**不重算**：重号就拒绝并让用户重跑，别偷偷换一个号。
  别让业务层自己再调一次时钟，也别让锁层去猜一个还没生成的号。
- **`atom` 只加锁**：按路径排序后依次加，不建记账本、不写盘、不提交、不打印。
- **三条硬约束**（写进 `atom.py` 注释）：
  1. 锁集**只许宽不许窄**；锁集以外的文件一个字节都不许写。
  2. **所有判定依据必须在锁内重读**——锁外读到的快照只能用来决定"锁多宽"，不能用来做"含不含有这条""该不该写"的判断。
  3. **任何失败补偿都不许再开一个 `atom`**（文件锁不可重入），只能在同一事务内做完。

```python
# guard.py
def current_identity(repo) -> Identity                       # env 的本机身份
def require_task(tasks: dict, tid, *, where: Path) -> dict   # 取一条，缺失时给可读原因
def require_owner(task, tid, me: Identity)                   # 只有当前 owner 能改
def same_task_ignoring_stamp(a, b) -> bool                   # 两份内容是否只差时间戳
def owner_of(task) -> str | None                             # 读 owner 的唯一入口
def status_of(task) -> str                                   # 读 status 的唯一入口
def is_mine(task, me: Identity) -> bool                      # 归一化后按邮箱比较
def in_scope(task, q: ListQuery, *, me: Identity) -> bool    # list 的过滤谓词
```

- **`owner` / `status` 的读取只走这四个谓词**：`store/` 里一律不许出现 `get("owner")` / `get("status")`，`actions/` 里除 `guard.py` 之外也不许裸写字段名比较。业务动作要判归属就调 `is_mine` / `require_owner` / `owner_of`。
- **任务号形态校验只在 `core/ids.py::require_task_id` 一处**，`guard` 不再提供同名函数（要校验就调 ids 那个）。

### 3.2 写动作（9 个）

每个动作文件顶部固定三行注释：**写集（最小） / 写序 / 重跑怎么收敛**。（加锁不在这里 —— 外壳用 `atom` 包住调用。）

**锁集总则**（四条，缺一条就会有人把锁算错）：

1. 下面每条写的「写集（最小）」= **这个动作真正会写的文件**。凡是要写过程文档的动作，**把该文档路径也放进去**（不是「分片锁顺带管着它」）。
2. **实际加锁由外壳在调动作之前完成**：`runner` 用 `lock_scope` 返回的 `Scope.files` 做 `with atom(repo, *scope.files)` 把动作调用包起来（见 §四）。这个集合可能比写集宽，但**必须包含写集**；写集只用来核对"我到底写了没写计划外的东西"。**动作函数自己不开事务、不拿锁。**
3. 锁集只许宽不许窄；锁集以外的文件一个字节都不许写。
4. **锁集 = `Scope.files`，是文件清单，允许包含"还不存在"的路径**（新建的过程文档就是这种：路径算得出来、文件还没有）。`Scope.dirs` 只决定"刷盘刷到哪"（展开成目录下已存在的文件），所以同一动作的锁集与刷取范围粒度不同、不必相等 —— presync 管"把旧的刷成新的"，锁管"我准备写哪些文件"。

**过程文档缺失怎么办（六个动作共用一条）**：`WorklogStore.find` 返回 `None`（台账里 `worklog` 为空、或文件已经不在）时，`claim` / `release` / `handoff` / `log_progress` / `close_task` **跳过「往过程文档记一笔」这一步**，不 Fail，只 `notices.note("提示：这条任务没有过程文档，已跳过执行记录")`；`close_task` 连带跳过封卷，历史末列留空、`payload["worklog_path"] = None`。其余步骤照常走。

**任务字段的初值与赋值时机（写死，别各动作自己猜）**：

| 动作 | 它写哪些字段 |
|---|---|
| `new_task` | `status="open"`、`started=null`、`updated=created`、`finished=null`、`creator=me.uuid`、`creator_name=me.name`；`owner` = `mine ? me.uuid : null`、`owner_name` 同理（进池的那份恒 `null`） |
| `claim` | `owner=me.uuid`、`owner_name=me.name`、`updated=now()`；`started` 还空就填 `now()`（"开始做"的时刻），已有值不动；`status` 不动 |
| `release` | 写回池的那份 `owner=null`、`owner_name=null`、`status="open"`、`updated=now()`；`started` 保留（重领时不重置） |
| `handoff` | 对方分片那份 `owner=to`、`owner_name=`名册里对方的 name、`updated=now()`；`started` 原值带走 |
| `log_progress` | 只改 `updated=now()` |
| `close_task` | **不写任务字段**：终值直接进历史行，分片那行最后删掉；`finished` 只出现在历史行与封卷标记里 |

```python
def bootstrap(repo, me) -> Identity
```

- 写集（最小）：索引 + 池 + 我的分片。
- 写序：`atomic.ensure_dir(owners/)` → 池 `TaskStore(POOL_REL).ensure_file()`（缺则建空池、有则不动）→ `OwnersIndex.ensure(me)`（索引缺则建、登记自己）→ 我的分片 `TaskStore(shard_rel(me)).ensure_file()`。**建目录只走 `atomic.ensure_dir`、建文件只走 `ensure_file`**，业务层不碰 `write_ledger_json`。三样由外壳用 `presync_scope` 返回的**自举那份** `Scope.files` 一次 `atom` 包住（机制同 §3.2 总则 2）；`bootstrap` 自己不开事务、不拿锁。
- 重跑：已登记 ⇒ 零写，直接返回。
- 必须在别的动作之前单独跑（文件锁不可重入，嵌进去会自己卡死）。
- **返回 `Identity` 而不是 `Result`**：它是 runner 在动作之前调的自举步骤，不参与"提交说明 / where / 打印"；它写的文件照样记进记账本，提交集合照常由记账本决定。

```python
def new_task(repo, me, *, title, tid, created, category=None, tags=(), mine=False) -> Result
```

- 写集（最小）：目标台账（`mine ? 我的分片 : 池`）+ 本次新建的过程文档。
- **`tid` / `created` 是必填 keyword，由外壳算好传进来**（见 §3.2 共用规则）：锁层要靠它们算出那篇过程文档的路径，业务层不许现算现用；缺了就是外壳的 bug，直接 `Fail`，不设"没给就自己算"的兜底。
- 写序：`atomic.ensure_dir(当月文档目录)` → 过程文档（含首条执行记录，一次写完）→ 台账。
- 重跑：任务号已存在就拒绝（这不是重跑，是重号；号是锁外定死的，不重算换号）。查重范围 = 池 + 我自己的分片（不看别人分片），**并且在锁内重读**。
- 查重范围比写集宽是故意的：查重里那份**本次不写**的台账（`mine=True` 时是池，`mine=False` 时是我的分片）不进锁集，但读它不怕并发 —— 单文件写是原子替换，读到的要么是旧全文、要么是全新文，不会读到半截。**锁保护写，读靠重读。**
- 失败：撤掉已写进台账那条（`TaskStore.drop(tid)`，那一条本来就是本次新建的，删掉即复原）+ 删本次新建的文档（`atomic.restore(path, None)`，原本不存在 ⇒ 删掉）。两者都在同一个 `atom` 内完成。**`new_task.py` 因此是第二个允许 `snapshot`/`restore` 的动作**（另一个是 `close_task`，见 §八 白名单），且只用它删文档，台账那条走 store。
- `worklog`：填（新建后的全文）；`payload`：`{"tid": …}`。

```python
def claim(repo, me, tid) -> Result
```

- 写集（最小）：池 + 我的分片 + 过程文档。
- 前置：他人分片里已有这个号 ⇒ 拒绝（别人正在改它）。他人分片**只读**：它在锁集与刷取范围里（锁内要重读），但不进写集。
- 写序：我的分片 → 删池里那行 → 过程文档记一笔。
- 重跑：分片里已有这个号（上次崩了一半）⇒ 只补删池里那行。
- `worklog`：填；`payload`：`{}`。

```python
def set_task(repo, me, tid, *, owner=None, release=False) -> Result
```

- **只做参数校验和路由，自己不加锁、不改任何文件**（它 import `release` / `handoff` / `claim`，这是全树唯一的跨动作引用）：
  - `--release` 与 `--owner` **必须二选一**：都缺 ⇒ `Fail`；都给 ⇒ `Fail`（释放不带人、交接不带释放）。**没有"空串 = 释放"这种隐式语义**。
  - `--release` ⇒ `release(repo, me, tid)`。
  - `--owner <uuid>` ⇒ 先过 `require_uuid`（非 uuid 当场 `Fail`，不做模糊匹配），再分三支：
    - 别人、已在索引里登记 ⇒ `handoff(repo, me, tid, to=…)`（没登记过 ⇒ `Fail`，不写出对别人不存在的分片）
    - 自己、这条现在不在我名下 ⇒ `claim(repo, me, tid)`
    - 自己、已经在我名下 ⇒ 幂等返回（`already_done=True`、退出码 0）
- 「我的」只比 uuid：分片里的行、历史两列、`--owner` / `--mine` 全是 uuid；显示名（`owner_name` / `creator_name`）只用于显示与 `--owner-name` 模糊筛。

```python
def release(repo, me, tid) -> Result
```

- 写集（最小）：我的分片 + 池 + 过程文档。
- 写序：写回池（已有同号就不覆盖）→ 删我分片那行 → 过程文档记一笔。
- 重跑：**收敛**，不是报错——池里已有同号（上次崩了一半）⇒ 只补删我分片那行，`already_done=True`、退出码 0。

```python
def handoff(repo, me, tid, *, to, status=None) -> Result
```

- 写集（最小）：我的分片 + 对方分片 + 过程文档。
- 前置：对方没在索引里登记 ⇒ 拒绝（否则写出一份对别人不存在的分片）。
- 写序：先写对方分片 → 再删我分片那行 → 过程文档记一笔。
- 重跑：对方分片里已有同号且内容只差时间戳 ⇒ **以对方那份为准**，只补删我；内容不一样 ⇒ 拒绝交人。

```python
def log_progress(repo, me, tid, note) -> Result
```

- 写集（最小）：我的分片 + 过程文档。
- 写序：刷分片的"最后更新" → 过程文档追加一行。
- 文档写不进（`append_exec` 回 `False`）⇒ **不算失败**：`changed` 照记分片那个字段、`notices.note("警告：分片的最后更新已刷，过程文档补不上")`、退出码 0，已写的分片照常提交（别在写完分片后抛错让外壳回滚，那会变成"改了又不提交"）。

```python
def close_task(repo, me, tid, *, summary, finished: str, category=None, tags=None) -> Result
```

- 写集（最小）：我的分片 + 结案那个月的历史文件 + 过程文档。
- **`finished` 必填、不接受 `None`**：外壳已经算好（`args.finished or now()`），同一个值也用于算锁集与刷取范围。业务层不许再调时钟 —— 这是跨月刷错月份的唯一根因。
- 写前核对：分片 / 历史 / 过程文档三个文件的 `fingerprint`，任一变了就中止；同时 `snapshot` 三份字节备用。
- **写序四步**：
  1. **改标签行**——给了 `--category` / `--tags` 就先改写过程文档头部那行（必须在封卷之前，否则封卷后就不许再动）；
     **历史行那九列里的 `category` / `tags` 取最终值**：给了参数就写新值，没给就写任务原值（分片里的），两处必须一致 —— 否则历史里会留下改前的旧标签；
  2. **历史加一行**——先 `atomic.ensure_dir(HISTORY_DIR)`（首次结案时 `ledger/history/` 可能还不存在，而 `write_text_atomic` 不建父目录），再落 `append_row` 返回的新全文；
  3. **封卷过程文档**——打封卷标记 + 在执行记录里补一行，一次写完；
  4. **删我分片那行**（永远是最后一步）。
- 重跑：历史去重走 `has_log`（有末列比文件名，末列空则按「创建时间 + 工作包」两列）；封卷认标记行（`has_frozen_line`）；分片已删且历史里有这行 ⇒ 返回"已结案，无需重复"，`already_done=True`、退出码 0。
  - `has_log` 要的 `created` / `title` **取自分片里那条任务**；分片里已经没有了（上次崩在删分片之后）⇒ 只拿 `log_name = worklog_name(tid)` 按末列比文件名判重，命中即 `already_done`。
  - 这时 `has_log` 回 `"undecidable"`（表里有末列为空的行）⇒ 直接 `Fail`，消息里指到当月历史文件让人工确认（不猜、不重复追加）。
- 失败：用 `atomic.restore` 把第 1~3 步碰过的文件按字节还原（`snapshot` 拿到的 `None` 表示原本不存在 ⇒ 删掉）。
- `payload`：`{"history_path": …, "worklog_path": …}`。

### 3.3 只读动作（5 个）

```python
def list_tasks(repo, me, q: ListQuery) -> ListResult
def show_task(repo, me, tid) -> ShowResult
def query_history(repo, me, q: HistoryQuery) -> HistoryResult
def validate(repo, me, deep: bool = False) -> ValidationReport
```

**签名统一收 `(repo, me, …)`**：`--mine` / 归属判断都要认人。只读动作不跑自举，`me` 由外壳用 `guard.current_identity(repo)` 装好传进来（env 本机身份，不写盘、不登记）。`me` 用不上也照样收，免得留一张"哪些动作要 me"的例外表。

**五个返回对象（字段名是公开契约，插件看板直接读；外壳不许重新算）**：

| 对象 | 字段 |
|---|---|
| `ListResult` | `rows: dict[tid, task]`（**原样任务对象**，`--json` 直接吐它）；`table: tuple[TaskRow, …]`（同一批数据的 9 字段投影，只给人话表格用）；`notices: tuple[str, …]` |
| `TaskRow` | `tid` / `title` / `status` / `owner`（显示名）/ `created` / `started` / `category` / `tags` / `where`（所在文件） |
| `ShowResult` | `task: dict`；`worklog: WorklogView`；`others: tuple[str, …]`（同一个任务号还出现在哪些文件里）；`notices: tuple[str, …]` |
| `HistoryResult` | `count`；`filters: dict`（回显生效的筛选）；`records: tuple[dict, …]`（每条 = 九列解析后的字段，`tags` 已拆成 `tuple[str, …]`；再加 `src` 来源文件 / `fmt` 原列数 / `line` 行号三个定位用字段）；`warnings: tuple[str, …]`；`capped: bool` |
| `ValidationReport` | `problems: tuple[str, …]`（**只有它影响退出码**）；`notices: tuple[str, …]`（只提示，不改退出码）；`checked_files: int`；`total_tasks: int`；`deep: bool`（本次是深度还是浅度） |

- **`list --json` 吐的是 `rows`（原始任务对象），不是 `TaskRow`**：看板要 `worklog` / `creator` / `updated` / `finished` 这些字段，`TaskRow` 只给人看的表格。
- **`rows` 的来源就是各份台账的 `TaskStore.data()["tasks"]` 按合并顺序拼起来**：不增字段、不改名、不做任何转换——里面的 `worklog` 仍是磁盘原值（相对 `ledger/`，见 §五 的基准约定），别在动作层偷偷改成相对 repo。
- **`list_tasks` 的合并顺序定死**：先池、再按索引键排序的各分片，同一任务号由分片那份胜出（见 `ledger-data.md` §八）。顺序不确定会让同一份数据两次查给出不同结果。
- **`validate` 分两档，只查格式不查业务**（2026-10-24 用户拍板）：
  - 浅度（默认）读：池 + 索引登记的各分片 + `owners/` 目录、**当月**历史文件、每篇过程文档的模板格式（标题行 / 「创建」行 / 前五节齐且有序）；
  - `--deep` 追加：全部月份的历史文件（含存量平铺）、读正文判「还是空骨架」；
  - `problems` —— 索引与文件对不上、池里有越权、字段非法、分片主人与分区键不一致、过程文档格式坏 ⇒ 退出码 1；
  - `notices` —— 缺「执行记录」节、有重复的节、解析历史时的警告、「历史里已结案但分片里还挂着」、空骨架（仅 `--deep`）⇒ **只提示**，退出码 0；
  - 没有台账 ⇒ 什么都不算，两个都是空，退出码 0。
  - **不查「同一任务号落在多个文件」**：读侧 `show` 会点名，写侧已有防护，体检不管（同号多文件不再影响退出码）。
- **报表只有**宿主侧一个来源：从 `query_history` 的 `records` 与 `list_tasks` 的 `rows` 聚合（时间线、按人工作日志、状态分布、分类 / 标签计数都从这里出）。脚本不开统计入口 —— 分类 / 标签计数要么从在办任务的 `rows` 里取，要么从历史行的分类 / 标签列取，都不需要逐篇扫过程文档。
- **只读动作的共同约束**：不拿整命令级锁、不加文件锁、不开事务、不跑自举、不做取最新（`list` 在没有台账时要能打出空表，`validate` 一个字节都不写）。
- **不拿锁为什么安全**：不做取最新 ⇒ 只读本地已提交的状态，不会撞上"正在刷盘"；另一个写进程留下的搬移中间态（同号在池与分片各一份）读侧本来就要容忍（`list` 只显示一次、`show` 在 stderr 说明）。

## 四、外壳 `shell/`：方法定义

```python
# cli.py
def main(argv=None) -> int                    # 唯一入口：解析 → 定位 → 整命令加锁 → 调 runner → 退出码
                                              # 「整命令锁」只在这里拿一次；runner 内部不再拿
                                              # finally 里 **只调一次** render.flush_notices()：任何阶段的提示都不丢
def build_parser() -> ArgumentParser          # 动作名与只读名单从 actions.registry 取
def resolve_repo(arg: str | None) -> Path     # --repo 给了就校验（是目录、且不是 ledger/ 本身）；没给则从 cwd 往上找
                                              # 找不到 ⇒ Fail（退出码 1），不自作主张在当前目录建台账
def to_query(args) -> ListQuery | HistoryQuery  # 命令行参数 → 查询对象。**只有这里认识 argparse**

# runner.py
def run(action: str, args) -> int
# 七步：绑记账本 → 取最新 → 自举 → 调动作 → 打印 → 提交 → 推送（定位与整命令锁已在 main 完成）
#   记账本**必须绑在「取最新」之前** —— 刷盘时要往它里面记 record_presync
#   **取最新必须在自举之前** —— 否则自举读到的是本地旧索引，会把远端刚登记的人覆盖掉
#   · 只读动作：跳过「取最新」与「自举」（也不拿整命令锁，见 §3.3）
#   · --no-sync：跳过「刷盘 / 提交 / 推送」；presync_scope 照调（锁集要用它），只是不交给 sync_down；记账本照建
#   · already_done **不**跳过「提交 / 推送」（写没写只看记账本）
#   · 记账本为空 ⇒ 提交与推送都跳过（没脏文件就没得提交）
#   · close：先算 finished = args.finished or now()，同一个值交给 lock_scope 与 close_task
# 唯一创建记账本、唯一决定退出码、唯一统一回滚的地方
#   · **唯一不回滚的失败分支是 `BrokenPipeError`**（打印时管道断了，例如 `| head`）：文件已经写完，
#       它**不回滚**、不重试，按记账本照常提交推送 —— 数据已经在盘上，回滚反而丢掉这次工作

# presync.py
def presync_scope(repo, me, action: str, params: dict) -> tuple[Scope, Scope]   # (自举那份, 动作那份)
#   **全仓唯一算锁集的地方**：内部各调一次 lock_scope("bootstrap", …) 与 lock_scope(action, …)
#   runner 拿它做三件事：sync_down(boot | act) / atom(*boot.files) 包自举 / atom(*act.files) 包动作
#   少了"自举"那一份就会拿旧索引去盖远端刚登记的人（见下表第一行）。只读动作 → 两份空 Scope
# 刷盘本身只有 GitRepo.sync_down 一个实现（见下），这里不重复定义

# gitops.py
class GitRepo:
    def __init__(self, repo)                    # 不带 no_sync：要不要刷/提交/推，由 runner 决定调不调
    def guard_before_write(self, scope: Scope) -> None   # 写前硬拦：本地有未提交的台账改动 / 有未推送的台账提交 /
                                                  # 有未入库的同名文件 / 处于 rebase 中间态 ⇒ Fail 并说明怎么处理
                                                  # 在 sync_down 之前调；只读动作与 --no-sync 不调
    def sync_down(self, scope: Scope) -> list[tuple[Path, bytes | None]]   # 刷 `files` 与 `dirs` 展开后的文件，
                                                  # 每个刷过的连同"刷之前"的字节一起返回
    def commit(self, files, message) -> None
    def push(self) -> None                     # 被拒时 rebase 重试
def repo_sync_lock(git_dir, timeout=60.0)      # 整条命令的进程级互斥，只有 cli.main 调

# merge.py
def merge_task_dicts(base, ours, theirs) -> tuple[dict, list[str]]
def resolve_ledger_conflict(path, text) -> str | None    # 直接写盘（`track=False`、不进记账本），只有外壳能调；
                                                         # 写完由紧随的 git rebase --continue 自己提交
def render_conflict_text(rel, base: str, ours: str, theirs: str) -> str   # 人话冲突说明，返回文本、不打印

# render.py —— 唯一打印处。一个返回类型一个函数，不做统一分发
def flush_notices() -> None                              # 把 notices 一次性打到 stderr（退出前调一次）
def result(res: Result, *, as_json: bool) -> None        # 写动作
def list_view(res: ListResult, q: ListQuery, *, as_json: bool) -> None
def show_view(res: ShowResult, *, as_json: bool) -> None
def history_view(res: HistoryResult, q: HistoryQuery, *, as_json: bool) -> None
def validate_view(rep: ValidationReport, *, as_json: bool) -> None
```

**动作是怎么被调起来的（`ActionSpec` + 第 ④ 步）**：

```python
@dataclass(frozen=True)
class ActionSpec:
    func: Callable          # (repo, me, **params) -> Result | 视图对象
    render: str             # 渲染函数**名**（`"result"` / `"list_view"` …）；actions 不 import shell，
                            # runner 用 `getattr(shell.render, spec.render)` 取到函数（第 ⑤ 步）
    readonly: bool
    lock_action: str        # 交给 lock_scope 的动作名：默认 = 命令名
```

1. `GitRepo(repo)` 在写动作里构造一次；**只读动作不构造**。`--no-sync` 照样构造，只是 runner 不调 `sync_down` / `guard_before_write` / `commit` / `push`（`TASK_LEDGER_NO_SYNC` 只在 `cli.main` 读一次，折成 `args.no_sync` 往下传，别在别处再读环境变量）。
2. `me` 统一由 `guard.current_identity(repo)` 装配：先 `env.current()` 拿本机 git 身份（邮箱即唯一身份键）。写动作随后用 `bootstrap(repo, me)` 的返回值覆盖。
3. `spec.func(repo, me, **params)`，`params` 只按 §九 的映射表挑，**不许把整个 `args` 透传进业务层**。
4. `spec.render(value, **视图参数)` **只负责打印，不 flush**；`render.flush_notices()` 只在 `cli.main` 的 `finally` 里调一次 —— 提交/推送阶段冒出来的提示也才打得到。

**每个 `lock_scope(action)` 算哪些文件（七个分支）——只由 `actions.atom.lock_scope` 一处算，不许各写一份**：

| 动作（`lock_scope` 的 `action`） | 刷取范围（该动作会碰的文件 / 目录） |
|---|---|
| 自举 `"bootstrap"` | 索引 + 池 + 我的分片（**必须在自举之前刷**，否则自举用旧索引盖掉远端新登记） |
| 建任务 `"new"` | 目标台账 + 当月文档目录（**目录只用来刷盘**；锁里放的是本次新建那篇文档的路径） |
| 认领 `"claim"` | 池 + 我的分片 + 他人分片 + 该任务过程文档 |
| 改状态 `"set"` | 我的分片 + 池 + **他人分片**（`claim` 前置要查、`handoff` 要写对方）+ 目标分片 + 该任务过程文档（四分支取并集，宁宽勿窄） |
| 记进展 `"log"` | 我的分片 + 该任务过程文档 |
| 结案 `"close"` | 我的分片 + **结案时间所在那个月**的历史 + 该任务过程文档 |
| 归并标签 `"tags"` | 我的分片 + 全部在办文档 |

- **表里的"目录"进 `Scope.dirs`**（只刷盘、不加锁，展开成目录下已存在的文件）；其余进 `Scope.files`，其中**本次要新建的文档路径也算进去**（`new` 那篇、`close` 要封卷那篇 —— 路径算得出来、文件还没有）。所以锁集允许含尚不存在的路径（见 §3.2 总则 4）。
- **② 取最新实际刷的是「`"bootstrap"` 行 ∪ 动作行」**（`presync_scope` 算这个并集）：写命令的自举会写索引与我的分片，只刷动作那一行不足以防旧索引盖人。
- **只读命令 → 空**（它连 `atom` 都不进）。`--no-sync` 只表示「不刷盘」：`presync_scope` **照调**（锁集得从它拿，它本来就不碰 git），只是那两份 `Scope` 不交给 `sync_down`，直接拿去加锁；`guard_before_write` 与提交/推送跟着一起跳。`--no-sync` 的写命令仍受总则 3 约束。

## 五、工具层 `core/`：函数清单

| 文件 | 函数 |
|---|---|
| `time.py` | `now()`；`to_utc(value, *, field, tid=None)`；`fmt_local(utc)`；`normalize_time(value, *, field)`；`time_key(utc)` |
| `paths.py` | `SKILL_DIR`（**模板与资产的唯一定位基准**，按自身位置算绝对路径）；`WORKLOG_TEMPLATE`；`POOL_REL` / `OWNERS_REL` / `OWNERS_DIR` / `HISTORY_DIR` / `WORKLOG_DIR` / `LEGACY_HISTORY_REL`；`shard_rel(identity)`；`worklog_dir_for(created)`；`worklog_name(tid)`；`worklog_rel(tid, created)`；`history_path_for(finished)`；`to_repo_rel(ledger_rel)` / `to_ledger_rel(repo_rel)` / `to_history_rel(ledger_rel)` |
| `ids.py` | `id_stamp(created)`；`slugify(title)`；`make_id(title, tasks, created=None)`；`require_task_id(tid)` |
| `identity.py` | `Identity`（`uuid` / `name` 的不可变值对象）；`normalize(who)`；`looks_like_uuid(who)`；`is_me(identity, who)` |
| `labels.py` | `STATUSES = ("open", "doing")`（`--status` 的白名单就是它）；`done` 只能由 `close` 产生、不在此二者里；`FORMAT_VERSION`；`normalize_label(value, *, field)`；`parse_tags(raw)`；`label_line(category, tags)`；`parse_label_line(text)` |
| `worklog_md.py` | `render_worklog(*, tid, title, created, creator, category, tags, template) -> str`；`is_skeleton(text)`；`exec_line(when, who, kind, note)`；`append_exec_log(text, line)`；`stamp_frozen(text, finished, who)`；`has_frozen_line(text)`；`rewrite_label_line(text, category, tags)` |
| `history_md.py` | `esc_cell(s)`；`owner_cell(owner)`；`creator_cell(creator)`；`history_line(...)`；`split_row(line)`；`is_sep_row(line)`；`parse_history(text)`（只认九列） |

五条必须守住的：

- **路径基准只有一个约定**：磁盘与 JSON 里存的路径**相对 `ledger/`**（格式契约，如 `task["worklog"]`）；凡是输出给人或给界面的（`Result.where`、`WorklogView.path`、`payload` 里所有 `*_path`）**一律相对 repo**。换算只在 `core/paths.py` 的 `to_repo_rel` / `to_ledger_rel` / `to_history_rel` 三处做，任何层都不许自己拼 `..`。
- **时间只有一个例外**：所有存盘时间都是 UTC；唯一例外是过程文档「执行记录」那行的时刻 —— 它是**本地时间**，给人读的日志行，不参与任何筛选或排序。转换固定发生在 `worklog_md.exec_line(when_utc, …)` 内部（它自己调 `fmt_local`）：**调用方一律传 UTC**，别在外面先转一遍。
- **身份只有 `uuid` 一个键**。`env.py` 只读本机身份文件（`$TASK_LEDGER_HOME/.taskledger/identity.json`，默认 `~/.taskledger/identity.json`），不读 git、不读环境变量、没有兜底。名字（`name`）只用于显示与 `--owner-name` 模糊筛，**不参与任何归属判定**；分片、历史行、`--owner` / `--mine` 一律比 uuid。
- **`render_worklog` 只做字符串替换**：模板由 `WorklogStore.template()` 取来传进去，它自己不读文件、也不接收整条 task dict。
- **`history_md` 自己不开文件**：它只做文本换算；凡是要读 worklog 的事都留在 store / 业务层。

### 5.1 顶层 `env.py`（不在四层里）

```python
def current(repo=None) -> Identity   # 读 ~/.taskledger/identity.json；没有就 Fail 提示跑 init
                               # 读不到就给兜底身份，并 notices.note("提示：…")，绝不抛
```

- 只有一个方法。它**只给本机的这一个身份**（邮箱即唯一身份键）。
- 它跑 `git config`（子进程），这是全仓唯一允许跑 git 的非 shell 文件；只读配置，不 pull / commit / push。

## 六、错误、退出码、输出

| 项 | 规则 |
|---|---|
| 业务错误 | 只有 `Fail` 一种；外壳接住，stderr 打 `错误：…` |
| 退出码 | `0` 成功（含"无需重复"）；`1` 业务错误；`2` 参数用错；`3` 未预期异常；`130` Ctrl-C |
| stdout | 正常结果；`--json` 时**只**出 JSON（一个字节的人话都不许混进去） |
| stderr | `提示：`/`警告：`/`错误：` 一律走这里；`notices` 由 `flush_notices()` 在退出前一次性打完 |
| 打印位置 | **只在 `shell/render.py`** |
| `--json` 挂在哪 | 只有 `list` / `show` / `history` / `validate` 挂；写动作一律人话 |
| 空结果也是 JSON（契约） | `list` → `{}`；`history` → `{"count":0,"filters":{…},"records":[],"warnings":[],"capped":false}`；`validate` → `{"problems":[],"notices":[],"checked_files":0,"total_tasks":0,"deep":false}` |
| 非空形状 | 就是 §3.3 那几个返回对象的字段直译，不许在 render 里换名字、加壳、去掉字段。**唯一例外是 `list`**：它的 `--json` 顶层直接是 `rows`（`{tid: task}`），不套 `ListResult` 那层壳 |
| `--count-only` 的形状 | **固定两个键** `{"count": int, "capped": bool}`；`capped=true` 表示计数触到 `COUNT_CAP`（10000）被封顶，此时 `count` 只是一个下界，调用方不许当精确值用 |
| 互斥 | `--json` 与 `--count-only` 同时给 ⇒ 用法错（退出码 2） |
| `show --json` 没有「空结果」 | 号不存在 / 没有台账都是**错误**（退出码 1 + stderr 说明），不出 `{}` —— 那不是"空数据"，是"你要的东西不在" |

## 七、现状符号 → 目标文件（搬迁地图）

> ⚠️ **本节只是施工参考，不是契约**。以 §二~§五 的方法表为准；两边对不上时，**一律按 §二~§五 写**，本表随码更新。
> 注：下表「现状」列为 2026-10-22 重构**前**的旧文件行号，重构（2026-10-23 落地）后仅供追溯，不再反映现状。

| 现状（行号为 2026-10-22 基线，重构前） | 目标文件 |
|---|---|
| `write_text_atomic` 440 / `stat_key` 773 | `store/atomic.py` |
| `CHANGED_FILES` 384 / `PRESYNC_FILES` 388 / `PRESYNC_BACKUPS` 392 / `CREATED_FILES` 420 | `store/dirty.py`（四个全局变量消失） |
| `progress_lock` 789 / `ledger_lock` 683 | `store/locks.py` |
| `read_ledger` 573 / `_load_shaped` 547 / `write_ledger_json` 656 / `load_pool` 619 / `load_shard` 634 | `store/json_store.py` + `store/task_store.py` |
| `load_owners` 624 / `registered_shards` 642 | `store/owners_index.py` |
| `history_sources` 2620 / `append_history_line` 2649 | `store/history_store.py`；`has_log` 为**新增**（结案重跑判据）；原来的 `rewrite` 并入 `write`（唯一的受控写回口） |
| `write_worklog` 3022 / `record_exec` 2989 / `find_worklog` 2927 | `store/worklog_store.py`（`record_exec` 里"找+读+拼+写+打印"拆开：前三步留数据层，打印归外壳）；`template` / `head_meta` 为**新增** |
| `parse_history` | `core/history_md.py`（只认九列；旧 `upgrade_history` 已删） |
| `append_exec_log` 2965 / `stamp_frozen` 3117 / `has_frozen_line` 3105 / `rewrite_label_line` 2857 / `render_worklog` 2875 | `core/worklog_md.py` |
| `id_stamp` 2739 / `make_id` 2746 / `slugify` / `require_task_id` | `core/ids.py` |
| `normalize_label` / `parse_tags` / `label_line` / `parse_label_line` | `core/labels.py` |
| `now` 132 / `to_utc` 140 / `fmt_local` 156 / `normalize_time` 196 | `core/time.py` |
| 路径常量 / `shard_rel` 290 / `worklog_rel` 2918 / `worklog_dir_for` 2895 / `worklog_name` 2904 / `history_path_for` 2593 | `core/paths.py` |
| `current_identity` / `read_identity` / `current` | `env.py`（读本机身份文件）+ `core/identity.py`（`Identity` 值对象、归一化、`looks_like_uuid`、`is_me`） |
| `require_owner` 2795 / `load_task` 2764 / `same_task_ignoring_stamp` 3318 | `actions/guard.py` + `actions/show_task.py`；`owner_of` / `status_of` / `is_mine` / `in_scope` 为**新增谓词**，把散落的 `get("owner")` 判定收进来 |
| `ensure_ledger` 692 | `actions/bootstrap.py` |
| `cmd_new` 3139 / `undo_new_task` 3028 | `actions/new_task.py`（撤销降为私有） |
| `cmd_claim` 3230 | `actions/claim.py` |
| `cmd_set` 3329 三分支 | `actions/set_task.py`（路由）+ `release.py` + `handoff.py` + `claim.py` |
| `cmd_log` 3455 | `actions/log_progress.py` |
| `cmd_close` 3483 | `actions/close_task.py` |
| `cmd_list` 3716 / `cmd_show` 3854 / `cmd_history` 4219 / `cmd_validate` 4006 | `actions/list_tasks.py` / `show_task.py` / `query_history.py` / `validate.py` |
| `git_presync` 1902 / `git_sync` 1357 / `_push` 922 / `_rebase_retry` 1224 / `repo_sync_lock` 820 | `shell/gitops.py` |
| `_write_targets` 1855 | `shell/presync.py` 的 `presync_scope` |
| `_merge_task_dicts` / `_union_merge` / `_resolve_ledger_conflict` | `shell/merge.py`（`merge_task_dicts` 去下划线 = 公开契约） |
| `_run_once` 4603 / `main` 4582 / `_repo_lock_dir` 4558 | `shell/runner.py` + `shell/cli.py` |
| 各 `cmd_*` 里的 `print` / `json.dumps` / `print_worklog` | `shell/render.py` |
| 模块入口 4656 | `progress.py`（≤ 40 行） |

## 八、防塌线（改完必跑；下表数字为 2026-10-22 重构前基线，重构已落地，重跑时以「目标」列为准）

| 判据 | 现状 | 目标 |
|---|---|---|
| `actions/` 里出现 `write_text_atomic\|read_ledger\|load_pool\|load_shard\|open(\|read_text(\|read_bytes` | 26 行（在 `cmd_*` 里） | **0** |
| `snapshot(` / `restore(` 出现在 `actions/` 的 `close_task.py` / `new_task.py` 之外 | — | **0**（只有"一次改多个文件、且半路失败要按字节退回"的动作才用；`new_task.py` 只用它删本次新建的那篇文档） |
| `actions/` 里出现 `print(` | 73 处 | **0**（打印全在 `shell/render.py`） |
| `actions/`+`store/` 里出现 `git_\|subprocess\|_push\|_rebase_retry` | 0 | **0**（唯一例外：顶层 `env.py` 读 `git config`，它不在这两个目录里） |
| `json.dumps` 出现在 `store/json_store.py` 之外（查 `actions/`+`store/`） | — | **0**（序列化只有 `json_store.py` 一处） |
| `store/`+`actions/` 里出现 `progress_lock(` / `ledger_lock(`，**排除 `store/locks.py`（定义体）与 `actions/atom.py`（唯一调用点）** | 9 处 | **0** |
| **`store/` 里出现 `get("owner")` / `get("status")` 判定** | 16 处 | **0**（读 `owner`/`status` 只走 `guard.py` 的四个谓词） |
| **`actions/` 里在 `guard.py` 之外**读**裸写 `["owner"]` / `["status"]` / `.get("owner")` / `.get("status")`**（用于判定） | — | **0**（要判就调 `is_mine` / `owner_of` / `status_of` / `in_scope`）；**写**这两个字段不算违规（`claim` / `release` / `handoff` / `set_task` 本来就要写），用赋值形态 `\["owner"\]\s*=` / `\["status"\]\s*=` 把它们从判据里排除 |
| 四个记账本名字出现在 `store/dirty.py` 之外 | 4 个文件都有 | **0** |
| `print(` 出现在 `notices.py` 与 `render.py` 之外 | — | **0** |
| 跨动作 import（`set_task.py → release.py/handoff.py/claim.py` 除外） | — | **0** |
| `scripts/progress.py` 行数 | 4657 | **≤ 40** |
| `actions/` 单文件最大行数 | — | **≤ 300** |

反向验证（防止为了过上面而拆坏功能）：`shell/render.py` 仍要命中 `--json` / `--count-only`；`list --json` 空结果仍是 `{}`、`history --json` 空结果仍是 `{"count":0,"filters":{…},"records":[],"warnings":[],"capped":false}`。

## 九、命令行参数 → 动作参数

| 命令 | 参数 | 动作 |
|---|---|---|
| `new` | `--title --id --created --category --tags --self` | `new_task(title, tid, created, category, tags, mine)` |
| `claim` | `--id` | `claim(tid)` |
| `set` | `--id --release --owner` | `set_task(tid, owner, release)` → `release` / `handoff` / `claim` |
| `log` | `--id --note` | `log_progress(tid, note)`（折叠空白，不限长度） |
| `close` | `--id --summary --finished --category --tags` | `close_task(tid, summary, finished, category, tags)` |
| `list` | `--mine --owner --owner-name --pool --status --category --tag --since --until --json` | `list_tasks(q)` |
| `show` | `--id --json` | `show_task(tid)` |
| `history` | `--owner --owner-name --mine --category --tag --since --until --limit --months --json --count-only` | `query_history(q)` |
| `validate` | `--deep --json` | `validate(deep)` |
| 全局 | `--repo`、`--no-sync` | 外壳处理，不进业务层（`--repo` 由 `resolve_repo` 消费） |

表里只列**命令带来的参数**：`repo` 与 `me` 由外壳自动注入（见 §四 的 `ActionSpec`）；**第三列括号里的参数名就是 `params` 的键**，外壳照它挑，多一个少一个都算契约破坏。

**名册的键就是命令写法**：九个命令九个键，没有子模式分键。没有 `--dry-run` —— 写命令没有预览模式。

**参数 → 查询对象的装配只在 `cli.to_query` 一处**：动作层拿到的永远是 `ListQuery` / `HistoryQuery`，不是 argparse 的 namespace。界面（看板）要复用同一个动作，自己构造这两个 dataclass 即可 —— 这是 §〇 第 39 行「业务函数要能被界面单独调」能成立的唯一方式。

**取最新的结果怎么进记账本**：`sync_down` 返回 `[(path, before)]`，runner 逐条交给 `WriteLog.record_presync(path, before)`。shell 不自己拼清单、store 不自己记账 —— 记账本只有它自己的方法能写。
