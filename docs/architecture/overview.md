# 架构总览

一个 DSH（DeepSeek Harness）插件，把 `task-ledger` skill 变成：装插件即把该 skill 注册进宿主全局；提供台账管理 UI（在办、历史、统计）；skill 本身也可脱离宿主单独安装给其他 agent 用。

## 一、单仓双包

仓库根是 private workspace 根，不发布。两个包独立 semver：

| 包 | 内容 | 发布触发 |
|---|---|---|
| `dsh-task-ledger`（`packages/plugin/`） | host 半（skill 注册 + webServer 路由 + 跨工作区读台账）、client 半（侧栏条目 + 主面板）、`cordis.patch.yml`；`dist/` 入仓 | tag `plugin-v*` |
| `task-ledger`（`packages/skill/`） | `SKILL.md`、`scripts/progress` 入口 shim、`scripts/bin/ledger-<os>-<arch>` 静态二进制、`src/`（Go 实现）、assets、references | tag `skill-v*` |

skill 内容唯一真源在 `packages/skill/`；插件构建时只把运行时那几项拷入 `packages/plugin/skill/`，Go 源码不进副本。宿主接口事实见 [dependencies/](../dependencies/)。

## 二、运行链路

### 2.1 一次读

```
各工作区 ledger/ 文件
  │ host 经内嵌 skill 脚本（Go 二进制子进程）只读
  ▼
host：routes → services（纯计算）→ repositories（唯一知道台账怎么读）
  │ 机器级清单 ~/.taskledger/ledgers.json 决定读哪些目录
  ▼ HTTP（Desktop 走 IPC bridge）
client：侧栏条目 + 主面板（在办 / 历史 / 设置三段滑轨）
```

入口是 `sidebar.panellist` 侧栏条目 + `main` 整页，没有 `shell.overlay` 浮标。读路由清单见 [host-data-plane.md](host-data-plane.md)。

### 2.2 一次写

外壳 `shell.Main`（解析参数 + 定位工作区 + 整命令同步锁）→ `shell.Run`（建记账本、挂中断处理）→ `shell.runCommand`，七步固定：

```
绑记账本 → 取最新 → 自举 → 调业务函数 → 打印 → 提交 → 推送
```

git 只在命令的前后两端，业务中间不碰 git。推送被拒会触发 `rebase --autostash`，冲突时脚本直接写盘合并结果；若这发生在业务函数中间，业务手里的改前快照会在下一次整份写回时抹掉别人刚合进来的内容，且这类写走 `track=false`，连「已改未提交」都不登记。

七步内部（跳过条件是分组而非逐条判）：只读命令跳「取最新 / 自举 / 提交 / 推送」；`--no-sync` 只跳刷盘与提交推送，**锁集照算**；`already_done` 不跳提交推送，要不要提交只看记账本。逐方法签名见 [ledger-api.md](../api/ledger-api.md)。

### 2.3 一次后台作业（「继续」/「完成」/三个写动作）

```
点击（任务行 / 历史行）
  │ ① 继续：POST /task/session/start  { workspace, id, policy:"resume", title, prompt }
  │    └ createSession() 起会话，不登记作业
  │ ② 后台作业：startTask({ key, kind, title, args }) → POST /task-center/submit
  │    ├ close-agent   → host/services/session.service.ts
  │    │                 claim → 建会话 → jobs.register → 订阅 session/event → whenIdle 核对台账 → settle
  │    └ 其余五种写动作 → host/services/write-job.service.ts（direct-close 是它的薄封装）
  │                       claim → jobs.register → host spawn skill 读 #step 五阶段 → settle
  │       kind / key：
  │         close-direct   close:<任务号>          close
  │         release        release:<任务号>        set --release
  │         cancel         cancel:<任务号>         close --cancel（带理由）
  │         delete         delete:<任务号>         delete（带留言）
  │         delete-hist    delete-hist:<src>:<行号> delete --src --line --expect（带指纹）
  ▼ 状态面：核心任务中心（/task-center/stream SSE 三流 + /task-center/submit POST）
host/services/session-job.store.ts  ← TaskStreamSource 实现（snapshot/subscribe/subscribeNotices，进程内）
  ├ reportProgress(key, message)   唯一披露写入口，仅 running 接受、updatedAt 严格递增
  └ settle(key, state, progress)   终态漏斗：写结论 → 推通知 → 归档会话（有 sessionId 才归）
  ▼ 页面：connectTaskCenter 接流、TaskBar 渲染；mountTaskUI 注册按钮 handler 与终态收尾（刷新看板）
```

