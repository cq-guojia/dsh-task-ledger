import type { LedgerWorkspace } from "../types.js";
/** `stats --json` 的领域投影（只收界面用到的面）。 */
export interface WorkspaceStats {
    readonly total: number;
    readonly open: number;
    readonly doing: number;
    readonly stale: number;
    readonly overdue: number;
    readonly backlog: number;
    readonly mine: number;
    readonly myDoing: number;
    readonly myStale: number;
    readonly myOverdue: number;
    readonly oldestOpenDays: number | null;
    readonly staleDays: number;
    readonly overdueDays: number;
    readonly backlogDays: number;
}
/** 一个时间窗口内的结案数（`history --count-only`）。 */
export interface ClosedCount {
    readonly count: number;
    /** count 到了 skill 的封顶（10000）⇒ 真实值只多不少。 */
    readonly capped: boolean;
}
/** 单工作区在办统计（skill `stats --json`；过 1.5s 读缓存，同屏多端点复用）。 */
export declare function readStats(workspace: LedgerWorkspace): Promise<WorkspaceStats>;
/** `stats --json` → {@link WorkspaceStats}（容器级严格：缺字段即坏，不当 0）。 */
export declare function parseStats(raw: unknown, where: string): WorkspaceStats;
/**
 * 一个时间窗口内结案了多少条（skill `history --count-only`）。
 * 区间写进缓存键：本周 / 上周两个窗口各算一次，别互相串味。
 */
export declare function countClosed(workspace: LedgerWorkspace, window: {
    readonly from: string;
    readonly to: string;
}): Promise<ClosedCount>;
