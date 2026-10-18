import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { runLedgerScript } from './runner.js'
import type { HistoryRecord, LedgerFilter, LedgerWorkspace, TaskRecord, TaskRow } from '../types.js'

/** 台账目录名（各工作区根下的这一个目录；布局知识只在本文件出现一次）。 */
const LEDGER_DIR = 'ledger'

/**
 * LedgerFilter → skill 脚本参数（只拼调用方给了的；undefined 一律不拼，
 * 让脚本走自己的默认——插件不替脚本决定默认值）。
 */
export function filterArgs(filter: LedgerFilter): string[] {
  const args: string[] = []
  if (filter.status !== undefined) args.push('--status', filter.status)
  if (filter.owner !== undefined) args.push('--owner', filter.owner)
  if (filter.category !== undefined) args.push('--category', filter.category)
  if (filter.tag !== undefined) args.push('--tag', filter.tag)
  if (filter.since !== undefined) args.push('--since', filter.since)
  if (filter.until !== undefined) args.push('--until', filter.until)
  if (filter.limit !== undefined) args.push('--limit', String(filter.limit))
  if (filter.months !== undefined) args.push('--months', String(filter.months))
  return args
}

/**
 * 台账工作区探测：`<path>/ledger/progress.json` 在才算（未初始化 = 后端不可见，
 * 2026-10-17 拍板）。全 host 对台账目录的 IO 只在本文件——别处再写 existsSync 即为分层倒退。
 */
export function hasLedger(workspacePath: string): boolean {
  return existsSync(path.join(workspacePath, LEDGER_DIR, 'progress.json'))
}

/**
 * 在办任务（包 `list --json`；结果打上 workspace）。
 * 脚本失败抛错——路由层转 500 + 人话，不静默返空（空 = 撒谎）。
 */
export async function readTasks(workspace: LedgerWorkspace, filter: LedgerFilter = {}): Promise<TaskRow[]> {
  const result = await runLedgerScript<Record<string, TaskRecord>>('list', ['--repo', workspace.path, '--json', ...filterArgs(filter)])
  if (!result.ok) throw new Error(`${workspace.title}: ${result.error}`)
  return Object.entries(result.data).map(([id, task]) => ({ ...task, id, workspace }))
}

/** 已结案记录（包 `history --json`；结果打上 workspace）。 */
export async function readHistory(workspace: LedgerWorkspace, filter: LedgerFilter = {}): Promise<HistoryRecord[]> {
  const result = await runLedgerScript<{ records?: HistoryRecord[] }>('history', ['--repo', workspace.path, '--json', ...filterArgs(filter)])
  if (!result.ok) throw new Error(`${workspace.title}: ${result.error}`)
  return (result.data.records ?? []).map((record) => ({ ...record, workspace }))
}

/** 单条在办（展开行 / 详情用）。取不到回 null，不抛。 */
export async function getTask(workspace: LedgerWorkspace, taskId: string): Promise<TaskRow | null> {
  const rows = await readTasks(workspace)
  return rows.find((row) => row.id === taskId) ?? null
}

/**
 * 过程文档正文（`task.worklog` 相对 `ledger/` 的路径）。
 * 读不到回 null（文件被清 / 路径坏都不炸——由调用方展示「过程文档缺失」）。
 */
export async function readWorklog(workspace: LedgerWorkspace, task: TaskRow): Promise<string | null> {
  const relative = task.worklog
  if (relative === undefined || relative === null || relative === '') return null
  try {
    return await readFile(path.join(workspace.path, LEDGER_DIR, relative), 'utf-8')
  } catch {
    return null
  }
}
