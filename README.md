# dsh-task-ledger

Monorepo for the **task ledger** project — one repo, two npm packages:

| Package | What | Who installs it | Publish trigger |
|---|---|---|---|
| [`dsh-task-ledger`](https://www.npmjs.com/package/dsh-task-ledger) | DSH (DeepSeek Harness) plugin: task ledger board UI + the `task-ledger` skill bundled | DSH users (`dsh plugin add dsh-task-ledger`) | tag `plugin-v*` |
| [`task-ledger`](https://www.npmjs.com/package/task-ledger) | The standalone skill (SKILL.md + scripts + assets), zero-code | CodeBuddy / other agent users (`npm install task-ledger`) | tag `skill-v*` |

The skill content has a single source of truth at `packages/skill/`; the plugin bundles a copy built from it, so DSH users get the skill automatically while everyone else installs `task-ledger` directly.

## Status

- `task-ledger@1.0.2` published (2026-10-17): `history` JSON mode now emits JSON even when a workspace has no history files (fixes a 500 that blanked the whole board).
- `dsh-task-ledger@0.0.16` published (2026-10-17): hardened the board so a client/host version mismatch can never black-screen it — chart buckets read `end` with a fallback to `week` (a hot-update left an old host without the `end` field and `bucket.end.slice(5)` threw, crashing the whole panel). 0.0.15 already emits `end`; 0.0.16 just makes the client crash-proof.
