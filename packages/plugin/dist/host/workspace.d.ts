import type { LedgerWorkspace } from "./types.js";
/** 宿主 workspaceRegistry.list() 条目的最小面（结构声明；事实与坐标见 external/dsh-workspace-registry.md）。 */
export interface RegistryWorkspace {
    readonly id: string;
    readonly title: string;
    readonly path: string;
    /**
     * 把会话登记进本工作区的 `sessionIds`（会话归组的唯一途径）。
     * ⚠️ 只设 `meta.cwd` **不会**自动归组（reference: dsh-task-dispatch-table 决策 22 真机结论）；
     * 宿主旧版本可能没有该面 ⇒ optional，调用方按缺失降级并如实回报。
     */
    readonly attachSession?: (sessionId: string) => Promise<void>;
}
/**
 * 工作区发现：宿主 registry 全量 → 逐个问 skill `root`（这个目录是不是台账根），
 * 只留是的。没有 `ledger/` 的目录后端不可见（2026-10-17 拍板）。
 *
 * 探测走 repository 的 hasLedger()——本文件不碰 node:fs（IO 唯一出口纪律）。
 */
export declare function resolveWorkspaces(registryList: readonly RegistryWorkspace[]): Promise<LedgerWorkspace[]>;
