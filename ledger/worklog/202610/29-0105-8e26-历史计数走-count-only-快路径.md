# 20261029-0105-8e26-历史计数走-count-only-快路径：历史计数走 count-only 快路径

- **标签**：台账、历史、计数、性能
- **状态**：closed · 2026-10-29 01:30:59 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **创建**：2026-10-29 01:05:43 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **封卷**：2026-10-29 01:30:59 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6

<!-- 头部四行由脚本维护，顺序固定：标签 → 状态 → 创建 → 封卷。
     「- **标签**：…」按 new --tags 插在最上面，没有标签就不写（分类只进台账与历史，不进本文档）；
     「- **封卷**：…」在结案时加在最后。 -->

## 背景

用户查首页「本周完成 / 上周完成」怎么取数（`stats.repository.ts:107-138` → `progress history --count-only`），
确认两点后要求优化计数路径：

- 文件型台账没有索引，想知道区间内结了几条必须解析历史 md，这点改不了；
- 但 `--count-only` 现在仍做了只有列表才需要的加工：逐行 `ToMap`、塞 `src`/`created`/`finished`/`mine`、
  读 `owners.json` 名册逐行补名、按 `finished` 排序、构造 `Filters` map（`actions/query_history.go`）。
  计数只要 `finished` 落在区间内，这些全是白做；且 `capped` 要读完全部才判，超过 `CountCap` 可以提前停。

用户原话：「判断到传了 count only 的时候，就不去读那个东西」；并明确「直接优化这个方法」时要保证
count 与 list 行数口径一致。

## 待办

- 无（三平台二进制已重编、插件副本已同步、端到端对数已过）

## 下一步

- 等用户验收后交付；若验收通过再由用户明确说「结束」才 close

## 过程

- `packages/skill/src/internal/actions/query_history.go`：抽出 `historyWindow`（区间计算 + 反向校验提前到读文件之前）
  与 `rowMatches`（owner / mine / owner-name / category / tag / 结案区间），列表与计数**共用同一套判据**；
  删掉事后那层 map 过滤（`filterRecords` 同时删除）。
- 计数分支：解析出行后直接累加，不 `ToMap`、不读名册、不排序；`counted > CountCap` 即置 `capped` 并停
  （对外仍是 `count=10000, capped=true`，与旧的「读完再截断」等价）。
- 新增 `packages/skill/src/internal/actions/query_history_test.go`：四组条件（全量 / 我的 / 分类 / 标签）下
  `--json` 行数与 `--count-only` 相等；10001 行 → `count=10000, capped=true`。
- 验证：`npm test`（go vet + go test 全包）通过、`gofmt -l` 无输出；`GOOS=linux/darwin/windows` 三平台编过，
  产物落 `packages/skill/scripts/bin/`，`packages/plugin` build 后副本同步。
- 端到端对数（本仓 2026-10-26~11-01 窗口）：`history --count-only` = 12，`history --json` 记录数 = 12。

## 结论

`--count-only` 不再做列表侧加工，也不再读名册、不排序；超过封顶立即停止读取。列表路径行为不变
（判据统一到 `rowMatches`，过滤时机从「建完 map 再筛」提前到「解析出行就筛」）。

## 执行记录

<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。
     补记用 progress log --id <任务号> --note "一句话"。 -->
- 2026-10-29 01:05:43 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 创建任务并认领
- 2026-10-29 01:08:43 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · query_history.go:计数分支跳过 ToMap/名册/排序并在 CountCap 即停，列表与计数共用 rowMatches；新增 query_history_test.go；npm test + 三平台产物 + plugin build 全过
- 2026-10-29 01:30:59 · close · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 结案封卷
