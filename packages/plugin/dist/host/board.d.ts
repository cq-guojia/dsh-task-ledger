import type { HistoryRecord, LedgerFilter, LedgerWorkspace, TaskRow } from './types.js';
/** 已结案列表默认分页大小（「加载更多」= 调用方加大 limit 重取）。 */
export declare const DEFAULT_HISTORY_LIMIT = 500;
/** 首页统计卡的两个完成类计数。 */
export interface ClosedCounts {
    /** 本周已完成（最近 2 个月文件内、创建时间落在本周）。 */
    readonly weekDone: number;
    /** 近一年完成（最近 13 个月文件行数；capped = 已触顶，值即下限）。 */
    readonly yearDone: number;
    readonly yearCapped: boolean;
}
export interface BoardSnapshot {
    readonly at: string;
    readonly workspaces: readonly LedgerWorkspace[];
    /** 全部在办任务（UI 自己筛「我的 / 待认领」——筛选是前端的事）。 */
    readonly tasks: readonly TaskRow[];
    readonly stats: {
        readonly myActive: number;
        readonly open: number;
    };
    /**
     * 工作区 id → 该工作区的当前 git 身份（取不到为 null）。
     * 「我的待办」在前端按 `owner === identities[workspace.id]` 筛——身份只在 host 侧取得到
     * （cwd = 该工作区跑 `git config user.name`），UI 不摸 git。
     */
    readonly identities: Readonly<Record<string, string | null>>;
}
/**
 * 当前 git 身份（cwd = 该工作区）——「我的待办」判定源。
 * 与 agent 在会话里跑 skill 时的取值环境一致；取不到回 null（非 git 目录 / 没配身份），
 * 该工作区的「我的」统计按 0 计（不谎报）。
 */
export declare function getCurrentIdentity(workspace: LedgerWorkspace): Promise<string | null>;
/**
 * 首页快照（在办路径）：并发跑全部工作区的 list + 身份解析。
 * 与历史量彻底无关——progress.json 只装没结案的任务（close 会移走），永远有界。
 */
export declare function getBoardSnapshot(workspaces: readonly LedgerWorkspace[]): Promise<BoardSnapshot>;
/**
 * 完成类统计（数行封顶，与总量脱钩）：本周 = 最近 2 个月文件 + 创建时间落在本周；
 * 近一年 = 最近 13 个月文件行数。任一工作区失败即抛（聚合数部分失败 = 错数，不兜）。
 */
export declare function getClosedCounts(workspaces: readonly LedgerWorkspace[]): Promise<ClosedCounts>;
/**
 * 已结案列表：默认近 13 个月 + limit 500，跨工作区合并后按创建时间倒序。
 * shortcut: 分页用「加大 limit 重取」的笨办法（skill 脚本无 offset）；
 * 单工作区内 limit 已生效，合并边界的全局精确排序暂不保证（500 条一页无感）。
 * 要全量老数据：调用方显式传 months: undefined（不拼 --months，脚本读全部，按秒计）。
 */
export declare function queryClosed(workspaces: readonly LedgerWorkspace[], filter?: LedgerFilter): Promise<HistoryRecord[]>;
export interface FilterOptions {
    readonly owners: string[];
    readonly categories: string[];
    readonly tags: string[];
}
/**
 * 筛选项候选：在办（全量）+ 近 13 个月历史的去重值（owner / category / tag）。
 * 按需调用（/filters 路由），非首屏——历史侧在极端量级下是百毫秒级。
 */
export declare function getFilterOptions(workspaces: readonly LedgerWorkspace[]): Promise<FilterOptions>;
