import type { LedgerWorkspace } from '../types.js';
/** 认领：只有 open 且无人认领才能接（脚本内判定），owner = 当前工作区的 git 身份。 */
export declare function claimTask(workspace: LedgerWorkspace, taskId: string): Promise<string>;
/** 释放：退回待认领（owner / started 清空），只许当前 owner 本人（脚本内判定）。 */
export declare function releaseTask(workspace: LedgerWorkspace, taskId: string): Promise<string>;
