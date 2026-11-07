# host 数据面

## 一、三层分工

`src/host/` 下按职责分三层，依赖方向单向向下，不允许反向引用：

| 层 | 位置 | 职责 |
|---|---|---|
| 路由层 | `src/host/routes/` | 只做参数校验、`try/catch`、HTTP 状态码与响应体；不读文件、不算统计 |
| 服务层 | `src/host/services/` | 纯函数计算：趋势合并、周完成数、身份映射、工作区解析、历史查询合并 |
| 仓储层 | `src/host/repositories/` | 唯一知道台账怎么读：定位 ledger 目录、spawn skill 脚本、解析 JSON、进程内缓存 |

**唯一 spawn 点**：`repositories/spawn.ts` 的 `spawnScript()`（同步 `spawnSync`，路径来自 `resolveSkillScriptPath()`，取 `process.platform` / `process.arch` 对应的平台二进制）。其余任何地方不得再起子进程；服务层只接收已解析好的结构化数据。

`routes.ts` 的 `HTTP_ROUTES` 是唯一路由注册表；`index.ts` 只注入依赖、调 `registerRoutes()`。写操作统一经 `handleTaskAction()` → `spawnScript()`，与读端点共用一个出口。

## 二、降级语义

多工作区 fan-out 逐个读，失败项进 `degraded` 数组（`workspaceId` / `title` / `op` / `code` / `message`），成功项照常合并：部分失败接口仍 200、坏工作区标红；**全部失败**才抛首个错误，路由转 500 + 人话，避免「台账程序根本没装」被集体降级成一片绿色空板。

错误码只增不改，`LEDGER_` 前缀避开宿主错误码空间：`LEDGER_SCRIPT_UNAVAILABLE` / `LEDGER_SCRIPT_TIMEOUT` / `LEDGER_SCRIPT_FAILED` / `LEDGER_SCRIPT_BAD_JSON` / `LEDGER_DATA_INVALID` / `LEDGER_IDENTITY_MISSING`。无身份是独立分流码（脚本退出码 4），界面据此整页切身份页。

降级不得伪造数据：空就是空，不能用占位值填充计数与时间。

## 三、缓存与响应

- 读端点统一先看 `?fresh=1`（手动刷新 = 先清缓存再算），正常浏览吃进程内缓存（TTL 1.5 秒）；写操作后有显式失效入口。
- JSON 只有一个出口 `sendJson()`：响应体超过 1024 字节且客户端收 gzip 就由路由自己压（宿主默认不压缩），并带 `vary: accept-encoding`；小响应不压。
- 身份与工作区清单来自 `~/.taskledger/` 下的独立文件，不混在台账目录里；隐藏/改名只影响展示，不改磁盘上的台账目录。

## 四、当前路由

统一前缀 `/api/task-ledger`，在 `routes.ts` 一处注册。

| 路径 | 用途 |
|---|---|
| `GET /identity` | 当前身份（未初始化双 null） |
| `GET /identity/roster` | 身份花名册 |
| `POST /identity/switch` | 切换身份 |
| `POST /identity/forget` | 移除身份 |
| `GET /workspaces` | 工作区清单 |
| `POST /dirs` | 台账目录维护（读/写同一路径） |
| `POST /task/action` | 任务写操作（认领、继续、完成、释放、取消、删除） |
| `POST /task/continue` | 从台账任务继续一个会话 |
| `POST /workspace/kind` | 工作区类型判定 |
| `GET /board/snapshot` | 首页一次拿全量：统计、在办、趋势、工作区、身份 |
| `GET /history/trend` | 趋势点 |
| `GET /history/list` | 历史列表 |
| `GET /fs` | 核心 explorer 的只读文件路由 |

注册方式与 handler 形状见 [host-webserver.md](../dependencies/host-webserver.md)；工作区清单来源见 [dsh-workspace-registry.md](../dependencies/dsh-workspace-registry.md)。

## 更新日志

- 2026-11-07 23:03:03：按 koc-code-docwriter 槽位迁移，剔除过程稿并统一标题头
