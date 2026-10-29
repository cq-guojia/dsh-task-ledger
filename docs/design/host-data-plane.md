# 后端数据面：host 分层架构与性能基线

> **状态**：🔵 已拍板（用户 2026-10-18 接受：三层 + repositories 四件套 + 拆端点 + 缓存；C 改脚本挂起）；分期 1/2 合并实施。**2026-10-28 收敛并清理**：首屏 = 8 卡 + 在办列表 + 各工作区花名册，路由只注册 `/workspaces` 与 `/board/snapshot`（每工作区 `stats --json` + `stats --trend week` + `list --json` + `owners --json`，跨工作区合并/求和/降级归集）。`/board`、`/board/trend`、`/task`、`/history`、`/filters`、`/claim`、`/release`、`/close` 的实现与空壳函数**已全部删除**（提交 c528eab，删 7 个文件 / 约 3800 行）：接回时按 skill 方法重写，不复用旧直读逻辑
> **来源**：任务「后端方法抽象：台账读取查询与会话交接」用户要求（2026-10-18）：①所有与台账交互的后端能力抽象成方法；②一个地方统一读；③其他一律调用抽象方法；④架构要健壮、合理、成熟，参考业界成熟分层
> **配套**：`architecture.md`（运行逻辑）、`code-conventions.md`（方法规范）、`ledger-data.md`（跨包数据契约）、`features/board-home.md`

## 一、现状与问题（2026-10-18 勘查 + 实测）

### 1.1 现有分层（2026-10-24 复核；代码已落地 `repositories/` + `services/` + `skill/` 重分）

| 层 | 文件 | 职责 | 状态 |
|---|---|---|---|
| 进程出口 | `repositories/runner.ts` | 全插件唯一 `spawn(台账程序)`（`skill/scripts/progress`，按平台 exec 内嵌二进制），不解析台账格式 | ✅ |
| 台账读取 | `repositories/ledger.repository.ts` | 判台账存在（`hasLedger`）、读在办（pool.json + 分片）、读花名册 | ✅ |
| 聚合层 | `services/stats.service.ts`（+ `dates.ts`、`uuid` 已删） | 8 卡跨工作区求和 + 降级归集，纯计算 | ✅ |
| 路由薄壳 | `routes.ts` | 只做协议 | ✅ |
| 工作区发现 | `workspace.ts` | `hasLedger()` 判有台账（走 skill `root --json`，判据是目录直接含 `ledger/`；插件不拼台账文件路径） | ✅ |
| skill 注册 | `skill/registration.ts` | 注册内嵌 `task-ledger` SKILL.md | ✅ |

### 1.2 IO 散点（2026-10-24 复核；行号随重构已变，以下只列文件）

台账相关的 `spawn` 唯一落在 `repositories/runner.ts`（起内嵌 `skill/scripts/progress`，静态二进制）；台账/分片/worklog 读取集中在 `repositories/ledger.repository.ts`；工作区判活经 `workspace.ts` → `hasLedger()` 走 skill `root --json`（插件内无 `node:fs` 读台账，唯一 `node:fs` 是 `skill/registration.ts` 读 SKILL.md）；SKILL.md 读取在 `skill/registration.ts`。原 §1.2 的 `script.ts`/`ledger-read.ts`/`skill-registration.ts` 等旧文件名与行号对应重构前结构，已失效（现状以 `packages/plugin/src/host/` 为准）。

### 1.3 三个健壮性缺口

1. **无入口校验**：`Object.entries(result.data)` 直接信脚本 JSON，字段变更会静默污染 UI；
2. **无错误隔离**：`Promise.all` 一个工作区读失败 → 整板 500（0.0.6 事故同类）；
3. **无结构护栏**：没有任何东西阻止再长出第二处 `existsSync('ledger/...')` / `spawn`。

## 二、性能实测（2026-10-18，本机；⚠️ 测的是已删除的 history 读路径）

> 下表是**历史基线**，其中 `readHistory` / `getHomeAggregate` 的实现已于 2026-10-28 删除（2026-10-29 起连 `history --count-only` 也删了：本周 / 上周完成改取趋势桶的最后两个，history 只负责列表）。留在这里是因为「趋势为什么慢、为什么不做」的结论仍成立。

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
2. `--since/--until/--limit` 是 **脚本解析之后**过滤——解析整个文件的钱已经付掉，只省后面的传输；
3. 单文件 5 万行的**解析硬成本 ≈ 0.9s**（`--count-only` 118ms 反证：其余 900ms 是 5 万条 JSON 的序列化 + stdout 传输 + Node 端 parse）；
4. 首屏 `/board` 慢 = `getHomeAggregate` 白读 history：统计卡与在办列表**只需要 readTasks（91ms）**，history 只服务于趋势图与周期计数。

