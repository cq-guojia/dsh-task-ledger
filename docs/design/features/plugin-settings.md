# 插件详情页配置区（入口位置 / 显示名 / 两个链接）

> **状态**：🔵 落码（2026-11-05），宿主内真机未验，见「验收判据」
> **来源**：用户 2026-11-05 原话「在官方的插件界面点开，里面有设置，就是我们现在要做设置页面的功能」+ 同轮四条需求（项目链接 / 组件库友情链接 / 入口位置 / 自定义显示名）
> **配套**：槽位与表单事实见 [`../external/client-ui-layout.md`](../external/client-ui-layout.md) §五；样式与控件分工见 [`../ui-style.md`](../ui-style.md) §四；插件页标题与图标见 [`plugin-listing.md`](plugin-listing.md)

---

## 一、做了什么

官方插件列表点进本插件后，详情页里多出一块**配置区**（`plugins.bundle.config` 槽位），四样东西：

| 项 | 形态 | 落点 |
|---|---|---|
| **入口位置** | 核心库 `Picker`（下拉单选，`width: 100%`），两档：`一级菜单`（默认，左侧栏一级）/ `更多`（收进侧栏底部的「更多」菜单） | 设置文档字段 `entryMode` |
| **显示名称** | 核心库 `Input`（文本） | 设置文档字段 `displayName` |
| **GitHub 项目** | 核心库 `Button`（outline + 链图标），点开 `https://github.com/cq-guojia/dsh-task-ledger` | 常量，不进设置 |
| **蓝鲸组件库** | 同上，点开 `https://github.com/cq-guojia/dsh-plugin-core` | 常量，不进设置 |

版式（用户 2026-11-05 指定照兄弟仓 `dsh-session-title-pattern` 抄）：

- **两个设置项一行、左右各半**（`grid 1fr 1fr`）：左「显示名称」、右「入口位置」。
- **保存与两个链接同一排，保存在最前**：保存 → GitHub 项目 → 蓝鲸组件库。
- **「是否改过」的提示**：改过的字段显示「自定义」标签 +「恢复默认」（文字链接），没改过两者都不出现。标签与恢复按钮都用核心库件（`Chip` / `Button variant='link'`），**不手搓**。
- **控件全部走核心控件库**：`Input` / `Picker` / `Chip` / `Button`（用户 2026-11-05：「不要自己手搓…用核心空间里面的」）；本文件只排标签、说明与两列容器（`.dtl-config__*`）。
- **两条分隔线**：字段区顶部一条实线（`--dtl-border`，从「显示名称」上沿开始），保存按钮那一排底部一条实线；保存行与字段区之间留 36px（字段下内距 12 + 上外边距 24）。
- 因为保存按钮要和链接同排，**不套官方 `SettingsForm` 外壳**（那个外壳的保存按钮固定在自己的 footer 里）：`dirty / invalid / saving / failed` 状态仍全部来自官方 `SettingsFormModel`；外壳原本负责的「离开页面丢弃草稿」在本组件卸载时自己接。

**没有任何东西落本地文件**：两个字段是 host 侧 `Config` 的 `volatile` 字段，由宿主持久化到 profile 的 patch 文档；插件不写盘、不碰 localStorage。

三条行为口径：

1. **入口默认 `一级菜单`** —— 等于改动之前的既有位置，装上不会先被挪走。
2. **显示名空串 = 用默认名**（`panelTitle`：中文「蓝鲸任务台账」/ 英文 `Whale Ledger`，跟随宿主语言）。
3. **填成与默认名相同 = 不落盘**：保存前把它折成「清空」，设置文档里不留这一项（用户层没有覆盖）。

## 二、宿主怎么读（依据）

| 事实 | 证据 |
|---|---|
| 详情页按**包名**去这个 keyed 槽里找配置区，且只渲染 `page` 视图 | `@deepseek-ai/dsh-client-ui-plugin-manager@0.2.0-rc.1` `lib/client.js:2527`（`renderSlot("plugins.bundle.config", { view: "page" }, { entryKey: pkg.name })`）、`lib/types/client/slot-contract.d.ts:100` |
| 槽位契约 = `{ view: 'summary' \| 'page'; form?: { state; mutate } }` | 同上 `slot-contract.d.ts:20-26`、`150-158` |
| 设置命名空间 = **活跃 entry 的 id**（本项目 `cordis.patch.yml` 的 `dsh-task-ledger`），由 settings 服务按 `Config` schema 派生 | `dsh-plugin-core/packages/demo/src/index.ts:11-16`（同栈活样本的注释 + 真机验证） |
| 只有 `.volatile()` 字段进表单；写入由宿主持久化、字段热更新 | 同上；官方 `SettingsFormModel`（`primitives@0.2.0-rc.1` `lib/types/settings-form/form-model.d.ts`） |
| 「更多」菜单槽 = `sidebar.panellist.actions`（注册一行 `MenuItemButton`，行里点开跳整页并收起菜单） | `dsh-plugin-core/packages/demo/src/client/index.tsx:113-137`（**同栈活样本用法；该槽的 `.d.ts` 本机未装，未逐行亲验**） |

