import type { LedgerFilter, LedgerWorkspace, TaskRow, WorkspaceOwners } from "../types.js";
/**
 * LedgerFilter → skill 脚本参数（只拼调用方给了的；undefined 一律不拼，
 * 让脚本走自己的默认——插件不替脚本决定默认值）。
 * 参数名以 `skill/shell/cli.go` 的 `list` 白名单为准，拼错一个就让 argparse 退 2、整块列表 500。
 */
export declare function filterArgs(filter: LedgerFilter): string[];
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
 * 工作区花名册（skill `owners --json`，只读、不改台账）。跨工作区由 service 扇出。
 * 名册为空的工作区脚本会报错 ⇒ settle 收进 degraded，本工作区分组自然不出现。
 */
export declare function readOwners(workspace: LedgerWorkspace): Promise<WorkspaceOwners>;
