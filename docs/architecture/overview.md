# 架构总览

一个 DSH（DeepSeek Harness）插件，把 `task-ledger` skill 变成：装插件即把该 skill 注册进宿主全局；提供台账管理 UI（在办、历史、统计）；skill 本身也可脱离宿主单独安装给其他 agent 用。

## 一、单仓双包

仓库根是 private workspace 根，不发布。两个包独立 semver：

| 包 | 内容 | 发布触发 |
|---|---|---|
| `dsh-task-ledger`（`packages/plugin/`） | host 半（skill 注册 + webServer 路由 + 跨工作区读台账）、client 半（侧栏条目 + 主面板）、`cordis.patch.yml`；`dist/` 入仓 | tag `plugin-v*` |
| `task-ledger`（`packages/skill/`） | `SKILL.md`、`scripts/progress` 入口 shim、`scripts/bin/ledger-<os>-<arch>` 静态二进制、`src/`（Go 实现）、assets、references | tag `skill-v*` |

skill 内容唯一真源在 `packages/skill/`；插件构建时只把运行时那几项拷入 `packages/plugin/skill/`，Go 源码不进副本。宿主接口事实见 [dependencies/](../dependencies/)。

## 二、运行链路

### 2.1 一次读

```
各工作区 ledger/ 文件
  │ host 经内嵌 skill 脚本（Go 二进制子进程）只读
  ▼
host：routes → services（纯计算）→ repositories（唯一知道台账怎么读）
  │ 机器级清单 ~/.taskledger/ledgers.json 决定读哪些目录
  ▼ HTTP（Desktop 走 IPC bridge）
client：侧栏条目 + 主面板（在办 / 历史 / 设置三段滑轨）
```

入口是 `sidebar.panellist` 侧栏条目 + `main` 整页，没有 `shell.overlay` 浮标。读路由清单见 [host-data-plane.md](host-data-plane.md)。

### 2.2 一次写

外壳 `shell.Main`（解析参数 + 定位工作区 + 整命令同步锁）→ `shell.Run`（建记账本、挂中断处理）→ `shell.runCommand`，七步固定：

```
绑记账本 → 取最新 → 自举 → 调业务函数 → 打印 → 提交 → 推送
```

git 只在命令的前后两端，业务中间不碰 git。推送被拒会触发 `rebase --autostash`，冲突时脚本直接写盘合并结果；若这发生在业务函数中间，业务手里的改前快照会在下一次整份写回时抹掉别人刚合进来的内容，且这类写走 `track=false`，连「已改未提交」都不登记。

七步内部（跳过条件是分组而非逐条判）：只读命令跳「取最新 / 自举 / 提交 / 推送」；`--no-sync` 只跳刷盘与提交推送，**锁集照算**；`already_done` 不跳提交推送，要不要提交只看记账本。逐方法签名见 [ledger-api.md](../api/ledger-api.md)。

## 三、关键不变量

1. **台账写路径只经脚本**：写台账只经 `packages/skill/scripts/progress`（Go 二进制），插件与 host 都不手改台账 JSON / history / worklog。「host 直写」= host 代跑同一个脚本。
2. **提交只在脚本外壳，业务中间零 git**：取最新 / 提交 / 推送三件事只许放在外壳，不许下放到业务层。
3. **两级锁不混用**：整条命令级 `store.SyncLock`（锁文件放 git 公共目录，非 git 仓库落系统临时目录按路径哈希；100ms 轮询、最多等 60 秒）；单文件级 `store.ProgressLock`（阻塞无超时、不重入，按绝对路径哈希在系统临时目录开 `<hash>.lock`；linux/darwin 走 flock、Windows 走 LockFileEx，其余平台只为能编译、不加锁）。只有只读命令不拿整命令级锁；`--no-sync` 的写命令照拿。
4. **失败收尾只有两套**：`RollbackPresync()` 恢复「写前取最新」覆盖掉的内容，`DiscardCreated()` 删本次新建的文件，成功路径统一 `Clear()`；`CommitStarted` 之后一律不回滚。业务动作自己写坏了走 `store.Snapshot` / `store.Restore`，只还原本次动作碰过的文件，不是 journal。
5. **唯一一个不回滚的失败分支**：下游读走人（broken pipe）。`shell.IgnoreSIGPIPE()` 让写 stdout 失败变成错误返回，进程继续走完暂存与提交；本次已写过文件就必须提交，否则台账停在「已写未提交」，下一条写命令会被写前 guard 拦死。
6. **原子性 = 单文件原子写 + 固定写序 + 重跑幂等**，不引入 journal / recover。单文件写走全仓唯一出口 `store.WriteTextAtomic`：临时文件 → write → fsync(file) → chmod → rename → fsync(父目录)。多文件先写目标、后删源，删永远是最后一步。
7. **写前 guard 会硬拦**：本地台账有未提交改动 / 有未推送的台账提交 / 有未入库的同名文件 / 处于 rebase 中间态 ⇒ 中止并说明怎么处理。detached HEAD 或无上游时只做本地提交并在 stderr 提示。worklog 里人写的改动先 stash、刷完再叠回。
8. **开关只有两组**：动作是否只读由 `actions/registry.go` 的 `ActionSpec.ReadOnly` 决定；`--no-sync` / `TASK_LEDGER_NO_SYNC` 只控制不碰 git。
9. **skill 内容单一真源**：内嵌副本是入库产物，改完源重跑 `npm run build` 再提交即可保持一致。
10. **宿主接口一律查已核实事实**：见 [dependencies/](../dependencies/)，不得凭方法名猜签名。
11. **dist 入仓**：git 直装不跑构建脚本，推送前必须 build（含 typecheck）。
12. **明暗主题只认宿主**：`body[data-ds-dark-theme]`，禁用 `prefers-color-scheme`。
13. **路由自持鉴权**：宿主 webServer 无 server-wide auth（默认回环绑定）；若部署暴露非回环地址，闸门必须由插件路由方自持。

## 四、入口与主题

浮标入口 `shell.overlay` 未落码；当前只有侧栏条目与整页面板。样式硬约束见 [ui-style.md](../development/ui-style.md)。

## 更新日志

- 2026-11-07 23:03:03：按 koc-code-docwriter 槽位迁移，剔除过程稿并统一标题头
