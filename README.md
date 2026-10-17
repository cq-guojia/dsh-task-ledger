# dsh-task-ledger

Monorepo for the **task ledger** project — one repo, two npm packages:

| Package | What | Who installs it | Publish trigger |
|---|---|---|---|
| [`dsh-task-ledger`](https://www.npmjs.com/package/dsh-task-ledger) | DSH (DeepSeek Harness) plugin: task ledger board UI + the `task-ledger` skill bundled | DSH users (`dsh plugin add dsh-task-ledger`) | tag `plugin-v*` |
| [`task-ledger`](https://www.npmjs.com/package/task-ledger) | The standalone skill (SKILL.md + scripts + assets), zero-code | CodeBuddy / other agent users (`npm install task-ledger`) | tag `skill-v*` |

The skill content has a single source of truth at `packages/skill/`; the plugin bundles a copy built from it, so DSH users get the skill automatically while everyone else installs `task-ledger` directly.

## Status

- `task-ledger@1.0.2` published (2026-10-17): `history` JSON mode now emits JSON even when a workspace has no history files (fixes a 500 that blanked the whole board).
- `dsh-task-ledger@0.0.14` published (2026-10-17): fixed a real bug where 待认领 hint showed a doubled unit ('24 天 天') — `days()` already appends 天, so the hint string no longer does; card copy made formal (最长未认领 / 其他成员负责); the chart's third bar renamed from the colloquial '没完成' to the professional '未结' (Outstanding), consistent with the plugin's 结案/已结案 terminology.
