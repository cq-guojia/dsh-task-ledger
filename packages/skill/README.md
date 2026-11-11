# task-ledger

**English** · [简体中文](https://github.com/cq-guojia/dsh-task-ledger/blob/main/packages/skill/README.zh-CN.md)

A task ledger for AI coding agents. The agent records what it is working on — who owns it, how far it has got, when it was opened and when it was closed — as plain text inside the repository, so the answer survives the end of the conversation.

The package is an Agent Skill: a `SKILL.md` instruction file, a prebuilt command-line tool and reference material. It is loaded by any AI coding agent that supports the open `SKILL.md` format — Claude Code, Cursor, Codex, CodeBuddy, WorkBuddy, Trae, Doubao Work and others. Several agents can install the same skill and record work in one shared ledger; see [Multiple agents, one ledger](#multiple-agents-one-ledger).

Four properties define it:

| Property | What it means |
|---|---|
| **Task lifecycle tracking** | Tasks are created, claimed, resumed, handed over and closed. Every transition carries a timestamp and an owner; progress, the conclusion and open issues are written into the task document. |
| **Local by design** | No account, no hosted backend, no service marketplace. The ledger is JSON and Markdown committed with the repository; it works offline and is reviewable in a pull request. |
| **Single-user and multi-user** | One person on one machine, or a team sharing one repository. Ownership state is sharded per person, so concurrent work never writes the same file. |
| **Version control as the sync layer** | Git is the transport. Push, pull and merge carry the ledger between machines and contributors. |

![Task document](https://raw.githubusercontent.com/cq-guojia/dsh-task-ledger/main/assets/screenshots/worklog.png)

## Install

Deployment comprises three stages: install the skill into the agent's skills directory (this section), declare a standing rule in the project rules file ([optional](#standing-rule-in-the-project-rules-file)), and — for dsh plugin users — register the repository as a ledger directory so the board aggregates it. The skill has no build step and no runtime dependency beyond its prebuilt CLI.

### With a skill manager

The [skills CLI](https://skills.sh) (Vercel) detects the AI coding agents installed on the machine, writes the skill into the corresponding user-level skills directories, and can update it later:

```bash
npx skills add cq-guojia/dsh-task-ledger -g
```

The argument is a GitHub repository coordinate: the CLI resolves the monorepo and locates the `SKILL.md` skill within it. `-g` installs at user level so the skill applies to every project; omit it to install for the current project only, and add `--agent` to restrict the targets. The CLI does not accept an npm package name as a source. Where the source directory must be pinned, the tree form `https://github.com/cq-guojia/dsh-task-ledger/tree/main/packages/skill` is also accepted.

[SkillHub](https://skillhub.cn) — the skill marketplace behind CodeBuddy and WorkBuddy — installs a skill once it is listed there. When search does not find `task-ledger`, use the client's local import and point it at `packages/skill`, or add this repository as a GitHub source in the SkillHub desktop application.

### Delegate the installation to the agent

Installation can be delegated instead of executed in a shell. Send the agent this instruction:

> Install the task-ledger skill (npm package task-ledger, GitHub repo cq-guojia/dsh-task-ledger).

The npm package name and the GitHub coordinate identify the same skill; the agent resolves the source and installs it into the skills directory it reads.

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

**Windows.** Substitute `%USERPROFILE%\` for `~`, and replace every `scripts/progress` below with `scripts\bin\ledger-windows-amd64.exe`: CreateProcessW cannot execute an extensionless sh wrapper (it appends `.exe`, finds nothing, and fails). The wrapper still works under Git Bash / WSL. The CLI ships binaries for Linux (amd64), macOS (arm64) and Windows (amd64).

## First run

Once per machine, initialise the identity that signs every ledger entry. The step is interactive and must be run by you — the agent is not allowed to create or rewrite an identity on your behalf:

```bash
~/.claude/skills/task-ledger/scripts/progress init
```

On a second machine, run `init` without arguments and claim the identity already present in the ledger roster, so that both machines write under the same account.

No runtime, package manager or network access is required afterwards. Multi-user synchronisation requires Git 2.27 or newer.

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

## Multiple agents, one ledger

The skill is not bound to a single AI coding agent. Installing it in several agents on the same machine and pointing them at one repository means every agent writes to the same plain-text `ledger/` directory; Git carries the records between agents and machines. Supported clients include Claude Code, Cursor, Codex, CodeBuddy, WorkBuddy, Trae and any agent that loads `SKILL.md`.

Two independent mechanisms deliver the ledger convention:

| Mechanism | Scope | Delivery |
|---|---|---|
| **Session rules injection** (dsh plugin) | dsh sessions only | The plugin injects the default prompt into the first turn of each session, once per session. Enabled by default, configurable in the plugin settings page, and never writes to the workspace rules file. |
| **Standing rule in the project rules file** | Any agent | The same text is declared in `AGENTS.md` (or the equivalent rules file) and committed with the repository. |

For dsh users, the board aggregates only repositories registered in its settings page. After another agent has written to a project, register that project's root directory under **Ledger folders → Add folder**; its tasks, history and trends then appear alongside the rest. Registration changes only the board's local directory list, never the ledger data.

## Links

- Repository and full documentation: <https://github.com/cq-guojia/dsh-task-ledger>
- The dsh plugin, which bundles this skill with a board UI: [`dsh-task-ledger`](https://www.npmjs.com/package/dsh-task-ledger)

## Licence

MIT
