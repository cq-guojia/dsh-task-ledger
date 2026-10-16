import type { HistoryRecord, LedgerFilter, LedgerWorkspace, TaskRow } from './types.js';
/**
 * LedgerFilter → skill 脚本参数（只拼调用方给了的；undefined 一律不拼，
 * 让脚本走自己的默认——插件不替脚本决定默认值）。
 */
export declare function filterArgs(filter: LedgerFilter): string[];
/**
 * 在办任务（包 `list --json`；结果打上 workspace）。
 * 脚本失败抛错——路由层转 500 + 人话，不静默返空（空 = 撒谎）。
 */
export declare function readTasks(workspace: LedgerWorkspace, filter?: LedgerFilter): Promise<TaskRow[]>;
/** 已结案记录（包 `history --json`；结果打上 workspace）。 */
export declare function readHistory(workspace: LedgerWorkspace, filter?: LedgerFilter): Promise<HistoryRecord[]>;
/** 单条在办（展开行 / 详情用）。取不到回 null，不抛。 */
export declare function getTask(workspace: LedgerWorkspace, taskId: string): Promise<TaskRow | null>;
/**
 * 过程文档正文（`task.worklog` 相对 `ledger/` 的路径）。
 * 读不到回 null（文件被清 / 路径坏都不炸——由调用方展示「过程文档缺失」）。
 */
export declare function readWorklog(workspace: LedgerWorkspace, task: TaskRow): Promise<string | null>;
