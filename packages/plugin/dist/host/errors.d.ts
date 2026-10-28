/**
 * 横切：错误模型与降级语义（2026-10-18 重构步骤 3 落地）。
 *
 * 两种失败分开表达：
 * - **已知失败**（坏数据 / 脚本非零 / 台账程序起不来 / 超时）：service 层捕获进 `degraded`，
 *   接口仍 200，该工作区被前端标红，其他工作区不受影响（不再一抛全板 500）；
 * - **全局失败**（所有工作区都读不到 / 编程错误）：照旧抛，路由转 500 + 人话。
 *   防止「台账程序根本没装」被集体降级成一片绿色空板——那等于界面撒谎。
 */
/** 机器可读错误码（只增不改；`LEDGER_` 前缀避开宿主错误码空间）。 */
export type LedgerErrorCode = "LEDGER_SCRIPT_UNAVAILABLE" | "LEDGER_SCRIPT_TIMEOUT" | "LEDGER_SCRIPT_FAILED" | "LEDGER_SCRIPT_BAD_JSON" | "LEDGER_DATA_INVALID";
/** 台账数据形状不符（容器级校验失败）。message 带工作区名 + 人话，可直接上界面。 */
export declare class LedgerDataError extends Error {
    readonly code: LedgerErrorCode;
    readonly workspaceId: string;
    constructor(workspaceId: string, message: string);
}
/** 降级信息：哪个工作区的哪类读挂了、为什么（扁平数组，UI 一种渲染路径）。 */
export interface DegradedInfo {
    readonly workspaceId: string;
    readonly workspaceTitle: string;
    /** 哪个读挂了——trend 同时读 list + history，必须能区分。 */
    readonly op: "list" | "history" | "owners";
    readonly code: LedgerErrorCode;
    /** 人话，可直接上界面（真源：脚本 stderr / records 校验文案）。 */
    readonly message: string;
}
/** 从任意抛出物取错误码（无 code 的按 LEDGER_SCRIPT_FAILED 兜底——那正是脚本非零的主路径）。 */
export declare function codeOf(error: unknown): LedgerErrorCode;
/** 人话（优先 Error.message；其余 String()，不吞）。 */
export declare function messageOf(error: unknown): string;
/**
 * 多工作区 fan-out：逐个读，坏的进 `degraded`，好的交给 `merge` 合成。
 * **全部失败** ⇒ 抛首个错误（路由转 500 + 人话）——部分失败才 200 + degraded。
 */
export declare function settleWorkspaces<W extends {
    id: string;
    title: string;
}, T, R>(workspaces: readonly W[], op: "list" | "history" | "owners", read: (workspace: W) => Promise<T>, merge: (rows: readonly T[]) => R): Promise<{
    data: R;
    degraded: readonly DegradedInfo[];
}>;
