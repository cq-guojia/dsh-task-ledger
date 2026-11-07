# 插件详情页配置区

## 一、展示内容

官方插件详情页按包名在 `plugins.bundle.config` 槽位取配置区，四项：

| 项 | 形态 | 落点 |
|---|---|---|
| 入口位置 | 核心库 `Picker` 下拉单选，两档：`一级菜单`（默认）/ `更多` | 设置字段 `entryMode` |
| 显示名称 | 核心库 `Input` 文本框 | 设置字段 `displayName` |
| 访问 GitHub | outline 链接按钮，打开本仓库地址 | 常量，不进设置 |
| 蓝鲸组件库 | outline 链接按钮，打开 `dsh-plugin-core` 仓库地址 | 常量，不进设置 |

版式：两个设置项一行左右各半（左显示名称、右入口位置）；保存与两个链接同一排、保存在最前；改过的字段出「自定义」标签（核心 `Chip`）与「恢复默认」链接钮，未改过两者都不出现；字段区顶部与保存行底部各一条实线。

不套官方 `SettingsForm` 外壳（它的保存按钮固定在自己的 footer 里），但 `dirty / invalid / saving / failed` 状态仍全部来自官方 `SettingsFormModel`；离开页面丢弃草稿由本组件卸载时自己接。控件一律走 `dsh-plugin-core/ui`（`Input` / `Picker` / `Chip` / `Button`），不在本文件自绘控件皮肤，只排标签、说明与两列容器。

## 二、行为口径

1. 两个字段都是 host 侧 `Config` 的 `volatile` 字段，由宿主持久化到 profile 的 patch 文档；插件不写盘、不碰 localStorage。
2. 入口默认 `一级菜单`，装上不会先被挪走；`更多` 是 `sidebar.panellist.actions` 里的一行 `MenuItemButton`，点开跳整页并收起菜单。
3. 显示名空串 = 用默认名（`panelTitle`：中文「蓝鲸任务台账」/ 英文 `Whale Ledger`，跟随宿主语言）。
4. 填成与默认名相同 = 不落盘：保存前折成「清空」，设置文档里不留这一项。
5. 显示名只改入口显示（侧栏条目 / 「更多」菜单那一行），不改插件详情页标题（那是 `locale/*.json` 的 `meta`，见 [plugin-listing.md](plugin-listing.md)）。
6. 只读部署下保存不可用，界面给出只读提示。

## 三、落点

| 文件 | 内容 |
|---|---|
| `packages/plugin/src/index.ts` | `Config`（两个 `volatile` 字段）与 `schemastery` 兜底 |
| `packages/plugin/src/client/config-panel.ts` | 配置区组件与四项版式 |
| `packages/plugin/src/client/ui.ts` | `.dtl-config__*` 排版类 |
| `packages/plugin/src/client/index.ts` | 建 `SettingsFormModel`、订阅设置文档、按 `entryMode` 挂入口、注册 `plugins.bundle.config` |
| `packages/plugin/src/client/locales.ts` | `config*` 一组中英文案 |
| `packages/plugin/package.json` | `dsh.client.inject` 补 `-ui-settings` / `-ui-plugin-manager` / `-ui-sidebar` |

## 四、约束与已知风险

- `@deepseek-ai/schemastery` 必须随包安装（已声明 `^3.18.5`）。插件从自己的 `node_modules` 往上找，找不到时 `Config` 退化成 `undefined`，宿主不派生设置命名空间，详情页显示「设置当前不可用」，且不会把插件标成异常。
- host entry 改动必须重启宿主：`Config` 只在 entry 加载时导出，浏览器刷新不够。
- `sidebar.panellist.actions` 按同栈样本的用法实现，本机未装该槽的类型包、未逐行核实；宿主升级若改槽名，表现为选「更多」后入口整个不见。
- `dsh.client.inject` 新增三个包：宿主缺其中某个时对应槽位不注册（配置区或「更多」入口缺失），看板不受影响。

## 更新日志

- 2026-11-07 23:03:04：按 koc-code-docwriter 槽位迁移，剔除过程稿并统一标题头
