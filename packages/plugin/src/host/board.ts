import { spawn } from 'node:child_process'
import { readHistory, readTasks } from './ledger-read.js'
import type { HistoryRecord, LedgerFilter, LedgerWorkspace, TaskRow } from './types.js'

/** 历史窗口：只读最近 13 个月的文件（2026-10-17 拍板；脚本默认读全部，窗口由插件显式传）。 */
const RECENT_MONTHS = 13

/** 已结案列表默认分页大小（「加载更多」= 调用方加大 limit 重取）。 */
const DEFAULT_HISTORY_LIMIT = 500

/** 停滞判定阈值：doing / blocked 且 created 至今超过这么多天（2026-10-17 拍板，显示级）。 */
export const STALE_DAYS = 14

/** 趋势图桶数：近 8 周（2026-10-17 定稿）。 */
export const WEEKLY_WEEKS = 8

/** 一个自然周期内的两个计数（核心永远是「完成」，新增只作对照）。 */
export interface PeriodCounts {
  readonly done: number
  readonly created: number
  /** 周期起（YYYY-MM-DD，含）。 */
  readonly from: string
  /** 周期止（YYYY-MM-DD，含）。 */
  readonly to: string
}

/** 统计台四个自然周期（用户 2026-10-17 定稿：本周 / 上周 / 本月 / 上月，不用 7/30 天）。 */
export interface TrendPeriods {
  readonly thisWeek: PeriodCounts
  readonly lastWeek: PeriodCounts
  readonly thisMonth: PeriodCounts
  readonly lastMonth: PeriodCounts
}

/** 趋势图一桶（一周）：完成 + 新增 + 截止时仍未完成。 */
export interface WeeklyBucket {
  /** 该周周一（YYYY-MM-DD）。 */
  readonly week: string
  /** 该周截止日（YYYY-MM-DD）：历史周=当周周日，当前周=今天——图表 x 轴标它，因为数据是按截止日判的。 */
  readonly end: string
  readonly done: number
  readonly created: number
  /** 该周截止时仍未完成（在办）的任务数：cumulative(创建 - 完成) 到该周末，含窗口前遗留。 */
  readonly remaining: number
}