判重（同一条任务已在跑）在服务端 `jobs.claim(key)` 的原子占位上（先于任何 `await`）。
key 每个动作独立：结案两种模式共用 `close:<任务号>`（同一任务互斥），释放 / 取消 / 删除
各用各的前缀，不同动作可并行、同一动作同一任务不会双跑；历史行删除按 src + 行号定位，
不是「在办任务」对象。submit 按 kind 显式分派执行者，并在提交期完成历史删除参数校验
（`host/services/task-action-params.ts`，与旧 `/task/action` 共用一套规则）。跨刷新、跨标签页
判重成立。终态通知带全局唯一 id、按 id 持久去重，状态可任意重放而不重弹。

并发写由 skill 自己的整命令锁串行（最多等 120 秒，等不到报「请稍后重试」），插件只做 UI
禁用防连点，不另加服务端互斥；超时由宿主 spawn 的 240 秒硬超时兜底。单个 git 操作上限 60 秒。

## 三、关键不变量

1. **台账写路径只经脚本**：写台账只经 `packages/skill/scripts/progress`（Go 二进制），插件与 host 都不手改台账 JSON / history / worklog。「host 直写」= host 代跑同一个脚本。
2. **提交只在脚本外壳，业务中间零 git**：取最新 / 提交 / 推送三件事只许放在外壳，不许下放到业务层。
3. **两级锁不混用**：整条命令级 `store.SyncLock`（锁文件放 git 公共目录，非 git 仓库落系统临时目录按路径哈希；100ms 轮询、最多等 120 秒）；单文件级 `store.ProgressLock`（阻塞无超时、不重入，按绝对路径哈希在系统临时目录开 `<hash>.lock`；linux/darwin 走 flock、Windows 走 LockFileEx，其余平台只为能编译、不加锁）。只有只读命令不拿整命令级锁；`--no-sync` 的写命令照拿。
4. **失败收尾只有两套**：`RollbackPresync()` 恢复「写前取最新」覆盖掉的内容，`DiscardCreated()` 删本次新建的文件，成功路径统一 `Clear()`；`CommitStarted` 之后一律不回滚。业务动作自己写坏了走 `store.Snapshot` / `store.Restore`，只还原本次动作碰过的文件，不是 journal。
5. **唯一一个不回滚的失败分支**：下游读走人（broken pipe）。`shell.IgnoreSIGPIPE()` 让写 stdout 失败变成错误返回，进程继续走完暂存与提交；本次已写过文件就必须提交，否则台账停在「已写未提交」，下一条写命令会被写前 guard 拦死。
6. **原子性 = 单文件原子写 + 固定写序 + 重跑幂等**，不引入 journal / recover。单文件写走全仓唯一出口 `store.WriteTextAtomic`：临时文件 → write → fsync(file) → chmod → rename → fsync(父目录)。多文件先写目标、后删源，删永远是最后一步。
7. **写前 guard 会硬拦**：本地台账有未提交改动 / 有未推送的台账提交 / 有未入库的同名文件 / 处于 rebase 中间态 ⇒ 中止并说明怎么处理。detached HEAD 或无上游时只做本地提交并在 stderr 提示。worklog 里人写的改动先 stash、刷完再叠回。
8. **开关只有两组**：动作是否只读由 `packages/skill/src/internal/actions/registry.go` 的 `ActionSpec.ReadOnly` 决定；`--no-sync` / `TASK_LEDGER_NO_SYNC` 只控制不碰 git。
9. **skill 内容单一真源**：内嵌副本是入库产物，改完源重跑 `npm run build` 再提交即可保持一致。
10. **宿主接口一律查已核实事实**：见 [dependencies/](../dependencies/)，不得凭方法名猜签名。
11. **dist 入仓**：git 直装不跑构建脚本，推送前必须 build（含 typecheck）。
12. **明暗主题只认宿主**：`body[data-ds-dark-theme]`，禁用 `prefers-color-scheme`。
13. **路由自持鉴权**：宿主 webServer 无 server-wide auth（默认回环绑定）；若部署暴露非回环地址，闸门必须由插件路由方自持。
14. **起会话只有一条链路**：`host/services/session.service.ts` 的 `createSession()` 是唯一实现；「继续」与「完成」只差 `policy` 一个字段。页面里出现 `sessions.create` / `agents.create` 即违规。
15. **会话作业的状态在宿主**：`host/services/session-job.store.ts` 是核心 `TaskStreamSource` 的本仓实现、唯一真源；宿主 `serveTaskStream`（SSE 三流）+ `serveTaskSubmit`（POST）对外，客户端 `connectTaskCenter` / `mountTaskUI` 接线。页面只渲染记录、注册按钮 handler 与终态收尾，**不判终态、不设超时兜底、不做本地判重**。
16. **作业寿命 = 执行者寿命**：作业记录只在宿主进程内存里，宿主重启即消失（会话必然已断）。不落盘、不做跨重启恢复 —— 落盘等于要求「恢复一个已经死掉的会话」。
17. **归档在服务端终态漏斗**：宿主 `workspaceRegistry.archiveSession(sessionId, {stopActivity:true})` 由入口注入 `session-job.store.ts` 的 `settle()`，done / failed / 超时一律归档（失败也归档留给用户查看），没有 sessionId 的直接结案作业自然跳过；客户端 `onSettled` 只刷新看板、不订阅归档、不分成败。归档失败只 warn，不改作业结论。签名见 [dependencies/dsh-workspace-registry.md](../dependencies/dsh-workspace-registry.md)。
18. **披露只有一个源**：`TaskRecord.progress.message` 是唯一的阶段披露源，由 `session-job.store.ts` 的 `reportProgress` 单点写入，弹窗 `notice` 与 TaskBar 都读它。Agent 结案把 `session/event` 的 `step/start` 当「正在处理」作业级节点，文案不带模型轮次 / 步数；直接结案由宿主跑 skill、逐行读 `#step` 的五阶段（check / sync / write / commit / push）。不落中转文件、不轮询、不消耗客户端资源；文案随 `startTask.args.progressTexts` 由客户端按界面语言透传，宿主不写死中文。
19. **终态披露由核心收口**：成功 / 失败标签出现后，披露文字连扫光一起退场（`progress` 数据仍在 store 里供 handler / selector 读）；核心负责终态呈现，本仓不自行绘制标签、不硬压 z-index。
20. **写动作后台化只留一份执行体**：释放 / 取消 / 删除 / 历史行删除 / 直接结案共用 `host/services/write-job.service.ts`，只有 agent 结案是另一条路径；每项动作独立 key、终态文案由客户端透传，宿主不产出界面中文。认领与「继续」保持同步链路，`POST /task/action` 的 NDJSON 流为它们保留。
21. **终态成功与失败都需要人话后缀**：核心 toast 只显示结构化标题、不显示 `TaskRecord.reason`，失败原因写进客户端透传的 `completionTexts.failure`（如「释放失败，请稍后重试」）；历史行删除只在成功终态才动本地数据，失败保持原行。

## 四、入口与主题

浮标入口 `shell.overlay` 未落码；当前只有侧栏条目与整页面板。样式硬约束见 [ui-style.md](../development/ui-style.md)。

## 更新日志

- 2026-11-07 23:03:03：按 koc-code-docwriter 槽位迁移，剔除过程稿并统一标题头
- 2026-11-10 22:37:28：源码路径补全为仓库内完整路径
- 2026-11-25 17:29:30：补两条结案路径、单一 progress 披露源、终态呈现由核心收口
- 2026-11-25 21:52:19：补五类写动作共用执行体、独立 key、参数校验与人话终态文案
- 2026-11-25 22:49:31：三档超时翻倍：git 60 秒、锁等待 120 秒、宿主 240 秒
