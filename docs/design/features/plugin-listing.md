# 插件在官方插件页的呈现

> **状态**：🔵 落码（2026-11-05）；宿主内真机未验，见「验收判据」
> **来源**：用户 2026-11-05 原话「确定插件的中英文名字 / 确定插件的 icon / 配置官方插件页面的设置、入口以及简介说明」；参考兄弟项目 `dsh-plugin-core` 的 `packages/demo`
> **配套**：进度见台账任务 `20261105-0552-9045-确定插件中英文名与图标并配置官方页`；兄弟范例 `dsh-plugin-core/packages/demo/package.json`、`dsh-plugin-core/packages/demo/locale/zh.json`

---

## 一、做了什么

DSH 的 Plugins 页点进本插件后，顶部显示**标题 + 图标 + 说明**。这三样原先都是宿主兜底值（完整包名 + 默认图案 + `package.json` 的英文 description），现改为品牌值：中文「蓝鲸任务台账(dsh-task-ledger)」/ 英文「Whale Ledger (dsh-task-ledger)」。

左侧栏入口另有一处图标（`packages/plugin/src/client/ui.ts` `LedgerIcon`），与插件页图标同形、但为无色版：同一份 path 数据 `fill: currentColor`，随主题与选中态反色。

官方插件设置项（`plugins.item`）**本轮不注册**，保持空白。

## 二、宿主怎么读（依据）

| 位置 | 来源 | 证据 |
|---|---|---|
| Installed 列表卡片 / bundle 详情页 / 组件行 | 包根 `package.json` 的 `icon` 字段，或包导出的 `./icon`；缺失或解不出图时回落默认图案 | `@deepseek-ai/dsh-client-ui-plugin-manager@0.2.2-rc.1` `README.md:38` |
| 同上位置的标题与说明 | 优先包内 locale `meta`，回落可访问的 `package.json`；两处都缺时标题=完整包名、说明为空 | 同上 `README.md:38` |
| Discover（市场）卡片 / 条目详情 | 插件**索引 JSON** 条目里的 `icon`（data URL 或绝对 URL，内联上限 32 KiB） | `@deepseek-ai/dsh-plugin-market-index@0.2.2-rc.1` `lib/types/types.d.ts:71` |

本功能只走前两行（Installed 路线）。Discover 那头的图标写进插件索引，索引是仓库外的远程文档，不在本次范围。

`locale` 落位与写法照兄弟项目 demo（同栈活样本，宿主内已验证可用）：`package.json` 写 `"icon": "./assets/icon-components.svg"`，`exports` 含 `"./locale/*.json"`，`files` 含 `assets` 与 `locale`；`locale/zh.json` 形如 `{ "meta": { "title": "…", "description": "…" } }`。该 demo 的 SVG 同样来自阿里图标库（带 `t` / `class="icon"` / `p-id`）、彩色填充，宿主照常显示。

> 未做：宿主读 locale 的实现源码未逐行核实（官方 README 只声明行为），靠官方 README + 兄弟项目真机结果，见文末验收判据第 1、2 条。

## 三、定稿文案

| 项 | 中文 | 英文 |
|---|---|---|
| 标题 | `蓝鲸任务台账(dsh-task-ledger)` | `Whale Ledger (dsh-task-ledger)` |
| 说明 | `建任务、认领、记进展、结案均由 Agent 主动写入工作区的纯文本台账，负责人、当前进度与下一步随时可查；不限于开发工作，调研、文档、演示、视频制作等均可建立任务。无需云服务，纯本地管理。单人、多人均可使用，支持 Git 同步，各项操作均有记录；控制面板汇总在办、逾期、停滞与按周趋势。` | `Tasks are created, claimed, advanced and closed by the agent and written straight into a plain-text ledger in the workspace, so the owner, the current state and the next step are always on record. It is not limited to development work — research, documentation, presentations and video production all fit. No cloud service is involved: everything is managed locally. Single-user and multi-user both work, with Git synchronisation, and every action is on record. The control panel summarises in-flight, overdue and stalled work with weekly trends.` |

中文括号用半角且不留空格、英文括号后留一个空格 —— 与兄弟项目 demo 一致。

文案定型的约束（2026-11-05 两轮定下来的，以后改写沿用）：

