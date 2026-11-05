# task-ledger

**English** · [简体中文](https://github.com/cq-guojia/dsh-task-ledger/blob/main/packages/skill/README.zh-CN.md)

A task ledger for AI coding agents. The agent records what it is working on — who owns it, how far it has got, when it was opened and when it was closed — as plain text inside the repository, so the answer survives the end of the conversation.

The package is a skill: a `SKILL.md` file, a prebuilt command-line tool, and reference material. It runs on any agent that loads the open `SKILL.md` format: Claude Code, Cursor, Codex, CodeBuddy, WorkBuddy, Trae, Doubao Work and others.

Four properties define it:

| Property | What it means |
|---|---|
| **Task lifecycle tracking** | Tasks are created, claimed, resumed, handed over and closed. Every transition carries a timestamp and an owner; progress, the conclusion and open issues are written into the task document. |
| **Local by design** | No account, no hosted backend, no service marketplace. The ledger is JSON and Markdown committed with the repository; it works offline and is reviewable in a pull request. |
| **Single-user and multi-user** | One person on one machine, or a team sharing one repository. Ownership state is sharded per person, so concurrent work never writes the same file. |
| **Version control as the sync layer** | Git is the transport. Push, pull and merge carry the ledger between machines and contributors. |

![Task document](https://raw.githubusercontent.com/cq-guojia/dsh-task-ledger/main/assets/screenshots/worklog.png)

## Install

### With a skill manager

The [skills CLI](https://skills.sh) (Vercel) detects the agents installed on the machine, writes the skill into the right directory for each, and can update it later:

```bash
npx skills add https://github.com/cq-guojia/dsh-task-ledger/tree/main/packages/skill
```

The path is part of the command: this repository is a monorepo holding two copies of the skill, and `packages/skill` selects the source. Add `-g` to install for every project rather than the current one, and `--agent` to restrict the targets.

[SkillHub](https://skillhub.cn) — the market behind CodeBuddy and WorkBuddy — installs a skill once it is listed there. When search does not find `task-ledger`, use the client's local import and point it at `packages/skill`, or add this repository as a GitHub source in the SkillHub desktop application.

### Manually

Installing means copying the skill directory into the directory your agent reads. Fetch the source once:

```bash
git clone --depth 1 https://github.com/cq-guojia/dsh-task-ledger.git /tmp/task-ledger-src
```

Then copy it for the agent you use. User-level paths apply to every project; project-level paths apply to one repository and can be committed, which is how a team shares one skill.

| Agent | User-level directory | Command |
|---|---|---|
| **Claude Code** | `~/.claude/skills/` | `mkdir -p ~/.claude/skills && cp -R /tmp/task-ledger-src/packages/skill ~/.claude/skills/task-ledger` |
| **Cursor** | `~/.cursor/skills/` | `mkdir -p ~/.cursor/skills && cp -R /tmp/task-ledger-src/packages/skill ~/.cursor/skills/task-ledger` |
| **Codex CLI** | `~/.codex/skills/` | `mkdir -p ~/.codex/skills && cp -R /tmp/task-ledger-src/packages/skill ~/.codex/skills/task-ledger` |
| **CodeBuddy** | `~/.codebuddy/skills/` | `mkdir -p ~/.codebuddy/skills && cp -R /tmp/task-ledger-src/packages/skill ~/.codebuddy/skills/task-ledger` |
| **WorkBuddy** | `~/.workbuddy/skills/` | `mkdir -p ~/.workbuddy/skills && cp -R /tmp/task-ledger-src/packages/skill ~/.workbuddy/skills/task-ledger` |
| **Trae** | `~/.trae/skills/` (Trae CN: `~/.trae-cn/skills/`) | `mkdir -p ~/.trae/skills && cp -R /tmp/task-ledger-src/packages/skill ~/.trae/skills/task-ledger` |

**Project-level installation.** The same copy works inside a repository: `.claude/skills/`, `.cursor/skills/`, `.codebuddy/skills/`, `.trae/skills/`, or `.agents/skills/` — the cross-agent convention read by Codex and Cursor. Committed alongside the code, it gives every contributor the same instructions.

**Doubao Work (豆包工作).** Import the folder from the application: open the sidebar, choose Skills, and import `packages/skill` as a local skill. The application does not document a user-level skills directory, so in-app import is the supported route.

**Other agents.** Place the directory under `.agents/skills/task-ledger/`, or wherever the agent scans for `SKILL.md`. Nothing in the package depends on the host: the CLI is a static binary, the content is Markdown.

**Windows.** Substitute `%USERPROFILE%\` for `~`. The CLI ships binaries for Linux (amd64), macOS (arm64) and Windows (amd64); the wrapper script selects the right one.

## First run

Once per machine, initialise the identity that signs every ledger entry. The step is interactive and must be run by you — the agent is not allowed to create or rewrite an identity on your behalf:

```bash
~/.claude/skills/task-ledger/scripts/progress init --new --name "Your Name"
```

On a second machine, run `init` without arguments and claim the identity already present in the ledger roster, so that both machines write under the same account.

No runtime, package manager or network access is required afterwards.

## Using it

There are no commands for you to type. The ledger is driven by what you say to the agent: when a request matches one of the intents below, the agent runs the corresponding operation and records it.

| You say | What the agent does | Result |
|---|---|---|
| "Open a task: get the release pipeline working" | creates the task with the tags you gave | In the shared pool, state `open`, unclaimed |
| "Open a task and start on it" | creates and claims it | Owned by you, state `doing` |
| "I'll take that one" / "continue with X" | claims the task | Moved to your name, state `doing` |
| *(while working)* | writes the task document, then appends an execution record | Progress, conclusions and blockers on record |
| "Blocked for now" / "leave it for a while" | records the blocker, leaves the state alone | Still `doing` — a pause is neither a release nor a cancellation |
| "Hand it back" | releases it | Returns to the shared pool for anyone to claim |
| "Close this task" | closes it with your summary | One row written to history; read-only afterwards |
| "Cancel it" | closes it as void, with the reason | Closed, not completed |
| "Delete it" | asks you to confirm, then deletes | Removed permanently — no undo, no restore |
| "What should I be doing?" / "what did we close last week?" | lists in-flight tasks, one task, or history | Query only, nothing written |

Creating a task requires two inputs: **what the work is** — one sentence, without category or project prefixes — and **what it touches** — one to five tags. A category may be given at creation; it is immutable afterwards.

Four rules bind the agent:

- It never creates, claims, releases, closes or deletes a task on its own initiative. Each of those needs an explicit instruction from you, and a vague "done" is answered with a question rather than a closure.
- It never edits state files, the history file or the execution log. Only the task document's first five sections are its to write.
- It completes the written record before closing: a closed task cannot be written to again.
- When it cannot find a task for the work at hand, it asks whether to create one instead of registering work you did not ask for.

## What gets written

```
ledger/
├── pool.json                 unclaimed tasks (shared)
├── owners.json               index: identity → shard file
├── owners/<hash>.json        one shard per person: the tasks they own
├── worklog/<YYYYMM>/*.md     task documents, six fixed sections
└── history/<YYYYMM>.md       closed tasks, one row each
```

State and prose are kept apart: JSON records ownership and state, Markdown records the reasoning. Only the CLI writes state, history and the execution log; the agent writes the first five sections of a task document and nothing else. All timestamps are stored in UTC and rendered in local time.

## Commands

| Command | Purpose |
|---|---|
| `init` | Initialise or claim the machine identity (once per machine) |
| `new` | Create a task |
| `claim` | Take ownership of a task |
| `set` | Change state, owner, tags or notes |
| `log` | Append an execution record to a task document |
| `close` | Close a task and write its history row |
| `delete` | Delete a task created in error |
| `list` | List in-flight tasks |
| `show` | Show one task |
| `history` | List closed tasks |
| `stats` | Aggregate counters and trend |
| `owners` | List known identities |
| `root` | Detect whether a directory holds a ledger |
| `whoami` | Show the current identity |
| `validate` | Check ledger consistency |

Run `scripts/progress <command> --help` for parameters. The agent-facing workflow lives in `SKILL.md`.

## Multiple users

Ownership is sharded: each person's tasks live in their own file, so two people advancing two tasks never touch the same file. Git merges the shards, the worklog documents and the history file. Where two people edit the same task document, the conflict is confined to that one file.

## Links

- Repository and full documentation: <https://github.com/cq-guojia/dsh-task-ledger>
- The dsh plugin, which bundles this skill with a board UI: [`dsh-task-ledger`](https://www.npmjs.com/package/dsh-task-ledger)

## Licence

MIT
