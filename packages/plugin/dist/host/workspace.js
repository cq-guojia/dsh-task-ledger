import { hasLedger } from "./repositories/ledger.repository.js";
/**
 * 工作区发现：宿主 registry 全量 → 逐个查 <path>/ledger/progress.json，只返回有的。
 * 未初始化（有 ledger/ 无 progress.json）= 隐藏，后端无此概念（2026-10-17 拍板）。
 * 补充源（registry 未收录目录）暂不做——形态待拍板，见 architecture §五。
 *
 * 探测走 repository 的 hasLedger()——本文件不碰 node:fs（IO 唯一出口纪律）。
 */
export function resolveWorkspaces(registryList) {
    return registryList
        .filter((workspace) => hasLedger(workspace.path))
        .map((workspace) => ({
        id: workspace.id,
        title: workspace.title,
        path: workspace.path,
    }));
}
