# 架构总览

> **状态**：🔵 落码（host 半、client 半、脚本「两层 + 外壳」均已落码；少数细节见 §四「已知差异与未落码部分」，如浮标入口）
> **来源**：NAS-Docker 台账调研任务（2026-10-16 结案）+ 用户 2026-10-22「只要两层，别搞框架、别加层」
> **配套**：数据格式见 [`ledger-data.md`](ledger-data.md)；脚本分层、铁律与防塌线见 [`code-conventions.md`](code-conventions.md)；功能清单见 [`features.md`](features.md)；宿主接口事实见 [`external/`](external/)

## 一、项目是什么

一个 DSH（DeepSeek Harness）插件，把 `task-ledger` skill 变成：

1. **skill 全局集成**：装插件即把该 skill 注册进 dsh 全局（模型可 load）；
2. **台账管理 UI**：待办查询、历史追溯、统计报表；
3. skill 本身可脱离 dsh 单独安装（git 直装）给其他 agent 用。

**单仓双包**（仓库根为 private workspace 根，不发布）：

| 包 | 内容 | 发布触发 |
|---|---|---|
| `dsh-task-ledger`（`packages/plugin/`） | host 半（skill 注册 + webServer 路由 + 跨工作区读台账）+ client 半（侧栏条目 + 主面板）+ `cordis.patch.yml`；`dist/` 入仓 | tag `plugin-v*` |
| `task-ledger`（`packages/skill/`） | SKILL.md + `scripts/progress.py`（入口 shim）+ `scripts/ledgerkit/`（业务 / 数据 / 驱动分层）+ assets + references（零依赖，`python3` 直跑） | tag `skill-v*` |

两包独立 semver。skill 内容唯一真源在 `packages/skill/`，插件构建时整目录拷入（内嵌副本与独立包必须同源）。

## 二、运行逻辑

### 2.1 一次读（现状）

```
各工作区 ledger/ 文件（宿主进程之外）
        │  host 经内嵌 skill 脚本（Python 子进程）只读
        ▼
host 半：routes → services（纯计算）→ repositories（唯一知道台账怎么读）
        │  HTTP（Desktop 走 IPC bridge）
        ▼
client 半：侧栏条目（带计数）+ 主面板（任务 / 统计两 tab）
```

- 入口是 `sidebar.panellist` 侧栏条目 + `main` 整页，**没有浮标**（`shell.overlay` 未落码）。
- 按钮的会话交接链路：client POST host 路由 → host 起会话并发预置提示词 → client 跳转会话。接口细节见 [`external/dsh-session-handoff.md`](external/dsh-session-handoff.md)。

### 2.2 一次写（现状）

外壳 `cli.main`（定位工作区 + 整命令锁）调 `runner.run`，一路七步：

```
绑记账本 → 取最新 → 自举 → 调业务函数 → 打印 → 提交 → 推送
```

git 只在命令的**前后两端**，业务中间不碰 git —— 这一点重构必须保住，理由见下节与不变量「提交只在脚本外壳」。

### 2.3 七步的细节与跳过条件

```
外壳 cli.main → runner.run
  ├─ 进 runner 之前（cli.main 里做完，不计入下面七步）：
  │    · 解析参数、定位工作区（--repo / 从 cwd 往上找；**并校验：ledger/ 本身不是根**；找不到就报错，不在当前目录建台账）
  │    · 整命令级锁（只读命令与 --no-sync 不拿）
  │
  ├─ ① 绑记账本（WriteLog，只在这里创建一次）          ← 以下是 runner 的七步
  ├─ ② 算锁集 + 取最新（`presync_scope` 给两份 `Scope`，合并后刷盘；**只读跳整步，
  │       `--no-sync` 只跳"刷盘"这一步、锁集照算**；刷下来的连同"刷之前"的字节记进 record_presync）
  ├─ ③ 自举 bootstrap（只读命令跳过；**必须在取最新之后**，否则用本地旧索引盖掉远端新登记；
  │       外壳用 `presync_scope` 返回的自举那份 `Scope.files` **单独** `with atom(...)` 包住它 ——
  │       自举有自己的一个 atom，绝不与 ④ 的业务 atom 合并，锁重入不进来）
  ├─ ④ 调业务函数（L2）：**外壳先用动作那份 `lock_scope(...).files` `with atom(...)` 包住它**，
  │       函数内不拿锁；只读命令不进事务
  │       └─ L1：每个文件一个对象，只读写自己
  ├─ ⑤ 打印（唯一在 render.py；**不 flush** —— 提示统一在 cli.main 的 finally 里打一次）
  ├─ ⑥ 提交：只提交记账本记的脏文件（后验精确；记账本为空 / `--no-sync` 才整步跳过，
  │       already_done 不跳 —— 重跑也可能补写了文件）
  └─ ⑦ 推送：被拒时 rebase 重试（同上跳过条件）
```

细节与每步的跳过条件见 [`ledger-api.md`](ledger-api.md) §四。

