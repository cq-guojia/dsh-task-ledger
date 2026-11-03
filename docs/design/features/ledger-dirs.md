# 台账目录清单与隐藏

> **状态**：🔵 落码（2026-11-01 数据面；2026-11-03 设置页管理界面与选目录）
> **来源**：用户 2026-11-01 原话（不在 DSH 工作区下的台账也要能管 / 不关心的项目要在看板上隐藏 / 以后的网页端、应用端读同一份配置）
> **配套**：运行逻辑见 [`../architecture.md`](../architecture.md)；台账文件格式见 [`../ledger-data.md`](../ledger-data.md)

---

## 一、解决什么

台账目录原来只能从 DSH 的 `workspaceRegistry` 里来 —— 不在 DSH 工作区下的台账看不见。改成：**一份机器级清单决定读哪些目录**，宿主工作区只是清单的一个登记来源。

同时提供隐藏：不关心的项目从所有看板数据里消失，但台账本身、agent 的读写一切照常。

## 二、数据

**位置**：`~/.taskledger/ledgers.json`（`$TASK_LEDGER_HOME/.taskledger/`），本机私有、不进任何 git 仓库。与身份文件同域，但**与身份无关** —— 没 `init` 的机器同样能读写。

**形状**：路径当 key（天然去重，比对就是查表）。

```json
{
  "/home/guo/proj":            {},
  "/home/guo/tools/nas-docker": { "name": "NAS 那套" },
  "/home/guo/old/playground":   { "hidden": true }
}
```

| 字段 | 缺省 | 说明 |
|---|---|---|
| key = 路径 | — | **绝对路径**（`~` 在写入前展开；软链还原）。不存 `~` 写法：`~` 是 shell 约定，每个读取方各实现一遍必有一处错 |
| `name` | 目录名 | 显示名。登记时落盘**一次**，之后不跟随 DSH 工作区改名 |
| `hidden` | `false` | 看板不显示它 |

显示名优先级：清单 `name` > DSH 工作区标题（登记那一刻写进 `name`）> 目录名。

## 三、命令面（skill `dirs`）

```bash
progress dirs                                    # 只列**可见**的；顺手清掉失效条目
progress dirs --all                              # 连隐藏的一起列（管理时才用）
progress dirs --dir <目录> --add [--name <名字>]  # 登记（幂等；已在清单里就不动，不覆盖已有名字）
progress dirs --dir <目录> --rename <新名字>      # 改名；空串 = 清掉自定义名、回落目录名
progress dirs --dir <目录> --hide                # 隐藏
progress dirs --dir <目录> --unhide              # 恢复
progress dirs --dir <目录> --remove              # 从清单删掉（不动磁盘目录）
progress dirs --json                             # {dirs, removed, added, reason, warnings}
```

- **默认只给可见的**：长期处理的就是可见那些，列出来还要自己过滤一遍是设计错误。隐藏项只在 `--all` 下出现（带 `hidden` 字段）。写命令的回执例外 —— 给全量，调用方要靠它判断「哪些已登记」，少给隐藏的会每轮重复补登记。
- **`--remove` 只删清单那一行**，不动磁盘目录。目录还在宿主工作区里的话，下次开看板会被自动登记回来（预期行为）；想长期不看用 `--hide`。外部台账（不在任何工作区里）删了就是删了 —— 这条才是 `--remove` 的正当用途。
- **不进 SKILL.md**（与 `switch` 同理）：agent 记账不需要它，看板与用户才需要。
- 它跑在**定位仓库之前**，不认 `--repo`、不看身份、不碰 git（与 `root` / `whoami` 同类）。

## 四、规则

| 规则 | 说明 |
|---|---|
| 隐藏 = 全局不看 | 统计卡、趋势、在办列表、历史列表、**执行人下拉**都不算它。功能与写入不受影响 |
| 只隐藏不删除 | 界面不提供删除；手动删掉记录也正常，下次扫到会自己回来（命令行的 `--remove` 见上节用途） |
| 显示名 | 清单 `name`；没写就是目录名。**默认名只在 skill 里算一次**（`actions.dirs.rowsOf`），插件与外壳都不重算 |
| 读时自愈 | 每次读清单逐条校验：目录没了 / 已经不是台账根 ⇒ 直接删掉（清单本来就是程序生成的） |
| 幂等 | 重复登记不产生重复条目，也不覆盖已有名字（否则每次开看板都会冲掉用户取的名） |
| 并发 | 单一写者 = skill；写盘走文件锁（`store.ProgressLock`）+ 原子替换 |
| 坏文件 | 读不懂按空清单处理并提示，**不覆盖**；下次写前先改名 `<文件>.broken` 保命 |
| 写失败不挡主任务 | 只读命令顺带登记清单失败 ⇒ 跳过 + 一行提示，命令结果不变 |

## 五、读路径（插件）

```
面板请求 → services/workspaces.service.ts: resolveWorkspaces()
  ① 读清单（repositories/dirs.repository.ts → skill `dirs --all --json`，顺带清理）
  ② 宿主 registry 里清单还没有的工作区 → 逐个 `dirs --add`（不是台账根的由 skill 拒掉，不算错误）
  ③ 去掉 hidden → LedgerWorkspace{id: 路径, title: 显示名, path}
```