## 三、落点

| 文件 | 装什么 |
|---|---|
| `packages/plugin/src/index.ts` | `Config`（两个 `volatile` 字段）+ 动态 import `@deepseek-ai/schemastery` 的兜底 |
| `packages/plugin/src/schemastery.d.ts` | schema 库的本地最小类型声明（本仓不装官方包） |
| `packages/plugin/src/client/config-panel.ts` | 配置区组件：`SettingsValueField` + `Menu` 下拉 + 保存 / 链接按钮（版式见 §一） |
| `packages/plugin/src/client/ui.ts` | `.dtl-config__*` 一组排版类（写在 `UI_BASE_CSS`，同一个注入器挂载） |
| `packages/plugin/src/client/index.ts` | 建 `SettingsFormModel`、订阅设置文档、按 `entryMode` 把入口挂到 `sidebar.panellist` 或 `sidebar.panellist.actions`、注册 `plugins.bundle.config` |
| `packages/plugin/src/client/primitives.d.ts` | `SettingsForm` / `SettingsFormModel` / `SettingsValueField` / `MenuItemButton` / `IconLinkOutlineRegular` 的本地声明 |
| `packages/plugin/src/client/locales.ts` | `config*` 一组中英文案 |
| `packages/plugin/package.json` | `dsh.client.inject` 补 `-ui-settings` / `-ui-plugin-manager` / `-ui-sidebar`（三个槽位与 `configForms` 服务的 owner） |

## 四、已定（不再作为待定项）

- 配置区**只做这四项**：入口位置两档（不做 `off` 隐藏档）、显示名、两个外链。
- 显示名**只改入口显示**（侧栏条目 / 「更多」菜单那一行），**不改**插件详情页标题（那是 `locale/*.json` 的 `meta`，见 `plugin-listing.md`）。
- 组件一律用宿主官方 primitives，**不经 `dsh-plugin-core` 控件层、不自绘**（用户 2026-11-05 明确）。
- 保存形态沿用官方表单的口径（草稿 + 保存按钮字、离开页面丢弃草稿），但**按钮位置按上面的版式自排**，不做「拨动即写」。
- 入口位置**用下拉，不用分段控件**（用户 2026-11-05：「就用个下拉框就完了」）。

## 五、验收判据

1. 插件列表点进本插件 → 详情页出现配置区：入口位置两档、显示名称输入框、两个链接按钮。
2. 「入口位置」下拉选「更多」→ 保存 → 左侧栏一级条目消失，侧栏底部「更多」菜单里出现本插件一行，点它打开看板整页并收起菜单；此时该字段出现「已自定义」徽标与「恢复默认」。
3. 选回「一级菜单」→ 保存 → 回到左侧栏一级。
4. 显示名称填「我的台账」→ 保存 → 侧栏条目 / 更多菜单那一行显示「我的台账」。
5. 显示名称清空 → 保存 → 回到「蓝鲸任务台账」；再把名字填成「蓝鲸任务台账」→ 保存 → 设置文档里不留 `displayName`（宿主表现为「未覆盖」状态）。
6. 切英文：默认名变 `Whale Ledger`，其余文案同步。
7. 两个链接都在新标签打开，指向 `cq-guojia` 的两个仓。

## 六、已知风险

1. **`@deepseek-ai/schemastery` 必须随包安装**：`packages/plugin/package.json` 已声明 `^3.18.5`（与 `dsh-plugin-core/packages/demo` 同口径）。⚠️ 实测过：**没装时它解析不到**（插件从自己的 `node_modules` 往上找，到不了宿主 profile），于是 `Config` 退化成 `undefined` → 宿主不派生设置命名空间 → 详情页那块显示「设置当前不可用」。真要丢了依赖，表现就是这一句，不会把插件标成异常。
2. **host entry 改动必须重启宿主**：`Config` 只在 entry 加载时导出，浏览器刷新不够。
3. **`sidebar.panellist.actions` 只按同栈样本的用法实现**，本机没装 `@deepseek-ai/dsh-client-ui-sidebar`，该槽的 `.d.ts` 未逐行核实；宿主升级后若该槽改名，表现是「选『更多』后入口整个不见」。
4. **`dsh.client.inject` 新增了三个包**：宿主若缺其中某个，对应槽位不会注册（配置区或「更多」入口缺失），但看板不受影响。
5. 官方 `SettingsForm` 没有「保存成功」提示；保存成功的唯一反馈是保存按钮恢复不可用态。本轮不加 Toast（用户未要求）。
