import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * 内嵌 skill 脚本的默认路径：dist/host/repositories/runner.js → 包根 skill/scripts/progress.py
 * （比原 host/script.js 深一层 ⇒ 相对路径多一级 `../`）。
 * 构建时 scripts/copy-skill.mjs 把 packages/skill 拷到 packages/plugin/skill/。
 */
const DEFAULT_SCRIPT_PATH = fileURLToPath(new URL('../../../skill/scripts/progress.py', import.meta.url))

/** 单次脚本调用超时上限（ms）。实测单仓 5 万行全量 1.2s，10s 是宽松上限。 */
const DEFAULT_TIMEOUT_MS = 10_000

/**
 * 写命令的超时上限（ms）：脚本写完会顺手 fetch + commit + push，最坏 30×4 = 120s。
 * 沿用读命令的 10s 会把「已经 commit、还没 push」那一步掐死 —— 界面报失败，台账其实
 * 已经改了，用户一重试就是二次写入。
 */
export const WRITE_TIMEOUT_MS = 120_000

export type LedgerScriptResult<T> = { ok: true; data: T } | { ok: false; error: string }

/**
 * 写命令的返回：stdout 原文（claim / set 打的是人话，不是 JSON）+ 退出码 0 时的 stderr。
 * `notice` 有值说明脚本写成功了、但同步（commit / push）没成功 —— 不能当失败抛，也不能吞掉。
 */
export type LedgerCommandResult =
  | { ok: true; output: string; notice?: string }
  | { ok: false; error: string }

export interface RunOptions {
  /** 测试用：覆盖脚本路径。 */
  scriptPath?: string
  /** 覆盖超时。 */
  timeoutMs?: number
  /**
   * 子进程 cwd。写命令（claim / set）必须落在工作区：
   * 脚本内的 owner 取 `git config user.name`，走进程 cwd 而不是 `--repo`。
   */
  cwd?: string
}

type ExecResult = { ok: true; stdout: string; stderr: string } | { ok: false; error: string }

/**
 * 起一次 python3、收 stdout / stderr。出错一律归一成人话（起不了 python3 / 超时 / 非零退出）。
 * 解析留给调用方：读命令要 JSON，写命令要原文。
 */
function exec(sub: string, args: readonly string[], opts?: RunOptions): Promise<ExecResult> {
  const scriptPath = opts?.scriptPath ?? DEFAULT_SCRIPT_PATH
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return new Promise((resolve) => {
    const child = spawn('python3', [scriptPath, sub, ...args], { cwd: opts?.cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      child.kill()
      settle({ ok: false, error: `skill 脚本超时（>${timeoutMs}ms）：${sub} ${args.join(' ')}` })
    }, timeoutMs)
    const settle = (result: ExecResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', (error: Error) => {
      settle({ ok: false, error: `起不了 python3（${error.message}）——本插件需要 python3 运行内嵌 skill 脚本` })
    })
    child.on('close', (code: number | null) => {
      if (code !== 0) {
        settle({ ok: false, error: stderr.trim() || `skill 脚本退出码 ${String(code)}` })
        return
      }
      settle({ ok: true, stdout, stderr: stderr.trim() })
    })
  })
}

/**
 * 读命令：spawn python3 跑内嵌 skill 脚本，收 stdout JSON。
 * 不解析任何台账格式——解析真源只有 skill 脚本一份（2026-10-17 用户拍板）。
 *
 * @param sub - 子命令（list / history / show…）
 * @param args - 参数数组，由调用方自拼（含 --repo / --json / --months 等）
 * @param opts.scriptPath - 测试用：覆盖脚本路径
 * @param opts.timeoutMs - 覆盖超时
 * @param opts.cwd - 子进程工作目录（写命令取 git 身份用）
 */
export async function runLedgerScript<T = unknown>(
  sub: string,
  args: readonly string[],
  opts?: RunOptions,
): Promise<LedgerScriptResult<T>> {
  const result = await exec(sub, args, opts)
  if (!result.ok) return result
  try {
    return { ok: true, data: JSON.parse(result.stdout) as T }
  } catch {
    return { ok: false, error: `skill 脚本输出不是 JSON：${result.stdout.slice(0, 200)}` }
  }
}

/**
 * 写命令（claim / set）：同样是 spawn python3，但**不解析 JSON**——这些子命令打的是人话，
 * 成功与否看退出码，失败时 stderr 就是能直接上界面的人话。
 */
export async function runLedgerCommand(
  sub: string,
  args: readonly string[],
  opts?: RunOptions,
): Promise<LedgerCommandResult> {
  const result = await exec(sub, args, opts)
  if (!result.ok) return result
  const output = result.stdout.trim()
  // 退出码 0 但 stderr 有字 = 写成功、同步失败（progress.py 的既定行为），必须带出去
  return result.stderr ? { ok: true, output, notice: result.stderr } : { ok: true, output }
}
