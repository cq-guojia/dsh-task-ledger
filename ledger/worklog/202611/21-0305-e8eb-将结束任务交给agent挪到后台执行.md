# 20261121-0305-e8eb-将结束任务交给agent挪到后台执行: 将结束任务交给Agent挪到后台执行

- **Tags**: 后台任务, 结案, Agent, 缺陷排查
- **Status**: doing · 2026-11-22 15:53:37 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **Created**: 2026-11-21 03:05:31 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

接续任务 `20261117-0231-8027-慢操作改后台执行并通知`（已结案）。那个任务把 P0「结案交给 Agent 挪到后台」按核心 v0.43.8 全量重构落地并提交（`67a4af9`）：服务端 `TaskStreamSource` 三流 + `serveTaskStream`/`serveTaskSubmit`，客户端 `connectTaskCenter`/`startTask`/`TaskBar`/`mountTaskUI`，旧 API 零残留。用户 2026-11-21 真机验收时暴露 4 个显示/判定 bug，明确要求单开一个任务「专门实现『将结束任务交给 Agent 挪到后台执行』的方法，并调试各种问题和 bug」，并强调「一个一个说清楚原因、一个一个过，不要一片给我打」「在找到确定的错误和合理的、成熟的解决方案之前不能动手」。

用户交互口径（本轮重申，不得偏离）：点「交给 Agent」后任务进后台，弹窗留在原处照常显示并锁定；只在原按钮位**替换**（不是新增）出「后台执行」；点它只关窗，不自动拉会话；要再看会话自己从后台任务的「查看会话」进入。用户明确否定「另加一个按钮到左边」。

## To Do

真机暴露的 4 个问题，**逐个定位、逐个报方案、用户确认后才改**：

1. **工作区判据 `isDsh` 时好时坏 — 端点已修，真机暴露「提示不显示」并根治，待再验收**：同一任务 `C.dsh-plugin-core`（`ledgerPath=/code/dsh-plugins/dsh-plugin-core`）点「交给 Agent」，有时 `hit:true` 能提交，有时 `hit:false` 弹「此任务不属于 DeepSeek Harness 工作区」。根因：前端 `fetchWorkspaceDshFlags` 拉 `/workspaces` 整表建 Map，与 `/board/snapshot` 是两次独立的 `readDirs()`+`registry.list()` 快照，两个快照对不上（用户明确判据按目录路径、不按名字/ID；前端判一次+后端判一次的分层保留）。修法（判定端点化）：host 新增 `GET /workspace/can-host?path=...`，用同一个 `resolveWorkspace` 现算返回 `{dsh}`；client `canHostAgentSession(path)` 取代建表；`/workspaces` 恢复只返回目录清单；3 条 `[ledger-ws-diag]` 临时日志全撤。**2026-11-22 真机新发现**：端点正常返 `{"dsh":false}`，但警告 Toast 完全不显示、只见 busy loading 闪一下。根因=本仓 27 处 `notify()` 全是死投递——核心 notify 只 push 到模块级 toast-queue，必须消费方 `mountToasts()` 建 Toaster+订阅渲染，本仓从未调用（全仓 0 处）。按用户「不要补丁、该重构就重构」定性为 UI 接线体系缺失，非端点问题。已做根治（见 Process 与 Conclusion）。
2. **一次失败结算弹两个红框**：文案 `失败：{title}`（session-job.store.ts:94 `toast.failure`）与 `后台任务失败：{title}`（:98 `notify.failure`，scope=all/broadcast=plugin）。核心 `coordinator.ts:116/125` 各弹一张。触发场景：点「执行」后立刻停会话 → agent 15s 未进 running → failed「会话没有起跑」（session.service.ts:318-323）。
3. **新标签页重弹已读通知 — 已代码层修复，待真机验收**：服务端 outbox 对每个新订阅全量回放 10 分钟内 notice（session-job.store.ts:126/300-313），客户端去重键 `dshpc:task-notices:seen` 在 sessionStorage、每标签独立（核心 api.ts:32-57），新标签 seen 为空即重弹。本轮随 core v0.45.4 对接修复两处：核心按 `task.settledAt` 做 per-project notice watermark（id 去重 512 条溢出后老通知不再重弹），服务端 notice id 注入宿主实例熵（跨重启全局唯一，重启后 seq 归零也不会复用旧 id）。待真机验收。
4. **locked 态左下新增按钮**：`close-task-modal.ts:103-142` 用 `marginRight:auto` 把「后台执行」(:120-123)+「Agent 会话中」(:127-140，脉动 Loader，即用户说的"执行中")推到左下新增；右侧「取消」+「确定」(:143-175) 在 locked 时禁用。用户要求**不新增**，改为替换右侧某一个/两个按钮。源码注释 :42/:49 声称这两颗是 11-04/11-17 用户要求加的，与本次口径冲突，以本次为准。

## Next

1. 问题 1 再交真机验收：点「交给 Agent」后应看到黄色 Toast「此任务不属于 DeepSeek Harness 工作区」+ 复制提示词说明（非 DSH 工作区分支）；同时验证其他操作（复制任务号 / 设置保存等）的 Toast 全部恢复显示。核心单飞锁的 TypeError 也应不再出现。
2. 问题 2/4 按用户要求逐个过，一次只讲一个，用户拍板再改；问题 3 已代码层修复（见上），待真机验收。
3. 是否提交另等用户明确指令（未完成前不提交）。

## Process

