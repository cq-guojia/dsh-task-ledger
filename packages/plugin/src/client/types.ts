/**
 * 客户端数据面：host 路由响应结构的**客户端投影**（与 host/host/types.ts 同形，各自声明——
 * UI 侧不许 import `src/host/`（2026-10-17 定稿：方法与页面严格分家），也不 import 官方包。
 */

/** 一个活跃台账工作区（宿主 id + title + 归一绝对路径）。 */
export interface Workspace {
  readonly id: string
  readonly title: string
  readonly path: string
}

/** 一条在办任务（`GET /board` 的 tasks[]）。 */
export interface TaskRow {
  readonly id: string
  readonly workspace: Workspace
  readonly title?: string
  readonly status?: string
  readonly creator?: string | null
  readonly owner?: string | null
  readonly created?: string | null
  readonly started?: string | null
  readonly finished?: string | null
  readonly category?: string | null
  readonly tags?: string[] | null
  /** 过程文档相对 `ledger/` 的路径。 */
  readonly worklog?: string | null
}

/** 一条已结案记录（`GET /history` 的 records[]）。 */
export interface HistoryRecord {
  /** 结案时间（首列）。 */
  readonly time?: string
  readonly created?: string | null
  readonly workpackage?: string
  readonly category?: string | null
  readonly tags?: string[] | null
  readonly owner?: string
  /** 「完成了什么」列。 */
  readonly summary?: string
  /** 过程文档路径列。 */
  readonly log?: string | null
  /** 行所在历史文件（相对工作区）。 */
  readonly src?: string
  readonly workspace?: Workspace
}

/** 首页两个完成类统计（封顶 1 万）。 */
export interface ClosedCounts {
  readonly weekDone: number
  readonly yearDone: number
  readonly yearCapped: boolean
}

/** `GET /board` 响应。 */
export interface BoardPayload {
  readonly at: string
  readonly workspaces: readonly Workspace[]
  readonly tasks: readonly TaskRow[]
  readonly stats: { readonly myActive: number; readonly open: number }
  readonly closed: ClosedCounts
  /** 工作区 id → 该工作区的当前 git 身份（`git config user.name`，取不到为 null）——「我的待办」判定源。 */
  readonly identities: Readonly<Record<string, string | null>>
}

/** `GET /filters` 响应：去重候选。 */
export interface FilterOptions {
  readonly owners: string[]
  readonly categories: string[]
  readonly tags: string[]
}

/** `GET /task` 响应。 */
export interface TaskDetail {
  readonly task: TaskRow
  /** 过程文档正文（文件缺失为 null）。 */
  readonly worklog: string | null
}
