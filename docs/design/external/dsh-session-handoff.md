# 宿主会话交接 API：把任务交给大模型的可行链路

> **类型**：🌐 **外部事实** —— 记的是宿主（DSH）能给什么，不是本项目的设计
> **适用版本**：`@deepseek-ai/dsh-api-session-controller` / `dsh-client-ui-conversation` / `dsh-client-ui-workspace` @0.2.0-rc.2 线（宿主版本线；个别坐标标注 0.1.7-rc.2，已逐条注明）
> **状态**：✅ 已核实（2026-10-16 深夜：官方包 `npm pack` 解包读 `lib/*.js` + 参考插件源码交叉验证；未能读到实现本体的标 **UNVERIFIED**）
> **来源**：解包产物 `lib/types/**`；参考实现 `cq-guojia/dsh-task-dispatch-table` `src/dispatch.ts` / `src/client/index.ts` / `src/client/session-view.ts`

## 一、结论

**浏览器半（client）没有「往会话里发自由文本」的官方 API。** 把任务交给大模型的唯一已验证链路 = **host 半 `ctx.agents.create()` 起会话并 `agent.send()` 发预置提示词**，浏览器再 `uiWorkspace.openSession` 跳过去。这与参考插件「立即执行」按钮同构。

## 二、逐条事实与出处

| API | 半侧 | 事实 | 出处 |
|---|---|---|---|
| `sessions.binding(id)` | client | 只查已物化 scope，**从不创建** | `dsh-api-session-controller` `lib/client.js:3406`（0.1.7-rc.2） |
| `sessions.retain(target, {source, signal?})` | client | 物化 scope 的正解（内部触发 `manager.get(id).open()`） | 同上 `:3409` → `:3472` |
| `sessions.fork({sessionId, atSeq?, increaseTitle?})` | client | 开分支；省略 `atSeq` = 最新已完成 turn 前缀；失败抛 `SessionForkError` | `contract/sessions.d.ts:124`；`lib/client.js:3343` |
| `uiWorkspace.openSession(id)` | client | 官方导航：自己 `retain('mainView')` + `selection.set` + `selectPanel(null)`；插件**不得**自己 retain `mainView` | `dsh-client-ui-workspace` `lib/client.js:819` → `:968-991` |
| `layout.selectPanel(id \| null)` | client | 切主面板 / 回会话；未注册 id 抛错且保持当前选择 | `dsh-client-ui-layout` `lib/types/client/service.d.ts:17-32` |
| `remote.commands.execute(sessionId, line, args)` | client | **只能发斜杠命令**：host 侧 `parseCommand()` 正则 `^\/[a-z][a-z0-9_-]*`，不带斜杠静默无反应 | 调用例 `dsh-session-title-pattern/lib/client.js:1105`；装配 `dsh-api-remotes/lib/client.js`（**UNVERIFIED** 精确行号） |
| `ctx.agents.create(...)` | host | 自建会话并驱动模型（自带 `sessions.prepare + enter + announce`）；**禁止**预建会话再驱动（撞 `already exists`） | 参考实证 `dispatch.ts:519-548`；签名 `host.ts:105-120` |
| `agent.send(message, target: 'next-turn'\|'next-step', wakeup)` | host | 往会话发 user message | `dispatch.ts:627-634`；类型 `@deepseek-ai/dsh-agent` `runtime-types.d.ts`（**UNVERIFIED** 行号） |
| `agent.inject(message)` | host | 排进最近 pre-step，**不唤醒 driver** | `@deepseek-ai/dsh-agent` `lib/types/runtime-types.d.ts:203-209`（**UNVERIFIED**） |
| `goals.create(agent, {objective, maxGoalRounds?})` | host | 持久目标 + 自动续跑轮 | `@deepseek-ai/dsh-goal` `lib/types/index.d.ts:54`（**UNVERIFIED**） |
| `ctx.attachments.saveFile({data, name?})` | host | 存附件，`FileAttachmentRef = {attachmentId, name, bytes}`（**无路径**）；发模型前被 `projectFilesToText` 换成一行文字 | `dsh-attachment` `lib/types/types.d.ts:34-41`；`dsh-llm` `lib/types/content.js:107-135`（**UNVERIFIED**） |
| 会话启动注入口 | — | **无 system prompt 参数**：`SessionCreateRequest = {workspaceId?, cwd?, sessionId?, agentPreset?}`；`AgentOptions` 仅 `provider/model/reasoningEffort/maxTokens`。预置指令的可行位 = 首条 user message / agent preset 的 prompt sections / `AGENTS.md` 发现链（root→cwd） | `dsh-api-session-controller` `lib/types/types.d.ts:279`；`dsh-agent` `runtime-types.d.ts:21-30`（**UNVERIFIED**） |

