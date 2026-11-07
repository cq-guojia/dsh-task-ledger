# 插件在官方插件页的呈现

## 一、展示内容

DSH 的 Plugins 页点进本插件后，顶部显示标题 + 图标 + 说明，均为品牌值：中文「蓝鲸任务台账(dsh-task-ledger)」/ 英文「Whale Ledger (dsh-task-ledger)」。官方插件设置项（`plugins.item`）不注册；插件自身的配置走 bundle 详情页的配置区（`plugins.bundle.config`），见 [plugin-settings.md](plugin-settings.md)。

侧栏入口另有一处图标（`src/client/ui.ts` 的 `LedgerIcon`），与插件页图标同形、无色版：`fill: currentColor`，随主题与选中态反色。

## 二、宿主怎么读

| 位置 | 来源 |
|---|---|
| Installed 列表卡片 / bundle 详情页 / 组件行 | 图标取包根 `package.json` 的 `icon` 字段或包导出的 `./icon`；缺图回落默认图案 |
| 同上位置的标题与说明 | 优先包内 locale `meta`，回落可访问的 `package.json`；两处都缺时标题=完整包名、说明为空 |
| Discover（市场）卡片 / 条目详情 | 插件索引 JSON 条目里的 `icon`（data URL 或绝对 URL，内联上限 32 KiB） |

本功能只走前两行（Installed 路线）。Discover 的图标写进仓库外的远程索引，不在本插件仓内。宿主读取 locale 的实现源码未逐行核实，行为依据来自官方 README 与同栈插件的实机结果。

`locale` 落位：`package.json` 写 `"icon": "./assets/icon.svg"`，`exports` 含 `"./locale/*.json"`，`files` 含 `assets` 与 `locale`；`locale/zh.json` 形如 `{ "meta": { "title": "…", "description": "…" } }`。

## 三、展示文案

| 项 | 中文 | 英文 |
|---|---|---|
| 标题 | `蓝鲸任务台账(dsh-task-ledger)` | `Whale Ledger (dsh-task-ledger)` |
| 说明 | `建任务、认领、记进展、结案均由 Agent 主动写入工作区的纯文本台账，负责人、当前进度与下一步随时可查；不限于开发工作，调研、文档、演示、视频制作等均可建立任务。无需云服务，纯本地管理。单人、多人均可使用，支持 Git 同步，各项操作均有记录；控制面板汇总在办、逾期、停滞与按周趋势。` | `Tasks are created, claimed, advanced and closed by the agent and written straight into a plain-text ledger in the workspace, so the owner, the current state and the next step are always on record. It is not limited to development work — research, documentation, presentations and video production all fit. No cloud service is involved: everything is managed locally. Single-user and multi-user both work, with Git synchronisation, and every action is on record. The control panel summarises in-flight, overdue and stalled work with weekly trends.` |

中文括号用半角且不留空格，英文括号后留一个空格。改写文案沿用下列约束：

- 插件带 skill，本质是主动记录，不定位成「只看 / 浏览」；痛点落在规划散落难找、事情做一半接不上、有记录才有统计。
- 不用「装上它…」开场；不说「随代码一起提交」（台账独立提交，不与代码混）。
- 任务类型不限于代码：开发、调研、演示、视频制作都能建。
- 数据必须是本地纯文本文件，写成「无需云服务，纯本地管理」一句带过，不展开文件细节。
- 单人、多人均可使用，支持 Git 同步；不是「多人靠 git 汇总」，两种用法对等。
- 用书面词：「负责人 / 当前进度」「调研、文档、演示、视频制作」。
- 结尾落在控制面板能看到什么。

## 四、落点

| 文件 | 内容 |
|---|---|
| `packages/plugin/locale/zh.json`、`locale/en.json` | 仅含 `meta.title` / `meta.description` |
| `packages/plugin/assets/icon.svg` | 彩色版：深蓝 `#405580` 轮廓 + 橙柱 `#FF7D03`；`viewBox` 收紧到 `153 153 718 696`，清掉背景块与图标库脏属性 |
| `packages/plugin/package.json` | `icon`、`exports["./locale/*.json"]`，`files` 含 `assets` + `locale`，`description` 与 `en.json` 同一句 |
| `packages/plugin/src/client/ui.ts` | `LedgerIcon` 无色版，与彩色版共用同一套 path，只换 `fill` |
| `packages/plugin/src/client/locales.ts` | `panelTitle` 为「蓝鲸任务台账」/ `Whale Ledger`（侧栏入口名） |

## 五、约束与已知风险

- `description` 在 `package.json` 与 `locale/en.json` 两处维护，必须同一句：宿主优先读 locale，npm 页面与兜底读 `package.json`。
- 界面文案与插件元数据是两套：界面用语在 `src/client/locales.ts`（`NS = "dsh-task-ledger"` 注册进宿主 locale 服务），插件页标题/说明在 `locale/*.json`，改一边不带动另一边。
- 18px 下支架是最细的一处（约 2px 宽），小尺寸可能不清；深蓝 `#405580` 在暗色底上偏暗，是纯黑不可见与浅蓝在白底消失之间的折中。彩色图标不用底板。
- 包名 `dsh-task-ledger` 与 `plugin-v*` tag 不动，改名只做展示层。

## 更新日志

- 2026-11-07 23:03:04：按 koc-code-docwriter 槽位迁移，剔除过程稿并统一标题头
- 2026-11-07 23:04:17：标题去过程词
