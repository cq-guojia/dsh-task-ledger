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
 * 台账目录发现（2026-11-01 改口径）：**按机器级清单读**，不再按宿主工作区读。
 *
 * 宿主 registry 只剩一件事：替清单**补登记**（扫到的工作区里清单还没有的，加进去）。
 * 隐藏 = 全局不看：过滤在这里做一次，下游（统计卡 / 趋势 / 列表 / 名册）全吃它的输出。
 */
export declare function resolveWorkspaces(registryList: readonly RegistryWorkspace[]): Promise<LedgerWorkspace[]>;
