# dsh-task-ledger

[English](README.md) · **简体中文**

[DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh)(dsh)插件，为 `task-ledger` skill 提供看板。任务、进度与结论由代理以纯文本文件写入仓库；本插件读取这些文件，呈现为一个可操作的视图 —— 按责任人划分的在办工作、待认领任务、逾期与停滞项，以及全部已结案任务的历史。

所有数据都在仓库内，不依赖账号、托管后端或任何服务市场。

![任务台账看板](https://raw.githubusercontent.com/cq-guojia/dsh-task-ledger/main/assets/screenshots/board.png)

## 安装

```bash
dsh plugin add dsh-task-ledger
```

插件已内置 skill：安装后每个 dsh 会话都可直接使用台账命令，无需另行安装 skill。

环境要求：dsh 本体。插件读取 Git 仓库；多人同步需 Git 2.27 及以上。

## 看板提供什么

### 总览

| 元素 | 内容 |
|---|---|
| 统计卡 | 我的待办、待认领、逾期、本周结案、进行中、积压、停滞、上周结案 |
| 趋势图 | 按日或按周展示已结、未结与新建任务，可限定「只看我的」 |
| 任务列表 | 在办任务的状态、标签、责任人与最后更新时间；可按全部、待认领、进行中、积压、逾期、停滞切换 |
| 筛选 | 工作区、执行人与关键词检索 |

「逾期」指认领后已过七天；「停滞」指三天没有进展。两者均由时间戳推导，不可手工填写。

![待认领任务](https://raw.githubusercontent.com/cq-guojia/dsh-task-ledger/main/assets/screenshots/board-unclaimed.png)

### 任务操作

每一行只显示当前状态允许的操作：认领、继续、完成、释放、取消。

- **继续** — 打开代理会话，提示词要求代理读取已记录的进度并汇报。
- **完成** — 两种方式：直接结案并写一句摘要；或交给代理，由代理读完进度、写出结论与遗留问题后结案。
- **取消** — 记录理由。

![结案任务](https://raw.githubusercontent.com/cq-guojia/dsh-task-ledger/main/assets/screenshots/close-task.png)

### 历史

独立视图聚合全部已结案任务：可在日、周、月之间切换的趋势图；今日、本周、本月、本季度的结案计数，并与上一周期对照；以及按日分组的结案任务，列出创建人、执行人与执行时间。

![历史视图](https://raw.githubusercontent.com/cq-guojia/dsh-task-ledger/main/assets/screenshots/history-list.png)

### 身份与设置

首次进入需确认身份 —— 新建，或从台账名册中认领已有身份。设置页支持修改昵称（同步至每一本已登记台账，有远端则提交并推送）、切换身份，以及管理台账清单：添加目录，或将某一本从看板上隐藏（数据不受影响）。

![设置](https://raw.githubusercontent.com/cq-guojia/dsh-task-ledger/main/assets/screenshots/settings.png)

## 数据落点

```
ledger/
├── pool.json                 公共池:未认领任务
├── owners.json               索引:身份 → 分片文件
├── owners/<hash>.json        每人一份分片
├── worklog/<年月>/*.md       任务正文
└── history/<年月>.md         已结案任务
```

除上述操作外，插件只读这套结构；写操作走与 skill 相同的命令行工具，看板不会直接改写状态文件。

## 其他代理

非 dsh 的代理可单独安装同一份 skill；各代理的安装方式见 [`task-ledger`](https://www.npmjs.com/package/task-ledger) 包。

## 链接

- 仓库与完整文档：<https://github.com/cq-guojia/dsh-task-ledger>
- skill 包：[`task-ledger`](https://www.npmjs.com/package/task-ledger)

## 许可

MIT
