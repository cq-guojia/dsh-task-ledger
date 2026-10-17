/**
 * 看板数据仓（client 侧**唯一**取数入口）：浮标角标与整页共用同一份快照，
 * 谁先挂载谁触发首读；刷新按钮走同一个 `refresh()`，**不轮询**（2026-10-17 拍板：
 * 后端纯按需，刷新时机归前端 = 打开面板首读 + 手动刷新）。
 *
 * 消费方式：`useSyncExternalStore(boardSubscribe, boardSnapshot)`。
 * ⚠️ `getSnapshot` 必须返回**稳定引用**（每次新建对象会被判定为「一直在变」⇒ 无限重渲染），
 * 故只在真变了时才换 `state` 对象。
 */
import { fetchBoard } from './api'
import type { BoardPayload } from './types'

/** 范围：我的 / 全部工作区。 */
export type Scope = 'mine' | 'all'
/** 状态档：进行中 = doing+blocked；停滞 = host 已标记的 stale。 */
export type StatusFilter = 'all' | 'active' | 'open' | 'blocked' | 'stale'

export interface Query {
  scope: Scope
  status: StatusFilter
  /** 工作区 id；'' = 全部工作区。 */
  workspace: string
  keyword: string
}

export interface BoardState {
  status: 'loading' | 'ready' | 'error'
  board: BoardPayload | null
  error: string | null
  query: Query
  /** 手动刷新在途（按钮转圈 / 禁用）。 */
  refreshing: boolean
}

const INITIAL_QUERY: Query = { scope: 'all', status: 'all', workspace: '', keyword: '' }

let state: BoardState = {
  status: 'loading',
  board: null,
  error: null,
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

/** 重读：在办快照 + 完成类统计与近 8 周趋势（一次 `/board` 全带回）。 */
export async function refresh(): Promise<void> {
  const token = ++runToken
  set({ refreshing: true })
  try {
    const board = await fetchBoard()
    if (token !== runToken) return
    set({ status: 'ready', board, error: null })
  } catch (error) {
    if (token !== runToken) return
    set({ status: 'error', error: error instanceof Error ? error.message : String(error) })
  } finally {
    if (token === runToken) set({ refreshing: false })
  }
}

/** 改筛选：全部在浏览器里完成（快照已含全部在办），不发请求。 */
export function setQuery(patch: Partial<Query>): void {
  set({ query: { ...state.query, ...patch } })
}
