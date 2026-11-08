# 20261108-1633-b0e2-修复内嵌-skill-注册体缺-source: 修复内嵌 skill 注册体缺 source

- **Tags**: 注册体, 宿主契约, 依赖复核, 回归验证
- **Status**: doing · 2026-11-08 16:38:10 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **Created**: 2026-11-08 16:33:18 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

GitHub issue #3（ysongyang，2026-11-08）：DSH `V0.2.2-rc.1` 上调用 `task-ledger` skill 报 `Error: loaded skill "task-ledger" source must be a string`，用户问是插件不可用还是不支持该宿主版本。

## To Do

- 真机验收：在 DSH `V0.2.2-rc.1` 装 `plugin-v0.1.10` 后实际调用一次 `task-ledger` skill，确认报错消失、正文里 `scripts/progress` 绝对路径可执行。
- GitHub issue #3 尚未回复。

## Next

在 DSH `V0.2.2-rc.1` 装 `plugin-v0.1.10`，触发一次台账意图，核对 `packages/plugin/src/host/skill/registration.ts` 的 `source: "runtime"` 是否被宿主 `get()` 正常加载；通过后由用户决定是否结案并回复 issue #3。

## Process

- 复现：`npm pack @deepseek-ai/dsh-skill@0.2.2-rc.1` 解包，取 `lib/index.js` 的 `validateDefinition`（`:470-489`，报错在 `:486`）喂插件 `dist/host/skill/registration.js` 的真实注册体，逐字复现 `TypeError: loaded skill "task-ledger" source must be a string`；补 `source` 后 PASS。`0.2.0-rc.2` 与 `0.2.2-rc.1` 的 `lib/index.js` 字节一致 ⇒ 不是版本不兼容。
- 根因：`lib/types/index.d.ts:56` 的 `SkillSummary.source` 必填，`SkillRegistration`（`:79`）只 omit invocation/provider；`register()`（`lib/index.js:193-207`）不补 source，`get()`（`:250-258`）加载才校验。我方 `registration.ts:22` 把 source 写成可选、`:69` 未传，源头是 `docs/dependencies/dsh-skill-registration.md:20` 误把 source 列为可选。
- 修复：`registration.ts` 必填 `source: "runtime"`；新增 `scripts/verify-skill.mjs` 并接入 `package.json` 的 `verify`；依赖文档订正必填字段、补写入/加载期两条事实、复核版本升 `0.2.2-rc.1`。
- 验证：`pnpm run verify`（build + typecheck + 5 项注册体契约断言）、`pnpm test`（Go vet + 单测）、`koc-codelint` 全过；bump 后重建产物使 `dist/client.js` 内嵌版本标记与 `package.json` 同为 `0.1.10`。
- 发版：`de9e6a0` 提交并推送 main，tag `plugin-v0.1.10` 已推送；未动 `packages/skill/` ⇒ 按 `AGENTS.md` 只升插件 tag。

## Conclusion

插件 `0.1.10` 已发版，注册体满足宿主加载期契约，宿主原码校验 PASS。留下的坑：真机（DSH 内）验收未做，issue #3 未回复；`source` 是 prompt 可见元数据，宿主升级后按 `docs/dependencies/dsh-skill-registration.md` 第四节复核。

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261108-1633-b0e2-修复内嵌-skill-注册体缺-source --note "...". -->
- 2026-11-08 16:33:18 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · created
- 2026-11-08 16:33:41 · claim · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · claimed → doing
- 2026-11-08 16:38:10 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 已交付待验收：注册体补 source=runtime（registration.ts:69），verify-skill.mjs 5 项断言全过，宿主 0.2.2-rc.1 validateDefinition PASS；插件 0.1.10 发版 de9e6a0 与 tag plugin-v0.1.10 已推送；待 DSH 真机验收
