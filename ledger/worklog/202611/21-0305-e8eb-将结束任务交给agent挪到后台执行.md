# 20261121-0305-e8eb-将结束任务交给agent挪到后台执行: 将结束任务交给Agent挪到后台执行

- **Tags**: 后台任务, 结案, Agent, 缺陷排查
- **Status**: doing · 2026-11-23 08:01:03 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
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
4. **locked 态底部按钮布局 — 2026-11-23 已按新口径改**：用户明确「执行时右边隐藏取消/交给 Agent，右边变成后台执行；停止了再还回来」。改法：`close-task-modal.ts` footer 在 `locked` 时右侧只渲染「后台执行」（`OverlayLockExempt` 包裹、primary），「取消」「确定」整组不渲染；左下只留「Agent 会话中」（查看会话）；终态 `closing` 解除 ⇒ `locked` false ⇒ 两颗提交钮自动还回来。旧的「左下新增后台执行 + 右侧禁用两颗」已删除。build/typecheck/verify-skill/verify-ui-wiring/codelint 全过，未提交。

## Next

1. 问题 1 再交真机验收：点「交给 Agent」后应看到黄色 Toast「此任务不属于 DeepSeek Harness 工作区」+ 复制提示词说明（非 DSH 工作区分支）；同时验证其他操作（复制任务号 / 设置保存等）的 Toast 全部恢复显示。核心单飞锁的 TypeError 也应不再出现。
2. 问题 4 已改（执行时右侧只留「后台执行」、终态还原），交真机验收；问题 2（双红框）待用户拍板再改；问题 3 已代码层修复，待真机验收。
3. 三个提示来源已查明并答用户：两红框=服务端 `session-job.store.ts:99,103` 的 toast.failure + notify.failure 两路（核心 coordinator `announce` 各发一次，即问题 2）；黄框=本仓 `board-home.ts:266` 的 onSettled 非 done warning。属问题 2 的红框待用户拍板。
4. 行「完成」按钮后台态文案：用户 2026-11-23 看真机图确认按钮形态对了，但文字不要「后台执行」、改「执行中」—— 新增 `executing` 键（中「执行中」/ 英「Running」，`locales.ts` 三处：`LocaleKey` + zh + en），`task-row.ts` 的 closing 文案由 `bgRun` 改 `executing`（`bgRun` 保留给结案弹窗那个「后台执行」按钮，两者语义不同）。verify/codelint 全过。
5. **核心需求（发何心，本仓不绕路）**：TaskBar 下拉 × Modal 层级 bug —— 用户真机点面板内「查看会话」，Modal 打开后 TaskBar 卡仍浮在 Modal 上。查实是核心 bug：token 阶梯 `--dshpc-z-popmenu`(970) > `--dshpc-z-modal`(940)（`src/design/tokens.css:262,267,273`），Modal 就地渲染（`src/ui/feedback/Modal.ts:107,147-159`，z 来自 `overlay.css:28-32`），TaskBar 面板走 `FloatingPortal` 挂 body（`src/adv/tasks/TaskBar.ts:448-456`，z 来自 `task-bar.css:45-48`）；核心只有 `locked` 广播（`src/ui/infra/overlay.ts:13-36`，Picker 订阅、TaskBar 未订阅），行按钮点击也不收面板（`TaskBar.ts:425-431`）。本仓未设任何 z-index、SessionViewModal 无改层级 prop，不背锅，也不用更高 z-index 硬压。建议给核心：加「浮层打开」广播（Modal 发、TaskBar 收 `setOpen(false)`）+ 行按钮点击即收面板。
6. **核心需求（发何心，本仓不绕路）**：核心 TaskBar 时间缺「渐进式披露」——`Elapsed`（`src/adv/tasks/TaskBar.ts:112-133`）无条件 `formatDurationHms` + `useNowMs` 每秒心跳（`src/ui/infra/ticker.ts:25`），运行中永远秒级跳；`relativePast`（`src/utils/date.ts:90-105`）已定义但零消费；`TaskBarProps`（`TaskBar.ts:38-76`）无时间粒度开关。请核心加 `timeMode?: 'elapsed'|'relative'|'auto'` + `coarseAfterMs?: number`（默认 elapsed 保持现状），并让 Elapsed 按经过时长切粗粒度；改完重建 dist。
5. 是否提交另等用户明确指令（未完成前不提交）。

## Process

