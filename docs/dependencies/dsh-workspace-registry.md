# 宿主工作区注册表（ctx.workspaceRegistry）

| 项 | 值 |
|---|---|
| 用途 | 看板的宿主工作区发现来源 |
| 适用版本 | `@deepseek-ai/dsh-workspace@0.2.0-rc.2`（宿主版本线） |
| 版本真源 | `@deepseek-ai/dsh-workspace@0.2.0-rc.2` 解包产物 `lib/index.js` + `lib/types/types.d.ts`；`@deepseek-ai/dsh-api-workspace-controller@0.2.0-rc.2` `lib/types/commands.js` |
| 复核日期 | 2026-10-17 |

## 一、结论

**宿主直接提供全量工作区列表**：host 半插件经 `ctx.workspaceRegistry.list()` 拿到有序的工作区实体数组，每个实体带 canonical 绝对路径（`path`）。本插件的「工作区发现」= 拿这个列表逐个跑内嵌脚本 `root --json` 判定台账存在（判据是目录直接含 `ledger/`，不看里面有哪些文件），不需要自建配置源。

## 二、逐条事实与出处

| 事实 | 原文 / 证据 | 出处 |
|---|---|---|
| `list()` 签名与语义 | `list()` → *"a fresh ordered array of workspace entities"*；实现 = registry 状态中的 workspaceIds 顺序映射，缺实体抛错 | `lib/index.js:452-458` |
| Workspace 实体字段 | `id`（uuid）/ `path`（*"Canonical directory path: the `fs.realpath` of the path given at create time… Never rewritten afterwards"*）/ `title`（缺省 = 路径末段，允许重名） | `lib/types/types.d.ts:57-67` |
| 注册表其余面 | `get(id)` / `resolveByPath(path)` / `create(path)` / `delete(id)` / `insertBefore(...)` / `archiveSession` / `unarchiveSession` / `pinnedSessionIds` 等 | `lib/index.js`；`dsh-api-workspace-controller` `lib/types/commands.js:21-76` |
| 覆盖范围 | registry 收录的是「在 dsh 里添加过的工作区」；从未添加的目录不在列表内（默认工作区初始化是显式行为，反证收录非自动全盘扫描） | `lib/index.js:429-436` |

## 三、对本插件的落地含义

1. `resolveWorkspaces()` 不吃配置参数：调 `ctx.workspaceRegistry.list()` 取全量，对每个 `workspace.path` 跑内嵌脚本 `root --json` 判定台账活跃；无台账 / 未初始化的跳过。
2. 跨工作区读台账的 `--repo` 参数直接用 `workspace.path`（宿主已 realpath 归一，无需再归一）。
3. registry 未收录的目录（从没在 dsh 里添加过的项目）走机器级清单 `~/.taskledger/ledgers.json`，见 [ledger-dirs.md](../features/ledger-dirs.md)。台账数据一律经内嵌脚本读取，不直接读台账文件。

## 四、复核方式（宿主升级后）

```bash
npm view @deepseek-ai/dsh-workspace dist-tags --json
cd /tmp && npm pack @deepseek-ai/dsh-workspace@<版本> && tar xzf *.tgz
# 看两处：list() 是否仍在、返回类型是否变（lib/index.js）
#         Workspace 实体字段（尤其 path 的 canonical 语义）是否变（lib/types/types.d.ts）
```

## 更新日志

- 2026-11-07 23:03:03：按 koc-code-docwriter 槽位迁移，剔除过程稿并统一标题头
