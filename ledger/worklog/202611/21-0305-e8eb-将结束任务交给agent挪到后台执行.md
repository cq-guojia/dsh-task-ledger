# 20261121-0305-e8eb-将结束任务交给agent挪到后台执行: 将结束任务交给Agent挪到后台执行

- **Tags**: 后台任务, 结案, Agent, 缺陷排查
- **Status**: doing · 2026-11-21 03:06:04 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
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

1. **工作区判据 `isDsh` 时好时坏**：同一任务 `C.dsh-plugin-core`（`ledgerPath=/code/dsh-plugins/dsh-plugin-core`）点「交给 Agent」，有时 `hit:true` 能提交，有时 `hit:false` 弹「此任务不属于 DeepSeek Harness 工作区」。浏览器日志：第一次 `hit:false`（table 10 项），第二次 `hit:true`；`/workspaces payload` = `workspaces:10` / `registryPaths:5`（两次都只截了长度，未展开内容）。用户否认可按名字/ID 判，要求按目录路径判。已加 3 条 `[ledger-ws-diag]` 临时诊断日志（client 2、host 1，host 把 registryPaths 随响应下发），已 build 进 dist，**未提交**。
2. **一次失败结算弹两个红框**：文案 `失败：{title}`（session-job.store.ts:94 `toast.failure`）与 `后台任务失败：{title}`（:98 `notify.failure`，scope=all/broadcast=plugin）。核心 `coordinator.ts:116/125` 各弹一张。触发场景：点「执行」后立刻停会话 → agent 15s 未进 running → failed「会话没有起跑」（session.service.ts:318-323）。
3. **新标签页重弹已读通知**：服务端 outbox 对每个新订阅全量回放 10 分钟内 notice（session-job.store.ts:126/300-313），客户端去重键 `dshpc:task-notices:seen` 在 sessionStorage、每标签独立（核心 api.ts:32-57），新标签 seen 为空即重弹。
4. **locked 态左下新增按钮**：`close-task-modal.ts:103-142` 用 `marginRight:auto` 把「后台执行」(:120-123)+「Agent 会话中」(:127-140，脉动 Loader，即用户说的"执行中")推到左下新增；右侧「取消」+「确定」(:143-175) 在 locked 时禁用。用户要求**不新增**，改为替换右侧某一个/两个按钮。源码注释 :42/:49 声称这两颗是 11-04/11-17 用户要求加的，与本次口径冲突，以本次为准。

## Next

1. 先报问题 1 的根因/为什么/方案（键恒等已证；待命中的 payload 展开定论是 registry 当刻内容变动还是清单读写时序），用户确认后再动。
2. 问题 2/3/4 按用户要求逐个过，一次只讲一个，用户拍板再改。
3. 全部改完后撤掉 `[ledger-ws-diag]` 临时日志，build/verify/typecheck/codelint 全过，再交用户验收；是否提交另等用户明确指令。

## Process

- 2026-11-21：旧任务收尾并结案（v0.43.8 重构已交付 `67a4af9`），本任务接手 4 个真机 bug。
- 2026-11-21：只读调查三路（工作区判据 / 双通知 / 按钮布局）+ 交叉核对宿主源码，结论见 To Do 各项带 `文件:行号` 的证据；未改任何产品代码，诊断日志为上一任务遗留、暂留待定位。

## Conclusion

- 已完成：4 个问题的现象、代码位置与初步根因已定位并落档；旧任务已结案，本任务已认领。
- 未完成：4 个问题逐个报方案等用户确认；诊断日志未撤；产品代码未改。

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261121-0305-e8eb-将结束任务交给agent挪到后台执行 --note "...". -->
- 2026-11-21 03:05:31 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · created and claimed
- 2026-11-21 03:06:04 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 接任务并写全背景与 4 个真机 bug（工作区判据时好时坏、双红框、新标签重弹、locked 新增按钮）；逐个定位逐个报，未动产品代码
