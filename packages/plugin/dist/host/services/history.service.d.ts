import type { HistoryTrendPayload, LedgerWorkspace } from "../types.js";
export declare function getHistoryTrend(workspaces: readonly LedgerWorkspace[], months?: number): Promise<HistoryTrendPayload>;
