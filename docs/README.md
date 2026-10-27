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
| 外部事实 | `docs/design/external/`：`dsh-skill-registration.md`、`host-webserver.md`、`client-ui-layout.md`、`dsh-session-handoff.md`、`dsh-workspace-registry.md`、`publish-oidc.md` |
| 数据库说明 | `docs/design/ledger-data.md`（本项目的「数据」= 各工作区台账文件，插件只读、不自建数据库） |
| 样式规范 | `docs/design/ui-style.md` |
| 方法规范 | `docs/design/code-conventions.md`（client 半分层 + 脚本侧两层（L1 / L2 / 外壳）、铁律与防塌线；宿主接口核实方法写在各 `external/` **宿主接口**文档的「复核方式」节，`publish-oidc.md` 是发布链路、无此节） |
| 接口契约 | `docs/design/ledger-api.md`（Go 实现的目录树 + 每层方法签名与职责 + 可机械检查的准入 `grep` 表 + 改完必跑的防塌线清单 + 命令行参数映射） |
| 后端数据面 | `docs/design/host-data-plane.md`（host 三层架构、降级/缓存语义、性能实测基线与优化路线） |
| 测试与验收判据 | `docs/design/ledger-api.md` §〇（分层准入 `grep`，全为 0）+ §七（`go vet` / `go test` / 三平台编译）、`npm test`、`npm run verify`（build + typecheck） |
| 样例 | 不适用（无独立样例产出；台账文件的真实样例直接看本仓 `ledger/history/202610.md` 与 `ledger/worklog/202610/`） |

## 二、本项目补充的写作约定

### 2.1 头部（`design/` 下文档必带）

```markdown
# <标题>

> **状态**：📝 待拍板 / 📝 待落码 / 🔵 落码 / ✅ 定型
> **来源**：需求出处（用户原话 / 决策编号）
> **配套**：相关文档链接
> **重构前快照**：（可选，仅当本文档被整篇重写过；指向归档，一句话说明不作依据）
```

`external/` 下的另加 `> **类型**：` 与 `> **适用版本**：`（写清是哪个包、哪个版本；宿主 / 官方升级后据此复核）。

**状态词只认这四档**，一格只写一档，别混搭（「已拍板」「已核实」这类词放来源行或正文，不进状态位）。📝 两档的区别：还没定方案用「待拍板」，方案定了但代码没写用「待落码」。

**未落码的设计必须显式标注**：文档里写的架构/接口如果代码里还没有，标题或节标题必须带「📝 计划 / 未落码」，正文不得用现在时叙述 —— 读者会照着不存在的东西改代码（2026-10-22 踩过：三篇文档把未落码的 `atom` / `JsonStore` 写成了现状）。

### 2.2 各层不得写什么

| 层 | 不得写 |
|---|---|
| `design/` 定型文档 | 进度、过程日志 |
| `external/` 外部事实 | 猜测、未核实内容；不得写成「我们的设计」 |
| `features/` 各功能 | 实现细节（归过程叙事） |
| 根 `README` 对外 | 内部设计 |

### 2.3 只链接，不摘引

文档之间一律用链接指路 —— 不抄正文，也不用「见某文件第 X 节 / 第 X 条」这类编号定位：被引用方随时改版，抄来的和编号指来的都会过期。
