import type { LedgerWorkspace } from '../types.js';
/** 认领：只有 open 且无人认领才能接（脚本内判定），owner = 工作区的 git 邮箱。 */
export declare function claimTask(workspace: LedgerWorkspace, taskId: string): Promise<string>;
/**
 * 释放：写回公共池（owner / started 清空、status 回 open），只许当前 owner 本人（脚本内判定）。
 *
 * 走 `set --owner ''`（空 owner = 释放）而不是 `set --status open`：后者只改状态，
 * 分片里那行不会回到公共池，别人永远看不到这条待认领。
 */
export declare function releaseTask(workspace: LedgerWorkspace, taskId: string): Promise<string>;