## 三、目标架构（三层 + 唯一出口，社区标准 routes→services→repositories 落地）

```
routes.ts            传输层：参数解析 / 发 JSON / 错误→状态码
services/            用例层：聚合与计算（纯函数；现只有 stats.service 与 dates.ts）
repositories/        数据访问层：**唯一知道「台账怎么读」的地方**
  ledger.repository    readTasks / readOwners / hasLedger
  stats.repository     readStats（stats --json）
  identity.repository  读本机 identity.json 的 uuid（机器级；与工作区 / git 无关）
  records.ts           入口校验：list --json → 领域对象，坏数据抛 LedgerDataError
  cache.ts             TTL 读缓存 + 单飞去重 + invalidate() 钩子
  runner.ts            全插件唯一 spawn 台账程序（内嵌静态二进制，读命令专用）
workspace.ts         调 ledger.repository.hasLedger()，不再自己 existsSync
errors.ts            统一错误模型 + 降级结果类型（横切）
```

**降级语义**（用户 2026-10-18 确认）：读失败 = ①台账（pool.json + 分片）坏 JSON / 缺字段 ②脚本非零退出 ③台账程序起不来（本平台无产物 / 丢了可执行位） ④超时。四种都记 `degraded:true + 原因`，接口仍 200，前端**弹一条 error toast**（核心 `notify({variant:'error'})`：标题带失败工作区数，描述只列前两个工作区的「名字：原因首行」），其他工作区不受影响。**2026-10-29 起不在页面上铺降级横幅** —— 脚本报错常把整段用法提示塞进来，铺在统计卡下面把版面顶烂。

**缓存语义**（用户已接受）：TTL 1.5s + `fresh=1` 绕过 + 写路径成功后 `invalidate()`（写路径归任务 4，未拍板前缓存无正确性风险）。

**实施状态（2026-10-18）**：`repositories/cache.ts` 已落地，口径与上文一致，另有三条硬边界：

| 边界 | 为什么 |
|---|---|
| 只缓存脚本两读（`list` / `history`），**worklog 正文不缓存** | 过程文档会被会话里的 Agent 实时改写，缓存 1.5s 也会让用户看到上一版 |
| **失败不入缓存** | 错就是错，重试必须真重跑（否则一次瞬时故障在 TTL 内被固化成「一直坏」） |
| 时间戳取**拿到结果那一刻**（不是发起时刻） | 趋势要跑 3s，按发起记会导致刚回来就已过期（缓存永远不命中） |

`fresh=1` 在**所有读路由**上生效（`registerRead` 包装：先 `invalidate()` 再算）；客户端手动刷新 / 首读都带它。命中的返回是同一引用（不复制），调用方只读——上层 service 全是纯计算。

## 四、量级实测（2026-10-18，用户规模假设：10 工作区 × 每月 1000~5000 条）

fixture：10 个工作区，每个 `pool.json`（+ 分片）+ 按月 history 文件（真实造库，非估算）。

| 场景 | 现状 `/board`（首屏全卡） | 拆端点后首屏 | 趋势异步加载 |
|---|---|---|---|
| 10 万条（10×5000×2 月） | 2602ms | **374ms** | 1566ms |
| 20 万条（10×10000×2 月） | **4429ms** | **527ms** | **3013ms** |
| 65 万条（13 个月铺满） | 2962ms | 418ms | — |

**结论**：

1. 现状 `/board` 在 20 万量级 **4.4s 全屏卡死**，不可接受；
2. **拆端点**（首屏只读在办数据：pool.json + 分片 + git 身份，不碰 history）后首屏 **~500ms 且与 history 总量无关**——这不是优化，是把首屏与历史数据量**解耦**；
3. 趋势（`months=2`，8 周 + 余量，2 个文件/工作区）在 20 万量级 **3.0s**，异步加载 + 加载态，符合用户 10 秒标准；
4. `months 13→2` 在「按月文件」场景收益有限（文件本来就不多），真正受益是挂了多年的老库（13 文件 vs 2 文件）——仍应改，但它是次要项；
5. 趋势必须读 history 明细是设计使然：「周截止未结数」要判「创建 ≤ 周末且未结」，已结案的 close 时间只在 history 里（与在办的 created 合并），不是浪费。

