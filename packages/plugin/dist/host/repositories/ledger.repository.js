import { cached, cacheKey } from "./cache.js";
import { parseTaskList } from "./records.js";
import { runLedgerScript } from "./runner.js";
/**
 * LedgerFilter → skill 脚本参数（只拼调用方给了的；undefined 一律不拼，
 * 让脚本走自己的默认——插件不替脚本决定默认值）。
 * 参数名以 `skill/shell/cli.go` 的 `list` 白名单为准，拼错一个就让 argparse 退 2、整块列表 500。
 */
export function filterArgs(filter) {
    const args = [];
    if (filter.status !== undefined)
        args.push("--status", filter.status);
    // 身份只收 uuid（脚本同样口径）；按名字模糊筛走 --owner-name
    if (filter.owner !== undefined)
        args.push("--owner", filter.owner);
    if (filter.ownerName !== undefined)
        args.push("--owner-name", filter.ownerName);
    if (filter.category !== undefined)
        args.push("--category", filter.category);
    if (filter.tag !== undefined)
        args.push("--tag", filter.tag);
    if (filter.since !== undefined)
        args.push("--since", filter.since);
    if (filter.until !== undefined)
        args.push("--until", filter.until);
    return args;
}
/**
 * 台账工作区探测：走 skill `root --json`（判据是「这个目录直接含 `ledger/`」，
 * 与脚本定位工作区根同一口径；有没有 `pool.json` 不影响）。
 *
 * 曾经的 `<path>/ledger/pool.json` 直查已废——布局知识只留 skill 一份。
 * 程序起不来时抛错（不静默把工作区藏掉）。
 */
export async function hasLedger(workspacePath) {
    const result = await runLedgerScript("root", [
        "--dir",
        workspacePath,
        "--json",
    ]);
    if (!result.ok)
        throw new Error(`台账根检测失败（${workspacePath}）：${result.error}`);
    return result.data.root === true;
}
/**
 * 在办任务（包 `list --json`；结果过 records 入口校验后打上 workspace）。
 * 脚本失败 / 形状不符抛错——由 service 层捕获进 degraded，路由层转 500 + 人话，
 * 不静默返空（空 = 撒谎）。**过 1.5s 读缓存**（同屏多端点会反复读同一份在办）。
 */
export async function readTasks(workspace, filter = {}) {
    return await cached(cacheKey(workspace.id, "list", argsKey(filter)), async () => {
        const result = await runLedgerScript("list", [
            "--repo",
            workspace.path,
            "--json",
            ...filterArgs(filter),
        ]);
        if (!result.ok)
            throw new Error(`${workspace.title}: ${result.error}`);
        return parseTaskList(result.data, workspace);
    });
}
/**
 * 工作区花名册（skill `owners --json`，只读、不改台账）。跨工作区由 service 扇出。
 * 名册为空的工作区脚本会报错 ⇒ settle 收进 degraded，本工作区分组自然不出现。
 */
export async function readOwners(workspace) {
    return await cached(cacheKey(workspace.id, "owners", ""), async () => {
        const result = await runLedgerScript("owners", ["--repo", workspace.path, "--json"]);
        if (!result.ok)
            throw new Error(`${workspace.title}: ${result.error}`);
        const owners = Object.entries(result.data.owners ?? {}).map(([uuid, value]) => ({
            uuid,
            name: typeof value.name === "string" && value.name.trim() !== ""
                ? value.name
                : uuid,
            mine: value.mine === true,
        }));
        return {
            workspaceId: workspace.id,
            workspaceTitle: workspace.title,
            owners,
        };
    });
}
/** 缓存键的 filter 段：脚本参数原样序列化（分隔符取不可见字符，值里带空格也不会串）。 */
function argsKey(filter) {
    return filterArgs(filter).join("\u0001");
}
