# 文档规范：每种文档落在哪

> 本文件只回答一件事：**本项目每一种文档落在哪个实际路径**。
> 槽位全集、命名纪律、写权限、生命周期由工作区级规则与进度工具定义 —— 本文件不复述、不摘引、不编号指代它们的条目（它们独立改版，抄来的必然过期）。

---

## 一、槽位表

| 槽位 | 本项目落位 |
|---|---|
| 文档规范 | `docs/README.md`（本文件） |
| 任务进度（在办 / 已结案 / 过程叙事） | **不入 `docs/`** —— 由 `task-ledger` skill 统一管理（`ledger/pool.json` + `ledger/owners.json` + `ledger/owners/<hash>.json`、`ledger/history/<年月>.md`、`ledger/worklog/<年月>/`，路径以 skill 为准） |
| 运行逻辑 | `docs/design/architecture.md` |
| 功能总索引 | `docs/design/features.md` |
| 各功能 | `docs/design/features/`（一功能一文件，清单见功能总索引） |
| 外部事实 | `docs/design/external/`：`dsh-skill-registration.md`、`host-webserver.md`、`client-ui-layout.md`、`publish-oidc.md` |
| 数据库说明 | `docs/design/ledger-data.md`（本项目的「数据」= 各工作区台账文件，插件只读、不自建数据库） |
| 样式规范 | `docs/design/ui-style.md` |
| 方法规范 | `docs/design/code-conventions.md`（client 半分层与「单源」清单；宿主接口核实方法仍写在 `external/` 各文档的「复核方式」节） |
| 后端数据面 | `docs/design/host-data-plane.md`（host 三层架构、降级/缓存语义、性能实测基线与优化路线） |
| 样例 | 不适用（初建期无样例产出；台账文件真实样例见 `ledger-data.md` 引用的工作区路径） |

## 二、本项目补充的写作约定

### 2.1 头部（`design/` 下文档必带）

```markdown
# <标题>

> **状态**：📝 待拍板 / 🔵 落码 / ✅ 定型
> **来源**：需求出处（用户原话 / 决策编号）
> **配套**：相关文档链接
```

`external/` 下的另加 `> **类型**：` 与 `> **适用版本**：`（写清是哪个包、哪个版本；宿主 / 官方升级后据此复核）。

### 2.2 各层不得写什么

| 层 | 不得写 |
|---|---|
| `design/` 定型文档 | 进度、过程日志 |
| `external/` 外部事实 | 猜测、未核实内容；不得写成「我们的设计」 |
| `features/` 各功能 | 实现细节（归过程叙事） |
| 根 `README` 对外 | 内部设计 |

### 2.3 只链接，不摘引

文档之间一律用链接指路 —— 不抄正文，也不用「见某文件第 X 节 / 第 X 条」这类编号定位：被引用方随时改版，抄来的和编号指来的都会过期。
