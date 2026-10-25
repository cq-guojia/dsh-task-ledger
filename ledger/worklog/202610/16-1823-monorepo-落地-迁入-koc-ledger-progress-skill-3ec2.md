# 20261016-1823-monorepo-落地-迁入-koc-ledger-progress-skill-3ec2：monorepo 落地：迁入 koc-ledger-progress skill 并发布可安装包

> **✅ 完成封卷**：2026-10-16 20:41:15（@cqguojia@hotmail.com）
> **创建**：2026-10-16 18:23:28（@cqguojia@hotmail.com）
> **分类**：建设 ｜ **标签**：monorepo、skill、发布

<!-- 「> **分类**：… ｜ **标签**：…」行由脚本按 new --category / --tags 自动插在创建行后；
     两者皆空则不写此行。close 时可用 --category / --tags 覆盖修正。 -->

## 背景

前任务「熟悉项目初衷并搭建初始文档架构」已结案并提交（`3ab2d7f`，文档架构 + 0.2.0-rc.2
开发基线落地）。用户指示（原话）：「如果基础的弄完了，就把这个任务结束掉，把东西提交
上去，然后再建一个新任务。新任务的目的是：1. 先把现成的 skill 挪过来加进去。加进去
不是就可以发版了吗？发版的 skill 就能正常安装了，对不对？2. 把 skill 安装弄好之后，
我们再去做 DSH 的插件」。

对用户两个问题的回答（已核实的结论）：

- **「加进去就可以发版」——是必要前提，但还差发布配置**：monorepo 化（pnpm workspaces）、
  skill 包 `package.json`（name `koc-ledger-progress` 未被占用、`repository.url` 必带——
  否则 provenance E422、files 白名单）、发布工作流按 tag 前缀分家（现行 `v*` 是占位
  单包触发，需改 `plugin-v*` / `skill-v*`）、版本号与 tag 一致。
- **「发版后就能正常安装」——对**：skill 包零代码（SKILL.md + scripts + assets），
  npm / git 均可装、无构建步骤、装完即用；其他 agent（CodeBuddy 等）按各自约定放置
  skill 目录。安装通道事实见 `docs/design/external/publish-oidc.md`。

**顺序**：本任务只做 skill 包（迁入 + 配置 + 发版 + 安装验证）；DSH 插件（host/client
两半）在本任务之后另建。

## 待办

- ✅ **迁入 skill 内容**（用户 2026-10-16 授权「先 copy 过来吧」）：已拷入
  `packages/skill/`，`diff -r` 与规范源逐字节一致；4 个文件 = README.md / SKILL.md /
  assets/worklog.md / scripts/progress.py
- ✅ **改名定稿并执行（最终名 `task-ledger`）**：用户先后拍板 `ledger-progress` →
  `task-ledger`（与插件 `dsh-task-ledger` 成家族，npm 实测空）；仓内 13 处已改；
  `packages/skill/package.json` = `task-ledger@1.0.0`（files 白名单 +
  repository.url 防 E422）
- ✅ **task-ledger@1.0.0 已发布并验证**（2026-10-16，用户手发）：maintainer=guojia、
  latest=1.0.0、5 文件、tarball integrity 与发布输出一致
- ✅ **npm 侧清理完成**（用户 2026-10-16 执行）：`ledger-progress@0.0.0-stage` 已撤、
  包彻底消失（E404 Unpublished 11:17:48Z，名字释放）；`task-ledger@0.0.0-stage`
  占位版已清。独立核验终态：task-ledger 单版本 1.0.0、latest=1.0.0、5 文件、
  integrity 与发布输出一致
- ✅ **monorepo 化落地**：root `package.json` 改 private workspace 根
  （`workspaces: ["packages/*"]`，name 改 `dsh-task-ledger-monorepo`；未建
  `pnpm-workspace.yaml`——package.json 的 workspaces pnpm 同样认）；`packages/plugin/`
  占位包落地（name `dsh-task-ledger`、version 0.0.4 接占位版本线、repository.url）
- ✅ **发布工作流改建**：`publish.yml` 双前缀分家（`skill-v*` → packages/skill、
  `plugin-v*` → packages/plugin，均 OIDC + `--provenance`、Node 24）；npm 侧
  `task-ledger` 的 Trusted Publisher 连接已由用户建好（GitHub Actions + 本仓 +
  publish.yml + Allow npm publish；dist-tag 未勾、Environment 留空）
- ✅ **CI 信任发布实测通过**（2026-10-16，用户授权实测）：`skill-v1.0.1` tag →
  skill job 五步全 success（含 `npm publish --provenance`）、plugin job 按 `if`
  正确跳过 ⇒ `task-ledger@1.0.1` 上线、`latest=1.0.1`，OIDC + provenance 链路
  端到端验证（Trusted Publisher 连接配置正确）
- ⚠️ 待用户确认（移交后续）：NAS-Docker 规范源目录改名（`_Skills/koc-ledger-progress/` →
  `task-ledger/`）+ rulemux 重新同步；EXE001 修复落点（应落规范源）

## 下一步

本任务已结案。DSH 插件开发（host/client 两半）按用户既定规划**另建任务**——
「把 skill 安装弄好之后，我们再去做 DSH 的插件」。

## 过程

1. **拷贝完成**（用户 2026-10-16 授权「先 copy 过来吧」）：规范源
   `/workspace/NAS-Docker/_Skills/koc-ledger-progress/` → `packages/skill/`，
   `diff -r` 校验逐字节一致（IDENTICAL）。落得 4 个文件：README.md / SKILL.md /
   assets/worklog.md / scripts/progress.py。
2. **空目录 `references/`**：规范源有、rulemux 安装副本无，但目录为**空** —— git 与
   npm 包均不跟踪空目录，内容零差异；拷贝时原样带入（本地可见、不入库）。
