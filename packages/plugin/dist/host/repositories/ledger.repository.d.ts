import type { HistoryRecord, LedgerFilter, LedgerWorkspace, TaskRow } from "../types.js";
/**
 * LedgerFilter → skill 脚本参数（只拼调用方给了的；undefined 一律不拼，
 * 让脚本走自己的默认——插件不替脚本决定默认值）。
 *
 * **按子命令裁参数**：`list` 不认 `--limit` / `--months`，`history` 不认 `--status`，
 * 拼错一个就让 argparse 退 2、整块列表 500。口径以 `skill/shell/cli.py` 为准。
 */
export declare function filterArgs(filter: LedgerFilter, sub: "list" | "history"): string[];
/**
 * 台账工作区探测：`<path>/ledger/pool.json` 在才算（分片布局的初始化标志；
 * 未初始化 = 后端不可见，2026-10-17 拍板）。全 host 对台账目录的 IO 只在本文件
 * ——别处再写 existsSync 即为分层倒退。
 */
export declare function hasLedger(workspacePath: string): boolean;
/**
 * 在办任务（包 `list --json`；结果过 records 入口校验后打上 workspace）。
 * 脚本失败 / 形状不符抛错——由 service 层捕获进 degraded，路由层转 500 + 人话，
 * 不静默返空（空 = 撒谎）。**过 1.5s 读缓存**（同屏多端点会反复读同一份在办）。
 */
export declare function readTasks(workspace: LedgerWorkspace, filter?: LedgerFilter): Promise<TaskRow[]>;
/**
 * 已结案记录（包 `history --json`；`records` 必须存在且为数组，缺了即坏数据）。同样过读缓存。
 * 一并带回 `warnings`（被脚本整行跳过的坏行原因）——调用方必须展示，不许吞。
 */
export declare function readHistory(workspace: LedgerWorkspace, filter?: LedgerFilter): Promise<{
    records: HistoryRecord[];
    warnings: string[];
}>;
/** 单条在办（展开行 / 详情用）。取不到回 null，不抛。 */
export declare function getTask(workspace: LedgerWorkspace, taskId: string): Promise<TaskRow | null>;
/**
 * 过程文档正文（`task.worklog` 相对 `ledger/` 的路径）。
 * 读不到回 null（文件被清 / 路径坏都不炸——由调用方展示「过程文档缺失」）。
 */
export declare function readWorklog(workspace: LedgerWorkspace, task: TaskRow): Promise<string | null>;
