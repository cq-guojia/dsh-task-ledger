/**
 * 首页**快路径**用例：在办快照 + 统计卡。
 * 只读 progress.json（list）+ 本机身份，**不碰 history**——首屏耗时与历史总量解耦
 * （20 万条量级实测：527ms vs 合并端点 4.4s，见 docs/design/host-data-plane.md §四）。
 * 慢路径（趋势）在 ./trend.service.ts；组合入口（/board 兼容全量）在 ../board.ts。
 */
import { type DegradedInfo } from "../errors.js";
import type { BoardSnapshot, LedgerWorkspace, TaskScope } from "../types.js";
/** 停滞阈值：进行中且 updated 至今满这么多天没更新（2026-10-19 拍板，显示级）。 */
export declare const STALE_DAYS = 3;
/** 逾期阈值：进行中且 started 至今满这么多天还没做完——中途更新不影响（2026-10-19 拍板 7 → 14 天）。 */
export declare const OVERDUE_DAYS = 14;
/** 积压阈值：待认领且 created 至今满这么多天还没人接（2026-10-19 拍板）。 */
export declare const BACKLOG_DAYS = 30;
/** 快路径读法：单工作区 readTasks + 本机身份（并行；供 settle 逐工作区调）。 */
export declare function readTaskScope(workspace: LedgerWorkspace): Promise<TaskScope>;
/** 在办行加工 + 六个统计面 + identities（纯函数；`now` 显式传入）。 */
export declare function computeSnapshot(scopes: readonly TaskScope[], now: Date): BoardSnapshot;
/** 快路径端点：在办快照（统计卡 + 身份 + 行加工）。单工作区坏 ⇒ 进 degraded，其余照常。 */
export declare function getSnapshot(workspaces: readonly LedgerWorkspace[]): Promise<{
    snapshot: BoardSnapshot;
    degraded: readonly DegradedInfo[];
}>;
