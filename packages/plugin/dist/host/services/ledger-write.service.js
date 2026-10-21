/**
 * 台账写方法（2026-10-18 拍板 B 混合制）：认领 / 释放没有判断量，host 直跑 skill 脚本，**不开会话**。
 *
 * 唯一要点：子进程 cwd 必须是工作区 —— `progress.py` 的 owner 取 `git config user.name`，
 * 走的是进程 cwd，`--repo` 只解决路径、不解决身份（2026-10-18 核实结论）。
 *
 * 校验全在脚本里（认领要求 open 且无 owner；释放要求是当前 owner），本层不重复实现。
 */
import { WRITE_TIMEOUT_MS, runLedgerCommand } from '../repositories/runner.js';
/** 返回脚本在退出码 0 时打到 stderr 的提示（同步失败等）；没有提示就是空串。 */
async function run(workspace, sub, args) {
    const result = await runLedgerCommand(sub, [...args, '--repo', workspace.path], {
        cwd: workspace.path,
        timeoutMs: WRITE_TIMEOUT_MS,
    });
    if (!result.ok)
        throw new Error(`${workspace.title}：${result.error}`);
    return result.notice ?? '';
}
/** 认领：只有 open 且无人认领才能接（脚本内判定），owner = 当前工作区的 git 身份。 */
export function claimTask(workspace, taskId) {
    return run(workspace, 'claim', ['--id', taskId]);
}
/** 释放：退回待认领（owner / started 清空），只许当前 owner 本人（脚本内判定）。 */
export function releaseTask(workspace, taskId) {
    return run(workspace, 'set', ['--id', taskId, '--status', 'open']);
}