3. **codelint 1 条 FAIL（B 类记账，不阻塞）**：`packages/skill/scripts/progress.py:1`
   EXE001「shebang 在但无可执行位」。三处副本（规范源 / rulemux 安装 / 本仓）均为
   644 同大小，属 skill 既有属性、非拷贝损伤；skill 以 `python3 <path>/progress.py`
   调用、无需执行位。**不在本仓 chmod** —— 会产生与单一真源的模式分歧；修复应落在
   规范源（chmod +x 或去 shebang），下次同步两边继承。
4. **改名定稿 + 执行**（用户 2026-10-16 拍板 `ledger-progress`）：npm 实测五个候选名
   全空（ledger-progress / skill-ledger-progress / ledger-progress-skill /
   task-ledger-skill / dsh-task-ledger-skill）。定名理由：去 koc vendor 前缀；包名与
   skill 内部名同名（SKILL.md frontmatter name / 目录名 / 插件 register 名三位一体）。
   已改：packages/skill 三文件 6 处 + 根 README/package.json + docs/README、
   architecture、features、ledger-data、dsh-skill-registration 六处。**刻意不动**：
   `.codebuddy/rules/__rulemux__*.md`（rulemux 托管副本，待中心规则更新后重同步）与
   `ledger-data.md` 历史样例行（真实封卷数据，保真）。`packages/skill/package.json`
   已建：name `ledger-progress`、version `1.0.0`（与 SKILL.md frontmatter 的
   version 一致）、files 白名单（SKILL.md/README.md/scripts//assets/）、
   `repository.url`（provenance E422 教训）。codelint 仍只报已知 EXE001（B 类记账）。
5. **改名二次纠正**（用户 2026-10-16）：`ledger-progress@1.0.0` 已被用户手发上 npm
   （内容 = 内部名 ledger-progress 的 skill）；用户随即纠正名字应为 `task-ledger`
   （npm 实测空；与插件 `dsh-task-ledger` 成家族：插件 dsh- 前缀、skill 裸名）。
   已把仓内 13 处 ledger-progress → task-ledger（packages/skill 四文件、根
   README / package.json、docs 六处）；**刻意不动**：`.codebuddy/rules/__rulemux__*.md`
   （rulemux 托管副本，仍是 koc-ledger-progress，待中心规则更新后重同步）与
   `ledger-data.md` 历史样例行（封卷真数据，保真）。误发包的处置命令已给用户
   （unpublish 推荐 / deprecate 备选）。
6. **发布执行与 staging 占位现象**（2026-10-16，用户手发）：`task-ledger@1.0.0` 发布
   成功并核实（maintainer=guojia、latest=1.0.0、integrity 一致）；`ledger-progress@1.0.0`
   已 unpublish。⚠️ 发现 npm 暂存发布机制：发布处理窗口内 `npm view <包> version` 会
   返回 `0.0.0-stage`（description "Temporary package placeholder for staged
   publishing"）——这是占位版本不是抢名，等处理完（约 1 分钟）即让位给正式版本。
   `ledger-progress` 因此还残留一个 0.0.0-stage 占位版本占名，需再 unpublish 一次
   才彻底消失；`task-ledger` 自身也带一个同名占位版本（可选清理）。
7. **npm 清理 + 传播延迟坑**（2026-10-16，用户执行）：撤 `ledger-progress@0.0.0-stage`
   时输出 `- ledger-progress`（末版撤掉即整包消失）。⚠️ **传播延迟**：撤完立刻
   `npm view ledger-progress` 仍返回旧文档（registry 副本滞后），约 30 秒后再查才
   E404（"Unpublished on 2026-10-16T11:17:48.341Z"）⇒ **发布 / 撤销后不能信第一次
   view，必须重查确认**。`task-ledger@0.0.0-stage` 占位版亦已清，终态独立核验：
   versions=[1.0.0]、latest=1.0.0、fileCount=5、integrity 与发布输出一致。
8. **monorepo 化落地**（用户 2026-10-16 授权「你去操作吧」，Trusted Publisher 连接
   已由用户建好）：root `package.json` → private workspace 根（name
   `dsh-task-ledger-monorepo`、`workspaces: ["packages/*"]`）；`packages/plugin/`
   占位包（`dsh-task-ledger@0.0.4` 接占位版本线、files 只 README、repository.url）；
   `publish.yml` 改建为双前缀（skill-v* / plugin-v*，两 job 均 OIDC + --provenance、
   Node 24、working-directory 发布；占位期无 install/build，注释留待补）；根 README
   改 monorepo 总览（双包表 + 安装矩阵），原占位说明移交 packages/plugin/README.md；
   architecture.md 双包表同步（路径、版本线、workspaces 声明方式）。
9. **CI 信任发布实测通过**（用户 2026-10-16 授权「改个 tag 实测一下」）：版本
   1.0.0→1.0.1 提交推送后打 `skill-v1.0.1` tag（commit `5eb5566`）→ skill job
   五步全 success（含 `npm publish --provenance`），plugin job 按 `if` 正确跳过。
   ⚠️ **传播延迟二次踩到**：run 完成后立刻查 npm 两次均 404（副本滞后，比手工发布
   那次更久），约 1 分半后复查才见 `versions=[1.0.0, 1.0.1]`、`latest=1.0.1`
   ⇒ **CI 发布后至少等 2 分钟再验证、且必须重查**。GitHub API 拉 run 日志需认证
   （403），但 npm 侧结果已确认链路通。

## 结论

<!-- 收尾时填：做成了什么、留了什么坑。
     例：已修复，但只覆盖 UTF-8；GBK 另开任务 -->

## 执行记录

<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。
     补记用 progress.py log --id <任务号> --note "一句话"。 -->
