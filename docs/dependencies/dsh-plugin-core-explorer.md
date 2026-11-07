# 核心 explorer：选目录 + 只读文件面（dsh-plugin-core）

| 项 | 值 |
|---|---|
| 用途 | 设置页「添加台账目录」的选目录弹窗与只读文件路由 |
| 适用版本 | `dsh-plugin-core@0.35.6`（本插件 `packages/plugin` 的依赖线；路径口径自 0.33.2 起） |
| 版本真源 | `node_modules/dsh-plugin-core` 解包产物 `dist/adv/explorer/*.d.ts`、`dist/host/index.d.ts`、`src/host/fs-route.ts` |
| 复核日期 | 2026-11-08 |

## 一、结论

**能选本机任意文件夹，且不限工作区**：核心 explorer 自带一条只读文件路由（`node:fs` 直读），配 `pickWorkspaceFile({ filter: { dirs: true } })` 就得到「只能选目录」的弹窗，返回**绝对路径**。它绕开了官方 `remote.workspaceFiles` 的「只能在各自工作区内列目录」限制，也不需要宿主提供系统弹窗。

路径口径：0.33.2 起源码与产物同构 —— 源码 `src/adv/explorer/`、产物 `dist/adv/explorer/`，`exports` 只给 `./adv/explorer`；旧的 `./explorer` / `dist/explorer/` 已删除，同时 `./session` → `./adv/session`、`./ui/host` → `./ui/host-toast`。

## 二、逐条事实与出处

| 事实 | 原文 / 证据 | 出处 |
|---|---|---|
| 选目录入口 | `pickWorkspaceFile(options): Promise<PickedPath \| null>`；取消（Esc / 点外部 / ✕）resolve `null` | `dist/adv/explorer/open.d.ts:136` |
| 过滤档 | `PickFilter { exts?: readonly string[]; dirs?: boolean }`；`dirs: true` = 只要文件夹 | `dist/adv/explorer/types.d.ts:170-173` |
| 回传形状 | `PickedPath { path: string（**绝对路径**）; isDir: boolean; workspaceRel?; workspace?（仅当落在某个工作区内） }` | `dist/adv/explorer/types.d.ts:161-168` |
| 「选当前目录」 | 进到某层后行上没有它自己 ⇒ 面包屑行尾给一枚「选当前目录」钮（`dirPickable` 且有 `onPick` 时才出） | `src/adv/explorer/FileBrowser.ts:702-705` |
| 行内可点选目录 | `dirPickable = picker && onPick && !extsOnly`；目录行点即 `onPick(toPicked(path, true))` | `dist/adv/explorer/FileBrowser.js:392,455` |
| 展开方位 | `placement?: PickPlacement`：`auto`（下方优先、不够翻上方、横向夹紧）+ 八档。语义 = **优先方位**：该侧够用就照它；该侧不够、对侧更宽敞 ⇒ 自动翻边（bottom↔top、left↔right，start/end 不变）；两侧都窄 ⇒ 守原侧再夹紧进视口 | `dist/adv/explorer/open.d.ts:105`；`dist/adv/explorer/picker-placement.js:1-22,66-80` |
| `bottom-start` ≈ 旧 `auto` | 下方有空间时两者算出的盒子完全一致 ⇒ 换这档看不出变化；要「面板挪到按钮左边」得用 `bottom-end` | `dist/adv/explorer/picker-placement.js:66-80` |
| 文件面接线（client） | `connectFs({ path })` → `createHttpFsFace(path)`；未接 ⇒ `getFsFace()` 为 undefined，picker / 预览都直接放弃并 warn | `dist/adv/explorer/fs-face.d.ts`；`open.js:94,268` |
| 文件路由（host） | `serveFsRoute(ctx, { path })`：`kind: 'prefix'`，`op = list \| read \| readBytes \| roots`，**只读**、绝对路径、单层最多 500 条（`FS_PAGE_LIMIT`）、list 8s 超时 | `dist/host/index.d.ts:66`；`src/host/fs-route.ts:205-237` |
| 不限工作区 | 路由用 `node:fs` 直读，路径只做「必须绝对」校验，不与任何工作区根比对 | `src/host/fs-route.ts:57-65,67-110` |
| 预览共用同一面 | `openFilePreview` 与 `pickWorkspaceFile` 用的是同一个 `FileBrowser` + 同一个 FS 面 | `src/adv/explorer/open.ts:7-9` |
| 内置文案 | 不传 `translate` 时用核心自带中英字典（`utils/i18n` 的 `setLocale`），默认中文；`setLocale(null)` 恢复跟随宿主 | `src/adv/explorer/FileBrowser.ts:145`；`src/utils/i18n.ts:548,1058,1568` |

## 三、对本插件的落地含义

1. `host/src/index.ts` 里 `serveFsRoute(ctx, { path: '/api/task-ledger/fs' })`；client `connectFs({ path: 'api/task-ledger/fs' })`（同一个值，`host/routes.ts:FS_ROUTE` 与 `client/api.ts:FS_PATH`）。
2. 设置页「添加目录」直接 `pickWorkspaceFile({ filter: { dirs: true } })`，不自己画目录树、不调官方 `remote.directoryPicker`。
3. 只读路由没有鉴权（与核心同一口径：宿主 HTTP 面本来就能读工作区外绝对路径）—— 若把宿主暴露到非回环地址，这条路由的暴露面要一并评估。

## 四、复核方式（升级 dsh-plugin-core 后）

```bash
cd packages/plugin && pnpm why dsh-plugin-core
grep -n "pickWorkspaceFile\|PickFilter\|PickedPath" node_modules/dsh-plugin-core/dist/adv/explorer/*.d.ts
grep -n "serveFsRoute\|connectFs" node_modules/dsh-plugin-core/dist/host/index.d.ts node_modules/dsh-plugin-core/dist/adv/explorer/*.d.ts
node -e "console.log(require('dsh-plugin-core/package.json').exports)"   # 子路径是否还在
# 看三处：pickWorkspaceFile 是否仍在 / filter.dirs 语义是否变 / FS 路由是否仍只读
```

本项目全部用法是**包入口**（`dsh-plugin-core/adv/explorer|adv/session|ui|design|host`），没有 deep import ⇒ `exports` 里这些子路径还在、入口符号还在就不用改代码。

## 更新日志

- 2026-11-07 23:03:03：按 koc-code-docwriter 槽位迁移，剔除过程稿并统一标题头
- 2026-11-08 01:29:51：复核到 0.35.6，重验 explorer 与 FS 路由符号