/** 趋势图数据按范围各一份（切换零请求）。 */
export interface ClosedSummary {
  readonly weekly: {
    readonly all: readonly WeeklyBucket[]
    readonly mine: readonly WeeklyBucket[]
  }
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

/** 首页一次 `/board` 的全部聚合（**每个工作区只读一次** list + history + git 身份）。 */
export interface HomeAggregate {
  readonly snapshot: BoardSnapshot
  readonly closed: ClosedSummary
  readonly trend: TrendPeriods
}

/* ── 日期工具（本机时区；skill 脚本同口径：周一为一周之始）───────────────── */

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Date → `YYYY-MM-DD`。 */
function ymd(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 时刻串（`YYYY-MM-DD HH:mm:ss` / `YYYY-MM-DD`）→ 日期部分；解析不了回 null。 */
function dayOf(stamp: string | null | undefined): string | null {
  if (stamp === null || stamp === undefined || stamp === '') return null
  const day = String(stamp).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

/** 某日期所在周的周一（00:00）。 */
function mondayOf(day: string): Date {
  const date = new Date(`${day}T00:00:00`)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return date
}

/** 第 offset 周的起止（offset 0 = 本周，-1 = 上周；返回日期串，含边界）。
 *  ⚠️ 本周只到今天（周还没结束），上周才是完整周一~周日——否则「本周」会把明天之后的
 *  日子也画进区间，tooltip 里的截止日撒谎。 */
function weekWindow(offset: number, now: Date): { from: string; to: string } {
  const monday = mondayOf(ymd(now))
  monday.setDate(monday.getDate() + offset * 7)
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  const last = offset === 0 ? now : sunday
  return { from: ymd(monday), to: ymd(last < sunday ? last : sunday) }
}

/** 第 offset 月的起止（offset 0 = 本月，-1 = 上月；含边界）。
 *  同 {@link weekWindow}：本月只到今天，上月才是完整自然月。 */
function monthWindow(offset: number, now: Date): { from: string; to: string } {
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  const end = offset === 0 ? now : last
  return { from: ymd(first), to: ymd(end < last ? end : last) }
}

/** 日期是否落在 [from, to]（含边界，字符串比较即可——ISO 字典序即时间序）。 */
function inWindow(day: string | null, window: { from: string; to: string }): boolean {
  return day !== null && day >= window.from && day <= window.to
}

/** 「YYYY-MM-DD HH:mm:ss」→ 距今天数（解析不了 / 未来都按 0；不编造）。 */
function daysSince(stamp: string | null | undefined, now: Date): number | null {
  if (stamp === null || stamp === undefined || stamp === '') return null
  const parsed = new Date(String(stamp).replace(' ', 'T'))
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

/** 一个工作区读全（list + history + git 身份）——首页所有数字的共同原料。 */
async function readWorkspace(workspace: LedgerWorkspace): Promise<{
  workspace: LedgerWorkspace
  tasks: readonly TaskRow[]
  history: readonly HistoryRecord[]
  identity: string | null
}> {
  const [tasks, history, identity] = await Promise.all([
    readTasks(workspace),
    readHistory(workspace, { months: RECENT_MONTHS }),
    getCurrentIdentity(workspace),
  ])
  return { workspace, tasks, history, identity }
}

/** 计数一批记录 / 任务（按范围过滤 owner；`mine` 时 identity 为 null 的一律不计）。 */
function countPeriod(entries: readonly { day: string | null; owner: string | null }[], window: { from: string; to: string }): number {
  return entries.filter((entry) => inWindow(entry.day, window)).length
}

/**
 * 首页一次拿全：在办快照（含停滞 / 天数 / 身份）+ 近 8 周趋势（完成 / 新增 × 所有 / 我的）
 * + 四个自然周期计数。**每个工作区只读一次**（list + history + git 身份），
 * 避免「快照读一遍、统计再读一遍」把 5 万行级工作区的 history 解析翻倍。
 */
export async function getHomeAggregate(workspaces: readonly LedgerWorkspace[]): Promise<HomeAggregate> {
  const now = new Date()
  const perWorkspace = await Promise.all(workspaces.map(readWorkspace))

  // ── 快照（在办路径，与历史量无关）────────────────────────────────────
  const withMeta = perWorkspace.flatMap((entry) => entry.tasks.map((task): BoardTask => {
    const working = task.status === 'doing' || task.status === 'blocked'
    const ageDays = working ? daysSince(task.started ?? task.created, now) : null
    return { ...task, ageDays, stale: ageDays !== null && ageDays > STALE_DAYS }
  }))
  const openTasks = withMeta.filter((task) => task.status === 'open')
  const blockedTasks = withMeta.filter((task) => task.status === 'blocked')
  const myActive = perWorkspace.reduce((sum, entry) => sum + entry.tasks.filter(
    (task) => task.owner === entry.identity && (task.status === 'doing' || task.status === 'blocked'),
  ).length, 0)
  const myBlocked = perWorkspace.reduce((sum, entry) => sum + entry.tasks.filter(
    (task) => task.owner === entry.identity && task.status === 'blocked',
  ).length, 0)
  const identities: Record<string, string | null> = {}
  for (const entry of perWorkspace) identities[entry.workspace.id] = entry.identity
  const snapshot: BoardSnapshot = {
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
      oldestOpenDays: openTasks.length === 0
        ? null
        : openTasks.reduce((max, task) => Math.max(max, daysSince(task.created, now) ?? 0), 0),
    },
    identities,
  }

  // ── 趋势：近 8 周（完成按结案时间、新增按创建时间）× 所有 / 我的 ────────
  // 新增必须**合并两个来源**：已结案的任务被 close 移出 progress.json，只在 history 里；
  // 在办的只在 progress.json 里。两者不相交（close 是移动），合并即全集、不会重复计。
  const weeks: string[] = []
  for (let offset = WEEKLY_WEEKS - 1; offset >= 0; offset -= 1) weeks.push(weekWindow(-offset, now).from)
  // 每周截止日：历史周 = 当周周日；当前周（最后一项）只到今天（周没结束，否则截止日撒谎）
  const weekEnds = weeks.map((week, i) => {
    const monday = new Date(`${week}T00:00:00`)
    const sunday = new Date(monday)
    sunday.setDate(sunday.getDate() + 6)
    return i === weeks.length - 1 ? ymd(now) : ymd(sunday)
  })
  const bucketsAll = new Map<string, { done: number; created: number; remaining: number }>(weeks.map((week) => [week, { done: 0, created: 0, remaining: 0 }]))
  const bucketsMine = new Map<string, { done: number; created: number; remaining: number }>(weeks.map((week) => [week, { done: 0, created: 0, remaining: 0 }]))
  const bump = (map: Map<string, { done: number; created: number; remaining: number }>, week: string, field: 'done' | 'created'): void => {
    const bucket = map.get(week)
    if (bucket !== undefined) map.set(week, { ...bucket, [field]: bucket[field] + 1 })
  }
  // remaining：某任务在「第 i 周截止时」仍未完成 ⇔ 创建 ≤ weekEnd_i 且（未结案 或 结案 > weekEnd_i）。
  // 窗口前创建、至今仍在办的任务会自然计入每一周 ⇒ 无需单独基线，口径自洽。
  const bumpRemaining = (map: Map<string, { done: number; created: number; remaining: number }>, createdDay: string | null, closeDay: string | null): void => {
    if (createdDay === null) return
    for (let i = 0; i < weeks.length; i++) {
      if (createdDay <= weekEnds[i] && (closeDay === null || closeDay > weekEnds[i])) {
        const bucket = map.get(weeks[i])
        if (bucket !== undefined) bucket.remaining += 1
      }
    }
  }
  for (const entry of perWorkspace) {
    for (const task of entry.tasks) {
      const created = dayOf(task.created)
      if (created === null) continue
      const week = ymd(mondayOf(created))
      const isMine = entry.identity !== null && task.owner === entry.identity
      bump(bucketsAll, week, 'created')
      if (isMine) bump(bucketsMine, week, 'created')
      bumpRemaining(bucketsAll, created, null)
      if (isMine) bumpRemaining(bucketsMine, created, null)
    }
    for (const record of entry.history) {
      const closed = dayOf(record.time)
      if (closed !== null) {
        const week = ymd(mondayOf(closed))
        bump(bucketsAll, week, 'done')
        if (entry.identity !== null && record.owner === entry.identity) bump(bucketsMine, week, 'done')
      }
      const created = dayOf(record.created)
      if (created !== null) {
        const week = ymd(mondayOf(created))
        bump(bucketsAll, week, 'created')
        if (entry.identity !== null && record.owner === entry.identity) bump(bucketsMine, week, 'created')
      }
      const isMine = entry.identity !== null && record.owner === entry.identity
      bumpRemaining(bucketsAll, created, closed)
      if (isMine) bumpRemaining(bucketsMine, created, closed)
    }
  }
  const closed: ClosedSummary = {
    weekly: {
      all: weeks.map((week, i) => ({ week, end: weekEnds[i], ...bucketsAll.get(week) ?? { done: 0, created: 0, remaining: 0 } })),
      mine: weeks.map((week, i) => ({ week, end: weekEnds[i], ...bucketsMine.get(week) ?? { done: 0, created: 0, remaining: 0 } })),
    },
  }

  // ── 统计台：四个自然周期（只算「全部工作区」范围；图表切换不带动卡片）────
  const windows = {
    thisWeek: weekWindow(0, now),
    lastWeek: weekWindow(-1, now),
    thisMonth: monthWindow(0, now),
    lastMonth: monthWindow(-1, now),
  }
  const doneEntries = perWorkspace.flatMap((entry) => entry.history.map((record) => ({ day: dayOf(record.time), owner: record.owner ?? null })))
  const createdEntries = perWorkspace.flatMap((entry) => [
    ...entry.tasks.map((task) => ({ day: dayOf(task.created), owner: task.owner ?? null })),
    ...entry.history.map((record) => ({ day: dayOf(record.created), owner: record.owner ?? null })),
  ])
  const period = (window: { from: string; to: string }): PeriodCounts => ({
    done: countPeriod(doneEntries, window),
    created: countPeriod(createdEntries, window),
    from: window.from,
    to: window.to,
  })
  const trend: TrendPeriods = {
    thisWeek: period(windows.thisWeek),
    lastWeek: period(windows.lastWeek),
    thisMonth: period(windows.thisMonth),
    lastMonth: period(windows.lastMonth),
  }
  return { snapshot, closed, trend }
}

/** 只拿在办快照（薄封装：测试 / 其它调用方用；首页走 {@link getHomeAggregate} 一次读全）。 */
export async function getBoardSnapshot(workspaces: readonly LedgerWorkspace[]): Promise<BoardSnapshot> {
  return (await getHomeAggregate(workspaces)).snapshot
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
