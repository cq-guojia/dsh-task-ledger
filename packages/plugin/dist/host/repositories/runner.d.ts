export type LedgerScriptResult<T> = {
    ok: true;
    data: T;
} | {
    ok: false;
    error: string;
};
export interface RunOptions {
    /** 测试用：覆盖脚本路径。 */
    scriptPath?: string;
    /** 覆盖超时。 */
    timeoutMs?: number;
}
/**
 * 读命令：跑内嵌台账程序，收 stdout JSON。
 * 不解析任何台账格式——解析真源只有 skill 脚本一份（2026-10-17 用户拍板）。
 *
 * @param sub - 子命令（list / history / show…）
 * @param args - 参数数组，由调用方自拼（含 --repo / --json / --months 等）
 * @param opts.scriptPath - 测试用：覆盖脚本路径
 * @param opts.timeoutMs - 覆盖超时
 */
export declare function runLedgerScript<T = unknown>(sub: string, args: readonly string[], opts?: RunOptions): Promise<LedgerScriptResult<T>>;
