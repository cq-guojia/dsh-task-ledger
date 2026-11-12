# 宿主会话交接 API：把任务交给大模型的可行链路

| 项 | 值 |
|---|---|
| 用途 | 看板「继续 / 结束」起会话并发预置提示词 |
| 适用版本 | `@deepseek-ai/dsh-api-session-controller` / `dsh-client-ui-conversation` / `dsh-client-ui-workspace` @0.2.0-rc.2 线（个别坐标标注 0.1.7-rc.2） |
| 版本真源 | 解包产物 `lib/types/**`、`lib/client.js`；同栈仓 `dsh-task-dispatch-table` 的 `src/dispatch.ts` / `src/client/session-view.ts` |
| 复核日期 | 2026-10-16 |

## 一、结论

**浏览器半（client）没有「往任意会话发自由文本」的官方 API。** 本插件只在自己刚创建的会话上发首条 user message，两个动作各走一条链路，互不复用：

| 动作 | 半侧 | 起会话 → 发消息 | 真源 |
|---|---|---|---|
| 「继续」 | host | `ctx.agents.create()` → `agent.send()` | `packages/plugin/src/host/services/continue.service.ts` |
| 「完成（由 Agent 结案）」 | client | `ctx.sessions.create()` → `face.prompt()` | `packages/plugin/src/client/close-session.ts` |

宿主没有 system prompt 参数（见 §二），所以注入的提示词只能是首条 user message，**是软约束，不是系统级硬规则**。

## 二、逐条事实与出处

| API | 半侧 | 事实 | 出处 |
|---|---|---|---|
| `sessions.binding(id)` | client | 只查已物化 scope，**从不创建** | `dsh-api-session-controller` `lib/client.js:3406`（0.1.7-rc.2） |
| `sessions.retain(target, {source, signal?})` | client | 物化 scope 的正解（内部触发 `manager.get(id).open()`） | 同上 `:3409` → `:3472` |
| `sessions.fork({sessionId, atSeq?, increaseTitle?})` | client | 开分支；省略 `atSeq` = 最新已完成 turn 前缀；失败抛 `SessionForkError` | `contract/sessions.d.ts:124`；`lib/client.js:3343` |
| `uiWorkspace.openSession(id)` | client | 官方导航：自己 `retain('mainView')` + `selection.set` + `selectPanel(null)`；插件**不得**自己 retain `mainView` | `dsh-client-ui-workspace` `lib/client.js:819` → `:968-991` |
| `layout.selectPanel(id \| null)` | client | 切主面板 / 回会话；未注册 id 抛错且保持当前选择 | `dsh-client-ui-layout` `lib/types/client/service.d.ts:17-32` |
| `sessions.create({cwd}\|{workspaceId})` | client | 建会话；`cwd` / `workspaceId` 二选一，同给即 bad-request | `contract/sessions.d.ts:88-93`；二选一规则见本插件 `close-session.ts` 头注（**UNVERIFIED** 精确行号） |
| `face.prompt(content, mode)` | client | 会话句柄上发 user message，`mode` 取 `queue` / `steer`；返回 `{ok:false}` 要按失败处理 | `contract/session.d.ts:82-117`（同上，**UNVERIFIED**） |
| `remote.commands.execute(sessionId, line, args)` | client | **只能发斜杠命令**：host 侧 `parseCommand()` 正则 `^\/[a-z][a-z0-9_-]*`，不带斜杠静默无反应 | 调用例 `dsh-session-title-pattern/lib/client.js:1105`；装配 `dsh-api-remotes/lib/client.js`（**UNVERIFIED** 精确行号） |
| `ctx.agents.create(...)` | host | 自建会话并驱动模型（自带 `sessions.prepare + enter + announce`）；**禁止**预建会话再驱动（撞 `already exists`） | 同栈仓 `dispatch.ts:519-548`；签名 `host.ts:105-120` |
| `agent.send(message, target: 'next-turn'\|'next-step', wakeup)` | host | 往会话发 user message | `dispatch.ts:627-634`；类型 `@deepseek-ai/dsh-agent` `runtime-types.d.ts`（**UNVERIFIED** 行号） |
| `agent.inject(message)` | host | 排进最近 pre-step，**不唤醒 driver** | `@deepseek-ai/dsh-agent` `lib/types/runtime-types.d.ts:203-209`（**UNVERIFIED**） |
| `goals.create(agent, {objective, maxGoalRounds?})` | host | 持久目标 + 自动续跑轮 | `@deepseek-ai/dsh-goal` `lib/types/index.d.ts:54`（**UNVERIFIED**） |
| `ctx.attachments.saveFile({data, name?})` | host | 存附件，`FileAttachmentRef = {attachmentId, name, bytes}`（**无路径**）；发模型前被 `projectFilesToText` 换成一行文字 | `dsh-attachment` `lib/types/types.d.ts:34-41`；`dsh-llm` `lib/types/content.js:107-135`（**UNVERIFIED**） |
| 会话启动注入口 | — | **无 system prompt 参数**：`SessionCreateRequest = {workspaceId?, cwd?, sessionId?, agentPreset?}`；`AgentOptions` 仅 `provider/model/reasoningEffort/maxTokens`。预置指令的可行位 = 首条 user message / agent preset 的 prompt sections / `AGENTS.md` 发现链（root→cwd） | `dsh-api-session-controller` `lib/types/types.d.ts:279`；`dsh-agent` `runtime-types.d.ts:21-30`（**UNVERIFIED**） |

