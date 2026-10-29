import { type TrendBucket } from "../repositories/trend.repository.js";
import type { LedgerWorkspace, TrendPayload, TrendView } from "../types.js";
/**
 * 跨工作区求和：同一天起止的周桶相加。
 * 工作区之间周界一致（同机同时区、都由 skill 的周一起算），所以直接按 `from` 归并。
 */
export declare function mergeTrend(rows: readonly {
    buckets: readonly TrendBucket[];
    coverageFrom: string;
    coverageTo: string;
}[]): TrendView;
/** 趋势图数据：逐工作区读、坏的进 degraded，全挂给空桶（不抛）。 */
export declare function getBoardTrend(workspaces: readonly LedgerWorkspace[]): Promise<TrendPayload>;
