/**
 * 看板数据仓（client 侧**唯一**取数入口）：浮标角标与整页共用同一份快照，
 * 谁先挂载谁触发首读；刷新按钮走同一个 `refresh()`，**不轮询**（2026-10-17 拍板：
 * 后端纯按需，刷新时机归前端 = 打开面板首读 + 手动刷新）。
 *
 * 消费方式：`useSyncExternalStore(boardSubscribe, boardSnapshot)`。
 * ⚠️ `getSnapshot` 必须返回**稳定引用**（每次新建对象会被判定为「一直在变」⇒ 无限重渲染），
 * 故只在真变了时才换 `state` 对象。
 */
import { fetchBoard, fetchFilters, fetchHistory } from './api'
import { rangeToDates, type RangeKey } from './format'
import type { BoardPayload, FilterOptions, HistoryRecord } from './types'

/** 状态档（历史查询 = 「已结案」档，不单开 tab）。 */
export type Bucket = 'all' | 'mine' | 'open' | 'closed'
/** 已结案列表分页大小（「加载更多」= 加大 limit 重取）。 */
export const HISTORY_PAGE = 500

export interface Query {
  bucket: Bucket
  range: RangeKey
  tag: string
  keyword: string
  limit: number
}

export interface BoardState {
  status: 'loading' | 'ready' | 'error'
  board: BoardPayload | null
  error: string | null
  history: readonly HistoryRecord[]
  historyStatus: 'idle' | 'loading' | 'ready' | 'error'
  historyError: string | null
  filters: FilterOptions | null
  query: Query
  /** 手动刷新在途（按钮转圈 / 禁用）。 */
  refreshing: boolean
}

const INITIAL_QUERY: Query = { bucket: 'all', range: 'all', tag: '', keyword: '', limit: HISTORY_PAGE }

let state: BoardState = {
  status: 'loading',
  board: null,
  error: null,
  history: [],
  historyStatus: 'idle',
  historyError: null,
  filters: null,
  query: INITIAL_QUERY,
  refreshing: false,
}

const listeners = new Set<() => void>()
/** 首读只触发一次（谁先订阅谁触发），之后一律靠 `refresh()` / `setQuery()`。 */
let booted = false
/** 在途轮次：迟到的响应按 token 丢弃，避免旧结果盖新结果。 */
let runToken = 0

function emit(): void {
  for (const listener of [...listeners]) listener()
}

function set(patch: Partial<BoardState>): void {
  state = { ...state, ...patch }
  emit()
}

export function boardSnapshot(): BoardState {
  return state
}

export function boardSubscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!booted) {
    booted = true
    void refresh()
  }
  return () => { listeners.delete(listener) }
}

/** 重读：在办快照 + 筛选项 +（已结案档时）历史列表。 */
export async function refresh(): Promise<void> {
  const token = ++runToken
  set({ refreshing: true })
  try {
    const board = await fetchBoard()
    if (token !== runToken) return
    set({ status: 'ready', board, error: null })
    // 筛选项非首屏必需：失败不影响首页（下拉显示「全部标签」即可），故不进 error 态。
    void loadFilters(token)
    if (state.query.bucket === 'closed') await loadHistory(token)
  } catch (error) {
    if (token !== runToken) return
    set({ status: 'error', error: error instanceof Error ? error.message : String(error) })
  } finally {
    if (token === runToken) set({ refreshing: false })
  }
}

async function loadFilters(token: number): Promise<void> {
  try {
    const filters = await fetchFilters()
    if (token === runToken) set({ filters })
  } catch { /* 候选拿不到就保持 null：下拉只有「全部标签」，不谎报选项 */ }
}

async function loadHistory(token: number): Promise<void> {
  const { range, tag, limit } = state.query
  const dates = rangeToDates(range)
  set({ historyStatus: 'loading', historyError: null })
  try {
    const records = await fetchHistory({ ...dates, tag, limit })
    if (token !== runToken) return
    set({ history: records, historyStatus: 'ready' })
  } catch (error) {
    if (token !== runToken) return
    set({ historyStatus: 'error', historyError: error instanceof Error ? error.message : String(error) })
  }
}

/** 改筛选：已结案档要重取历史（服务端过滤）；在办档只在浏览器里重筛（数据已全）。 */
export function setQuery(patch: Partial<Query>): void {
  const query: Query = { ...state.query, ...patch }
  set({ query })
  if (query.bucket === 'closed') void loadHistory(++runToken)
}

/** 「加载更多」：加大 limit 重取（skill 脚本无 offset，笨办法；500 条一页无感）。 */
export function loadMoreHistory(): void {
  setQuery({ limit: state.query.limit + HISTORY_PAGE })
}


