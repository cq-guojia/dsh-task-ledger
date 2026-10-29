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
/** 单工作区在办统计（skill `stats --json`；过 1.5s 读缓存，同屏多端点复用）。 */
export declare function readStats(workspace: LedgerWorkspace): Promise<WorkspaceStats>;
/** `stats --json` → {@link WorkspaceStats}（容器级严格：缺字段即坏，不当 0）。 */
export declare function parseStats(raw: unknown, where: string): WorkspaceStats;