社区插件实现过「浏览器半直发自由文本」，但其依赖的宿主 API 本地未验证，本插件不押注其上。

## 三、预置提示词的真源

认领 / 释放 / 移交由 host 代跑 `progress`（不开会话）；只有「继续」和「结束」起会话，见 [overview.md](../architecture/overview.md) 的不变量。

提示词正文的唯一真源是 `packages/plugin/src/client/prompts.ts`。本文只记宿主链路事实，**不复刻正文、不在此维护文案**；改提示词改源码，不改本文。

| 导出 | 用途 | 形态 |
|---|---|---|
| `continuePrompt()` | 「继续」 | 只读汇报：读任务与过程文档 → 输出三块 → 停下 |
| `closePrompt()` | 「完成（由 Agent 结案）」 | 读 → 总结 → 用 skill 正常结案；用户留言插在正文与硬约束之间，空留言删掉整节 |

两条铁律见源码头注：只依赖「任务号」与「task-ledger skill 存在」，不写命令、脚本路径、过程文档章节名，也不复述环境 —— skill 或过程文档模板改了，提示词不用跟着改；中英各一份，由 `isEnglish()` 比对自家字典决定（界面语言只有浏览器半知道，所以放在 client）。

### 会话创建的三条硬事实（仅 host 半链路）

以下三条只约束 `agents.create()`（「继续」）；client 半 `sessions.create()` 不挂 preset、不传 agentOptions、不调 `attachSession`。

| 事实 | 后果 |
|---|---|
| `agents.create` 不 mount preset ⇒ agent 落到「空的全局层」，只有根作用域的东西，**fs / bash 全无** | 必须在 `setup(agentCtx)` 里 `agentPresets.mount(agentCtx, presetId)`，并把 `presetId` 写进 `meta.agentPreset` |
| `agentOptions.provider/model` 缺省 **≠** 走宿主默认 | 用户不选模型时由插件读 `ctx.get('agentDefaultModel').currentSelection()` 补；补不到就报错，不建会话 |
| `meta.cwd` 只决定会话 cwd，**不会**自动归进工作区 | 建完要调该工作区实体的 `attachSession(sessionId)`，否则侧栏找不到这个会话 |

## 四、复核方式（宿主升级后）

```bash
npm view @deepseek-ai/dsh-api-session-controller dist-tags --json   # 取与宿主一致版本
cd /tmp && npm pack @deepseek-ai/dsh-api-session-controller@<版本> @deepseek-ai/dsh-client-ui-workspace@<版本> && tar xzf *.tgz
# 看三处：ISessions 是否新增 send/submit 类方法（contract/sessions.d.ts）
#         agents.create 签名是否变（若解包可得）
#         uiWorkspace.openSession 是否仍在（lib/client.js）
```

## 更新日志

- 2026-11-07 23:03:03：按 koc-code-docwriter 槽位迁移，剔除过程稿并统一标题头
- 2026-11-12 08:54:50：结论改为两条起会话链路；删过时模板正文，改为 prompts.ts 唯一真源指针
