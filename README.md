# dsh-task-ledger

Monorepo for the **task ledger** project — one repo, two npm packages:

| Package | What | Who installs it | Publish trigger |
|---|---|---|---|
| [`dsh-task-ledger`](https://www.npmjs.com/package/dsh-task-ledger) | DSH (DeepSeek Harness) plugin: task ledger board UI + the `task-ledger` skill bundled | DSH users (`dsh plugin add dsh-task-ledger`) | tag `plugin-v*` |
| [`task-ledger`](https://www.npmjs.com/package/task-ledger) | The standalone skill (SKILL.md + scripts + assets), zero-code | CodeBuddy / other agent users (`npm install task-ledger`) | tag `skill-v*` |

The skill content has a single source of truth at `packages/skill/`; the plugin bundles a copy built from it, so DSH users get the skill automatically while everyone else installs `task-ledger` directly.

## Status

- `task-ledger@1.2.1` published (2026-10-19): prompt slimmed from ~26 KB to ~9 KB (details moved to `references/`, loaded on demand); `description` rewritten as pure routing (three intent clusters + explicit-only close/release) — no commands, paths or workflow text; handover removed from the prompt (release → claim only, `set --owner` kept for a future UI); history table separator fixed to 9 columns; older worklogs without the 执行记录 section get one appended automatically.
- `dsh-task-ledger@0.0.55` published (2026-10-19): bundles the slimmed skill and its references; no host behaviour change beyond `0.0.54`.
- `task-ledger@1.2.0` published (2026-10-19): worklog gains a script-maintained **执行记录** section (`- 时间 · 类型 · @谁 · 说明`, types `new`/`claim`/`set`/`release`/`log`/`close`, append-only) and a new `log` subcommand; `progress.json` gains `updated` (last-progress time); **`blocked` state removed** — blocked/stale are now time-derived flags (7 days since start / 3 days since last update), old `blocked` rows stay readable as in-progress.
- `dsh-task-ledger@0.0.54` published (2026-10-19): board stats `blocked`/`myBlocked` replaced by time-derived `overdue`/`myOverdue` (7 days since start); stale now means 3 days without progress and feeds the `updated` field; per-row `overdue` flag ships for the UI round.
- `task-ledger@1.0.2` published (2026-10-17): `history` JSON mode now emits JSON even when a workspace has no history files (fixes a 500 that blanked the whole board).
- `task-ledger@1.1.0` published (2026-10-17): history format 8→9 columns — new **creator** column (task initiator, distinct from owner which can be claimed away). `close` writes it; `upgrade_history` migrates legacy rows by following each row's worklog link and reading the 「创建：…（@发起人）」 header (same source as `created` — **no data lost**); read-only `history --json` also back-fills it for unmigrated 8-col rows.
- `dsh-task-ledger@0.0.18` published (2026-10-17): chart semantics fixed per user — **新增（我的）now means 'created by me' (creator)**, while 完成/未结（我的）stay 'owned by me' (owner). Previously all three used owner. Smoke adds a fork-semantics integration test (creator-created + other-owned open/closed fixtures: mine.created=2, mine.done=0, mine.remaining=0) and scopes the remaining baseline invariant to `all` only (mine's three series are now different scopes — mixing them in one identity is invalid).
- `dsh-task-ledger@0.0.17` published (2026-10-17): chart hover tooltip cleaned up — top line now only shows the week-end date (e.g. '截至 2026-10-17'), with the three colored rows below carrying the numbers; when '只看我的' is checked the date line shows '(只看我的)' so the scope is obvious.
