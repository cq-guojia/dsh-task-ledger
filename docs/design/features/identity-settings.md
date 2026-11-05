# 功能：身份与设置页（identity-settings）

> **状态**：🔵 第一版已落码（2026-11-01）
> **来源**：用户 2026-11-01 原话 ——「如果他没有登录，或者没有身份进来，就跳到那个所谓的帮助页，或者叫设置页」「先把登录后进入的入口确定了，就放在右上角吧，在刷新的左边放一个类似于设置或帮助的图标」
> **配套**：后端端点见 [`../host-data-plane.md`](../host-data-plane.md) §五点五；首页结构见 [`board-home.md`](board-home.md)

## 一、进入规则（登录闸）

**身份为空 ⇒ 整个面板就是这一页**，不做提示条、不做「先看看」、不弹模态。有身份时点右上角齿轮进的也是同一页，带「返回看板」。

- 首读先打 `GET /identity`：`uuid === null` 就**不发任何台账请求**（skill 侧所有读命令都过身份闸门，发了必然 500）。
- 已带身份在跑、中途身份被外部删掉：下一次请求失败 → 身份位置空 → 面板变成这一页。
- 代价（用户已接受）：跳转会丢掉当前页的筛选与滚动位置。

## 二、页面内容（第一版只做最小集）

| 场景 | 内容 |
|---|---|
| 没身份 | ① 新建身份（输名字 → `POST /identity/switch {action:"new"}`）② 用已有的身份（`GET /identity/roster` 列各工作区名册，点一个 → `{action:"claim", uuid, workspace}`）③ 可粘贴的终端命令（host 拼的绝对路径，`sh <scripts/progress> init --repo <根>`） |
| 有身份 | 身份卡（`@昵称` + uuid）+ 「修改昵称」「切换身份」两个按钮。点「修改昵称」名字就地变输入框，下面按钮换「保存（info 实心 + 勾图标）/ 取消（灰实心）」；保存走 `POST /identity/switch {action:"rename"}`，按钮转圈期间不可再点。名字文字与输入框共用 `--dtl-name-h`，两态同高不位移 |

名册读不到（该仓库还没有 `owners.json`）= 这里没人可认领，**不是故障**：显示「只能新建」那一句，不报错。

### 改昵称（2026-11-02）

一次保存做三件事，顺序固定：

1. 改本机身份文件 `~/.taskledger/identity.json` 的 `name`；
2. 遍历机器级台账目录清单（`~/.taskledger/ledgers.json`，**含隐藏项**），逐本看 `ledger/owners.json` 里**同 uuid** 的那条：
   - 有 → 只改 `name`；`file`（uuid 的 hash）与 `joined` 一律不动，所以改名不会变成"新人"；
   - 没有（这台机器没在这本台账写过东西）→ 跳过，**绝不凭空加人**；
3. 每本台账**有 git 就** 提交 → 推送；没有 git 就只写本地文件。**不先取** —— 推被拒时 `Push` 会自己 fetch + rebase 再来（见下）。

| 项 | 规则 |
|---|---|
| 任务 / 历史里已写下的 `owner_name` | **一律不动** —— 那是「当时他叫什么」的快照，改了就是篡改历史（用户 2026-11-02） |
| 纯本地仓库（没有远端） | 改了 + 提交在本地就算**完成**，不是失败（`changed`，不进「没改通」列表） |
| 先粗筛再联网 | 先读本地 `owners.json`：名册里没这个人 / 昵称已经是这个 → 直接跳过，**不碰网络**；只有真要改的那几本才走「改 → 提交 → 推送」 |
| 不先取最新 | 本机到远端一次往返实测 3.6s，为改一行名字先 fetch 不值；推被拒时 `Push` 自动 fetch + rebase 再推（实测能自动接上别人的提交并推成功） |
| 多本并行 | 各本台账是独立仓库，并发上限 4 同时跑 —— 否则五本串行就是五倍的网络等待 |
| 一本失败 | 不拖垮别的：逐本回执 `changed` / `commit-only` / `skipped` / `failed`，界面用 **Toast** 把没改通的列出来（不往卡片里铺） |
| 推送被拒 / 冲突 | 不把 rebase 做进用户仓库历史：本地提交保留、原样报错，由用户自己 `git pull --rebase && git push` |
| 超时 | 该请求单独放宽到 180s（`client/api.ts` 的 `RENAME_TIMEOUT_MS`、`host/repositories/identity.repository.ts` 的同名常量），不是默认 8s / 10s |

## 三、不做（后续任务）

- 帮助正文（命令速查、错误码解释、S2/S3 空态说明）。
- 看板上直接建任务。

## 四、数据来源

全部走 skill 脚本，插件不碰 `identity.json`：

| 端点 | 背后命令 | 备注 |
|---|---|---|
| `GET /identity` | `whoami --json` | 未初始化双 null、退 0；响应另带 `initCommand`（host 拼好的绝对路径） |
| `GET /identity/roster` | `owners --json`（每工作区） | 2026-11-01 起**读名册不需要身份**；读挂的工作区跳过 |
| `POST /identity/switch` | `switch --json`（隐藏命令） | 三档 `action`：`new` 建新人 / `claim` 认领 / `rename` 改昵称（逐本台账 取→改→提交→推送，超时 180s）。允许覆盖已有身份、不受真终端限制；不进 `SKILL.md`；实现在 `shell/cli.go` 的 `runSwitch` / `runRenameSelf` |
| `POST /identity/forget` | `forget --id <uuid> --keep-identity --json`（逐本台账） | 每本登记过他的台账各跑一次，分片里还有任务的那本不删、由 host 回报为 kept；全部删成才顺手 `logout`。**响应是 NDJSON 流**（2026-11-05）：`{type:"step",step,workspace}` / `{type:"done",report}` / `{type:"error",error,code}` —— 移除确认框底栏左侧跟着 skill 的阶段翻文案（`notice`） |

后端细节见 [`../host-data-plane.md`](../host-data-plane.md)；命令侧实现在 `packages/skill/src/internal/shell/cli.go` 的 `runSwitch`。
