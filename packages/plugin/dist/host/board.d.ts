import type { HistoryRecord, LedgerFilter, LedgerWorkspace, TaskRow } from './types.js';
/** 停滞判定阈值：doing / blocked 且 created 至今超过这么多天（2026-10-17 拍板，显示级）。 */
export declare const STALE_DAYS = 14;
/** 趋势图桶数：近 8 周（2026-10-17 定稿）。 */
export declare const WEEKLY_WEEKS = 8;
/** 一个自然周期内的两个计数（核心永远是「完成」，新增只作对照）。 */
export interface PeriodCounts {
    readonly done: number;
    readonly created: number;
    /** 周期起（YYYY-MM-DD，含）。 */
    readonly from: string;
    /** 周期止（YYYY-MM-DD，含）。 */
    readonly to: string;
}
/** 统计台四个自然周期（用户 2026-10-17 定稿：本周 / 上周 / 本月 / 上月，不用 7/30 天）。 */
export interface TrendPeriods {
    readonly thisWeek: PeriodCounts;
    readonly lastWeek: PeriodCounts;
    readonly thisMonth: PeriodCounts;
    readonly lastMonth: PeriodCounts;
}
/** 趋势图一桶（一周）：完成 + 新增。 */
export interface WeeklyBucket {
    /** 该周周一（YYYY-MM-DD）。 */
    readonly week: string;
    readonly done: number;
    readonly created: number;
}
/** 趋势图数据按范围各一份（切换零请求）。 */
export interface ClosedSummary {
    readonly weekly: {
        readonly all: readonly WeeklyBucket[];
        readonly mine: readonly WeeklyBucket[];
    };
}
/** 首页统计卡的六个面（阈值 / 天数全在 host 算，前端只渲染——单一真源）。 */
export interface BoardStats {
    /** 我的 doing + blocked。 */
    readonly myActive: number;
    /** 我的 blocked。 */
    readonly myBlocked: number;
    /** 待认领（open）。 */
    readonly open: number;
    /** 全部 doing。 */
    readonly doing: number;
    /** 全部 blocked。 */
    readonly blocked: number;
    /** 停滞 = doing|blocked 且 ageDays > STALE_DAYS。 */
    readonly stale: number;
    /** 停滞阈值（天）——随响应下发，界面文案不硬编码（单一真源）。 */
    readonly staleDays: number;
    /** 最老一条待认领躺了多少天（没有待认领 = null）。 */
    readonly oldestOpenDays: number | null;
}
/** 列表行附加工资字段（host 算，前端不判阈值）。 */
export interface BoardTask extends TaskRow {
    /** 认领后未动天数（doing / blocked；open 与解析不了的时间为 null）。 */
    readonly ageDays: number | null;
    /** 停滞标记。 */
    readonly stale: boolean;
}
export interface BoardSnapshot {
    readonly at: string;
    readonly workspaces: readonly LedgerWorkspace[];
    /** 全部在办任务（UI 自己筛「我的 / 待认领」——筛选是前端的事）。 */
    readonly tasks: readonly BoardTask[];
    readonly stats: BoardStats;
    /**
     * 工作区 id → 该工作区的当前 git 身份（取不到为 null）。
     * 「我的待办」在前端按 `owner === identities[workspace.id]` 筛——身份只在 host 侧取得到
     * （cwd = 该工作区跑 `git config user.name`），UI 不摸 git。
     */
    readonly identities: Readonly<Record<string, string | null>>;
}
/** 首页一次 `/board` 的全部聚合（**每个工作区只读一次** list + history + git 身份）。 */
export interface HomeAggregate {
    readonly snapshot: BoardSnapshot;
    readonly closed: ClosedSummary;
    readonly trend: TrendPeriods;
}
/**
 * 当前 git 身份（cwd = 该工作区）——「我的待办」判定源。
 * 与 agent 在会话里跑 skill 时的取值环境一致；取不到回 null（非 git 目录 / 没配身份），
 * 该工作区的「我的」统计按 0 计（不谎报）。
 */
export declare function getCurrentIdentity(workspace: LedgerWorkspace): Promise<string | null>;
/**
 * 首页一次拿全：在办快照（含停滞 / 天数 / 身份）+ 近 8 周趋势（完成 / 新增 × 所有 / 我的）
 * + 四个自然周期计数。**每个工作区只读一次**（list + history + git 身份），
 * 避免「快照读一遍、统计再读一遍」把 5 万行级工作区的 history 解析翻倍。
 */
export declare function getHomeAggregate(workspaces: readonly LedgerWorkspace[]): Promise<HomeAggregate>;
/** 只拿在办快照（薄封装：测试 / 其它调用方用；首页走 {@link getHomeAggregate} 一次读全）。 */
export declare function getBoardSnapshot(workspaces: readonly LedgerWorkspace[]): Promise<BoardSnapshot>;
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
