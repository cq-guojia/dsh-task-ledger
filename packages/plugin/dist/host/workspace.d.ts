import type { LedgerWorkspace } from './types.js';
/** 宿主 workspaceRegistry.list() 条目的最小面（结构声明；事实与坐标见 external/dsh-workspace-registry.md）。 */
export interface RegistryWorkspace {
    readonly id: string;
    readonly title: string;
    readonly path: string;
}
/**
 * 工作区发现：宿主 registry 全量 → 逐个查 <path>/ledger/progress.json，只返回有的。
 * 未初始化（有 ledger/ 无 progress.json）= 隐藏，后端无此概念（2026-10-17 拍板）。
 * 补充源（registry 未收录目录）暂不做——形态待拍板，见 architecture §五。
 */
export declare function resolveWorkspaces(registryList: readonly RegistryWorkspace[]): LedgerWorkspace[];
