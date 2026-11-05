# dsh-task-ledger

[English](README.md) · **简体中文**

面向 AI 编码代理的任务台账。任务由代理自行创建、认领、推进与结案，每一步都写入仓库内的纯文本 `ledger/` 目录 —— 谁在做、做到哪、下一步是什么、结论是什么，全程留痕，不会随对话窗口关闭而丢失。

![任务台账看板](https://raw.githubusercontent.com/cq-guojia/dsh-task-ledger/main/assets/screenshots/board.png)

## 它解决什么问题

只要一件工作跨了多次会话、跨了若干天，或者由多人接力，三个问题就再也答不上来：谁在做、做到哪一步、原本要达成什么。对话记录答不上来，托管型项目管理工具虽然答得上，却把答案留在了仓库之外、离它所描述的代码很远的地方。

本台账把这些答案放在代码旁边，以可读、可 diff、可评审的文件形式保存。它的定位由四点界定：

| 特性 | 具体含义 |
|---|---|
| **任务全生命周期跟踪** | 任务可创建、认领、续做、移交、结案。每次状态变更都带时间与责任人；过程叙述、结案结论与遗留问题写在任务正文中。 |
| **本地化工具** | 不需要账号、不需要托管后端、不依赖任何服务市场。台账是与仓库一同提交的 JSON 与 Markdown，离线可用，可在代码评审中逐行审阅。 |
| **单人可用，多人亦可用** | 单机单人可直接使用；团队共用一个仓库同样成立。归属状态按人分片存储，两人各自推进各自的任务时不会写同一份文件。 |
| **以 Git 承载版本同步** | Git 即传输通道。push、pull、merge 把台账带到其他机器与其他人，提交历史本身构成审计记录。 |

## 两个包

同一套能力以两种形态发布。skill 内容只有一个真源，两者不会产生分歧。

| 包 | 形态 | 适用对象 | 安装 |
|---|---|---|---|
| [`dsh-task-ledger`](https://www.npmjs.com/package/dsh-task-ledger) | [DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) 插件：完整看板界面，内置 skill | dsh 用户 | `dsh plugin add dsh-task-ledger` |
| [`task-ledger`](https://www.npmjs.com/package/task-ledger) | 独立 skill：仅含执行说明、命令行与资源 | Claude Code、Cursor、Codex、CodeBuddy、WorkBuddy、Trae，以及其他加载 `SKILL.md` 的代理 | 见下一节 |

各包的完整说明：[插件](packages/plugin/README.zh-CN.md) · [skill](packages/skill/README.zh-CN.md)。

## 为代理安装 skill

skill 就是一个包含 `SKILL.md` 与预编译命令行的目录。安装即：把该目录复制到你所使用代理的技能目录。先取一份源码：

```bash
git clone --depth 1 https://github.com/cq-guojia/dsh-task-ledger.git /tmp/task-ledger-src
```

再按代理复制到下列位置。用户级目录对所有项目生效；项目级目录只对单个仓库生效，且可随仓库提交，这是团队共用同一份 skill 的方式。

| 代理 | 用户级目录 | 命令 |
|---|---|---|
| Claude Code | `~/.claude/skills/` | `mkdir -p ~/.claude/skills && cp -R /tmp/task-ledger-src/packages/skill ~/.claude/skills/task-ledger` |
| Cursor | `~/.cursor/skills/` | `mkdir -p ~/.cursor/skills && cp -R /tmp/task-ledger-src/packages/skill ~/.cursor/skills/task-ledger` |
| Codex CLI | `~/.codex/skills/` | `mkdir -p ~/.codex/skills && cp -R /tmp/task-ledger-src/packages/skill ~/.codex/skills/task-ledger` |
| CodeBuddy | `~/.codebuddy/skills/` | `mkdir -p ~/.codebuddy/skills && cp -R /tmp/task-ledger-src/packages/skill ~/.codebuddy/skills/task-ledger` |
| WorkBuddy | `~/.workbuddy/skills/` | `mkdir -p ~/.workbuddy/skills && cp -R /tmp/task-ledger-src/packages/skill ~/.workbuddy/skills/task-ledger` |
| Trae | `~/.trae/skills/`（Trae 国内版：`~/.trae-cn/skills/`） | `mkdir -p ~/.trae/skills && cp -R /tmp/task-ledger-src/packages/skill ~/.trae/skills/task-ledger` |

补充说明：

- **项目级安装** — 同样的复制方式也适用于仓库内：`.claude/skills/`、`.cursor/skills/`、`.codebuddy/skills/`、`.trae/skills/`，以及 Codex 与 Cursor 都能读取的跨代理约定目录 `.agents/skills/`。
- **豆包工作** — 在应用内导入：打开侧栏，进入「技能」，将 `packages/skill` 作为本地技能导入。
- **Windows** — 将路径中的 `~` 替换为 `%USERPROFILE%\`。
- 仓库内有两份内容完全相同的副本：`packages/skill/` 为源，`packages/plugin/skill/` 是随 dsh 插件一起分发的副本。装哪一份都可以，内容一致。

安装完成后，每台机器需执行一次身份初始化。该步骤为交互式，必须由你本人执行，不能交由代理代做：

```bash
~/.claude/skills/task-ledger/scripts/progress init --new --name "你的名字"
```

环境要求：多人同步需 Git 2.27 及以上。此后无需任何运行时、包管理器或网络 —— 命令行以静态二进制形式提供，覆盖 Linux、macOS 与 Windows。

## 落盘的数据

```
ledger/
├── pool.json                 公共池:未认领任务
├── owners.json               索引:身份 → 分片文件
├── owners/<hash>.json        每人一份分片:其名下任务
├── worklog/<年月>/*.md       任务正文,固定六节
└── history/<年月>.md         已结案任务,一行一条
```

状态与正文分离：JSON 记录归属与状态，Markdown 记录来龙去脉。只有命令行工具可写状态、历史与执行记录；代理只能写任务正文的前五节，其余一律不改。

![任务正文](https://raw.githubusercontent.com/cq-guojia/dsh-task-ledger/main/assets/screenshots/worklog.png)

## 看板

dsh 插件在同一份数据之上提供看板：按责任人展示在办任务、待认领任务、逾期与停滞项、周度趋势，以及按日 / 周 / 月 / 季度聚合的结案历史。

![历史视图](https://raw.githubusercontent.com/cq-guojia/dsh-task-ledger/main/assets/screenshots/history.png)

任务可在看板上以两种方式结案：直接结案并写一句摘要；或交还给代理，由代理读完已记录的进度，写出结论与遗留问题，再行结案。

![结案任务](https://raw.githubusercontent.com/cq-guojia/dsh-task-ledger/main/assets/screenshots/close-task.png)

## 开发

```bash
npm test        # Go:vet 与单元测试
cd packages/plugin && npm run verify   # 构建与类型检查
```

## 许可

MIT，见 [LICENSE](LICENSE)。
