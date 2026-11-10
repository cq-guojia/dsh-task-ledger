# 台账目录清单与隐藏

## 一、解决什么

一份机器级清单决定看板读哪些目录，宿主工作区只是清单的一个登记来源，不在 DSH 工作区下的台账也能看见。隐藏项从所有看板数据里消失，但台账本身与 agent 的读写一切照常。

## 二、数据

位置：`~/.taskledger/ledgers.json`（`$TASK_LEDGER_HOME` 可改），本机私有、不进任何 git 仓库。与身份文件同域，但与身份无关，未 `init` 的机器同样能读写。形状是路径当 key（天然去重）：

```json
{
  "/home/user/proj":            {},
  "/home/user/tools/nas-docker": { "name": "NAS 那套" },
  "/home/user/old/playground":   { "hidden": true }
}
```

| 字段 | 缺省 | 说明 |
|---|---|---|
| key = 路径 | — | 绝对路径（`~` 在写入前展开，软链还原）；不存 `~` 写法，各读取方各实现一遍必有一处错 |
| `name` | 目录名 | 显示名；登记时落盘一次，之后不跟随 DSH 工作区改名 |
| `hidden` | `false` | 看板不显示它 |

显示名优先级：清单 `name` > DSH 工作区标题（登记那一刻写进 `name`）> 目录名。默认名只在 skill 里算一次（`actions.dirs.rowsOf`），插件与外壳都不重算。

## 三、命令面（skill `dirs`）

```bash
progress dirs                                    # 只列可见的；顺手清掉失效条目
progress dirs --all                              # 连隐藏的一起列（管理时才用）
progress dirs --dir <路径> --add [--name <名字>]  # 登记（幂等；已在清单里就不动，不覆盖已有名字）
progress dirs --dir <路径> --rename <新名字>      # 改名；空串 = 清掉自定义名、回落目录名
progress dirs --dir <路径> --hide                # 隐藏
progress dirs --dir <路径> --unhide              # 恢复
progress dirs --dir <路径> --remove              # 从清单删掉（不动磁盘目录）
progress dirs --json                             # {dirs, removed, added, reason, warnings}
```

- 默认只给可见的；隐藏项只在 `--all` 下出现。写命令回执例外，给全量，调用方要靠它判断「哪些已登记」。
- `--remove` 只删清单那一行，不动磁盘目录。目录还在宿主工作区里的话，下次开看板会被自动登记回来；想长期不看用 `--hide`。外部台账删了就是删了，这才是 `--remove` 的正当用途。
- 不进 `SKILL.md`：agent 记账不需要它，看板与用户才需要。
- 跑在定位仓库之前，不认 `--repo`、不看身份、不碰 git（与 `root` / `whoami` 同类）。

## 四、规则

| 规则 | 说明 |
|---|---|
| 隐藏 = 全局不看 | 统计卡、趋势、在办列表、历史列表、执行人下拉都不算它；功能与写入不受影响 |
| 只隐藏不删除 | 界面不提供删除；手动删掉记录也正常，下次扫到会自己回来 |
| 读时自愈 | 每次读清单逐条校验：目录没了 / 已经不是台账根 ⇒ 直接删掉 |
| 幂等 | 重复登记不产生重复条目，也不覆盖已有名字 |
| 并发 | 单一写者 = skill；写盘走文件锁（`store.ProgressLock`）+ 原子替换 |
| 坏文件 | 读不懂按空清单处理并提示，不覆盖；下次写前先改名 `<文件>.broken` 保命 |
| 写失败不挡主任务 | 只读命令顺带登记清单失败 ⇒ 跳过 + 一行提示，命令结果不变 |

## 五、读路径（插件）

