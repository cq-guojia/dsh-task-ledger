import { spawn } from 'node:child_process'
import { readHistory, readTasks } from './ledger-read.js'
import type { HistoryRecord, LedgerFilter, LedgerWorkspace, TaskRow } from './types.js'

/** 历史窗口：只读最近 13 个月的文件（2026-10-17 拍板；脚本默认读全部，窗口由插件显式传）。 */
const RECENT_MONTHS = 13

/** 已结案列表默认分页大小（「加载更多」= 调用方加大 limit 重取）。 */
const DEFAULT_HISTORY_LIMIT = 500

/** 停滞判定阈值：doing / blocked 且 created 至今超过这么多天（2026-10-17 拍板，显示级）。 */
export const STALE_DAYS = 14

/** 趋势图桶数：近 8 周（2026-10-17 定稿，与 dsh-context「近 7 天」同思路，按周更耐看）。 */
export const WEEKLY_WEEKS = 8

/** 完成类统计（**按结案时间**落桶；旧实现走 `--since` 按创建时间过滤，数的是「本周创建且已结案」，口径错）。 */
export interface ClosedSummary {
  /** 本周（周一至今）完成数。 */
  readonly weekDone: number
  /** 近 8 周分周完成数，旧 → 新；`week` = 该周周一（YYYY-MM-DD）。 */
  readonly weekly: readonly WeeklyBucket[]
}

export interface WeeklyBucket {
  readonly week: string
  readonly count: number
}

/** 首页统计卡的六个面（阈值 / 天数全在 host 算，前端只渲染——单一真源）。 */
export interface BoardStats {
  /** 我的 doing + blocked。 */
  readonly myActive: number
  /** 我的 blocked。 */
  readonly myBlocked: number
  /** 待认领（open）。 */
  readonly open: number
  /** 全部 doing。 */
  readonly doing: number
  /** 全部 blocked。 */
  readonly blocked: number
  /** 停滞 = doing|blocked 且 ageDays > STALE_DAYS。 */
  readonly stale: number
  /** 停滞阈值（天）——随响应下发，界面文案不硬编码（单一真源）。 */
  readonly staleDays: number
  /** 最老一条待认领躺了多少天（没有待认领 = null）。 */
  readonly oldestOpenDays: number | null
  /** 卡住最久的 blocked 多少天（没有 blocked = null）。 */
  readonly longestBlockedDays: number | null
}

/** 列表行附加工资字段（host 算，前端不判阈值）。 */
export interface BoardTask extends TaskRow {
  /** 认领后未动天数（doing / blocked；open 与解析不了的时间为 null）。 */
  readonly ageDays: number | null
  /** 停滞标记。 */
  readonly stale: boolean
}

export interface BoardSnapshot {
  readonly at: string
  readonly workspaces: readonly LedgerWorkspace[]
  /** 全部在办任务（UI 自己筛「我的 / 待认领」——筛选是前端的事）。 */
  readonly tasks: readonly BoardTask[]
  readonly stats: BoardStats
  /**
   * 工作区 id → 该工作区的当前 git 身份（取不到为 null）。
   * 「我的待办」在前端按 `owner === identities[workspace.id]` 筛——身份只在 host 侧取得到
   * （cwd = 该工作区跑 `git config user.name`），UI 不摸 git。
   */
  readonly identities: Readonly<Record<string, string | null>>
}

/** 周一所在日期（YYYY-MM-DD）。skill 的 --since 只给日期按当天 00:00 解析。 */
function mondayDateString(now: Date): string {
  const date = new Date(now)
  const mondayOffset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - mondayOffset)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 「YYYY-MM-DD HH:mm:ss」→ 距今天数（解析不了 / 未来都按 0；不编造）。 */
function daysSince(stamp: string | null | undefined, now: Date): number | null {
  if (stamp === null || stamp === undefined || stamp === '') return null
  const parsed = new Date(stamp.replace(' ', 'T'))
  if (Number.isNaN(parsed.getTime())) return null
  const days = Math.floor((now.getTime() - parsed.getTime()) / 86_400_000)
  return days > 0 ? days : 0
}

/**
 * 当前 git 身份（cwd = 该工作区）——「我的待办」判定源。
 * 与 agent 在会话里跑 skill 时的取值环境一致；取不到回 null（非 git 目录 / 没配身份），
 * 该工作区的「我的」统计按 0 计（不谎报）。
 */
export function getCurrentIdentity(workspace: LedgerWorkspace): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn('git', ['config', 'user.name'], { cwd: workspace.path, stdio: ['ignore', 'pipe', 'ignore'] })
    let stdout = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.on('error', () => { resolve(null) })
    child.on('close', (code) => {
      const name = stdout.trim()
      resolve(code === 0 && name !== '' ? name : null)
    })
  })
}

/**
 * 首页快照（在办路径）：并发跑全部工作区的 list + 身份解析。
 * 与历史量彻底无关——progress.json 只装没结案的任务（close 会移走），永远有界。
 */
