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

- 待定（用户侧）：远程 SSH 场景下用什么方式把页面以 http 打开（IDE 内置浏览器 + 端口转发 / 静态服务），本机 file:// 打开对远程台账无意义。
- 待用户验收：通过 http 打开应零点击直接出数据；file:// 下走手选目录那条路。
- 验收通过后：把 `ledger/board.html` 移进 skill 包，并在建台账（`bootstrap`）时拷到 `ledger/board.html`；此时才决定 skill 发版口径。
- 未做：单条任务详情页（过程文档目前只给跳转链接，页面内不渲染 md 全文）。
- 未做：多个月份 history 的折叠 / 筛选；目前全部按月文件拼成一张表。
- http 模式的 history 探测只回看最近 13 个自然月（与 skill `history` 窗口一致），更早的月份在 http 模式下不会出现（手选目录模式不受此限）。

## 下一步

等用户对展示效果给结论；通过则改 `packages/skill/scripts/ledgerkit/actions/bootstrap.py`（建台账处）加一步模板拷贝，并把模板放到 skill 包内固定路径。

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

## 结论

`ledger/board.html` 已落地（本项目唯一新增文件，skill 脚本一行未改）：以 http 打开（IDE 内置浏览器 / 端口转发）→ 自动读同目录台账、零点击渲染；以 `file://` 双击 → 顶部按钮手选 `ledger` 目录后直读。渲染在办分组卡片、统计卡与已结案表，过程文档可点击跳转。三模式 node 实测通过，`koc-codelint` 全过。尚未验收，尚未移入 skill 包。

## 执行记录

<!-- 本节由脚本维护：new / claim / set / release / log / close 自动追加，请勿手改。
     补记用 progress.py log --id <任务号> --note "一句话"。 -->
- 2026-10-26 17:17:15 · new · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 创建任务并认领
- 2026-10-26 17:17:41 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 任务已建并认领；worklog 记下三条硬要求与待讨论点：file:// 下 HTML 不能自执行本地脚本，第 2 条形态需先定
- 2026-10-26 17:45:22 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 落地 ledger/board.html（单文件、webkitdirectory 手选目录直读原始 JSON/MD，skill 脚本零改动）；node 自检 2 在办/29 已结案、链接均存在，codelint 全过；待用户验收
- 2026-10-26 17:51:15 · log · @GuoJia-Agent · 8d557c6d-7c93-43ac-8c73-5d623e82e1c6 · 改双模式：http 打开时按相对路径自动读同目录台账（零点击），file:// 才回退手选目录；三模式 node 实测通过，codelint 全过
