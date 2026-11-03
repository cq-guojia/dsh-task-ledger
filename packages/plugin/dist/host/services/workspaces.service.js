import { addDir, readDirs } from "../repositories/dirs.repository.js";
/**
 * 台账目录发现（用户 2026-11-01 改口径）：**按机器级清单读**，不再按宿主工作区读。
 *
 * 宿主 registry 只剩一件事：替清单**补登记**（扫到的工作区里清单还没有的，加进去）。
 * 补登记只在 `sync = true` 时做（用户 2026-11-03：进看板 + 手动刷新，一共两处；其余请求
 * 一律只读清单 —— 每请求起一个进程只为对比工作区，纯浪费）。
 * 隐藏 = 全局不看，过滤只在这里做一次 —— 下游（统计卡 / 趋势 / 列表 / 名册）全吃这个输出。
 */
export async function resolveWorkspaces(registryList, sync = false) {
    let dirs = await readDirs();
    if (sync) {
        const known = new Set(dirs.map((dir) => dir.path));
        for (const workspace of registryList) {
            if (known.has(workspace.path))
                continue;
            // 串行：读改写同一个文件，并发会互相覆盖（skill 侧虽有锁，最后写入者仍可能少几条）
            const added = await addDir(workspace.path, workspace.title);
            known.add(workspace.path);
            if (added.added)
                dirs = added.dirs;
        }
    }
    return dirs.filter((dir) => !dir.hidden).map(toWorkspace);
}
function toWorkspace(dir) {
    return { id: dir.path, title: dir.name, path: dir.path };
}
