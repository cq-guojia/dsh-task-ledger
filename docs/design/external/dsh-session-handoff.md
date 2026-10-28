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

## 三、预置提示词模板（看板按钮用）

> **写入路径已定（2026-10-18，B 案按动作分流）**：认领 / 释放 / 移交由 host 代跑 `progress`（不开会话）；**只有「继续」和「结束」起会话**。本节只保留会话那两个模板。定案理由见 [`../architecture.md`](../architecture.md) 不变量 1。

### 会话创建的三条硬事实（落地必守）

| 事实 | 后果 |
|---|---|
| `agents.create` 不 mount preset ⇒ agent 落到「空的全局层」，只有根作用域的东西，**fs / bash 全无** | 必须在 `setup(agentCtx)` 里 `agentPresets.mount(agentCtx, presetId)`，并把 `presetId` 写进 `meta.agentPreset`；不挂 = 模型连 `progress` 都跑不了 |
| `agentOptions.provider/model` 缺省 **≠** 走宿主默认 | 用户不选模型时由插件读 `ctx.get('agentDefaultModel').currentSelection()` 补；补不到就报错，不建会话 |
| `meta.cwd` 只决定会话 cwd，**不会**自动归进工作区 | 建完要调该工作区实体的 `attachSession(sessionId)`，否则侧栏找不到这个会话 |

### 模板一：继续

> 用户准备继续任务「<title>」（任务号 <id>）。过程文档在 <工作区>/ledger/worklog/<path>，请读「下一步」一节接着做。

### 模板二：结束（带用户留言，已落地）

结构照用户 2026-10-18 口述：**预置说明在前，留言放最末**，三条硬约束缺一不可。

> 用户从任务台账看板点了「结束」，要把任务「<title>」（任务号 <id>）结案。
>
> 工作区：<工作区>
> 过程文档：<绝对路径>
>
> 请按顺序做完这三件，然后停下：
>
> 1. 读过程文档的「背景 / 待办 / 下一步」，核对这次到底做了什么、还留了什么坑。
> 2. 用 task-ledger skill 的脚本结案（在工作区目录下、原样执行这一条命令）：
>    `<SKILL_DIR>/scripts/progress close --id <id> --repo <工作区> --summary "<一句话说清做成了什么、留了什么坑>"`
>    `--summary` 是必填参数，不许编套话；命令报错就原样报告错误，不要自己绕过、不要手改台账文件。
> 3. 收尾即结束——这就是本条消息的全部要求。
>
> 【硬约束】
>
> - 不要在会话里继续派活，**不要新建会话或子 agent**：这是收尾动作，不是新任务的开始。
> - 用户已经明确要结束，不会再回答提问：信息不足就按留言与过程文档如实写进摘要/结论，**不要停下来反问**。
> - 只动这一个任务，不顺带改别的记录；写台账只经上面那个 skill 脚本（脚本绝对路径由插件在生成提示词时填好，不让模型猜）。
>
> 用户现在处理结束，以下是用户的留言：
> <用户留言，可空>

实现落点：~~`packages/plugin/src/host/services/session.service.ts::buildClosePrompt`~~ —— **该文件已于 2026-10-28 删除**（`/close` 端点与客户端 `requestClose` 一并移除，「结束任务」按钮当前不接）。本节保留的是**宿主 API 事实与提示词模板**，接回时按此重写，落点文件需重新创建。

## 四、复核方式（宿主升级后）

```bash
npm view @deepseek-ai/dsh-api-session-controller dist-tags --json   # 取与宿主一致版本
cd /tmp && npm pack @deepseek-ai/dsh-api-session-controller@<版本> @deepseek-ai/dsh-client-ui-workspace@<版本> && tar xzf *.tgz
# 看三处：ISessions 是否新增 send/submit 类方法（contract/sessions.d.ts）
#         agents.create 签名是否变（若解包可得）
#         uiWorkspace.openSession 是否仍在（lib/client.js）
```