## 五、性能优化路线（待拍板）

| # | 措施 | 首屏（20 万量级） | 风险 | 结论 |
|---|---|---|---|---|
| A | 拆端点：`/board` 只回在办快照+统计卡；趋势改 `/board/trend` 按需拉 | 4429ms → **527ms** | 响应结构变化；新旧版本错配要兜底（v0.0.15 黑屏教训） | **必做** |
| B | 缓存 TTL 1.5s + 单飞去重 + `fresh=1` 绕过 + 写路径 `invalidate()` | 重复访问 → ~0ms | 低 | 与 A 叠加 |
| C | 脚本聚合模式：`progress history` 直接按周回分组计数 | 趋势也变快 | **改 skill 独立分包 = 跨包契约** | ✅ 已落地（2026-10-29）：不是改 `history`，而是新增 `stats --trend <粒度>` —— 一次遍历回整段桶序列 + 已过本地月的本机缓存（`~/.taskledger/cache/trend/`，不进 git）。首页趋势图经 `/board/snapshot` 下发（`services/trend.service.ts` 只做跨工作区求和），**不单独开 `/board/trend`** |
| D | `RECENT_MONTHS 13 → 2`（首页趋势窗口） | 老库场景有效 | ⚠️ **会少算** | ❌ **否决**（2026-10-18 评审改口：`--months` 是文件级过滤，8 周桶在月初会横跨 3 个自然月，缩到 2 会静默漏掉更早文件里本月结案的记录 ⇒ 趋势与周期卡少算；保持 13） |

缓存实现口径（三条，无黑魔法）：①进程内 `Map`，key = `op:workspace:filter`，值 = 结果 + 时间戳；②命中且 1.5s 内直接返回不起进程，同 key 并发单飞；③`fresh=1` 绕过缓存，写路径成功后 `invalidate(workspaceId)`。

## 五点五、版本错配兜底（拆端点的必配项）

> **已不适用（2026-10-28）**：`/board` 全量端点、`/board/trend`、`/history`、`/filters`、`/task` 与写端点均已删除，client 只剩 `/board/snapshot` 与 `/workspaces` 两条请求。只剩一种组合需要注意：

| 组合 | 行为 |
|---|---|
| 新 client + 旧 host | 旧 host 仍注册 `/board/snapshot` ⇒ 正常；旧 host 多出来的端点没有 client 调用，无影响 |
| 旧 client + 新 host | 旧 client 若仍调 `/board/trend` 等已删端点 ⇒ 404，**不白屏**（旧 client 自身有兜底）；这是「只更一半」的唯一代价，升级到同一版本即消失 |

本轮**不再保留兼容端点**：用户 2026-10-28 明确要求「停用的该删全删，别污染逻辑」，兼容壳一律不留。

## 六、分期

| 期 | 内容 | 对外行为 |
|---|---|---|
| 1 | 目录重组 + IO 收敛 + 错误模型/降级 + 入口校验 | 完全等价，验收通过才算完 |
| 2 | 拆端点（A）+ 缓存（B）+ 前端降级标红 —— ✅ 已完成（4a / 4b / 步骤 5） | 新增行为 |
| 3 | 写路径 + invalidate | ⏸ 曾实现（`/claim`、`/release` 走 `ledger-write.service.ts`，`/close` 走会话交接），2026-10-28 随界面收敛**已整链路删除**；接回时按 skill 方法重写 |

## 七、影响面（重构必读）

- host 文件重组时，`dist/` 产物路径的下游引用要同步（原 smoke 的 5 处硬编码 `import('../dist/host/*.js')` 已随 smoke 删除移除）；
- 对外契约不许变：`list --json` = 任务号为键的对象；`history --json` = `{count,filters,records}`；（`--count-only` 已于 2026-10-29 删除，计数一律走 `stats --trend`）；错误人话文案守返回结构与文案；
- host 新文件 tsc 自动纳入（`tsconfig.json` include `src`）；client 禁止 import host；
- API 前缀两份副本：`host/routes.ts` 与 `client/api.ts` 各一份 `API_PREFIX`，改要同步；
- 文档同步：`ledger-data.md`（点名 runLedgerScript 处）、`architecture.md`、`code-conventions.md`、`board-home.md`、`external/dsh-workspace-registry.md`。