- 2026-11-21：旧任务收尾并结案（v0.43.8 重构已交付 `67a4af9`），本任务接手 4 个真机 bug。
- 2026-11-21：只读调查三路（工作区判据 / 双通知 / 按钮布局）+ 交叉核对宿主源码，结论见 To Do 各项带 `文件:行号` 的证据；诊断日志为上一任务遗留、暂留待定位。
- 2026-11-21：问题 1 按用户「不要再来回问、专家组定成熟写法」的指令落地——组三方只读专家（架构师定分层 / 找现成范式借鉴 / 资深程序员列改动清单），三路结论一致推荐判定端点化（端点传 path 返布尔、复用 `resolveWorkspace`、后端权威判定不动、零侵入核心），无实质反对。方案：`host/routes.ts` 新增 `GET /workspace/can-host`（`resolveWorkspace(deps.registry, path)` 现算，空 path 自返 400——`registerRead` 的 catch 固定 500）；`/workspaces` 撤 isDsh 与诊断恢复清单、端点保留（无理由多删只读端点）；`client/api.ts` `canHostAgentSession(path)` 取代 `fetchWorkspaceDshFlags`；`client/task-row.ts` 改传当前行 `workspace.path` 判定；3 条诊断日志全清。build + typecheck + verify + codelint 全过（3 文件、六层通过），未提交。
- 2026-11-22：随 core v0.45.4 单飞对接，问题 3 代码层修复——核心按 `task.settledAt` 做 per-project notice watermark（解决 512 条 id 去重溢出后老通知重弹），服务端 `session-job.store.ts` 通知 id 注入 `randomUUID()` 宿主实例熵（跨重启全局唯一），并顺带修同 key `startedAt` 严格递增、`origin`/`panelId` 回显（后两项服务任务 2 的后台会话归属）。`package.json` core 0.44.0→0.45.4 + lockfile 同步、dist 重建；verify + codelint（9 文件六层）全过。问题 1/3 待真机验收、问题 2/4 待逐个过，未提交。
- 2026-11-23（第二批，用户四条需求）：① 后台「查看会话」一律改走本仓托管的**核心 SessionViewModal**（`board-home.ts` mountTaskUI 的 VIEW_SESSION_ACTION handler + 终态 Toast 按钮），不再 `openSession()` 外跳宿主；`showSessionView` 状态块从 effect 后提到 effect 前避免依赖数组 TDZ。② 截图文案「完成：xxx」自解释化：`session-job.store.ts` completionConfig 改「关闭任务 · xxx（已结案/失败）」，不再「已完成：完成：…」；行按钮 `rowButtons()` 加 `icon: common.base:AIdamoxing`（核心 TaskBar 支持 TaskButton.icon，已核实 `TaskBar.ts:413-434`）。③ 台账行「完成」按钮（`task-row.ts`）去掉 Tip hover 提示，`closing`（来自 SSE 基线、刷新可恢复）时文案换 `bgRun`「后台执行」+ 左侧 `Loader` 动图标，点击仍开同一个结案框。④ 时间秒一直走：查实**核心 v0.45.5 没有渐进式披露时间机制**，「披露」指进度文字翻牌（`TaskBar.ts:119-131`），时间是 `Elapsed` + `useNowMs` 每秒心跳无条件 `formatDurationHms`（`TaskBar.ts:112-133`、`ticker.ts:25`），无开关、`relativePast` 定义了但零消费。按用户「核心不支持就让核心支持、不走后门」落地为**核心需求**（见 Next），本仓未绕路。build/typecheck/verify-skill/verify-ui-wiring/codelint（14 文件六层）全过，未提交。
- 2026-11-23：用户真机点「停止会话」结束后弹 3 个提示并问来源 —— 查明：两红框「后台任务失败：完成：…」=服务端 `session-job.store.ts:99,103` 给作业配的 `toast.failure`+`notify.failure`，核心 `coordinator.ts:114-135` 结算时各发一次（即问题 2 的双红框，待用户拍板）；黄框「这轮跑完了，但任务没结」=本仓 `board-home.ts:266` 的 onSettled 非 done warning。同轮用户明确问题 4 新口径：执行时右侧隐藏取消/交给 Agent、换成「后台执行」，停止了再还回来 —— 已改 `close-task-modal.ts` footer：locked 时右侧只渲染后台执行（OverlayLockExempt+primary），左下只留 Agent 会话中，终态 locked 解除自动还原两颗提交钮；build/typecheck/verify/codelint 全过，未提交。
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
- 2026-11-23 06:54:04 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 查明3个提示来源：两红框=session-job.store.ts:99,103的toast.failure+notify.failure两路(核心coordinator各发一次,即问题2双红框)；黄框=board-home.ts:266的onSettled非done warning。按用户新口径改问题4：close-task-modal.ts locked时右侧只留后台执行(OverlayLockExempt+primary)、隐藏取消/提交，终态locked解除还原；左下只留Agent会话中。verify/codelint全过，未提交
- 2026-11-23 07:22:43 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 第二批四条：①后台查看会话改走核心SessionViewModal(board-home handler+终态Toast，showSessionView状态提到effect前避TDZ)；②completionConfig文案改关闭任务·xxx、rowButtons加icon common.base:AIdamoxing；③行完成按钮去Tip、closing时显示后台执行+Loader动图标(SSE基线刷新可恢复)；④时间秒一直走查实核心无渐进式披露机制，列为核心需求(timeMode+coarseAfterMs)未绕路。verify/codelint(14文件)全过，未提交
- 2026-11-23 07:34:53 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 行完成按钮后台态文案由后台执行改执行中(新增executing键中英双语，bgRun保留给结案弹窗)；TaskBar下拉盖住Modal查实是核心bug(popmenu970>modal940、Modal就地渲染、TaskBar走body portal且未订阅浮层关闭广播)，本仓不硬压z-index，列核心需求。verify/codelint(15文件)全过，未提交
- 2026-11-23 08:01:03 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 已提交f05ffe3并push。扫光渐进披露：查实核心Modal.notice→FlipText(sweep)是正式API且已打进产物，本仓接线本就正规；扫光消失真因是task-row.ts的notice只在busy时给、交给Agent后finally清busy且startTask无step流。正规修法：notice覆盖整个结案期(busy用step文案/closing用新closingNotice中英文案)，核心foot flex布局让notice贴左、按钮贴右共存。verify/codelint全过，未提交