- 2026-11-21：旧任务收尾并结案（v0.43.8 重构已交付 `67a4af9`），本任务接手 4 个真机 bug。
- 2026-11-21：只读调查三路（工作区判据 / 双通知 / 按钮布局）+ 交叉核对宿主源码，结论见 To Do 各项带 `文件:行号` 的证据；诊断日志为上一任务遗留、暂留待定位。
- 2026-11-21：问题 1 按用户「不要再来回问、专家组定成熟写法」的指令落地——组三方只读专家（架构师定分层 / 找现成范式借鉴 / 资深程序员列改动清单），三路结论一致推荐判定端点化（端点传 path 返布尔、复用 `resolveWorkspace`、后端权威判定不动、零侵入核心），无实质反对。方案：`host/routes.ts` 新增 `GET /workspace/can-host`（`resolveWorkspace(deps.registry, path)` 现算，空 path 自返 400——`registerRead` 的 catch 固定 500）；`/workspaces` 撤 isDsh 与诊断恢复清单、端点保留（无理由多删只读端点）；`client/api.ts` `canHostAgentSession(path)` 取代 `fetchWorkspaceDshFlags`；`client/task-row.ts` 改传当前行 `workspace.path` 判定；3 条诊断日志全清。build + typecheck + verify + codelint 全过（3 文件、六层通过），未提交。
- 2026-11-22：随 core v0.45.4 单飞对接，问题 3 代码层修复——核心按 `task.settledAt` 做 per-project notice watermark（解决 512 条 id 去重溢出后老通知重弹），服务端 `session-job.store.ts` 通知 id 注入 `randomUUID()` 宿主实例熵（跨重启全局唯一），并顺带修同 key `startedAt` 严格递增、`origin`/`panelId` 回显（后两项服务任务 2 的后台会话归属）。`package.json` core 0.44.0→0.45.4 + lockfile 同步、dist 重建；verify + codelint（9 文件六层）全过。问题 1/3 待真机验收、问题 2/4 待逐个过，未提交。
- 2026-11-22：问题 1 真机发现「点交给 Agent 只闪一下、无任何提示」。实测 `/workspace/can-host` 正常返 200 `{"dsh":false}`，分支逻辑对；根因是全仓 27 处 `notify()` 死投递——核心 notify 只 push 到模块级 toast-queue，消费方从未调 `mountToasts()` 建 Toaster+订阅（全仓 0 处），本地死投递核心无告警。用户明确「不要补丁、该重构就重构」，拒绝在 apply 里加一行的补丁做法。独立架构专家评审后按修正方案根治：新增 `client/ui-init.ts` 统一初始化入口（setTooltipRenderer → connectToasts → mountToasts → setDefaultTaskProject(TASK_PROJECT) → ensureUiBase，幂等 + Symbol 探测自检），`ui.ts` 移除顶层 setTooltipRenderer 副作用、补 showToast 出口，`index.ts:apply` 开头调 `initClientUi()`，`scripts/verify-ui-wiring.mjs` 构建期静态检查（有契约子路径直引 / notify 导入来源 / apply 调用 / 四件接线），纳入 verify。自检不用 `isNotifyBridgeConnected`（核心未导出、且是广播路径假阳性）也不用 DOM 探测（容器懒建），用 `Symbol.for('dsh-plugin-core/toast-host')`。build/typecheck/verify-skill/verify-ui-wiring/codelint（12 文件六层）全过，未提交。

## Conclusion

- 已完成：问题 1 判定端点化 + Toast 死投递根治（27 处 notify 现在有渲染端；UI 接线统一到 `ui-init.ts` + 构建期自检，不再是补丁）；诊断日志撤净；旧任务结案、新任务认领。问题 3 代码层修复（notice watermark + id 实例熵，随 core v0.45.4 对接）。
- 未完成：问题 1/3 待真机验收（这次重点看 Toast 是否恢复）；问题 2（双红框）/4（locked 新增按钮）待逐个报方案并改；未提交。

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261121-0305-e8eb-将结束任务交给agent挪到后台执行 --note "...". -->
- 2026-11-21 03:05:31 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · created and claimed
- 2026-11-21 03:06:04 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 接任务并写全背景与 4 个真机 bug（工作区判据时好时坏、双红框、新标签重弹、locked 新增按钮）；逐个定位逐个报，未动产品代码
- 2026-11-21 03:37:12 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 问题1判定端点化修复：新增 GET /workspace/can-host 现算 resolveWorkspace，client 改 canHostAgentSession(path)，撤 /workspaces isDsh 与 3 条诊断日志；build/verify/typecheck/codelint 全过，待真机验收
- 2026-11-21 03:38:46 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 专家组三路结论一致确认判定端点化；按 impl 指出的坑补读端点空 path 自返 400（registerRead catch 固定 500），verify+codelint 复验全过，未提交
- 2026-11-22 14:20:56 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 随 core v0.45.4 对接修复问题3：notice watermark + id 注入 randomUUID 实例熵(session-job.store.ts)，顺带修 startedAt 严格递增与 origin/panelId 回显；verify+codelint 全过；问题1/3待真机验收、2/4待逐个过，未提交
- 2026-11-22 15:53:37 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 问题1真机提示不显示根治：全仓27处notify死投递(核心notify只入队、本仓从未mountToasts)；按用户不要补丁口径经独立专家评审后重构——新增client/ui-init.ts统一接线(Toaster/bridge/默认分组/Tooltip/样式+Symbol探测自检)、ui.ts收口出口、apply开头初始化、verify-ui-wiring.mjs构建期自检；build/typecheck/verify/codelint全过，待真机验收，未提交
