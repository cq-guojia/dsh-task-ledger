# 后端数据面：host 分层架构与性能基线

> **状态**：📝 待拍板（分层方案用户已暂时接受；性能路线待 history 讨论定稿后一起实施）
> **来源**：任务「后端方法抽象：台账读取查询与会话交接」用户要求（2026-10-18）：①所有与台账交互的后端能力抽象成方法；②一个地方统一读；③其他一律调用抽象方法；④架构要健壮、合理、成熟，参考业界成熟分层
> **配套**：`architecture.md`（运行逻辑）、`code-conventions.md`（方法规范）、`ledger-data.md`（跨包数据契约）、`features/board-home.md`

## 一、现状与问题（2026-10-18 勘查 + 实测）

### 1.1 现有分层（已 80% 到位）

| 层 | 文件 | 职责 | 状态 |
|---|---|---|---|
| 进程出口 | `script.ts` | 全插件唯一 `spawn('python3')`，不解析台账格式 | ✅ |
| 中间层 | `ledger-read.ts` | `readTasks/readHistory/getTask/readWorklog/filterArgs` | ✅ |
| 聚合层 | `board.ts` | 统计/趋势/周期，纯计算 | ⚠️ 含第 5 处 IO（spawn git） |
| 路由薄壳 | `routes.ts` | 只做协议 | ✅ |
| 工作区发现 | `workspace.ts` | ❌ 自己 `existsSync('ledger/progress.json')`，没走中间层 |

### 1.2 IO 散点（勘查实锤）

`script.ts:35`(python3)、`board.ts:171`(git)、`workspace.ts:20`(existsSync)、`ledger-read.ts:54`(readFile worklog)、`skill-registration.ts:52`(读 SKILL.md，不碰台账、不动)。

### 1.3 三个健壮性缺口

1. **无入口校验**：`Object.entries(result.data)` 直接信脚本 JSON，字段变更会静默污染 UI；
2. **无错误隔离**：`Promise.all` 一个工作区读失败 → 整板 500（0.0.6 事故同类）；
3. **无结构护栏**：没有任何东西阻止再长出第二处 `existsSync('ledger/...')` / `spawn`。

## 二、性能实测（2026-10-18，本机）

fixture：`/tmp/perf3` = 空在办 + `history/202610.md` 50002 行 / 6.6MB（5 万行全在这一个月文件里）。

| 路径 | 耗时 | 说明 |
|---|---|---|
| `readHistory(months=13)` | 1108ms | 首页/历史现状 |
| `readHistory(months=2)` | 1063ms | ⚠️ 窗口参数**几乎无效** |
| `readHistory(months=1)` | 1042ms | 同上 |
| `readHistory(since=2026-08-20)` | 1080ms | ⚠️ **解析后过滤**，只省传输 |
| `readHistory(limit=500)` | 813ms | 同上 |
| `readHistory(全量)` | 1031ms | |
| `history --count-only` | 118ms | **证明 ~900ms 花在「5 万条 JSON 序列化→stdout→Node parse」** |
| `readTasks(list)` | 91ms | 在办路径本来就快 |
| `getHomeAggregate`（self+dispatch+perf-50k） | 1391ms | 首屏 `/board` 全成本 |
| `getHomeAggregate`（self+dispatch 真实两库） | 176ms | 真实环境可接受 |

**结论（推翻两个想当然）**：

1. `--months` 是**文件级**过滤（只读最近 N 个月的文件）——5 万行全在单文件里时，缩窗口救不了；
2. `--since/--until/--limit` 是 **Python 解析之后**过滤——解析整个文件的钱已经付掉，只省后面的传输；
3. 单文件 5 万行的**解析硬成本 ≈ 0.9s**（`--count-only` 118ms 反证：其余 900ms 是 5 万条 JSON 的序列化 + stdout 传输 + Node 端 parse）；
4. 首屏 `/board` 慢 = `getHomeAggregate` 白读 history：统计卡与在办列表**只需要 readTasks（91ms）**，history 只服务于趋势图与周期计数。

## 三、目标架构（三层 + 唯一出口，社区标准 routes→services→repositories 落地）

```
routes.ts            传输层：参数解析 / 发 JSON / 错误→状态码
services/            用例层：纯计算零 IO（home / history / filters 三个 service）
repositories/        数据访问层：**唯一知道「台账怎么读」的地方**
  ledger.repository    readTasks / readHistory / getTask / readWorklog / hasLedger
  identity.repository  git config user.name（收敛 board.ts:171）
  records.ts           入口校验：脚本 JSON → 领域对象，坏数据抛 LedgerDataError
  cache.ts             TTL 读缓存 + 单飞去重 + invalidate() 钩子
  runner.ts            = 现 script.ts，全插件唯一 spawn python3
workspace.ts         调 ledger.repository.hasLedger()，不再自己 existsSync
errors.ts            统一错误模型 + 降级结果类型（横切）
```

**降级语义**（用户 2026-10-18 确认）：读失败 = ①`progress.json` 坏 JSON / 缺字段 ②脚本非零退出 ③python3 起不来 ④超时。四种都记 `degraded:true + 原因`，接口仍 200，前端把该工作区**标红 + 警告**，其他工作区不受影响。

**缓存语义**（用户已接受）：TTL 1.5s + `fresh=1` 绕过 + 写路径成功后 `invalidate()`（写路径归任务 4，未拍板前缓存无正确性风险）。

## 四、性能优化路线（待拍板）

| # | 措施 | 首屏大库耗时 | 风险 | 结论 |
|---|---|---|---|---|
| A | 拆端点：`/board` 只回在办快照+统计卡，趋势改 `/board/trend` 后台/按需拉 | 1391ms → **~120ms** | 响应结构变化；新旧版本错配要兜底（v0.0.15 黑屏教训） | **推荐先做** |
| B | 缓存 TTL 1.5s + `fresh=1` | 重复访问 → ~0ms | 低 | 与 A 叠加 |
| C | 脚本聚合模式：`progress.py history` 加分組计数输出（如按周 done/created），host 只收几百字节 | 趋势也变快 | **改 skill 独立分包 = 跨包契约**，影响所有消费者 | 后续评估，本期不做 |

A 的前提（服务拆分）：`getBoardSnapshot` 当前内部走 `getHomeAggregate` 白读 history（实测 1320ms，实际只需 91ms），拆端点时一并修正。

## 五、分期

| 期 | 内容 | 对外行为 |
|---|---|---|
| 1 | 目录重组 + IO 收敛 + 错误模型/降级 + 入口校验 | 完全等价，冒烟全绿才算完 |
| 2 | 拆端点（A）+ 缓存（B）+ 前端降级标红 | 新增行为 |
| 3 | 写路径 + invalidate（等任务 4 拍板） | 新增行为 |

## 六、影响面（重构必读）

- smoke 的 5 处 `import('../dist/host/*.js')` 硬编码路径要随文件重组同步改；
- 对外契约不许变：`list --json` = 任务号为键的对象；`history --json` = `{count,filters,records}`；`--count-only` = `{count,capped}`；错误人话文案（smoke 断言 `/progress\.json/`）；
- host 新文件 tsc 自动纳入（`tsconfig.json` include `src`）；client 禁止 import host；
- API 前缀两份副本：`routes.ts:32` 与 `client/api.ts:14`，改要同步；
- 文档同步：`ledger-data.md`（点名 runLedgerScript 处）、`architecture.md`、`code-conventions.md`、`board-home.md`、`external/dsh-workspace-registry.md`。
