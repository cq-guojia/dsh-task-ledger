# dsh-task-ledger

[English](README.md) · **简体中文**

一本放在工作区里的任务台账：什么任务都可以用，不限于开发工作，调研、文档、演示、视频制作都能建任务。任务由 Agent 创建、认领、推进与结案，每一步都写入纯文本 `ledger/` 目录 —— 谁在做、做到哪、下一步是什么、结论是什么，全程留痕，不会随对话窗口关闭而丢失。

![任务台账看板](https://raw.githubusercontent.com/cq-guojia/dsh-task-ledger/main/assets/screenshots/board.png)

## 它解决什么问题

只要一件工作跨了多次会话、跨了若干天，或者由多人接力，三个问题就再也答不上来：谁在做、做到哪一步、原本要达成什么。对话记录留不住，托管型项目管理工具虽然答得上，却把答案放在工作区之外、离这件事本身很远。

本台账把答案记在工作区里，以可读、可 diff、可评审的纯文本文件保存。它的定位由四点界定：

| 特性 | 具体含义 |
|---|---|
| **任务全生命周期跟踪** | 任务可创建、认领、续做、移交、结案。每次状态变更都带时间与责任人；过程叙述、结案结论与遗留问题写在任务正文中。 |
| **本地化工具** | 不需要账号、不需要托管后端、不依赖任何服务市场。台账是与仓库一同提交的 JSON 与 Markdown，离线可用，可在评审中逐行审阅。 |
| **单人可用，多人亦可用** | 单机单人可直接使用；团队共用一个仓库同样成立。归属状态按人分片存储，两人各自推进各自的任务时不会写同一份文件。 |
| **以 Git 承载版本同步** | Git 即传输通道。push、pull、merge 把台账带到其他机器与其他人，提交历史本身构成审计记录。 |

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

## 在 DeepSeek Harness 上安装

本项目的主形态是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（下称 DSH）插件：装好就有完整看板，skill 也已内置，无需另外安装。三种方式任选其一：

1. **在 DSH 里添加插件** —— 打开插件页，点「添加插件」，输入包名 `dsh-task-ledger`，确认安装。
2. **命令行安装** —— 在终端执行：

   ```bash
   dsh plugin add dsh-task-ledger
   ```

3. **在插件市场安装** —— 在 DSH 的插件市场搜索 `dsh-task-ledger`，直接安装。

## 在其他 Agent 中使用

如果你有多个 Agent 工具，可以在各自的 Agent 中安装这个 Skill 记录台账；同一份 skill 装在其他 Agent 上，记录的仍是这个项目的台账。三步：

### 1. 安装 Skill

```bash
npx skills add cq-guojia/dsh-task-ledger -g
```

命令会自动识别本机已装的 Agent（Claude Code、Codex、CodeBuddy 等），写进各自的技能目录。也可以把这句话发给任意 Agent，让它自己装：

> 帮我安装 task-ledger 这个 skill（npm 包名 task-ledger，GitHub 包名 cq-guojia/dsh-task-ledger）。

### 2. 注入规则文件（可选）

把下面这段加进项目根目录的 `AGENTS.md`，让 Agent 按台账口径跟进任务：

```markdown
任务台账工具[task-ledger skill]使用规则：

- **凡任务进度、工作事项与工作日志**：（新建 / 推进 / 查询 / 结案）一律调用 task-ledger skill 管理；进度 / 历史任务类问题一律走它作答，不凭对话记忆或自建清单顶替。
- **开工锚点**：仅当用户明确说要新建（如「开个新坑」「先记一下」「建个任务」）才登记；提问 / 查询 / 讨论 / 顺手小改不算，拿不准先问，未经明确指令不得擅自新建任务。
- **怎么建、按什么顺序**：命令的授权与确认口径，一律以 task-ledger skill 的说明为准。
- **顺手问一句**：用户在推进一件跨轮的事（这轮答完、手上还有下一步动作没做完）、却从没提过记账时，答完问一次「你现在这个任务是需要帮你建一个台账吗？（如果无需，忽略这句话，也不用去回复。）」；本会话问过一次就别再问，用户不接就当他不需要。
```

### 3. 到看板管理

看板目前仅支持 DeepSeek Harness 的插件看板。装完 skill 后想用看板统一查看管理，按上面「在 DeepSeek Harness 上安装」把插件装上即可。

Claude Code、Cursor、Codex、CodeBuddy、Trae，以及任何加载 `SKILL.md` 的 Agent 工具都适用。手动安装、身份初始化与各 Agent 的技能目录位置见 [skill 包文档](packages/skill/README.zh-CN.md)。

## 其他

台账落在 `ledger/` 目录，状态与正文分离 —— JSON 记归属与状态，Markdown 记来龙去脉；只有命令行工具可写状态、历史与执行记录，Agent 只能写任务正文的前五节：

```
ledger/
├── pool.json                 公共池:未认领任务
├── owners.json               索引:身份 → 分片文件
├── owners/<hash>.json        每人一份分片:其名下任务
├── worklog/<年月>/*.md       任务正文,固定六节
└── history/<年月>.md         已结案任务,一行一条
```

![任务正文](https://raw.githubusercontent.com/cq-guojia/dsh-task-ledger/main/assets/screenshots/worklog.png)

看板按责任人展示在办任务、待认领任务、逾期与停滞项、周度趋势，以及按日 / 周 / 月 / 季度聚合的结案历史。

![历史视图](https://raw.githubusercontent.com/cq-guojia/dsh-task-ledger/main/assets/screenshots/history.png)

任务可在看板上以两种方式结案：直接结案并写一句摘要；或交还给 Agent，由 Agent 读完已记录的进度，写出结论与遗留问题，再行结案。

![结案任务](https://raw.githubusercontent.com/cq-guojia/dsh-task-ledger/main/assets/screenshots/close-task.png)

各包的完整说明：[插件](packages/plugin/README.zh-CN.md) · [skill](packages/skill/README.zh-CN.md)。

## 开发

```bash
npm test        # Go:vet 与单元测试
cd packages/plugin && npm run verify   # 构建与类型检查
```

## 许可

MIT，见 [LICENSE](LICENSE)。
