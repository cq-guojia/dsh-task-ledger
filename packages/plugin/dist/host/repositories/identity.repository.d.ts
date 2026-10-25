import type { LedgerWorkspace } from "../types.js";
/** 机器级身份文件路径（与 skill 侧 `env.identity_file()` 同一口径）。 */
export declare function identityPath(): string;
export declare function getCurrentIdentity(_workspace?: LedgerWorkspace): Promise<string | null>;
