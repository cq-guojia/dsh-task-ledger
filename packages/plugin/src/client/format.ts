/**
 * 客户端时间口径**单源**：补零 / 时刻串（本机时区）。
 * 解析失败按调用方给的兜底返回（不编造时间）。
 *
 * 2026-10-17 改版后首页不再做时间范围过滤（时间只作用于统计卡与趋势图，由 host 聚合）
 * ⇒ 原来的 `rangeToDates` / `withinRange` / `RangeKey` 一并删除；统计 tab 要做时间筛选时
 * 按当时口径在此重建，别处不许再写一份。
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
