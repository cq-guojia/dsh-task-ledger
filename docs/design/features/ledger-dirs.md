# 台账目录清单与隐藏

> **状态**：🔵 落码（2026-11-01，管理界面未做）
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

## 六、本轮不做

- **管理界面**（隐藏开关、加目录、改名的入口）：位置已定，挂现有「身份与设置」页里，等后续任务。
- **目录选择器**：暂时靠手输路径 + `--add` 当场校验。
- **改名命令**：目前只能编辑 `ledgers.json`；等界面一起做。
