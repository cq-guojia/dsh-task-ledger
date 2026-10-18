import { type DegradedInfo } from '../errors.js';
import type { FilterOptions, HistoryRecord, LedgerFilter, LedgerWorkspace, TrendScope } from '../types.js';
/** 已结案列表默认分页大小（「加载更多」= 调用方加大 limit 重取）。 */
export declare const DEFAULT_HISTORY_LIMIT = 500;
/**
 * 已结案列表：默认近 13 个月 + limit 500，跨工作区合并后按创建时间倒序。
 * shortcut: 分页用「加大 limit 重取」的笨办法（skill 脚本无 offset）；
 * 单工作区内 limit 已生效，合并边界的全局精确排序暂不保证（500 条一页无感）。
 * 要全量老数据：调用方显式传 months: undefined（不拼 --months，脚本读全部，按秒计）。
 */
export declare function queryClosed(workspaces: readonly LedgerWorkspace[], filter?: LedgerFilter): Promise<{
    records: HistoryRecord[];
    degraded: readonly DegradedInfo[];
}>;
/** 候选值收集（纯函数）：owner/category/tag 去重 + 排序。 */
export declare function collectFilterOptions(scopes: readonly TrendScope[]): FilterOptions;
/**
 * 筛选项候选：在办（全量）+ 近 13 个月历史的去重值（owner / category / tag）。
 * 按需调用（/filters 路由），非首屏——历史侧在极端量级下是百毫秒级。单工作区坏 ⇒ 进 degraded。
 */
export declare function getFilterOptions(workspaces: readonly LedgerWorkspace[]): Promise<{
    options: FilterOptions;
    degraded: readonly DegradedInfo[];
}>;
