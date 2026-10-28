import type { HistoryRecord, LedgerFilter, LedgerWorkspace, TaskRow, WorkspaceOwners } from "../types.js";
/**
 * LedgerFilter → skill 脚本参数（只拼调用方给了的；undefined 一律不拼，
 * 让脚本走自己的默认——插件不替脚本决定默认值）。
 *
 * **按子命令裁参数**：`list` 不认 `--limit` / `--months`，`history` 不认 `--status`，
 * 拼错一个就让 argparse 退 2、整块列表 500。口径以 `skill/shell/cli.py` 为准。
 */
export declare function filterArgs(filter: LedgerFilter, sub: "list" | "history"): string[];
/**
 * 台账工作区探测：走 skill `root --json`（判据是「这个目录直接含 `ledger/`」，
 * 与脚本定位工作区根同一口径；有没有 `pool.json` 不影响）。
 *
 * 曾经的 `<path>/ledger/pool.json` 直查已废——布局知识只留 skill 一份。
 * 程序起不来时抛错（不静默把工作区藏掉）。
 */
export declare function hasLedger(workspacePath: string): Promise<boolean>;
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
/**
 * 工作区花名册（skill `owners --json`，只读、不改台账）。跨工作区由 service 扇出。
 * 名册为空的工作区脚本会报错 ⇒ settle 收进 degraded，本工作区分组自然不出现。
 */
export declare function readOwners(workspace: LedgerWorkspace): Promise<WorkspaceOwners>;
/** 单条在办（展开行 / 详情用）。取不到回 null，不抛。 */
export declare function getTask(workspace: LedgerWorkspace, taskId: string): Promise<TaskRow | null>;
/**
 * 任务 + 过程文档正文（skill `show --json`：一次拿全，插件不再按 `ledger/` 路径自己读文件）。
 * 读不到回 null（任务不存在 / 过程文档缺失都不炸——由调用方展示原因）。
 */
export declare function readWorklog(workspace: LedgerWorkspace, taskId: string): Promise<string | null>;
