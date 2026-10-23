# 代码规范：client 半分层与「单源」清单

> **状态**：🔵 落码（2026-10-17 首页落码时建立；只记**不写就会做错**的约定，不写通用编码常识）
> **来源**：用户 2026-10-17「该抽象出来的东西一定要抽象出来：样式与方法一律抽象，不要反复重写」
> **配套**：样式规矩见 [`ui-style.md`](ui-style.md)；外部接口事实见 [`external/`](external/)

## 一、目录分层（`packages/plugin/src/`）

```
host/     # Node 侧：读台账 / 聚合 / 路由（不得 import client/）
client/   # 浏览器侧：只经 HTTP 取数（不得 import host/，不得直接摸文件系统）
skill/    # 构建时从 packages/skill/ 纳入的内嵌副本（唯一真源在 packages/skill/）
```

`client/` 内部再分：

| 文件 | 只装什么 |
|---|---|
| `index.ts` | 装配：locale 注册 + 槽位注册（`main` / `shell.overlay`）。**不写业务逻辑** |
| `tokens.ts` | `--dtl-*` 定义（**唯一**落点） |
| `ui.ts` | 样式基础层注入 + 共用元件（卡 / chip / 下拉 / 搜索框 / 空态） |
| `locales.ts` | 文案字典（**唯一**落点） |
| `api.ts` | client → host 的全部 HTTP（**唯一**取数出口） |
| `store.ts` | 看板状态仓（订阅 / 刷新 / 筛选条件） |
| `rows.ts` | 列表行的筛选与排序（**纯函数**，可直测） |
| `format.ts` | 时间口径（**唯一**：补零 / 时刻串 / 时间范围 → since-until） |
| `types.ts` | host 路由响应的客户端投影 |
| `board-home.ts` / `task-row.ts` / `overlay-entry.ts` | 页面与入口的视图 |

规矩：**同一样东西只有一份实现**。要改样式先想「是不是该进 `ui.ts` / `tokens.ts`」；要改取数先想「是不是该进 `api.ts`」。

## 二、模块导入的两条铁律

1. `client/` **不 import `host/`**（方法与页面严格分家），也不 import 官方包（rc 接口会无声变 ⇒ 只本地结构化声明）。
2. `client/` 内部相对导入**一律带 `.ts` 扩展名**：`tsconfig.client.json` 开了 `allowImportingTsExtensions`，tsdown 单文件打包认得，Node 原生剥类型也认得 —— 冒烟才能直测纯逻辑模块（不带扩展名 Node 的 ESM 解析器找不到）。

## 三、取数与刷新

- 所有请求走 `api.ts` 的 `fetchJson`（带超时且 abort 带 `reason`：不带 reason 时浏览器把错误写成「signal is aborted without reason」，看不出是超时）。
- **不轮询**：后端纯按需，刷新 = 挂载首读 + 手动刷新按钮（`store.refresh()` 是唯一入口，浮标与整页共用同一份快照）。
- 失败**不造兜底假值**（数据真实红线）：返回什么渲染什么，失败就显示错误态 + 重试。

## 四、产物与验证

- `dist/` 入仓；`npm run build` = host(`tsc`) + client(`tsc --noEmit` + `tsdown`)。
- 浏览器产物是 dsh 模块内核消费的 **CJS 闭包工厂**（`window.__ModuleLoader__.load({id, factory})`），平台模块（`react`、`@deepseek-ai/dsh-client-ui-*`）必须保留成 `require()` —— 其余全部内联（模块表回答不了的 `require()` 运行时必抛）。冒烟守这条契约。
- `npm run smoke` 打 `dist/` 产物；纯逻辑 / 字典这类**无 DOM 依赖**的模块允许剥类型直读源码直测。
