import { existsSync } from 'node:fs';
import path from 'node:path';
/**
 * 工作区发现：宿主 registry 全量 → 逐个查 <path>/ledger/progress.json，只返回有的。
 * 未初始化（有 ledger/ 无 progress.json）= 隐藏，后端无此概念（2026-10-17 拍板）。
 * 补充源（registry 未收录目录）暂不做——形态待拍板，见 architecture §五。
 */
export function resolveWorkspaces(registryList) {
    const found = [];
    for (const workspace of registryList) {
        if (existsSync(path.join(workspace.path, 'ledger', 'progress.json'))) {
            found.push({ id: workspace.id, title: workspace.title, path: workspace.path });
        }
    }
    return found;
}