```
面板请求 → services/workspaces.service.ts: resolveWorkspaces()
  ① 读清单（repositories/dirs.repository.ts → skill `dirs --all --json`，顺带清理）
  ② 宿主 registry 里清单还没有的工作区 → 逐个 `dirs --add`（不是台账根的由 skill 拒掉，不算错误）
  ③ 去掉 hidden → LedgerWorkspace{id: 路径, title: 显示名, path}
```

三层归属：编排在 `services/`，清单读写只在 `packages/plugin/src/host/repositories/dirs.repository.ts`，`routes.ts` 只做协议。`id` 用路径：清单条目没有别的唯一标识，而路径本来唯一（历史筛选、缓存键都靠它）。

第 ② 步「拿宿主工作区补登记」只在两个时刻跑：进看板首读（`GET /board/snapshot?sync=1`）与手动点刷新。其余请求（名册、历史趋势、写动作后的重读、错误重试）不带 `sync`，只读清单，不起 skill 进程、不 stat、不写盘 —— 同步一次要起一个 skill 进程加 N 次 `stat`，而产物在稳态下永远一样。

副作用：移除一个**宿主工作区**目录后，下一次进看板同步会把它补回来；想让工作区台账不显示要用「隐藏」（长期有效，同步不会重加）。

## 六、添加目录（设置页）

入口是设置页「台账目录」块的「添加目录」→ 核心选目录弹窗 `pickWorkspaceFile({ filter: { dirs: true } })`（只能选目录、不限工作区），事实见 [dsh-plugin-core-explorer.md](../dependencies/dsh-plugin-core-explorer.md)。

有效判据（两条满足任一即可）：

| 选择 | 结果 |
|---|---|
| 选中的目录自己是台账根（直接含 `ledger/`） | 登记它 |
| 选中的目录不是台账根，但一级子目录里有台账根 | 登记那些子目录（父目录不进清单） |
| 两样都没有 | 不落盘，提示「所选目录不含台账」 |

判据用「目录下直接含 `ledger/`」，与 skill `root` 同一口径（`core/roots.go:35`），不看里面有哪些文件。父目录不登记，因为清单只存台账根，skill 读清单时会自愈删掉非台账根。

结果提示一律 Toast（成功默认样式、失败 error 样式）：无效目录 / 已在清单 / 成功 1 个 / 成功 n 个各一条文案。技术原文不上界面：路径与 skill 的原因只进 `console.warn`，skill 拼的是「路径 + 不是台账根：这个目录没有 ledger/」，直接展示会读成一串斜杠。「已经在清单里」只能由 host 判：skill 的 `--add` 幂等，回执 `added` 是「现在在清单里」而非「这次新增」，故 `dirs.service.ts` 登记前先读一份清单比对，回 `existed` + `paths`。

弹窗贴着触发按钮弹，方位固定 `bottom-end`（按钮下方、往左展开）：

```ts
pickWorkspaceFile({ anchor: event.currentTarget, placement: "bottom-end", filter: { dirs: true } })
```

`anchor` 只能调用方给（核心不知道谁触发）：`ui.ts` 的 `Button` 从 `onClick` 拿 `event.currentTarget` 传入。`placement` 是核心 0.20.8 起的参数、0.20.9 起语义为优先方位（八档 + `auto`，见 [dsh-plugin-core-explorer.md](../dependencies/dsh-plugin-core-explorer.md)）：该侧放得下就照它，不够则翻到对侧，两侧都窄才夹紧进视口。不传 `placement` 走旧 `auto`；不传 `anchor` 走核心那条只设宽高的兜底（会落左上角）。按钮在右侧要往左展开必须用 `bottom-end`，`bottom-start` 在下方有空间时算出的盒子与旧 `auto` 一模一样。

## 七、边界

- 界面只给「从看板移除」，不删磁盘目录。
- 不做批量改名与拖拽排序。

## 更新日志

- 2026-11-07 23:03:04：按 koc-code-docwriter 槽位迁移，剔除过程稿并统一标题头
- 2026-11-10 22:37:28：源码路径补全为仓库内完整路径
