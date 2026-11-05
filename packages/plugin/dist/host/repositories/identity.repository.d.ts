import type { LedgerWorkspace } from "../types.js";
/**
 * 本机身份 —— 走 skill `whoami --json` / `switch --json`（**不自己读 identity.json**：
 * `$TASK_LEDGER_HOME` / 默认目录 / 文件格式都是 skill 的知识，插件不复制第二份）。
 *
 * 未初始化时 skill 回 `{"uuid":null,"name":null}`（退 0）⇒ 这里同样回 null ⇒ 「我的」按 0 计（不谎报）。
 * 程序起不来看不出身份，也只回 null。
 */
/** 本机身份；`uuid === null` = 这台机器还没有身份。 */
export interface IdentityView {
    readonly uuid: string | null;
    readonly name: string | null;
}
/** 换身份：建全新身份 / 认领某个工作区名册里已有的人 / 改自己的昵称。 */
export type SwitchInput = {
    readonly action: "new";
    readonly name: string;
} | {
    readonly action: "claim";
    readonly uuid: string;
    readonly repo: string;
} | {
    readonly action: "rename";
    readonly name: string;
};
/** 改昵称时某一本台账的结果（skill `switch --rename --json` 的 `dirs[]`）。 */
export interface RenameDirResult {
    readonly dir: string;
    /** changed = 改了且提交推送成功；commit-only = 改了但只提交在本地；skipped = 没改；failed = 出错。 */
    readonly status: "changed" | "commit-only" | "skipped" | "failed";
    readonly reason: string;
}
/** 改昵称的回执：新昵称 + 每本台账各自的结果（跨仓库做不到全成或全败）。 */
export interface RenameView {
    readonly uuid: string;
    readonly name: string;
    readonly previous: string;
    readonly dirs: readonly RenameDirResult[];
}
export declare function readIdentity(): Promise<IdentityView>;
/** 只要 uuid（看板行级的「是不是我的」以 skill 的 `mine` 为准，这里只备查）。 */
export declare function getCurrentIdentity(_workspace?: LedgerWorkspace): Promise<string | null>;
/**
 * 换身份。调的是隐藏命令 `switch`（不进 SKILL.md）：它允许覆盖已有身份、不受真终端限制，
 * 正是 `init` 做不到的两件事。失败把人话抛给路由（→ 500 → 界面原地显示）。
 */
export declare function switchIdentity(input: SwitchInput): Promise<IdentityView | RenameView>;
/** 从一本台账的名册里摘掉一个人（skill `forget --json`）。 */
export interface ForgetOutcome {
    /** false = 分片里还有任务，这本台账没删。 */
    readonly removed: boolean;
    readonly name: string;
    readonly tasks: number;
}
export declare function forgetOwner(repo: string, uuid: string, onStep?: (step: string) => void): Promise<ForgetOutcome>;
/**
 * 清掉本机身份（skill `logout`）：台账一个字节都不动。
 * 只删 ~/.taskledger/identity.json —— 路径归 skill 管，插件不复制这份知识。
 */
export declare function logout(repo: string): Promise<void>;
