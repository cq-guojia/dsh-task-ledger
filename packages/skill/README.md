# task-ledger

**English** · [简体中文](https://github.com/cq-guojia/dsh-task-ledger/blob/main/packages/skill/README.zh-CN.md)

A task ledger that lives in your workspace: any kind of task is fair game — not just development work, but research, documentation, presentations and video production. The agent records what it is working on — who owns it, how far it has got, when it was opened and when it was closed — as plain text inside the repository, so the answers survive the end of the conversation.

This package is an Agent Skill: a `SKILL.md` instruction file, a prebuilt command-line tool and reference material. It is loaded by any agent that supports the open `SKILL.md` format, and several agents can install the same skill and record work in one shared ledger.

Four properties define it:

| Property | What it means |
|---|---|
| **Task lifecycle tracking** | Tasks are created, claimed, resumed, handed over and closed. Every transition carries a timestamp and an owner; progress, the conclusion and open issues are written into the task document. |
| **Local by design** | No account, no hosted backend, no service marketplace. The ledger is JSON and Markdown committed with the repository; it works offline and can be reviewed line by line. |
| **Single-user and multi-user** | One person on one machine, or a team sharing one repository. Ownership state is sharded per person, so concurrent work never writes the same file. |
| **Version control as the sync layer** | Git is the transport. Push, pull and merge carry the ledger between machines and contributors. |

![Task document](https://raw.githubusercontent.com/cq-guojia/dsh-task-ledger/main/assets/screenshots/worklog.png)

## Install

If you use [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), you **do not need to install this skill separately** — the `dsh-task-ledger` plugin bundles it. For plugin installation, see the [root README](https://github.com/cq-guojia/dsh-task-ledger#readme).

The rest is for other agents. Claude Code, Cursor, Codex, CodeBuddy, WorkBuddy, Trae, Doubao Work and any agent that loads `SKILL.md` are supported; the same skill installed in different agents still writes to this project's ledger.

### 1. Install the skill

One command installs it for every agent already on this machine — the [skills CLI](https://skills.sh) (Vercel) detects them, so you never pick a directory:

```bash
npx skills add cq-guojia/dsh-task-ledger -g
```

Or send this line to any agent and let it install:

> Install the task-ledger skill (npm package task-ledger, GitHub repo cq-guojia/dsh-task-ledger).

The argument is a GitHub repository coordinate: `-g` installs at user level so the skill applies to every project; omit it to install for the current project only, and add `--agent` to restrict the targets. The CLI does not accept an npm package name as a source.

### 2. Inject the rules (optional)

Add this to `AGENTS.md` in the project root so the agent follows the ledger convention:

```markdown
Usage rules for the task-ledger tool [task-ledger skill]:

- **Task progress, work items and work logs**: (create / advance / query / close) go through the task-ledger skill; answer questions about progress and task history from it, never from conversation memory or a hand-rolled list.
- **Creation anchor**: register a task only when the user explicitly asks for a new one ("open a task", "log this first", "create a task"); questions, queries, discussion and small incidental edits do not count — ask when unsure, and never create a task without an explicit instruction.
- **How to create and in what order**: the authorization and confirmation rules all follow the task-ledger skill's own instructions.
- **Ask in passing**: when the user is pushing forward work that spans turns (this turn ends with actions still on your plate) and has never mentioned tracking it, ask once after answering: "Want me to open a ledger for this task? (Ignore this if not needed — no reply necessary.)"; once asked in a session, do not ask again; no reply means ignore it.
```

With session rules injection enabled (the default), dsh sessions do not need this block; other agents do.

### 3. Manage it on the board

The board is currently available only as a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin board. To view and manage these tasks on a board, install the `dsh-task-ledger` plugin in dsh as described in the [root README](https://github.com/cq-guojia/dsh-task-ledger#readme).

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
| `set` | Release a task, hand it to someone, or replace its tags |
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