三层归属：编排在 `services/`（用例层），清单读写只在 `repositories/dirs.repository.ts`（数据访问层），`routes.ts` 只做协议。

`id` 用路径：清单条目没有别的唯一标识，而路径本来唯一（历史筛选、缓存键都靠它）。

### 5.1 什么时候同步宿主工作区（用户 2026-11-03 拍板）

第 ② 步「拿宿主工作区补登记」**只在两个时刻跑**：

| 时刻 | 传参 | 说明 |
|---|---|---|
| 进看板（面板挂载首读） | `GET /board/snapshot?sync=1` | `store.ts` 的 boot 与 `board-home.ts` 挂载 effect |
| 手动点「刷新」 | `GET /board/snapshot?sync=1` | 同上，`refresh(true)` |
| **其余全部**（名册、历史趋势、名册写动作、设置页任何写后的重读、错误重试） | `GET /board/snapshot`（无 `sync`） | 只读清单：不起 skill 进程、不 stat、不写盘 |

理由：同步一次 = 起一个 skill 进程 + N 次 `stat`，而产物在稳态下永远一样；只为了「DSH 里新加工作区能自动出现」这一个场景，不值得每个请求都付。

推论（对界面有约束）：**宿主工作区目录不能给「移除」**——它一定在 registry 里，下次进看板同步就补回来。所以 `/dirs` 每条带 `inRegistry`，设置页对工作区行只给「隐藏」（`hidden` 长期有效），非工作区目录才给「移除」。

## 六、添加目录（设置页）

**入口**：设置页「台账目录」块的「添加目录」→ 核心选目录弹窗（`dsh-plugin-core/explorer` 的
`pickWorkspaceFile({ filter: { dirs: true } })`，**只能选目录、不限工作区**；事实见
[`../external/dsh-plugin-core-explorer.md`](../external/dsh-plugin-core-explorer.md)）。

**有效判据**（用户 2026-11-03，两条满足任一即可）：

| 选择 | 结果 |
|---|---|
| 选中的目录**自己**是台账根（直接含 `ledger/`） | 登记它 |
| 选中的目录不是台账根，但**一级子目录**里有台账根 | 登记那些子目录（父目录本身**不进**清单） |
| 两样都没有 | 不落盘，提示「所选目录不含台账」 |

判据用「目录下直接含 `ledger/`」——与 skill `root` 同一口径（`core/roots.go:35`），不看里面有哪些文件。
父目录不登记的理由：清单只存台账根，skill 读清单时会自愈删掉非台账根。

### 6.1 结果提示（用户 2026-11-03 定稿）

| 情形 | 标题 | 描述 |
|---|---|---|
| 无效目录 | 所选目录不含台账 | 该目录不是台账根目录，其直接下级目录中也未发现台账根。请选择台账根目录，或包含台账的上级目录。 |
| 已在清单 | 该目录已在监控清单中 | 无需重复添加，台账监控范围未发生变化。 |
| 成功 1 个 | 已添加台账目录 | 「{名称}」已纳入台账监控。 |
| 成功 n 个（选的是上级目录） | 添加成功 | 已添加 {n} 个台账目录：{名称列表} |

- 一律 Toast：成功用默认样式，失败用 error 样式。
- **技术原文不上界面**：路径 + skill 的原因只进浏览器控制台（`console.warn`）——skill 的拼法是
  `路径 + " 不是台账根：这个目录没有 ledger/"`，直接展示会读成一串斜杠（2026-11-03 踩过）。
- 「已经在清单里」只能由 host 判：skill 的 `--add` 幂等，回执里的 `added` 是「现在在清单里」，
  不是「这次新增」⇒ `dirs.service.ts` 登记前先读一份清单做比对，回 `existed` + `paths`。

### 6.2 弹窗位置

贴着**触发的那个按钮**弹，方位固定 **`bottom-end`（按钮下方、往左展开：面板右缘对齐按钮右缘）**：

```ts
pickWorkspaceFile({ anchor: event.currentTarget, placement: "bottom-end", filter: { dirs: true } })
```

- `anchor` 只能调用方给（核心不知道是谁触发的）：`ui.ts:Button` 的 `onClick` 拿 `event.currentTarget` 传进去。
- `placement` 是核心 0.20.8 起的参数、0.20.9 起语义为**优先方位**（八档 + `auto`，见
  [`../external/dsh-plugin-core-explorer.md`](../external/dsh-plugin-core-explorer.md)）：该侧放得下就照它，
  不够则翻到对侧，两侧都窄才夹紧进视口。
- **别用 `bottom-start`**：它在下方有空间时算出来的盒子与旧的 `auto` 一模一样，看起来「改了没反应」
  （2026-11-03 踩过）。按钮在右侧要往左展开就用 `bottom-end`。
- 不传 `placement` 就是旧 `auto`；不传 `anchor` 才走核心那条只设宽高的兜底（会落左上角）。

## 七、不做

- **删除目录**：界面只给「从看板移除」（见 §三 `--remove` 用途），不删磁盘。
- **批量改名 / 拖拽排序**：无需求。
