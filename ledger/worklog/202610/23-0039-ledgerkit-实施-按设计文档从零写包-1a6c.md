# 20261023-0039-ledgerkit-实施-按设计文档从零写包-1a6c：ledgerkit 实施：按设计文档从零写包

- **标签**：实施、ledgerkit、分包、分层、单测
- **状态**：closed · 2026-10-23 04:36:23 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **创建**：2026-10-23 00:39:39 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **封卷**：2026-10-23 04:36:23 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6

<!-- 头部四行由脚本维护，顺序固定：标签 → 状态 → 创建 → 封卷。
     「- **标签**：…」按 new --tags 插在最上面，没有标签就不写（分类只进台账与历史，不进本文档）；
     「- **封卷**：…」在结案时加在最后。 -->

## 背景

- 用户 2026-10-23：「文档弄好了，下一步就是根据文档去实施全新的代码」。
- 前序任务 `20261022-2107-…-f033`（分层重构 + 设计文档）已结案：设计文档定稿、评审 7 轮收敛到 0 条，**代码零改动**（`packages/skill/scripts/progress.py` 仍是 4657 行单文件）。
- 真源只有一处：`docs/design/` 四份（`ledger-api.md` = 目录树与全部签名；`architecture.md` = 流程与不变量；`code-conventions.md` = 工程与协作约定；`ledger-data.md` = 数据布局）。文档与代码冲突时以文档为准并先报，不自作主张。

## 待办

1. 包骨架：`ledgerkit/`（core / store / actions / shell 四子包 + 顶层 `notices.py` / `env.py` / `errors.py`）+ 入口 `progress.py`（只做 sys.path + 调 `main`）。
2. 阶段一：`core`（paths / ids / identity / labels / time / worklog_md / history_md）+ `store`（atomic / locks / dirty / json_store / task_store / owners_index / history_store / worklog_store）+ 单测。
3. 阶段二：`actions`（atom / guard / registry / query / result + 九个写动作与五个只读动作）。
4. 阶段三：`shell`（cli / runner / presync / gitops / merge / render）+ 冒烟 + `--json` 形状对齐。
5. 切换期：旧 `progress.py` 与新包并存怎么切、冒烟脚本读哪份 —— **尚未拍板**，动到这一步前先问用户。

## 下一步

1. 建 `packages/skill/scripts/ledgerkit/` 骨架：`__init__.py` 空 + `core/` `store/` `actions/` `shell/` 四个空包 + 顶层 `notices.py` / `env.py` / `errors.py`（目录树照 `docs/design/ledger-api.md` §一）。
2. 第一个落地文件 `core/paths.py`（常量与路径函数，真源 `ledger-api.md` §五），配单测。
3. 入口 `progress.py` 改成 4 行：关字节码 → 塞 `sys.path` → `from ledgerkit.shell.cli import main` → `sys.exit(main())`。

## 过程

- （本轮只建档，尚未动代码。）

## 结论

- （待验收：每完成一个阶段在此记可验证的事实，不写评价。）

## 执行记录

<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。
     补记用 progress.py log --id <任务号> --note "一句话"。 -->
- 2026-10-23 00:39:39 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 创建任务（doing）
- 2026-10-23 00:40:28 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 建档：背景/待办/下一步写清三阶段与真源文档；下一步先建 ledgerkit 骨架与 core/paths.py
- 2026-10-23 12:36:23 · close · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 结案封卷
