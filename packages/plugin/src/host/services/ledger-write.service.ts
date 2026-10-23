/**
 * 台账写方法（2026-10-18 拍板 B 混合制）：认领 / 释放没有判断量，host 直跑 skill 脚本，**不开会话**。
 *
 * 身份：脚本按 `--repo`（= 工作区路径）读该仓库的 `git config user.email` 作为 owner，
 * 与宿主进程自己的 cwd / 身份无关。
 *
 * 校验全在脚本里（认领要求 open 且无 owner；释放要求是当前 owner），本层不重复实现。
 */
import { WRITE_TIMEOUT_MS, runLedgerCommand } from '../repositories/runner.js'
import type { LedgerWorkspace } from '../types.js'

/** 返回脚本在退出码 0 时打到 stderr 的提示（同步失败等）；没有提示就是空串。 */
async function run(workspace: LedgerWorkspace, sub: string, args: readonly string[]): Promise<string> {
  const result = await runLedgerCommand(sub, [...args, '--repo', workspace.path], {
    cwd: workspace.path,
    timeoutMs: WRITE_TIMEOUT_MS,
  })
  if (!result.ok) throw new Error(`${workspace.title}：${result.error}`)
  return result.notice ?? ''
}

/** 认领：只有 open 且无人认领才能接（脚本内判定），owner = 工作区的 git 邮箱。 */
export function claimTask(workspace: LedgerWorkspace, taskId: string): Promise<string> {
  return run(workspace, 'claim', ['--id', taskId])
}

/**
 * 释放：写回公共池（owner / started 清空、status 回 open），只许当前 owner 本人（脚本内判定）。
 *
 * 走 `set --owner ''`（空 owner = 释放）而不是 `set --status open`：后者只改状态，
 * 分片里那行不会回到公共池，别人永远看不到这条待认领。
 */
export function releaseTask(workspace: LedgerWorkspace, taskId: string): Promise<string> {
  return run(workspace, 'set', ['--id', taskId, '--owner', ''])
}
