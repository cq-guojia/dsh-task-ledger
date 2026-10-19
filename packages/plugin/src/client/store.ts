/**
 * 看板数据仓（client 侧**唯一**取数入口）：浮标角标与整页共用同一份快照，
 * 谁先挂载谁触发首读；刷新按钮走同一个 `refresh()`，**不轮询**（2026-10-17 拍板：
 * 后端纯按需，刷新时机归前端 = 打开面板首读 + 手动刷新）。
 *
 * 消费方式：`useSyncExternalStore(boardSubscribe, boardSnapshot)`。
 * ⚠️ `getSnapshot` 必须返回**稳定引用**（每次新建对象会被判定为「一直在变」⇒ 无限重渲染），
 * 故只在真变了时才换 `state` 对象。
 */
import { fetchBoardSnapshot, fetchTrend } from './api'
import type { BoardPayload, TrendPayload } from './types'

/** 范围：我的 / 全部工作区。 */
export type Scope = 'mine' | 'all'
/** 状态档：进行中 = doing；积压 / 超期 / 停滞 = host 按时间标记的 backlog / overdue / stale。 */
export type StatusFilter = 'all' | 'active' | 'open' | 'backlog' | 'overdue' | 'stale'

export interface Query {
  scope: Scope
  /** 「其他待办」的状态档过滤（segmented）。 */
  status: StatusFilter
  /** 工作区 id；'' = 全部工作区（只作用于「我的待办」）。 */
  workspace: string
  /** 「我的待办」的标题搜索。 */
  keyword: string
  /** 「其他待办」的搜索（标题 / 执行人）。 */
  othersKeyword: string
}

export interface BoardState {
  status: 'loading' | 'ready' | 'error'
  board: BoardPayload | null
  error: string | null
  query: Query
  /** 手动刷新在途（按钮转圈 / 禁用）。 */
  refreshing: boolean
  /** 趋势（慢路径，`/board/trend`）：null = 还没回来 / 旧宿主没有该端点。 */
  trend: TrendPayload | null
  /** 趋势加载态：首屏不阻塞列表，图表区自己显示占位 / 兜底文案。 */
  trendStatus: 'idle' | 'loading' | 'ready' | 'error'
  trendError: string | null
}

const INITIAL_QUERY: Query = { scope: 'all', status: 'all', workspace: '', keyword: '', othersKeyword: '' }

let state: BoardState = {
  status: 'loading',
  board: null,
  error: null,
  query: INITIAL_QUERY,
  refreshing: false,
  trend: null,
  trendStatus: 'idle',
  trendError: null,
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

/**
 * 重读（2026-10-18 拆端点）：**两段**——先快路径 `/board/snapshot`（只读在办，首屏立即可渲染），
 * 再慢路径 `/board/trend`（读 history，后台拉；迟到按 token 丢弃，不盖新快照）。
 * 趋势失败（含旧宿主 404）不阻塞列表：trendStatus 置 error，图表区显示兜底文案。
 * 两段都带 `fresh=1`：本函数只由首读与手动刷新触发，都要最新值（host 缓存清两次无害，清是全局的）。
 */
export async function refresh(): Promise<void> {
  const token = ++runToken
  set({ refreshing: true })
  try {
    const board = await fetchBoardSnapshot({ fresh: true })
    if (token !== runToken) return
    set({ status: 'ready', board, error: null, trendStatus: 'loading', trendError: null })
  } catch (error) {
    if (token !== runToken) return
    set({ status: 'error', error: error instanceof Error ? error.message : String(error) })
    return
  } finally {
    if (token === runToken) set({ refreshing: false })
  }
  try {
    const trend = await fetchTrend({ fresh: true })
    if (token !== runToken) return
    set({ trend, trendStatus: 'ready', trendError: null })
  } catch (error) {
    if (token !== runToken) return
    set({ trend: null, trendStatus: 'error', trendError: error instanceof Error ? error.message : String(error) })
  }
}

/** 改筛选：全部在浏览器里完成（快照已含全部在办），不发请求。 */
export function setQuery(patch: Partial<Query>): void {
  set({ query: { ...state.query, ...patch } })
}
