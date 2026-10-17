# dsh-task-ledger

Monorepo for the **task ledger** project — one repo, two npm packages:

| Package | What | Who installs it | Publish trigger |
|---|---|---|---|
| [`dsh-task-ledger`](https://www.npmjs.com/package/dsh-task-ledger) | DSH (DeepSeek Harness) plugin: task ledger board UI + the `task-ledger` skill bundled | DSH users (`dsh plugin add dsh-task-ledger`) | tag `plugin-v*` |
| [`task-ledger`](https://www.npmjs.com/package/task-ledger) | The standalone skill (SKILL.md + scripts + assets), zero-code | CodeBuddy / other agent users (`npm install task-ledger`) | tag `skill-v*` |

The skill content has a single source of truth at `packages/skill/`; the plugin bundles a copy built from it, so DSH users get the skill automatically while everyone else installs `task-ledger` directly.

## Status

- `task-ledger@1.0.2` published (2026-10-17): `history` JSON mode now emits JSON even when a workspace has no history files (fixes a 500 that blanked the whole board).
- `dsh-task-ledger@0.0.13` published (2026-10-17): chart reworked to 3 thin bars per week — 完成 (blue) / 没完成 (amber, = open-at-week-end) / 新增 (grey), 5px wide, no rounded tops; hover now brightens all 3 bars in a column (was only the blue one); left 8-block grid narrowed slightly and the chart widened (1.7fr/1fr) so bars have more room; left-card copy re-verified (待认领 hint → '待认领最久 N 天'). '没完成' is computed accurately from create/close timestamps with no snapshot DB.
