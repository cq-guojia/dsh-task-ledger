import type { LedgerWorkspace } from "../types.js";
/** 认领：只有 open 且无人认领才能接（脚本内判定），owner = 本机 identity 文件里的 uuid。 */
export declare function claimTask(workspace: LedgerWorkspace, taskId: string): Promise<string>;
/**
 * 释放：写回公共池（owner / owner_name 清空、status 回 open），只许当前 owner 本人（脚本内判定）。
 *
 * 走 `set --release`。**不能用 `--owner ''`**：脚本不接受「空 owner = 释放」这种隐式语义，
 * 空串会被当成非法 uuid 直接退 1（2026-10-25 修，此前这条路必失败）。
 */
export declare function releaseTask(workspace: LedgerWorkspace, taskId: string): Promise<string>;
