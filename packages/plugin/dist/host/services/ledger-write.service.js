/**
 * 台账写方法（2026-10-18 拍板 B 混合制）：认领 / 释放没有判断量，host 直跑 skill 脚本，**不开会话**。
 *
 * 身份：脚本只读本机 identity 文件里的 uuid 作为 owner（机器级、与工作区和 git 配置无关），
 * 宿主进程不传、也不推断身份。
 *
 * 校验全在脚本里（认领要求 open 且无 owner；释放要求是当前 owner），本层不重复实现。
 */
import { runLedgerCommand, WRITE_TIMEOUT_MS } from "../repositories/runner.js";
/** 返回脚本在退出码 0 时打到 stderr 的提示（同步失败等）；没有提示就是空串。 */
async function run(workspace, sub, args) {
    const result = await runLedgerCommand(sub, [...args, "--repo", workspace.path], {
        cwd: workspace.path,
        timeoutMs: WRITE_TIMEOUT_MS,
    });
    if (!result.ok)
        throw new Error(`${workspace.title}：${result.error}`);
    return result.notice ?? "";
}
/** 认领：只有 open 且无人认领才能接（脚本内判定），owner = 本机 identity 文件里的 uuid。 */
export function claimTask(workspace, taskId) {
    return run(workspace, "claim", ["--id", taskId]);
}
/**
 * 释放：写回公共池（owner / owner_name 清空、status 回 open），只许当前 owner 本人（脚本内判定）。
 *
 * 走 `set --release`。**不能用 `--owner ''`**：脚本不接受「空 owner = 释放」这种隐式语义，
 * 空串会被当成非法 uuid 直接退 1（2026-10-25 修，此前这条路必失败）。
 */
export function releaseTask(workspace, taskId) {
    return run(workspace, "set", ["--id", taskId, "--release"]);
}
