# dsh-task-ledger

Monorepo for the **task ledger** project — one repo, two npm packages:

| Package | What | Who installs it | Publish trigger |
|---|---|---|---|
| [`dsh-task-ledger`](https://www.npmjs.com/package/dsh-task-ledger) | DSH (DeepSeek Harness) plugin: task ledger board UI + the `task-ledger` skill bundled | DSH users (`dsh plugin add dsh-task-ledger`) | tag `plugin-v*` |
| [`task-ledger`](https://www.npmjs.com/package/task-ledger) | The standalone skill (SKILL.md + scripts + assets), zero-code | CodeBuddy / other agent users (`npm install task-ledger`) | tag `skill-v*` |

The skill content has a single source of truth at `packages/skill/`; the plugin bundles a copy built from it, so DSH users get the skill automatically while everyone else installs `task-ledger` directly.

## Status

- `task-ledger@1.0.2` published (2026-10-17): `history` JSON mode now emits JSON even when a workspace has no history files (fixes a 500 that blanked the whole board).
- `dsh-task-ledger@0.0.12` published (2026-10-17): stats value font bumped to a dedicated `--dtl-font-stat: 26px` (was too small); stat-card sub-text rewritten formally (e.g. "最久未认领 N 天", "他人负责 N 条"); fixed a real bug where the chart bars were invisible (percentage heights collapsed because the absolutely-positioned pair had no definite height — now `top/bottom` anchored, non-zero bars get `min-height:2px`); the "mine only" checkbox shrunk to `--dtl-font-xs` and moved up.
