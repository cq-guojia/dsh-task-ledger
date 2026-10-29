# 20261027-1519-skill-补齐底层能力-新增-stats-owners-台账根检测-并扩展-l-736d: skill 补齐底层能力：新增 stats、owners、台账根检测，并扩展 list 状态

- **Tags**: skill, 台账, 能力
- **Status**: done · 2026-10-28 01:33:48 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **Created**: 2026-10-27 15:19:22 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **Sealed**: 2026-10-28 01:33:48 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

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

## To Do

- [x] 新增 `stats`（参数化计数，独立于 list）
- [x] 新增 `owners --json`（薄封装 `OwnersIndex.All()`）
- [x] 新增 台账根检测命令 `root`
- [x] 给 `list` 加阈值参数 + 派生状态字段（停滞 / 逾期 / 积压）

## Next

- 交给用户复核（**未提交**）；确认后先提交 skill 侧改动，再启动 DSH 插件侧任务 `20261027-1519-dsh-插件重构-界面更新-方法替换-注册方式改造-1f9a`

## Process

<!-- Pitfalls and evidence: with revision + file:line or symbol names -->

### 落地形状（四个动作 + 一层共用关系）

- **年龄派生值** `actions/age.go`：`AgeOf(task, now, ListQuery) -> AgeMarks` 纯计算、`ApplyAge` 写进任务字典。六个键（`stale` / `overdue` / `backlog` / `age_days` / `idle_days` / `waiting_days`）**只活在输出里**：`store.JSONStore.All()`（`store/jsonstore.go:271`）返回的是浅拷贝，`selectTasks` 写的是这份副本，只读路径（`shell/runner.go:111`）根本不进写分支 ⇒ 一个字节都落不到台账。
- **`list` 与 `stats` 共用同一口径**：`selectTasks`（`actions/list_tasks.go:117`）把「合并 → 校验 → 筛选 → 打派生值」收成一处，两边各自调它 —— 范围 mine → pool → owner 的优先级、状态白名单校验（`checkQuery`）都只有这一份实现。
- **`stats`** `actions/query_stats.go`：只数数不吐行，`thresholds` 回显本次生效的三个值（界面文案不硬编码）。
- **`owners`** `actions/query_owners.go`：`OwnersIndex.All()` + 每条打 `mine`；**加了 `AssertPresent()`** —— 索引登记了却没分片这种坏状态，`list` 会报错，`owners` 不能悄悄回答「花名册空的」。
- **`root`** `actions/detect_root.go`：判据只看结构（直接含不含 `ledger/`），与 `core.AsRoot` 同口径；它在 `Main` 里排在 `ResolveRepo` **之前**（`shell/cli.go:543`），与 `whoami` / `init` 同类 —— 不然「这个目录有没有台账」这个问题永远要先有台账才能问。

### 踩过的坑（都修了，留个记号）

1. **`jsonfmt` 不认指针、也不认嵌套 map**：`render`（`jsonfmt/jsonfmt.go:50`）的 switch 没 `*int` / `map[string]map[string]any` 分支，落 default 就 `fmt.Sprint` ⇒ JSON 里出现 `0xc000…` 或 Go 的 `map[…]` 打印形态。`owners` 头版就是这个症状（旧再现看 `shell/json_contract_test.go` 的 `scanBadValues`）。修法：派生值一律 `intOrNil` 解引用、**无类型** `nil` 表示空；嵌套字典转 `map[string]any`。已写进 `docs/design/ledger-api.md` §六。
2. **`owners.json` 的 `joined` 漏了时区**：它是 `core.Now()` 写的 UTC，头版原样进 JSON，与 `list` 的 `created` 差 8 小时。把 `joined` 补进 `TimeFields` 后由 `LocalizeTimes` 统一转（`shell/render.go:44`）。
3. **人话遍历 map ⇒ 顺序随机**：`RenderOwners` 改成按 `name`（空名排最后）再按 `uuid` 排序。
4. **未知状态口径分叉**：原先 `AgeOf` 只在 `status == "open"` 时算等待天数，而 `stats` 把「非 doing」全算进 `open` ⇒ 一条未知状态的任务进了 open 面却不参与 `oldest_open_days`。改成 `default` 分支一律按待认领算，两边同一判据。
5. **`root` 顶层 `--repo` 会被引误解**：顶层 `--repo` 谁都认，`root` 偏偏不看它，静默忽略会让人以为指定生效了 ⇒ 给了 stderr 提示（`shell/cli.go:549`）。

## Conclusion

三个只读命令（`stats` / `owners` / `root`）+ `list` 的阈值参数与六个派生字段全部落码：

- `stats` 按状态 + 年龄阈值计数，阈值不传用内置默认（3 / 14 / 30）、传了覆盖；`list` 同一套阈值，每行多给派生状态与天数。
- `owners` 给全量花名册（含当前没任务的人），每条带 `mine`。
- `root` 传目录 → 回答是不是已初始化的台账根，顺带回往上找到的工作区根（`repo`），拿到就能喂给其它命令的 `--repo`。
- JSON 是契约：`docs/design/ledger-api.md` §3.3 / §六、`packages/skill/SKILL.md` 的命令表都已同步；三平台产物重建入库；`go vet` + `go test` 全过、分层准入 grep 全 0。

**留给 Task2（插件侧）**：插件现在还在自己算 `StaleDays/OverdueDays/BacklogDays` 与三个标记（`packages/plugin/src/host/services/home.service.ts:22`），改调 `stats` / `list` 后的 slug 映射待插件任务做。版本从 1.3.37 / 1.3.38 提到 **1.3.39**（两侧同步），tag 未打。

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id <id> --note "...". -->
- 2026-10-27 15:19:22 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · created
- 2026-10-27 16:20:16 · claim · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · claimed → doing
- 2026-10-27 17:57:16 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 新增 stats/owners/root 三命令 + list 阈值参数与六个派生字段（actions/age.go:age.go、query_stats.go、query_owners.go、detect_root.go）；JSON 契约与分层文档同步，三平台产物重建，go test 全过；未提交待用户复核
- 2026-10-28 01:33:48 · close · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · sealed
