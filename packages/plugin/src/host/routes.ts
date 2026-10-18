/**
 * 数据面路由薄壳：只做协议（参数解析 + JSON 响应 + 错误转 500），
 * 一行业务逻辑都不多写——全部调 board / ledger-read 的方法（2026-10-17 定稿）。
 * 宿主事实（handler = 原始 Node req/res、发头后不抛错、重复 path 注册直接 throw）
 * 见 external/host-webserver.md。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { getHomeAggregate, getFilterOptions, queryClosed } from './board.js'
import { getSnapshot } from './services/home.service.js'
import { getTrend } from './services/trend.service.js'
import { getTask, readTasks, readWorklog } from './repositories/ledger.repository.js'
import { invalidate } from './repositories/cache.js'
import type { LedgerFilter } from './types.js'
import { resolveWorkspaces, type RegistryWorkspace } from './workspace.js'

/** 宿主 webServer.register 的最小面（WebRoute 形状见 external/host-webserver.md）。 */
export interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): unknown
}

/** 宿主 workspaceRegistry 的最小面（事实见 external/dsh-workspace-registry.md）。 */
export interface WorkspaceRegistryLike {
  list(): readonly RegistryWorkspace[]
}

export interface RouteDeps {
  readonly registry: WorkspaceRegistryLike
}

/** API 前缀（唯一真源就在这一处）。 */
const API_PREFIX = '/api/task-ledger'

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** URL query → LedgerFilter（只认白名单键；limit/months 非正数忽略）。 */
function filterFromQuery(url: URL): LedgerFilter {
  const filter: LedgerFilter = {}
  const str = (key: string): string | null => {
    const value = url.searchParams.get(key)
    return value !== null && value !== '' ? value : null
  }
  const int = (key: string): number | undefined => {
    const raw = str(key)
    if (raw === null) return undefined
    const value = Number.parseInt(raw, 10)
    return Number.isFinite(value) && value > 0 ? value : undefined
  }
  const status = str('status'); if (status !== null) filter.status = status
  const owner = str('owner'); if (owner !== null) filter.owner = owner
  const category = str('category'); if (category !== null) filter.category = category
  const tag = str('tag'); if (tag !== null) filter.tag = tag
  const since = str('since'); if (since !== null) filter.since = since
  const until = str('until'); if (until !== null) filter.until = until
  const limit = int('limit'); if (limit !== undefined) filter.limit = limit
  const months = int('months'); if (months !== undefined) filter.months = months
  return filter
}

/** 每请求重新解析工作区（registry 可能刚变；探测走 hasLedger()，微秒级，不缓存）。 */
function workspacesOf(deps: RouteDeps) {
  return resolveWorkspaces(deps.registry.list())
}

type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>

export function registerRoutes(webServer: WebServerLike, deps: RouteDeps): void {
  /**
   * 注册一个**读**端点：统一先看 `?fresh=1`（手动刷新 = 清缓存再算，别让用户按了刷新还看旧数）。
   * 缓存 TTL 只有 1.5s，正常浏览照样吃缓存；写端点将来自己走写路径 + `invalidate()`，不走这里。
   */
  const registerRead = (path: string, handler: Handler): void => {
    webServer.register({
      kind: 'exact',
      path: `${API_PREFIX}${path}`,
      handler: async (req, res) => {
        if (new URL(req.url ?? '/', 'http://localhost').searchParams.get('fresh') === '1') invalidate()
        await handler(req, res)
      },
    })
  }

  registerRead('/workspaces', (_req, res) => { sendJson(res, 200, { workspaces: workspacesOf(deps) }) })

  // 首页一次拿全：在办快照 + 近 8 周趋势 + 四个自然周期计数（host 每个工作区只读一次）。
  registerRead('/board', async (_req, res) => {
    try {
      const home = await getHomeAggregate(workspacesOf(deps))
      sendJson(res, 200, { ...home.snapshot, closed: home.closed, trend: home.trend, degraded: home.degraded })
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  })

  // ── 拆端点（2026-10-18 步骤 4a：纯加法，旧 /board 全量原样保留）──
  // 快路径：首屏。只读 progress.json + git 身份，**不碰 history** ⇒ 耗时与历史总量解耦
  // （20 万条量级实测 527ms vs 合并端点 4.4s）。
  registerRead('/board/snapshot', async (_req, res) => {
    try {
      const result = await getSnapshot(workspacesOf(deps))
      sendJson(res, 200, { ...result.snapshot, degraded: result.degraded })
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  })

  // 慢路径：趋势（近 8 周 + 四个自然周期）。读 history ⇒ 异步/按需拉，首屏不等它。
  registerRead('/board/trend', async (_req, res) => {
    try {
      const result = await getTrend(workspacesOf(deps))
      sendJson(res, 200, { closed: result.closed, trend: result.trend, degraded: result.degraded })
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  })

  registerRead('/tasks', async (req, res) => {
    try {
      const filter = filterFromQuery(new URL(req.url ?? '/', 'http://localhost'))
      const perWorkspace = await Promise.all(workspacesOf(deps).map((workspace) => readTasks(workspace, filter)))
      sendJson(res, 200, { tasks: perWorkspace.flat() })
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  })

  // 任务详情 + 过程文档正文（query 传 ws/id，不做路径段解析——任务号含中文和连字符）。
  registerRead('/task', async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const workspace = workspacesOf(deps).find((item) => item.id === url.searchParams.get('ws'))
      const taskId = url.searchParams.get('id')
      if (workspace === undefined || taskId === null) {
        sendJson(res, 400, { error: '缺少 ws / id 参数' })
        return
      }
      const task = await getTask(workspace, taskId)
      if (task === null) {
        sendJson(res, 404, { error: '任务不存在' })
        return
      }
      sendJson(res, 200, { task, worklog: await readWorklog(workspace, task) })
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  })

  registerRead('/history', async (req, res) => {
    try {
      const filter = filterFromQuery(new URL(req.url ?? '/', 'http://localhost'))
      const result = await queryClosed(workspacesOf(deps), filter)
      sendJson(res, 200, { records: result.records, degraded: result.degraded })
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  })

  registerRead('/filters', async (_req, res) => {
    try {
      const result = await getFilterOptions(workspacesOf(deps))
      sendJson(res, 200, { ...result.options, degraded: result.degraded })
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  })

  // POST /sessions（按钮会话交接）归「任务按钮与会话交接」任务——写入路径 A/B 拍板后再接。
}
