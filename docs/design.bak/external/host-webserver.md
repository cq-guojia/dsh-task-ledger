# 宿主 webServer 路由与流式（SSE）能力

> **类型**：🌐 **外部事实** —— 记的是**宿主（DSH）**能给什么，不是本项目的设计
> **适用版本**：`@deepseek-ai/dsh-host-webserver@0.2.0-rc.2`（宿主版本线；升级后按下方「复核方式」重跑）
> **状态**：✅ 已核实（首核 2026-10-06；2026-10-16 立项调研复核引用）
> **来源**：`@deepseek-ai/dsh-host-webserver@0.2.0-rc.2` 解包产物 `lib/index.js` + `lib/types/index.d.ts` + `README.md`；完整逐条核实记录另见姊妹仓 `cq-guojia/dsh-task-dispatch-table` 的 `docs/design/external/host-webserver-streaming.md`

## 一、结论

插件可 `ctx.webServer.register(route)` 挂自有路由，handler 拿**原始 Node `req` / `res`**，可 SSE、可静态文件；宿主**不缓冲、不设响应超时、不主动回收**这类响应。宿主**无 server-wide TLS / 鉴权 / 同源策略**，闸门由路由方自持。

## 二、逐条事实与出处

| 事实 | 原文 / 证据 | 出处 |
|---|---|---|
| handler = 原始 Node req/res | `WebRoute.handler: (req: IncomingMessage, res: ServerResponse) => void \| Promise<void>` | `lib/types/index.d.ts:33-38` |
| 允许持有响应不结束 | 类型注释原文：*"Owns the full response lifecycle (**may hold the response open, e.g. SSE**)."* | `lib/types/index.d.ts:37-38` |
| gzip 显式跳过 SSE | `if (contentType.toLowerCase().startsWith("text/event-stream")) return false;` | `lib/index.js:110-116` |
| 压缩默认关闭 | `const DEFAULT_COMPRESSION = "none"` | `lib/index.js:103`、`:144` |
| 无响应超时 / 不主动回收 | 全文件无 `server.timeout` / `setTimeout` / 对已建立响应的回收逻辑 | `lib/index.js`（全文） |
| 宿主无 TLS / 鉴权 / 同源 | *"No server-wide TLS, authentication, or origin policy — route owners … enforce their own request policy."* | `README.md:113` |
| 重复 `(kind,path)` 注册直接 throw | `if (table.has(route.path)) throw new Error(...)` | `lib/index.js:177-184` |
| 主动断仅两种情况 | ① handler 抛错且已发头 ⇒ `res.destroy()`；② 插件 dispose ⇒ `server.close()` + `closeAllConnections()` | `lib/index.js:248-256`、`:306-319` |

## 三、对本插件的落地含义

1. **数据面路由**：待办 / 历史 / 报表各挂 exact 或 prefix 路由，JSON 响应；变更推送可走 SSE（宿主明确支持）。
2. **跨工作区读文件成立**：路由 handler 在 host 进程内执行，直读各工作区 `ledger/` 文件即可（宿主进程 = 普通 Node 进程，本地文件系统可读）。
3. **鉴权待拍板**：默认回环绑定；若部署成非回环地址，路由方需自持闸门（未验证项，见 [`../architecture.md`](../architecture.md) 「待拍板」）。
4. **handler 内不在发头后抛错**：出错自行 `res.end()`；SSE 连接的订阅集合与心跳定时器挂 `ctx.on('dispose')` 清理。

## 四、复核方式（宿主升级后）

```bash
npm view @deepseek-ai/dsh-host-webserver dist-tags --json
cd /tmp && npm pack @deepseek-ai/dsh-host-webserver@<版本> && tar xzf *.tgz
# 看三处：WebRoute.handler 是否仍收原始 req/res（lib/types/index.d.ts）
#         gzip filter 是否仍跳过 text/event-stream（lib/index.js）
#         是否新增响应超时 / 回收逻辑（lib/index.js 全文）
```
