# dsh-task-ledger

**English** · [简体中文](README.zh-CN.md)

Task tracking for AI coding agents. A task is opened, claimed, advanced and closed by the agent itself, and every one of those steps is written into a plain-text `ledger/` directory inside the repository — so the owner of a task, its current state, the next step and the conclusion remain on record instead of dissolving into chat history.

![Task ledger board](https://raw.githubusercontent.com/cq-guojia/dsh-task-ledger/main/assets/screenshots/board.png)

## Why it exists

Work that spans several sessions, several days or several people loses three answers: who is doing it, how far it has progressed, and what it was supposed to achieve. A chat log does not preserve them reliably, and a hosted project tool keeps them outside the repository, away from the code they describe.

This ledger keeps those answers next to the code, in files that can be read, diffed and reviewed. Four properties define it:

| Property | What it means |
|---|---|
| **Task lifecycle tracking** | Tasks are created, claimed, resumed, handed over and closed. Every transition carries a timestamp and an owner; free-form progress, the conclusion and open issues live in the task document. |
| **Local by design** | No account, no hosted backend, no service marketplace. The ledger is plain JSON and Markdown committed with the repository; it works offline and is reviewable in a pull request. |
| **Single-user and multi-user** | One person on one machine, or a team sharing one repository. Ownership state is sharded per person, so two people advancing two tasks never write the same file. |
| **Version control as the sync layer** | Git is the transport. Push, pull and merge carry the ledger between machines and contributors, and commit history doubles as the audit trail. |

## Two packages

This repository ships one capability in two forms. They share a single source of truth for the skill, so the two never drift apart.

| Package | Form | Who it is for | Install |
|---|---|---|---|
| [`dsh-task-ledger`](https://www.npmjs.com/package/dsh-task-ledger) | Plugin for [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh): full board UI, with the skill bundled | dsh users | `dsh plugin add dsh-task-ledger` |
| [`task-ledger`](https://www.npmjs.com/package/task-ledger) | Standalone skill: instructions, CLI and assets only | Claude Code, Cursor, Codex, CodeBuddy, WorkBuddy, Trae, and any other agent that loads `SKILL.md` | see below |

Detailed documentation lives in each package: [plugin](packages/plugin/README.md) · [skill](packages/skill/README.md).

## Installing the skill in an agent

The skill is a directory containing `SKILL.md` and a prebuilt CLI. Installing it means copying that directory into the skills directory of the agent you use. Fetch the source once:

```bash
git clone --depth 1 https://github.com/cq-guojia/dsh-task-ledger.git /tmp/task-ledger-src
```

Then copy it to the location your agent reads. User-level paths apply to every project; project-level paths apply to one repository and are committed, which is how a team shares the same skill.

| Agent | User-level directory | Command |
|---|---|---|
| Claude Code | `~/.claude/skills/` | `mkdir -p ~/.claude/skills && cp -R /tmp/task-ledger-src/packages/skill ~/.claude/skills/task-ledger` |
| Cursor | `~/.cursor/skills/` | `mkdir -p ~/.cursor/skills && cp -R /tmp/task-ledger-src/packages/skill ~/.cursor/skills/task-ledger` |
| Codex CLI | `~/.codex/skills/` | `mkdir -p ~/.codex/skills && cp -R /tmp/task-ledger-src/packages/skill ~/.codex/skills/task-ledger` |
| CodeBuddy | `~/.codebuddy/skills/` | `mkdir -p ~/.codebuddy/skills && cp -R /tmp/task-ledger-src/packages/skill ~/.codebuddy/skills/task-ledger` |
| WorkBuddy | `~/.workbuddy/skills/` | `mkdir -p ~/.workbuddy/skills && cp -R /tmp/task-ledger-src/packages/skill ~/.workbuddy/skills/task-ledger` |
| Trae | `~/.trae/skills/` (Trae CN: `~/.trae-cn/skills/`) | `mkdir -p ~/.trae/skills && cp -R /tmp/task-ledger-src/packages/skill ~/.trae/skills/task-ledger` |

Notes:

- **Project-level install** — the same copies work under the repository: `.claude/skills/`, `.cursor/skills/`, `.codebuddy/skills/`, `.trae/skills/`, or `.agents/skills/` for the cross-agent convention read by Codex and Cursor.
- **Doubao Work (豆包工作)** — import the folder from the application: open the sidebar, choose Skills, and import `packages/skill` as a local skill.
- **Windows** — substitute `%USERPROFILE%\` for `~`.
- The repository holds two identical copies: `packages/skill/` is the source, `packages/plugin/skill/` is the copy bundled into the dsh plugin. Either may be installed; the content is the same.

Once installed, run the identity setup once per machine. It is interactive and must be run by you, not by the agent:

```bash
~/.claude/skills/task-ledger/scripts/progress init --new --name "Your Name"
```

Requirements: Git 2.27 or newer for multi-user synchronisation. No runtime, package manager or network access is required afterwards — the CLI ships as a static binary for Linux, macOS and Windows.

## What gets written

```
ledger/
├── pool.json                 unclaimed tasks (shared)
├── owners.json               index: identity → shard file
├── owners/<hash>.json        one shard per person: tasks they own
├── worklog/<YYYYMM>/*.md     task documents, six fixed sections
└── history/<YYYYMM>.md       closed tasks, one row each
```

State and prose are kept apart: JSON holds who owns what and in which state, Markdown holds the reasoning. Only the CLI writes state, history and the execution log; the agent writes the first five sections of a task document and nothing else.

![Task document](https://raw.githubusercontent.com/cq-guojia/dsh-task-ledger/main/assets/screenshots/worklog.png)

## The board

The dsh plugin adds a board on top of the same data: in-flight tasks by owner, unclaimed work, overdue and stalled items, weekly trend, and a history view that aggregates closed tasks by day, week, month and quarter.

![History](https://raw.githubusercontent.com/cq-guojia/dsh-task-ledger/main/assets/screenshots/history.png)

Tasks can be closed from the board in two ways: directly, with a one-line summary, or by handing the task back to the agent, which reads the recorded progress, writes the conclusion and open issues, then closes it.

![Closing a task](https://raw.githubusercontent.com/cq-guojia/dsh-task-ledger/main/assets/screenshots/close-task.png)

## Development

```bash
npm test        # Go: vet + unit tests
cd packages/plugin && npm run verify   # build + typecheck
```

## Licence

MIT — see [LICENSE](LICENSE).
