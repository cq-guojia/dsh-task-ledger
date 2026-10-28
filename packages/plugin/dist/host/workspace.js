import { hasLedger } from "./repositories/ledger.repository.js";
/**
 * 工作区发现：宿主 registry 全量 → 逐个问 skill `root`（这个目录是不是台账根），
 * 只留是的。没有 `ledger/` 的目录后端不可见（2026-10-17 拍板）。
 *
 * 探测走 repository 的 hasLedger()——本文件不碰 node:fs（IO 唯一出口纪律）。
 */
export async function resolveWorkspaces(registryList) {
    const flags = await Promise.all(registryList.map((workspace) => hasLedger(workspace.path)));
    return registryList
        .filter((_, index) => flags[index])
        .map((workspace) => ({
        id: workspace.id,
        title: workspace.title,
        path: workspace.path,
    }));
}