社区插件（`lovvvve/dsh-quick-actions` 一键发送预置文本、`sanqiPanax/dsh-sticker-board` 点击即发 prompt）实现了「浏览器半直发自由文本」，但其依赖的宿主 API **本地未验证**，本插件不押注其上。

## 三、预置提示词模板（看板按钮用；措辞与写入路径绑定）

> ⚠️ **写入路径待定**（architecture.md 不变量 1，2026-10-16 深夜挂起）：混合制（B）下 host 先代跑 claim / set / close，模板只作通知、移交与放弃不起会话；全会话制（A）下五个按钮全部起会话，认领 / 移交 / 放弃也各需模板、由模型自行执行对应 skill 命令。拍板后按定稿措辞收紧本节；当前两案并列。

1. **认领并开始** —— B 案（host 已 claim，通知式）：
   > 用户已认领任务「<title>」（任务号 <id>）。任务台账过程文档在 <工作区>/ledger/worklog/<path>。请先完整阅读该文档的「背景 / 待办 / 下一步」三节，然后开始执行；执行中按 skill 规范更新过程文档。

   A 案（模型自行认领，指令式）：
   > 用户通过任务台账看板点击「认领并开始」。任务「<title>」（任务号 <id>），工作区 <工作区>，过程文档在 ledger/worklog/<path>。请先用 task-ledger skill 认领该任务，再完整阅读过程文档的「背景 / 待办 / 下一步」开始执行；执行中按 skill 规范更新过程文档。
2. **继续**（两案相同）：
   > 用户准备继续任务「<title>」（任务号 <id>）。过程文档在 <工作区>/ledger/worklog/<path>，请读「下一步」一节接着做。
3. **结束任务**（两案相同）：
   > 用户指示结案任务「<title>」（任务号 <id>）。请核对过程文档：待办是否全部完成、结论是否可写。**若信息不足或有未完成项，停下来询问用户，不要自行 close**；确认无误后执行 close 并写好摘要。
4. **移交**（A 案；B 案不起会话、无模板）：
   > 用户通过任务台账看板请求把任务「<title>」（任务号 <id>）移交给 <新 owner>。请用 task-ledger skill 执行移交（set --owner），并在过程文档记一笔。
5. **放弃**（A 案；B 案不起会话、无模板）：
   > 用户通过任务台账看板确认放弃任务「<title>」（任务号 <id>）（原因：<用户填写，可空>）。请用 task-ledger skill 结案（close），摘要写明「放弃」及原因，不要做其他改动。

## 四、复核方式（宿主升级后）

```bash
npm view @deepseek-ai/dsh-api-session-controller dist-tags --json   # 取与宿主一致版本
cd /tmp && npm pack @deepseek-ai/dsh-api-session-controller@<版本> @deepseek-ai/dsh-client-ui-workspace@<版本> && tar xzf *.tgz
# 看三处：ISessions 是否新增 send/submit 类方法（contract/sessions.d.ts）
#         agents.create 签名是否变（若解包可得）
#         uiWorkspace.openSession 是否仍在（lib/client.js）
```
