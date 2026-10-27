# 20261027-1519-skill-补齐底层能力-新增-stats-owners-台账根检测-并扩展-l-736d：skill 补齐底层能力：新增 stats、owners、台账根检测，并扩展 list 状态

- **标签**：skill、台账、能力
- **状态**：doing · 2026-10-27 16:20:16 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **创建**：2026-10-27 15:19:22 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6

<!-- 头部四行由脚本维护，顺序固定：标签 → 状态 → 创建 → 封卷。
     「- **标签**：…」按 new --tags 插在最上面，没有标签就不写（分类只进台账与历史，不进本文档）；
     「- **封卷**：…」在结案时加在最后。 -->

## 背景

由「盘点 DSH 插件底层能力」（`20261027-1330-盘点-dsh-插件底层能力-8cd1`）拆分而来：补齐/改造 skill 数据面能力，供 DSH 插件调用。

**需要新增：**
1. `stats`：按状态 + 年龄阈值计数（停滞/过期/积压等），独立方法，不与 `list` 合并。
2. `owners --json`：返回该工作区全量花名册。底层 `OwnersIndex.All()` 已有（`store/ownersindex.go:39`），薄封装成命令即可。
3. 台账根检测命令：传一个目录 → 返回它是否为已初始化的台账根（`core/roots.go` 的 `AsRoot`/`RootOf` 已有，暴露为子命令）。

**需要修改：**
- `list`：① 接受阈值参数；② **多返回几种状态**（延期/延迟、已逾期等派生状态字段），现在返回的基础状态不够用。

**注意事项（务必遵守）：**
- 参数可选、向后兼容：不传用内置默认（沿用现有 `STALE_DAYS`/`OVERDUE_DAYS`/`BACKLOG_DAYS`），传了用调用方值覆盖再算。
- 时区契约：插件按本地时间传「哪天到哪天」窗口；skill 内部转 UTC 查，查完转回本地时间返回。插件不管时区转换。
- `stats`/`list` 是「通用能力」，不按 DSH 看板页面形状建模；页面自己组合调用。
- JSON 输出结构是契约（真源在 skill），改结构按破坏性变更对待。
- 范围只作用活跃任务（池 open + 进行中 doing），历史不动。
- 底层已有方法尽量薄封装，不重写。

## 待办

- [ ] 新增 `stats`（参数化计数，独立于 list）
- [ ] 新增 `owners --json`（薄封装 `OwnersIndex.All()`）
- [ ] 新增 台账根检测命令
- [ ] 给 `list` 加阈值参数 + 派生状态字段（延期/延迟等）

## 下一步

- 先读 `packages/skill/src/internal/shell/cli.go`（`commandFlags`）与 `actions/`、`store/ownersindex.go`、`core/roots.go`，确定新命令挂载位置与薄封装方式

## 过程

<!-- 踩坑与证据：带 revision + 文件:行号 或符号名 -->

## 结论

<!-- 做成了什么、留了什么坑 -->

## 执行记录

<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。
     补记用 progress log --id <任务号> --note "一句话"。 -->
- 2026-10-27 15:19:22 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 创建任务
- 2026-10-27 16:20:16 · claim · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 认领 → doing