export async function getBoardSnapshot(workspaces: readonly LedgerWorkspace[]): Promise<BoardSnapshot> {
  const now = new Date()
  const perWorkspace = await Promise.all(workspaces.map(async (workspace) => ({
    workspace,
    tasks: await readTasks(workspace),
    identity: await getCurrentIdentity(workspace),
  })))
  const withMeta = perWorkspace.flatMap((entry) => entry.tasks.map((task): BoardTask => {
    const working = task.status === 'doing' || task.status === 'blocked'
    const ageDays = working ? daysSince(task.started ?? task.created, now) : null
    return { ...task, ageDays, stale: ageDays !== null && ageDays > STALE_DAYS }
  }))
  const myActive = perWorkspace.reduce((sum, entry) => sum + entry.tasks.filter(
    (task) => task.owner === entry.identity && (task.status === 'doing' || task.status === 'blocked'),
  ).length, 0)
  const myBlocked = perWorkspace.reduce((sum, entry) => sum + entry.tasks.filter(
    (task) => task.owner === entry.identity && task.status === 'blocked',
  ).length, 0)
  const openTasks = withMeta.filter((task) => task.status === 'open')
  const blockedTasks = withMeta.filter((task) => task.status === 'blocked')
  const oldestOpenDays = openTasks.length === 0
    ? null
    : openTasks.reduce((max, task) => Math.max(max, daysSince(task.created, now) ?? 0), 0)
  const longestBlockedDays = blockedTasks.length === 0
    ? null
    : blockedTasks.reduce((max, task) => Math.max(max, task.ageDays ?? 0), 0)
  const identities: Record<string, string | null> = {}
  for (const entry of perWorkspace) identities[entry.workspace.id] = entry.identity
  return {
    at: now.toISOString(),
    workspaces,
    tasks: withMeta,
    stats: {
      myActive,
      myBlocked,
      open: openTasks.length,
      doing: withMeta.filter((task) => task.status === 'doing').length,
      blocked: blockedTasks.length,
      stale: withMeta.filter((task) => task.stale).length,
      staleDays: STALE_DAYS,
      oldestOpenDays,
      longestBlockedDays,
    },
    identities,
  }
}

/** 取一条记录的结案日期部分（history 首列 `time`；旧行 / 缺列返回 null）。 */
function closedDateOf(record: HistoryRecord): string | null {
  const value = record.time
  if (value === undefined || value === null || value === '') return null
  return String(value).slice(0, 10)
}

/**
 * 完成类统计 + 近 8 周趋势：读一次 13 个月窗口的 history，按**结案时间**落周桶。
 * 任一工作区失败即抛（聚合数部分失败 = 错数，不兜）。
 */
export async function getClosedSummary(workspaces: readonly LedgerWorkspace[]): Promise<ClosedSummary> {
  const now = new Date()
  const thisMonday = mondayDateString(now)
  const weeks: string[] = []
  for (let offset = WEEKLY_WEEKS - 1; offset >= 0; offset -= 1) {
    weeks.push(mondayDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset * 7)))
  }
  const perWorkspace = await Promise.all(workspaces.map((workspace) => readHistory(workspace, { months: RECENT_MONTHS })))
  const counts = new Map<string, number>(weeks.map((week) => [week, 0]))
  for (const record of perWorkspace.flat()) {
    const date = closedDateOf(record)
    if (date === null) continue
    const monday = mondayDateString(new Date(`${date}T00:00:00`))
    const bucket = counts.get(monday)
    if (bucket !== undefined) counts.set(monday, bucket + 1)
  }
  return {
    weekDone: counts.get(thisMonday) ?? 0,
    weekly: weeks.map((week) => ({ week, count: counts.get(week) ?? 0 })),
  }
}

/**
 * 已结案列表：默认近 13 个月 + limit 500，跨工作区合并后按创建时间倒序。
 * shortcut: 分页用「加大 limit 重取」的笨办法（skill 脚本无 offset）；
 * 单工作区内 limit 已生效，合并边界的全局精确排序暂不保证（500 条一页无感）。
 * 要全量老数据：调用方显式传 months: undefined（不拼 --months，脚本读全部，按秒计）。
 */
export async function queryClosed(workspaces: readonly LedgerWorkspace[], filter: LedgerFilter = {}): Promise<HistoryRecord[]> {
  const windowed: LedgerFilter = { months: RECENT_MONTHS, ...filter }
  const perWorkspace = await Promise.all(workspaces.map((workspace) => readHistory(workspace, windowed)))
  return perWorkspace.flat()
    .sort((a, b) => String(b.created ?? b.time ?? '').localeCompare(String(a.created ?? a.time ?? '')))
    .slice(0, filter.limit ?? DEFAULT_HISTORY_LIMIT)
}

export interface FilterOptions {
  readonly owners: string[]
  readonly categories: string[]
  readonly tags: string[]
}

/**
 * 筛选项候选：在办（全量）+ 近 13 个月历史的去重值（owner / category / tag）。
 * 按需调用（/filters 路由），非首屏——历史侧在极端量级下是百毫秒级。
 */
export async function getFilterOptions(workspaces: readonly LedgerWorkspace[]): Promise<FilterOptions> {
  const perWorkspace = await Promise.all(workspaces.map(async (workspace) => ({
    tasks: await readTasks(workspace),
    history: await readHistory(workspace, { months: RECENT_MONTHS }),
  })))
  const owners = new Set<string>()
  const categories = new Set<string>()
  const tags = new Set<string>()
  const addTask = (task: TaskRow): void => {
    if (task.owner !== undefined && task.owner !== null && task.owner !== '') owners.add(task.owner)
    if (task.creator !== undefined && task.creator !== null && task.creator !== '') owners.add(task.creator)
    if (task.category !== undefined && task.category !== null && task.category !== '') categories.add(task.category)
    for (const tag of task.tags ?? []) tags.add(tag)
  }
  const addRecord = (record: HistoryRecord): void => {
    if (record.owner !== undefined && record.owner !== '') owners.add(record.owner)
    if (record.category !== undefined && record.category !== null && record.category !== '') categories.add(record.category)
    for (const tag of record.tags ?? []) tags.add(tag)
  }
  for (const entry of perWorkspace) {
    for (const task of entry.tasks) addTask(task)
    for (const record of entry.history) addRecord(record)
  }
  const sorted = (values: Set<string>): string[] => [...values].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  return { owners: sorted(owners), categories: sorted(categories), tags: sorted(tags) }
}
