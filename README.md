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

Deployment comprises three stages: install the skill into the agent's skills directory (this section), declare a standing rule in the project rules file (see below), and — for dsh users — register the repository as a ledger directory so the board aggregates it. See [Use from other agents](#use-from-other-agents) for the second and third stages.

### With a skill manager

The [skills CLI](https://skills.sh) (Vercel) detects the AI coding agents installed on the machine, writes the skill into their user-level skills directories and keeps it updated:

```bash
npx skills add cq-guojia/dsh-task-ledger -g
```

The argument is a GitHub repository coordinate: the CLI resolves the monorepo and locates the `SKILL.md` skill within it. `-g` installs at user level for all projects; omit it to install for the current project only, and add `--agent` to restrict the targets. The CLI does not accept an npm package name as a source. Where the source directory must be pinned, the tree form `https://github.com/cq-guojia/dsh-task-ledger/tree/main/packages/skill` is also accepted.

[SkillHub](https://skillhub.cn) and the skill marketplaces built into CodeBuddy and WorkBuddy install a skill once it is listed; when search does not find `task-ledger`, use the client's local import and point it at `packages/skill`, or add this repository as a GitHub source.

**Delegated installation.** The deployment can also be handed to the agent itself:

> Install the task-ledger skill (npm package task-ledger, GitHub repo cq-guojia/dsh-task-ledger).

### Manually

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
- **Windows** — substitute `%USERPROFILE%\` for `~`. Everywhere below, replace `scripts/progress` with `scripts\bin\ledger-windows-amd64.exe`: CreateProcessW cannot execute an extensionless sh wrapper (it appends `.exe`, finds nothing, and fails). The wrapper still works under Git Bash / WSL.
- The repository holds two identical copies: `packages/skill/` is the source, `packages/plugin/skill/` is the copy bundled into the dsh plugin. Either may be installed; the content is the same.

Once installed, run the identity setup once per machine. It is interactive and must be run by you, not by the agent:

```bash
~/.claude/skills/task-ledger/scripts/progress init
```

Requirements: Git 2.27 or newer for multi-user synchronisation. No runtime, package manager or network access is required afterwards — the CLI ships as a static binary for Linux, macOS and Windows.

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

### Standing rule in the project rules file

The skill loads only when a request matches one of the intents above; "should this piece of work be tracked" is not one of them. A standing rule in the project's `AGENTS.md` (or the equivalent rules file of the agent) declares the convention explicitly. The block below is the built-in default prompt of the dsh plugin — the same text that **session rules injection** delivers into the first turn of every dsh session:

```markdown
Usage rules for the task-ledger tool [task-ledger skill]:

- **Task progress, work items and work logs**: (create / advance / query / close) go through the task-ledger skill; answer questions about progress and task history from it, never from conversation memory or a hand-rolled list.
- **Creation anchor**: register a task only when the user explicitly asks for a new one ("open a task", "log this first", "create a task"); questions, queries, discussion and small incidental edits do not count — ask when unsure, and never create a task without an explicit instruction.
- **How to create and in what order**: the authorization and confirmation rules all follow the task-ledger skill's own instructions.
- **Ask in passing**: when the user is pushing forward work that spans turns (this turn ends with actions still on your plate) and has never mentioned tracking it, ask once after answering: "Want me to open a ledger for this task? (Ignore this if not needed — no reply necessary.)"; once asked in a session, do not ask again; no reply means ignore it.
```

With injection enabled (the default), dsh sessions do not require this block. Other agents do, because injection applies to dsh sessions only. Without either mechanism the skill still works, but only when the task is mentioned explicitly.

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

## Use from other agents

One ledger is shared by every agent that writes to the repository. Installing the same Agent Skill in another AI coding agent — Claude Code, Cursor, Codex, CodeBuddy, WorkBuddy, Trae or any client that loads `SKILL.md` — gives it the same commands, and its records land in the same `ledger/` directory the board reads.

The ledger convention reaches an agent through two independent mechanisms:

| Mechanism | Applies to | Delivery |
|---|---|---|
| **Session rules injection** (dsh plugin) | dsh sessions only | The plugin injects the default prompt into the first turn of each session, once per session. Enabled by default and configurable on the plugin settings page; it never writes to the workspace rules file. |
| **Standing rule in the project rules file** | Any agent | The same prompt is placed in `AGENTS.md` (or the equivalent rules file) and travels with the repository. |

Three steps bring an external agent's work into the board: install the skill (`npx skills add cq-guojia/dsh-task-ledger -g`, or the delegated prompt above), declare the standing rule in `AGENTS.md` unless the agent is dsh with injection enabled, and register the project root under **Settings → Ledger folders → Add folder**. The board aggregates only directories registered on this machine; registration modifies no ledger data. The plugin settings page presents the same three steps with copyable commands and prompt.

## Development

```bash
npm test        # Go: vet + unit tests
cd packages/plugin && npm run verify   # build + typecheck
```

## Licence

MIT — see [LICENSE](LICENSE).
