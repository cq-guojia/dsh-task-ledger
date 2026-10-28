import type { BoardHomePayload, LedgerWorkspace, StatsPayload } from "../types.js";
/**
 * 首屏一次拿全：8 卡 + 在办列表 + 工作区 + 身份 + 各工作区花名册。
 * 三条读并行（`stats` / `list` / `owners`），各自缓存；一个工作区坏只进 degraded，其余照常。
 */
export declare function getBoardHome(workspaces: readonly LedgerWorkspace[], now?: Date): Promise<BoardHomePayload>;
export declare function getBoardStats(workspaces: readonly LedgerWorkspace[], now?: Date): Promise<StatsPayload>;
