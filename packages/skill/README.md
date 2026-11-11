**简体中文** · [English](https://github.com/cq-guojia/dsh-task-ledger/blob/main/packages/skill/README.zh-CN.md)

一本放在工作区里的任务台账：什么任务都可以用，不限于开发工作，调研、文档、演示、视频制作都能建任务。Agent 把正在做的事 —— 谁在做、做到哪一步、何时开始、何时结束 —— 以纯文本形式记录在仓库内，答案不会随对话结束而丢失。

本包是一份 Agent Skill：包含 `SKILL.md` 执行说明、预编译命令行工具与参考资料。凡支持开放 `SKILL.md` 格式的 Agent 均可加载；多个 Agent 可同时安装同一份技能并写入同一本台账。

它的定位由四点界定：

| 特性 | 具体含义 |
|---|---|
| **任务全生命周期跟踪** | 任务可创建、认领、续做、移交、结案。每次状态变更都带时间与责任人；过程、结论与遗留问题写入任务正文。 |
| **本地化工具** | 不需要账号、不需要托管后端、不依赖任何服务市场。台账是与仓库一同提交的 JSON 与 Markdown，离线可用，可在评审中审阅。 |
| **单人可用，多人亦可用** | 单机单人可直接使用；团队共用一个仓库同样成立。归属状态按人分片存储，并发推进时不会写同一份文件。 |
| **以 Git 承载版本同步** | Git 即传输通道。push、pull、merge 把台账带到其他机器与其他人。 |

![任务正文](https://raw.githubusercontent.com/cq-guojia/dsh-task-ledger/main/assets/screenshots/worklog.png)

## 安装

使用 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的用户**无需重复安装本 skill** —— `dsh-task-ledger` 插件已内置这份 skill，插件的安装办法见[根 README](https://github.com/cq-guojia/dsh-task-ledger/blob/main/README.zh-CN.md)。

以下面向其他 Agent。支持 Claude Code、Cursor、Codex、CodeBuddy、WorkBuddy、Trae、豆包工作，以及任何加载 `SKILL.md` 的 Agent；同一份 skill 装在不同 Agent 上，记录的仍是同一个项目的台账。

### 1. 安装 Skill

一条命令装到本机所有已装的 Agent —— [skills CLI](https://skills.sh)（Vercel）会自动识别它们，无需你指定目录：

```bash
npx skills add cq-guojia/dsh-task-ledger -g
```

也可以把这句话发给任意 Agent，让它自己装：

> 帮我安装 task-ledger 这个 skill（npm 包名 task-ledger，GitHub 包名 cq-guojia/dsh-task-ledger）。

参数为 GitHub 仓库坐标：`-g` 表示用户级安装、对所有项目生效；省略则仅作用于当前项目，`--agent` 可限定目标 Agent。该工具不接受 npm 包名作为来源。

### 2. 注入规则文件（可选）

把下面这段加进项目根目录的 `AGENTS.md`，让 Agent 按台账口径跟进任务：

```markdown
任务台账工具[task-ledger skill]使用规则：

- **凡任务进度、工作事项与工作日志**：（新建 / 推进 / 查询 / 结案）一律调用 task-ledger skill 管理；进度 / 历史任务类问题一律走它作答，不凭对话记忆或自建清单顶替。
- **开工锚点**：仅当用户明确说要新建（如「开个新坑」「先记一下」「建个任务」）才登记；提问 / 查询 / 讨论 / 顺手小改不算，拿不准先问，未经明确指令不得擅自新建任务。
- **怎么建、按什么顺序**：命令的授权与确认口径，一律以 task-ledger skill 的说明为准。
- **顺手问一句**：用户在推进一件跨轮的事（这轮答完、手上还有下一步动作没做完）、却从没提过记账时，答完问一次「你现在这个任务是需要帮你建一个台账吗？（如果无需，忽略这句话，也不用去回复。）」；本会话问过一次就别再问，用户不接就当他不需要。
```

会话规则注入默认开启时，dsh 会话无需再写入该片段；其他 Agent 仍需写入。

### 3. 到看板管理

看板目前仅支持 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的插件看板。想用看板统一查看管理，按[根 README](https://github.com/cq-guojia/dsh-task-ledger/blob/main/README.zh-CN.md)在 DSH 里装好 `dsh-task-ledger` 插件即可。

## 怎么用

不需要你敲任何命令。台账由你对 Agent 说的话驱动：请求命中下列意图时，Agent 执行对应操作并留痕。

| 你说 | Agent 做什么 | 结果 |
|---|---|---|
| 「新建一个任务：把发布流程走通」 | 按你给的标签建任务 | 落公共池，状态「待认领」 |
| 「新建个任务并开始做」 | 建并认领 | 归你名下，状态「进行中」 |
| 「这活我领了」/「接着做 X」 | 认领该任务 | 转到你名下，状态「进行中」 |
| （干活过程中） | 写任务正文，再追加一条执行记录 | 进度、结论、卡点全程留痕 |
| 「卡住了」/「先放一放」 | 记下卡点，状态不动 | 仍是「进行中」—— 暂停既不是释放，也不是取消 |
| 「退回去」 | 释放任务 | 回公共池，任何人可认领 |
| 「这个任务结束掉」 | 带摘要结案 | 写入历史，此后只读 |
| 「取消 / 作废」 | 作废结案，记下原因 | 已关闭，但不算完成 |
| 「删除」 | 先请你确认，再删除 | 彻底删除，无撤销、无恢复 |
| 「现在该做什么」/「上周结了什么」 | 列在办、看单条、查历史 | 只读查询，不写任何东西 |

建任务需要两项输入：**做什么** —— 一句话，不加分类或项目名前缀；**涉及什么** —— 一到五个标签。分类可在建任务时给出，此后不可更改。

四条约束对 Agent 生效：

- 建、认领、释放、结案、删除，没有一项由 Agent 自行发起。每一项都需要你的明确指令；你只说了「做完了」这类含糊的话，它回问，而不是直接结案。
- 状态文件、历史文件、执行记录一律不由 Agent 改动。它只能写任务正文的前五节。
- 结案前必须先把记录写完 —— 已结案的任务不能再写。
- 找不到对应任务时，它问你要不要新建，而不是替你登记你没要求登记的工作。

## 落盘的数据

```
ledger/
├── pool.json                 公共池:未认领任务
├── owners.json               索引:身份 → 分片文件
├── owners/<hash>.json        每人一份分片:其名下任务
├── worklog/<年月>/*.md       任务正文,固定六节
└── history/<年月>.md         已结案任务,一行一条
```

状态与正文分离：JSON 记录归属与状态，Markdown 记录来龙去脉。只有命令行工具可写状态、历史与执行记录；Agent 只能写任务正文的前五节，其余一律不改。所有存盘时间一律为 UTC，输出时转换为本机时区。

## 命令

| 命令 | 用途 |
|---|---|
| `init` | 初始化或认领本机身份（一台机器一次） |
| `new` | 新建任务 |
| `claim` | 认领任务 |
| `set` | 释放任务、转交他人或整组替换标签 |
| `log` | 向任务正文追加一条执行记录 |
| `close` | 结案，并写入历史 |
| `delete` | 删除建错的任务 |
| `list` | 列出在办任务 |
| `show` | 查看单个任务 |
| `history` | 列出已结案任务 |
| `stats` | 汇总计数与趋势 |
| `owners` | 列出已知身份 |
| `root` | 判断某目录是否含台账 |
| `whoami` | 显示当前身份 |
| `validate` | 检查台账一致性 |

参数见 `scripts/progress <子命令> --help`；面向 Agent 的工作流写在 `SKILL.md`。

## 多人协作

归属按人分片：每人名下的任务保存在各自的分片文件中，两人各自推进各自的任务时不会写同一份文件。Git 负责合并分片、任务正文与历史文件。若两人同时修改同一份任务正文，冲突范围仅限于该文件。

## 链接

- 仓库与完整文档：<https://github.com/cq-guojia/dsh-task-ledger>
- 内置本 skill 并提供看板界面的 dsh 插件：[`dsh-task-ledger`](https://www.npmjs.com/package/dsh-task-ledger)

## 许可

MIT
