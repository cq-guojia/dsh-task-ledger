> 2026-10-22 起 skill 侧台账已改为「池 + 分片 + 索引」并全链路 UTC；**宿主侧已适配**：以 `ledger/pool.json` 存在判定台账、待办 / 历史一律经内嵌脚本（已分片感知）读取，不再直接读扁平 `progress.json`。

# 宿主工作区注册表（ctx.workspaceRegistry）

> **类型**：🌐 **外部事实** —— 记的是**宿主（DSH）**能给什么，不是本项目的设计
> **适用版本**：`@deepseek-ai/dsh-workspace@0.2.0-rc.2`（宿主版本线 0.2.0-rc.2；升级后按下方「复核方式」重跑）
> **状态**：✅ 已核实（2026-10-17：`npm pack` 解包读 `lib/index.js` + `lib/types/types.d.ts` 原文；参考插件 `dsh-task-dispatch-table` `src/host.ts:194-196` 的结构化声明交叉印证）
> **来源**：`@deepseek-ai/dsh-workspace@0.2.0-rc.2` 解包产物；`@deepseek-ai/dsh-api-workspace-controller@0.2.0-rc.2` `lib/types/commands.js`（host 侧用法实证）

## 一、结论

**宿主直接提供全量工作区列表**：host 半插件经 `ctx.workspaceRegistry.list()` 拿到有序的工作区实体数组，每个实体带 canonical 绝对路径（`path`）。本插件的「工作区发现」= 拿这个列表 + 逐个查 `<path>/ledger/pool.json`（或经内嵌脚本读分片）判定台账存在，**不需要自建配置源**（用户 2026-10-17 拍板：「他都会带给你」）。

## 二、逐条事实与出处

| 事实 | 原文 / 证据 | 出处 |
|---|---|---|
| `list()` 签名与语义 | `list()` → *"a fresh ordered array of workspace entities"*；实现 = registry 状态中的 workspaceIds 顺序映射，缺实体抛错 | `lib/index.js:452-458` |
| Workspace 实体字段 | `id`（uuid）/ `path`（*"Canonical directory path: the `fs.realpath` of the path given at create time… Never rewritten afterwards"*）/ `title`（缺省 = 路径末段，允许重名） | `lib/types/types.d.ts:57-67` |
| 注册表其余面 | `get(id)` / `resolveByPath(path)` / `create(path)` / `delete(id)` / `insertBefore(...)` / `archiveSession` / `unarchiveSession` / `pinnedSessionIds` 等 | `lib/index.js`；`dsh-api-workspace-controller` `lib/types/commands.js:21-76` |
| 覆盖范围 | registry 收录的是「在 dsh 里添加过的工作区」；从未添加的目录不在列表内（默认工作区初始化是显式行为，反证收录非自动全盘扫描） | `lib/index.js:429-436` |

## 三、对本插件的落地含义

1. `resolveWorkspaces()` **不吃配置参数**：调 `ctx.workspaceRegistry.list()` 取全量，对每个 `workspace.path` 以 `ledger/pool.json` 存在判定台账活跃（待办 / 历史经内嵌脚本读分片）；无台账 / 未初始化的跳过（展示形态已定「隐藏」，后端无此概念）。
2. 跨工作区读台账的 `--repo` 参数直接用 `workspace.path`（宿主已 realpath 归一，无需再归一）。
3. 补充源（registry 未收录的目录，如从没在 dsh 里添加过的项目）暂不做；形态待拍板，见 [`../architecture.md`](../architecture.md) §五。

## 四、复核方式（宿主升级后）

```bash
npm view @deepseek-ai/dsh-workspace dist-tags --json
cd /tmp && npm pack @deepseek-ai/dsh-workspace@<版本> && tar xzf *.tgz
# 看两处：list() 是否仍在、返回类型是否变（lib/index.js）
#         Workspace 实体字段（尤其 path 的 canonical 语义）是否变（lib/types/types.d.ts）
```
