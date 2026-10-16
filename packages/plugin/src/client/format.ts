/**
 * 客户端时间口径**单源**：补零 / 时刻串 / 时间范围 → `--since` / `--until`。
 * 走**本机时区**；解析失败按调用方给的兜底返回（不编造时间）。
 *
 * ⚠️ 与 skill 脚本的边界一致：`--since` 取当天 00:00、`--until` 只给日期时含当天整天
 * （脚本 `normalize_time` 的 `date_only_ref="23:59:59"`），故这里只拼 `YYYY-MM-DD`。
 */
export function pad2(value: number | string): string {
  return String(value).padStart(2, '0')
}

/** ISO → `YYYY-MM-DD HH:mm`（`seconds: true` 时补 `:ss`）；解析失败返回 `fallback`（缺省原串）。 */
export function formatDateTime(iso: string, opts?: { seconds?: boolean; fallback?: string }): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return opts?.fallback ?? iso
  const d = new Date(ms)
  const base = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  return opts?.seconds === true ? `${base}:${pad2(d.getSeconds())}` : base
}

/** ISO → `YYYY-MM-DD`。 */
export function formatYmd(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return iso
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 时间范围档 → 脚本参数（只给日期；`all` = 不过滤）。 */
export type RangeKey = 'all' | 'week' | 'month' | 'year'

/** 周一 00:00 所在日期（与 host `board.ts` 的 `mondayDateString` 同口径：周一为一周之始）。 */
function mondayOf(now: Date): Date {
  const date = new Date(now)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return date
}

/**
 * 时间范围 → `{ since, until }`（`YYYY-MM-DD`，含边界）。`all` 返回空对象 = 不拼参数。
 * 近一年 = 今天往前推 365 天（与统计卡「近 13 个月文件」不同口径：那是文件窗口，这是创建时间过滤）。
 */
export function rangeToDates(range: RangeKey, now: Date = new Date()): { since?: string; until?: string } {
  const ymd = (date: Date): string => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
  if (range === 'week') return { since: ymd(mondayOf(now)), until: ymd(now) }
  if (range === 'month') return { since: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), until: ymd(now) }
  if (range === 'year') {
    const start = new Date(now)
    start.setDate(start.getDate() - 365)
    return { since: ymd(start), until: ymd(now) }
  }
  return {}
}

/** 任务行是否落在时间范围内（在办侧在浏览器里筛；无创建时间的行按「不带时间过滤」处理）。 */
export function withinRange(created: string | null | undefined, since: string | undefined, until: string | undefined): boolean {
  if (since === undefined && until === undefined) return true
  if (created === null || created === undefined || created === '') return false
  const day = created.slice(0, 10)
  if (since !== undefined && day < since) return false
  if (until !== undefined && day > until) return false
  return true
}
