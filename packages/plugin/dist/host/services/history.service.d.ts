import type { HistoryGran, HistoryTrendPayload, LedgerWorkspace } from "../types.js";
export declare function getHistoryTrend(workspaces: readonly LedgerWorkspace[], gran?: HistoryGran): Promise<HistoryTrendPayload>;
