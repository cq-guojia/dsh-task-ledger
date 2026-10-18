export type LedgerScriptResult<T> = {
    ok: true;
    data: T;
} | {
    ok: false;
    error: string;
};
/**
 * 全插件唯一碰 Python 的地方：spawn python3 跑内嵌 skill 脚本，收 stdout JSON。
 * 不解析任何台账格式——解析真源只有 skill 脚本一份（2026-10-17 用户拍板）。
 *
 * 出错一律归一为 { ok:false, error }（人话，直接可上界面）：
 * 起不了 python3 / 超时（kill）/ 非零退出（stderr 原文）/ 输出不是 JSON。
 *
 * @param sub - 子命令（list / history / show…）
 * @param args - 参数数组，由调用方自拼（含 --repo / --json / --months 等）
 * @param opts.scriptPath - 测试用：覆盖脚本路径
 * @param opts.timeoutMs - 覆盖超时
 */
export declare function runLedgerScript<T = unknown>(sub: string, args: readonly string[], opts?: {
    scriptPath?: string;
    timeoutMs?: number;
}): Promise<LedgerScriptResult<T>>;
