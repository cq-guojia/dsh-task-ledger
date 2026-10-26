# 20261026-0917-在-skill-里增加-html-台账展示页-e276：在 skill 里增加 HTML 台账展示页

> **创建**：2026-10-26 09:17:15（@GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6）
> **分类**：建设 ｜ **标签**：台账、展示、静态页面

<!-- 「> **分类**：… ｜ **标签**：…」行由脚本按 new --category / --tags 插入；两者皆空则不写。 -->

## 背景

用户原话（2026-10-26）：现在的工作台账，让用户直接去看台账文件、还是去看 MD 文件，都特别不方便；想在 skill 里增加一个 HTML，把 HTML 的样式都写好，借助它去调用脚本，把台账的所有内容都读出来，用 HTML 形式显示。

三条硬要求：

1. **静态模板**：交付的是一个用于显示的模板程序，不是实时生成 HTML。
2. **脚本调用**：HTML 去找相对目录里的脚本执行，把内容读出来放到静态页面上。
3. **纯静态展示**：不能有服务器，点开就能展示。

## 待办

- 用户 2026-10-26 傍晚叫停命令行看板：`board` 子命令、`--tui`、SKILL.md 描述已全部撤销，skill 回到动手前状态，等重新定方向。
- `ledger/board.html` 仍在工作区（未跟踪、未提交）：用户没说要删，保留待定。
- 未做：任何方向的下一步（HTML 与 TUI 都被叫停）。

## 下一步

等用户给新方向。在拿到明确指令前，不改 `packages/` 下任何文件。

## 过程

- **硬约束（决定了整个形态）**：`file://` 页面的 `fetch`/`XHR` 读同目录 JSON 被浏览器拒绝；唯一能免点击拿到本地内容的通道是 `<script src>` 加载 js 本体。因此「HTML 自动读原数据」不存在，「靠 JS 存路径」也无效（拿到路径照样读不了）。
- **File System Access API（`showDirectoryPicker`）**：唯一能持久化目录句柄的 API，但 `file://` 下抛 `SecurityError`，只在 https/localhost 可用 ⇒ 「记住一次、之后免选」在纯静态下做不到（依据 Chrome 官方调试文档 + 一致技术口径，本机无浏览器未实测）。
- **被否掉的方案**（记录以免重提）：① 实时生成整页 HTML（用户：点了才能看，等于没意义）；② 脚本顺带吐 `board.data.js` 数据快照（用户：数据必须读原数据，不接受把数据塞进 JS；且多一份数据是新的冲突源）；③ 浏览器启动参数 `--allow-file-access-from-files`（用户：不能让用户手动执行命令）。
- **落定形态**：单个 `ledger/board.html`，内联 CSS/JS，用 `<input webkitdirectory>` 手选 `ledger` 目录后**直读原始文件**（`pool.json` / `owners.json` / `owners/*.json` / `history/*.md`），在内存渲染；不写盘、不联网。skill 脚本零改动。
- **数据面口径**（按现有真源）：`pool.json.tasks`（公共池）+ `owners/<hash>.json.tasks`（各人名下，`identity.uuid` 在文件内）+ `owners.json.workers[uuid].name`（名字）；`history/*.md` 为 11 列表格，列序「结案时间 | 创建时间 | 标题 | 分类 | 标签 | owner | owner_name | creator | creator_name | 摘要 | 过程文档」。
- **自检方式**：把 `board.html` 里 `<script>` 抽出来在 node 里跑（stub 掉 `document`），喂真实 `ledger/` 目录的文件，断言渲染出 2 条在办、29 条已结案、链接指向真实存在的过程文档。
- **第二轮形态修正（用户实测反馈）**：用户在本机浏览器打开、台账在远程 SSH 机器上，手选目录选到的是**本机目录**，读不到远端台账；且「每次都要自己指一下」不可接受。结论是必须让页面以 **http** 打开才能用相对路径读同目录数据。
- **双模式落地**：`boot()` 先试 `fetch("pool.json")`（相对页面路径）——成功即零点击渲染（IDE 内置浏览器 / 端口转发 / 静态服务）；失败（`file://`）才显示手选目录那条路。数据来源抽成 `httpSource()` / `pickerSource()` 两个同接口对象（`text` / `historyFiles` / `label`），渲染逻辑一份。
- **http 模式的目录发现**：分片文件名不再靠扫目录，直接读 `owners.json.workers[uuid].file`；history 无索引可用，按「当前月起回看 13 个月」构造 `history/YYYYMM.md` 逐月探测（404 忽略）。
- **三模式验证**（本机起临时 `python3 -m http.server` + node 跑真脚本）：http 自动 = 2 在办 / 30 行已结案、零错误；手选目录 = 同结果；选错目录 = 明确报「里没有 pool.json / owners.json」。验证后服务与临时脚本均已关闭 / 删除。
- **一次转向记录（2026-10-26 傍晚）**：用户实际是 VS Code Remote-SSH（文件在远端、浏览器在本地），`file://` 选目录只能选到本机 ⇒ HTML 的兜底路径对远程无效；用户又明确否掉三件事：多一个数据 `.js`、装任何东西、起/配任何服务与静态托管。查证 MDN 与社区：自 CVE-2019-11730 起本地文件互不可读，`file://` 自动读没有第四条路 ⇒ HTML 方案整体收摊，改 TUI（终端在远程/本地都是同一套，天然跨环境、零依赖、零文件）。

## 结论

**本轮命令行看板实现已全部回退**（用户叫停：不许改 skill 描述）。`board` 子命令、`--tui` 全屏界面、SKILL.md 相关描述、smoke 断言、插件内嵌副本均已还原：

- 回退方式：`git checkout --` 恢复 10 个被改文件，删除 3 个新增文件（`packages/skill/.../actions/board.py`、`.../shell/tui.py`、`packages/plugin/skill/.../actions/board.py`）。
- 验证：`packages/skill` 与 `packages/plugin/skill` 已无 `board_view` / `BoardView` / `--tui` 残留；`check-skill-copy.mjs` 一致；无 `__pycache__`。
- 未触碰：插件 UI 那条在途改动（`packages/plugin/src/client/*`、`dist/*`、`tsdown.client.config.ts`），以及未跟踪的 `ledger/board.html`。
- 版本号未 bump、未提交。

## 执行记录

<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。
     补记用 progress.py log --id <任务号> --note "一句话"。 -->
- 2026-10-26 17:17:15 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 创建任务并认领
- 2026-10-26 17:17:41 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 任务已建并认领；worklog 记下三条硬要求与待讨论点：file:// 下 HTML 不能自执行本地脚本，第 2 条形态需先定
- 2026-10-26 17:45:22 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 落地 ledger/board.html（单文件、webkitdirectory 手选目录直读原始 JSON/MD，skill 脚本零改动）；node 自检 2 在办/29 已结案、链接均存在，codelint 全过；待用户验收
- 2026-10-26 17:51:15 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 改双模式：http 打开时按相对路径自动读同目录台账（零点击），file:// 才回退手选目录；三模式 node 实测通过，codelint 全过
- 2026-10-26 20:52:47 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 方向转 TUI：新增只读 board 子命令（actions/board.py + render.board_view + registry/cli 注册，零依赖 ANSI 一屏）；smoke 加 2 项全绿、codelint 13→17 文件全过、内嵌副本已同步；HTML 方案按用户否决定收摊
- 2026-10-26 20:56:31 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 按用户叫停撤销全部命令行看板改动：git checkout 恢复 10 个文件、删 3 个新增文件，skill 与内嵌副本无残留；未碰插件 UI 在途改动，等新方向