- 不把插件定位成「只看 / 浏览」，它带 skill，本质是主动记录；
- 要落到痛点：规划散落难找、事情做一半接不上、有记录才有统计；
- 不用「装上它…」开场；不说「随代码一起提交」（台账独立提交，不与代码混）；
- 任务类型不限于代码，开发 / 调研 / PPT / 视频都能建；
- **数据必须是本地纯文本文件**：写成「无需云服务，纯本地管理」一句带过即可，不展开文件细节；
- **单人、多人均可使用，支持 Git 同步** —— 不是「多人靠 git 汇总」，两种用法对等；
- 用书面词：写「负责人 / 当前进度」，不写「谁在做 / 做到哪」；写「调研、文档、演示、视频制作」，不写「PPT / 剪视频」；
- 结尾落在控制面板能看到什么。

## 四、落点

| 文件 | 现状 |
|---|---|
| `packages/plugin/locale/zh.json`、`locale/en.json` | 已建，仅含 `meta.title` / `meta.description` |
| `packages/plugin/assets/icon.svg` | 已建。彩色版：黑轮廓改为深蓝 `#405580`（暗色底上纯黑看不见），橙柱 `#FF7D03` 不动；`viewBox` 由 `0 0 1024 1024` 收紧到 `153 153 718 696`（图形占约 92%，原版只占 65%），源图标两个 `opacity=".01"` 背景块与 `p-id` / `t` / `class` 脏属性已清 |
| `packages/plugin/package.json` | 已加 `icon`、`exports["./locale/*.json"]`，`files` 补 `assets` + `locale`，`description` 与 `en.json` 同一句 |
| `packages/plugin/src/client/ui.ts` `LedgerIcon` | 已换黑白版：同一份 path，`fill: currentColor`，`viewBox` 同步 `153 153 718 696` |
| `packages/plugin/src/client/locales.ts` `panelTitle` | 已改「蓝鲸任务台账」/ `Whale Ledger`（侧栏入口名） |
| 根目录 `电商与财产-工作台.svg` | 已删 |

黑白版不重画：颜色版与无色版共用同一套 path，只换 `fill`，形状逐点一致。侧栏图标用 `currentColor`，暗色主题与选中态自动跟文字色，不受彩色版的蓝色影响。

## 五、已知风险

1. **18px 下支架仍是最细的一处**：`viewBox` 收紧后图形整体放大，但支架本身约 2px 宽，宿主里看着不清就去掉支架或加粗——不影响插件页的大图。
2. **深蓝 `#405580` 在暗色底上偏暗**：只能二选一（纯黑彻底不可见、浅蓝 `#BFD9FF` 在白底几乎消失），取深蓝是两头折中；真机上若仍看不清，再考虑别的做法（例如给图标加浅色底板，用户已明确否掉一版）。
3. **`description` 在两处维护**：`package.json` 与 `locale/en.json` 必须同一句，改文案时一起改（宿主优先读 locale，但 npm 页面与兜底读 `package.json`）。
4. **界面文案与插件元数据是两套**：界面用语在 `src/client/locales.ts`（`NS = "dsh-task-ledger"` 注册进宿主 locale 服务），插件页标题/说明在 `locale/*.json`。改一边不会带动另一边。

## 六、已定（不再作为待定项）

- 侧栏面板标题用「蓝鲸任务台账」/ `Whale Ledger`（`src/client/locales.ts` `panelTitle` 两档都改）。
- 彩色图标不用底板，黑色轮廓换兄弟项目 demo 的深蓝 `#405580`（暗色底上纯黑不可见；浅蓝 `#BFD9FF` 在白底几乎消失，故取深蓝）。
- 包名 `dsh-task-ledger` 与 `plugin-v*` tag 不动，改名只做展示层。
- 官方插件设置项（`plugins.item`）不注册。

## 七、验收判据

1. 宿主 Plugins 页点进本插件：标题显示 `蓝鲸任务台账(dsh-task-ledger)`，图标是彩色版本，说明是第三节文案。
2. 宿主语言切英文：标题变 `Whale Ledger (dsh-task-ledger)`，说明同步。
3. 左侧栏入口显示无色图标，暗色主题与选中态下清晰可见（顺带看风险 1）。
4. 根目录不再有 `电商与财产-工作台.svg`（已满足）。