**为什么 git 必须在外壳的头尾**：推送被拒会触发 `rebase --autostash`，冲突时脚本会**直接写盘**合并结果。若这发生在业务函数中间，业务手里的改前快照会在下一次整份写回时把别人刚合进来的内容抹掉，且这类写用 `track=False`，连「已改未提交」都不登记。分层细则见 [`code-conventions.md`](code-conventions.md) 的脚本侧一节。

## 三、关键不变量

1. **台账写路径只经脚本**（2026-10-18 拍板，B 混合制按动作分流）：写台账只经 `scripts/progress.py`；插件与 host 都不手改台账 JSON / history / worklog。「host 直写」= host 代跑同一个脚本（已落码：`/claim`、`/release`）。按动作的分流表与前置校验归 [`features/board-home.md`](features/board-home.md)，会话侧接口约束归 [`external/dsh-session-handoff.md`](external/dsh-session-handoff.md)。
2. **提交只在脚本外壳，业务中间零 git**：现状已如此（`git_presync` → `args.func` → `git_sync`），重构只许把「取最新 / 提交 / 推送」三件事从命令里提出来，不许下放到业务层。
3. **两级锁，别混为一谈**：
   - 整条命令级 `repo_sync_lock`：锁文件在 `<git-common-dir>`（worktree 共享），`LOCK_NB` 轮询、最多等 60 秒，等不到就 `Fail`；
   - 单文件级 `progress_lock`：`flock(LOCK_EX)` **无超时、不重入**；平台没有 `fcntl` / `msvcrt` 时**直接不加锁**（只读、单人场景的取舍）；
   - 只有只读命令不拿整命令级锁；`--no-sync` 的写命令**照拿**（它只跳取最新 / 提交 / 推送）。
4. **失败收尾只有两套，别再长第三套**：`WriteLog.rollback_presync()` 负责把「写前取最新」覆盖掉的内容恢复回去；`WriteLog.discard_created()` 负责删掉本次新建的文件；成功路径统一 `clear()`。（业务动作自己写坏了是另一对：`atomic.snapshot` / `restore`，只还原本次动作碰过的文件。）
5. **唯一一个不回滚的失败分支**：BrokenPipe（下游读走人）—— 不回滚，但若本次已写过文件，仍必须完成提交，否则台账停在「已写未提交」，下一条写命令会被写前 guard 拦死。
6. **原子性靠单文件原子写 + 固定写序 + 重跑幂等**，不引入 journal / recover：
   - 单文件写：`mkstemp → write → fsync(file) → chmod → os.replace → fsync(父目录)`（掉电时 rename 的目录项可能丢，所以父目录也要刷）。全仓只有一个写盘出口 `write_text_atomic`，别开第二个；
   - 多文件：先写目标、后删源、删永远是最后一步；每个动作的重跑判据写在业务层。写序表见 [`ledger-data.md`](ledger-data.md)。
   - 跨文件写失败：用 `atomic.snapshot` / `restore` 把**本次动作刚碰过的**文件按字节还回去。这是"读进内存、失败写回"，**不是** journal —— 不落日志、不扫残留、没有启动恢复。
7. **写前 guard 会硬拦**：本地台账有未提交改动 / 有未推送的台账提交 / 有未入库的同名文件 / 处于 rebase 中间态 ⇒ 中止并说明怎么处理。detached HEAD 或无上游时只做本地提交并在 stderr 提示。`worklog` 里人写的改动先 stash、刷完再叠回。
8. **开关只有两组**：动作是否只读由 `actions/registry.py` 的 `ActionSpec.readonly` 决定（只读 ⇒ 不取最新、不自举、不提交）；`--no-sync` / `TASK_LEDGER_NO_SYNC`（不碰 git、不拿整命令级锁）。
9. **skill 内容单一真源**：`packages/skill/` 是唯一真源，插件内嵌副本由构建纳入，两处逐字节一致（`check-skill-copy.mjs` 守）。
10. **开发基线 = 宿主 0.2.0-rc.2**：宿主能力一律以 [`external/`](external/) 为准，不得凭方法名猜签名。
11. **dist 入仓**：git 直装不跑构建脚本；推送前必须 build（含 typecheck 验证）。
12. **明暗主题只认宿主**：`body[data-ds-dark-theme]`，禁用 `prefers-color-scheme`。
13. **路由自持鉴权**：宿主 webServer 无 server-wide auth（默认回环绑定）；若部署暴露非回环地址，闸门必须由插件路由方自持 —— 目前未做，属待拍板风险。

## 四、已知差异与未落码部分

| 项 | 现状 |
|---|---|
| 浮标入口（`shell.overlay`） | 未落码；当前入口只有 `sidebar.panellist` 侧栏条目 + `main` 整页 |

## 五、待拍板

- 工作区**补充源**的配置形态（主来源已定 = `ctx.workspaceRegistry.list()`）；
- UI API 路由的鉴权方案（见不变量「路由自持鉴权」）；
- Desktop（Electron）表面真机表现；
- 结束会话的收尾（模型跑完 ⇒ 自动归档 + 通知用户）：用户 2026-10-18 说先放着。
