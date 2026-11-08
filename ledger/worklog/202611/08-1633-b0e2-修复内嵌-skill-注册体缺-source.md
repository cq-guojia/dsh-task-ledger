# 20261108-1633-b0e2-修复内嵌-skill-注册体缺-source: 修复内嵌 skill 注册体缺 source

- **Tags**: 注册体, 宿主契约, 依赖复核, 回归验证
- **Status**: done · 2026-11-08 16:42:03 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **Created**: 2026-11-08 16:33:18 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6
- **Sealed**: 2026-11-08 16:42:03 · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6

<!-- Header lines are maintained by the script, fixed order: Tags → Status → Created → Sealed.
     The `- **Tags**: …` line is inserted at the top by new --tags; omitted when there are no tags
     (category goes to the ledger and history only, never into this document).
     The `- **Sealed**: …` line is appended on close. -->

## Background

GitHub issue #3（ysongyang，2026-11-08）：DSH `V0.2.2-rc.1` 上调用 `task-ledger` skill 报 `Error: loaded skill "task-ledger" source must be a string`，用户问是插件不可用还是不支持该宿主版本。

## To Do

- 无。真机验收由用户在 DSH 升级 `plugin-v0.1.10` 后自行确认（本机无法启动宿主）；GitHub issue #3 需仓库管理员关闭：本机凭证调 `PATCH /issues/3` 返回 `403 Must have admin rights to Repository.`，agent 不绕过凭证链。

## Next

任务已结案。若真机升级后仍复现，另开任务；`source` 是 prompt 可见元数据，宿主升级后按 `docs/dependencies/dsh-skill-registration.md` 第四节复核。

## Process

- 复现：`npm pack @deepseek-ai/dsh-skill@0.2.2-rc.1` 解包，取 `lib/index.js` 的 `validateDefinition`（`:470-489`，报错在 `:486`）喂插件 `dist/host/skill/registration.js` 的真实注册体，逐字复现 `TypeError: loaded skill "task-ledger" source must be a string`；补 `source` 后 PASS。`0.2.0-rc.2` 与 `0.2.2-rc.1` 的 `lib/index.js` 字节一致 ⇒ 不是版本不兼容。
- 根因：`lib/types/index.d.ts:56` 的 `SkillSummary.source` 必填，`SkillRegistration`（`:79`）只 omit invocation/provider；`register()`（`lib/index.js:193-207`）不补 source，`get()`（`:250-258`）加载才校验。我方 `registration.ts:22` 把 source 写成可选、`:69` 未传，源头是 `docs/dependencies/dsh-skill-registration.md:20` 误把 source 列为可选。
- 修复：`registration.ts` 必填 `source: "runtime"`；新增 `scripts/verify-skill.mjs` 并接入 `package.json` 的 `verify`；依赖文档订正必填字段、补写入/加载期两条事实、复核版本升 `0.2.2-rc.1`。
- 验证：`pnpm run verify`（build + typecheck + 5 项注册体契约断言）、`pnpm test`（Go vet + 单测）、`koc-codelint` 全过；bump 后重建产物使 `dist/client.js` 内嵌版本标记与 `package.json` 同为 `0.1.10`；最终产物再跑宿主原码 `validateDefinition` → `source=runtime / PASS`。
- 发版：`de9e6a0` 提交并推送 main，tag `plugin-v0.1.10` 已推送；未动 `packages/skill/` ⇒ 按 `AGENTS.md` 只升插件 tag。
- 结案：用户确认问题已解决并要求结案；issue #3 的关闭动作受本机凭证权限限制未执行，改由仓库管理员操作。

## Conclusion

插件 `0.1.10` 已发版，注册体满足宿主加载期契约，宿主 `0.2.2-rc.1` 原码校验 PASS，根因（注册体缺 `source` + 依赖文档误标可选）已同时修掉并加回归断言。边界：解决是源码级 / 宿主原码级确认，真机 DSH 内加载调用未验收；issue #3 尚未关闭（凭证无 admin 权限）。

## Execution Log

<!-- Maintained by the script: appended by new / claim / set / release / log / close. Do not edit.
     Backfill with: progress log --id 20261108-1633-b0e2-修复内嵌-skill-注册体缺-source --note "...". -->
- 2026-11-08 16:33:18 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · created
- 2026-11-08 16:33:41 · claim · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · claimed → doing
- 2026-11-08 16:38:10 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 已交付待验收：注册体补 source=runtime（registration.ts:69），verify-skill.mjs 5 项断言全过，宿主 0.2.2-rc.1 validateDefinition PASS；插件 0.1.10 发版 de9e6a0 与 tag plugin-v0.1.10 已推送；待 DSH 真机验收
- 2026-11-08 16:41:59 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 结案收尾：worklog 前五节更新为结案态；宿主 0.2.2-rc.1 原码校验 PASS、真机未验收；issue #3 关闭受凭证权限限制（403 Must have admin rights），待仓库管理员关闭
- 2026-11-08 16:42:03 · close · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · sealed: 注册体补 source=runtime（registration.ts:69），宿主 0.2.2-rc.1 validateDefinition PASS，verify/typecheck/go test/codelint 全过；插件 0.1.10 发版 de9e6a0 与 tag plugin-v0.1.10；真机验收由用户升级后确认，issue #3 因凭证无 admin 权限未关闭
