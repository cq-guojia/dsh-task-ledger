import type { BoardSnapshot, LedgerWorkspace, TaskScope } from '../types.js';
/** 停滞判定阈值：doing / blocked 且 created 至今超过这么多天（2026-10-17 拍板，显示级）。 */
export declare const STALE_DAYS = 14;
/** 快路径读法：每工作区 readTasks + git 身份（并行）。 */
export declare function readTaskScopes(workspaces: readonly LedgerWorkspace[]): Promise<TaskScope[]>;
/** 在办行加工 + 六个统计面 + identities（纯函数；`now` 显式传入）。 */
export declare function computeSnapshot(scopes: readonly TaskScope[], now: Date): BoardSnapshot;
/** 快路径端点：在办快照（统计卡 + 身份 + 行加工）。任一行抛即整端点抛（路由转 500 + 人话）。 */
export declare function getSnapshot(workspaces: readonly LedgerWorkspace[]): Promise<BoardSnapshot>;
