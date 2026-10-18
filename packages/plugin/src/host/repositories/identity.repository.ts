import { spawn } from 'node:child_process'
import type { LedgerWorkspace } from '../types.js'

/**
 * 当前 git 身份（cwd = 该工作区）——「我的待办」判定源。
 * 与 agent 在会话里跑 skill 时的取值环境一致；取不到回 null（非 git 目录 / 没配身份），
 * 该工作区的「我的」统计按 0 计（不谎报）。
 *
 * 全 host 唯一 spawn git 的地方（python3 的唯一出口在 ./runner.ts）。
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
