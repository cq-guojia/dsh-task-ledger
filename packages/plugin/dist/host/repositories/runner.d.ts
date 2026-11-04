/** 脚本绝对路径（界面上要写给用户复制的命令用；别在别处再拼一份）。 */
export declare function scriptPath(): string;
/**
 * 脚本失败的统一出口：**没身份单独成类**（→ `LEDGER_IDENTITY_MISSING`），其余照旧是普通 Error。
 * 各处别自己 `new Error(result.error)` —— 那样「没身份」就淹进「台账坏了」里，界面分不出来。
 */
export declare function failureOf(result: {
    readonly error: string;
    readonly identityMissing?: boolean;
}, prefix?: string, workspaceId?: string | null): Error;
export type LedgerScriptResult<T> = {
    ok: true;
    data: T;
} | {
    ok: false;
    error: string;
    /** 脚本退出码 4 = 这台机器还没有身份（`env.Current` 的专用码，文案不变）。 */
    identityMissing?: boolean;
};
export interface RunOptions {
    /** 测试用：覆盖脚本路径。 */
    scriptPath?: string;
    /** 覆盖超时。 */
    timeoutMs?: number;
    /**
     * 过程步骤回调（写命令专用）：skill 每进一个阶段就在 stderr 打一行 `#step <key>`
     * （`shell/render.go` 的 stepf，只有宿主设了 `TASK_LEDGER_STEPS=1` 才打）。
     * 给了它才让 skill 打标记，读命令不传、不产生任何额外输出。
     */
    onStep?: (step: string) => void;
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
/** 写命令结果：写动作只回人话（`shell/render.go` 的 RenderResult），**不认 --json** ⇒ 不解析 stdout。 */
export type LedgerCommandResult = {
    readonly ok: true;
    readonly output: string;
} | {
    readonly ok: false;
    readonly error: string;
    readonly identityMissing?: boolean;
};
/** 写命令：认领 / 释放 / 结案这类改台账的动作走它（读命令走 `runLedgerScript`）。 */
export declare function runLedgerCommand(sub: string, args: readonly string[], opts?: RunOptions): Promise<LedgerCommandResult>;
