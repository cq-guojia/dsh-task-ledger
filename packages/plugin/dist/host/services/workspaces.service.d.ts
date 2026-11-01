import type { LedgerWorkspace, RegistryWorkspace } from "../types.js";
/**
 * 台账目录发现（用户 2026-11-01 改口径）：**按机器级清单读**，不再按宿主工作区读。
 *
 * 宿主 registry 只剩一件事：替清单**补登记**（扫到的工作区里清单还没有的，加进去）。
 * 隐藏 = 全局不看，过滤只在这里做一次 —— 下游（统计卡 / 趋势 / 列表 / 名册）全吃这个输出。
 */
export declare function resolveWorkspaces(registryList: readonly RegistryWorkspace[]): Promise<LedgerWorkspace[]>;
