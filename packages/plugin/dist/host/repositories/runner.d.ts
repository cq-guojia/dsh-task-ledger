/**
 * 写命令的超时上限（ms）：脚本每条 git 调用各自 30s 超时，写前（fetch / ff / push /
 * rebase / push）与写后（push / fetch / rebase / push）串起来最坏约 270s。
 * 低到 120s 会在网络挂死时先报「超时失败」——台账其实已写入，用户一重试就是二次写入。
 * 180s 覆盖常见最坏组合，又不至于让真卡死的请求占着界面太久。
 */
export declare const WRITE_TIMEOUT_MS = 180000;
export type LedgerScriptResult<T> = {
    ok: true;
    data: T;
} | {
    ok: false;
    error: string;
};
/**
 * 写命令的返回：stdout 原文（claim / set 打的是人话，不是 JSON）+ 退出码 0 时的 stderr。
 * `notice` 有值说明脚本写成功了、但同步（commit / push）没成功 —— 不能当失败抛，也不能吞掉。
 */
export type LedgerCommandResult = {
    ok: true;
    output: string;
    notice?: string;
} | {
    ok: false;
    error: string;
};
export interface RunOptions {
    /** 测试用：覆盖脚本路径。 */
    scriptPath?: string;
    /** 覆盖超时。 */
    timeoutMs?: number;
    /**
     * 子进程 cwd。写命令（claim / set）必须落在工作区：
     * 脚本内的 owner 取 `git config user.name`，走进程 cwd 而不是 `--repo`。
     */
    cwd?: string;
}
/**
 * 读命令：spawn python3 跑内嵌 skill 脚本，收 stdout JSON。
 * 不解析任何台账格式——解析真源只有 skill 脚本一份（2026-10-17 用户拍板）。
 *
 * @param sub - 子命令（list / history / show…）
 * @param args - 参数数组，由调用方自拼（含 --repo / --json / --months 等）
 * @param opts.scriptPath - 测试用：覆盖脚本路径
 * @param opts.timeoutMs - 覆盖超时
 * @param opts.cwd - 子进程工作目录（写命令取 git 身份用）
 */
export declare function runLedgerScript<T = unknown>(sub: string, args: readonly string[], opts?: RunOptions): Promise<LedgerScriptResult<T>>;
/**
 * 写命令（claim / set）：同样是 spawn python3，但**不解析 JSON**——这些子命令打的是人话，
 * 成功与否看退出码，失败时 stderr 就是能直接上界面的人话。
 */
export declare function runLedgerCommand(sub: string, args: readonly string[], opts?: RunOptions): Promise<LedgerCommandResult>;
