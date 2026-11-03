import type { LedgerWorkspace, RegistryWorkspace } from "../types.js";
/**
 * 台账目录发现（用户 2026-11-01 改口径）：**按机器级清单读**，不再按宿主工作区读。
 *
 * 宿主 registry 只剩一件事：替清单**补登记**（扫到的工作区里清单还没有的，加进去）。
 * 补登记只在 `sync = true` 时做（用户 2026-11-03：进看板 + 手动刷新，一共两处；其余请求
 * 一律只读清单 —— 每请求起一个进程只为对比工作区，纯浪费）。
 * 隐藏 = 全局不看，过滤只在这里做一次 —— 下游（统计卡 / 趋势 / 列表 / 名册）全吃这个输出。
 */
export declare function resolveWorkspaces(registryList: readonly RegistryWorkspace[], sync?: boolean): Promise<LedgerWorkspace[]>;
