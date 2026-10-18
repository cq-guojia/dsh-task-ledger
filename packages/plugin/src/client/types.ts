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

/** host 附加工资字段（阈值 / 天数在 host 算，前端只渲染）。 */
export interface TaskMeta {
  /** 认领后未动天数（doing / blocked；open 与解析不了为 null）。 */
  readonly ageDays: number | null
  /** 停滞 = doing|blocked 且 ageDays > 14 天（STALE_DAYS）。 */
  readonly stale: boolean
}

/** 在办行 = 任务 + host 附加字段。 */
export type BoardTask = TaskRow & TaskMeta

/** 一条已结案记录（`GET /history` 的 records[]）。 */
export interface HistoryRecord {
  /** 结案时间（首列）。 */
  readonly time?: string
  readonly created?: string | null
  readonly workpackage?: string
  readonly category?: string | null
  readonly tags?: string[] | null
  readonly owner?: string
  /** 发起人（creator）：任务创建者，与 owner 区分（owner 可被 claim 改走）。 */
  readonly creator?: string | null
  /** 「完成了什么」列。 */
  readonly summary?: string
  /** 过程文档路径列。 */
  readonly log?: string | null
  /** 行所在历史文件（相对工作区）。 */
  readonly src?: string
  readonly workspace?: Workspace
}

/** 一个自然周期内的两个计数（核心永远是「完成」，新增只作对照）。 */
export interface PeriodCounts {
  readonly done: number
  readonly created: number
  /** 周期起（YYYY-MM-DD，含）。 */
  readonly from: string
  /** 周期止（YYYY-MM-DD，含）。 */
  readonly to: string
}

/** 统计台四个自然周期。 */
export interface TrendPeriods {
  readonly thisWeek: PeriodCounts
  readonly lastWeek: PeriodCounts
  readonly thisMonth: PeriodCounts
  readonly lastMonth: PeriodCounts
}

/** 趋势图一桶（一周）：完成 + 新增 + 截止时未完成。 */
export interface WeeklyBucket {
  /** 该周周一（YYYY-MM-DD）。 */
  readonly week: string
  /** 该周截止日（YYYY-MM-DD）：x 轴标它，数据按截止日判。 */
  readonly end: string
  readonly done: number
  readonly created: number
  /** 该周截止时仍未完成（在办）的任务数。 */
  readonly remaining: number
}

/** 趋势图数据（按范围各一份，切换零请求）。 */
export interface ClosedSummary {
  readonly weekly: {
    readonly all: readonly WeeklyBucket[]
    readonly mine: readonly WeeklyBucket[]
  }
}

/** 首页统计卡的六个面。 */
export interface BoardStats {
  readonly myActive: number
  readonly myBlocked: number
  readonly open: number
  readonly doing: number
  readonly blocked: number
  readonly stale: number
  /** 停滞阈值（天）——界面文案用它，不硬编码。 */
  readonly staleDays: number
  readonly oldestOpenDays: number | null
  readonly longestBlockedDays: number | null
}

/** `GET /board` 响应。 */
export interface BoardPayload {
  readonly at: string
  readonly workspaces: readonly Workspace[]
  readonly tasks: readonly BoardTask[]
  readonly stats: BoardStats
  readonly closed: ClosedSummary
  readonly trend: TrendPeriods
  /** 工作区 id → 该工作区的当前 git 身份（`git config user.name`，取不到为 null）——「我的待办」判定源。 */
  readonly identities: Readonly<Record<string, string | null>>
  /** 降级信息：哪些工作区读挂了、为什么（单工作区坏不拖垮其余；空 = 全部正常）。 */
  readonly degraded?: readonly DegradedInfo[]
}

/** 一个读失败的工作区（host `degraded` 条目；UI 标红 + 人话原因）。 */
export interface DegradedInfo {
  readonly workspaceId: string
  readonly workspaceTitle: string
  readonly op: 'list' | 'history'
  readonly code: string
  readonly message: string
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
