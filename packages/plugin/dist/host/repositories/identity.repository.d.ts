import type { LedgerWorkspace } from "../types.js";
/**
 * 本机身份 uuid —— 走 skill `whoami --json`（**不再自己读 identity.json**：
 * `$TASK_LEDGER_HOME` / 默认目录 / 文件格式都是 skill 的知识，插件不复制第二份）。
 *
 * **只取 `uuid`**：`name` 是冗余显示字段，不参与任何判定（按名字比 owner 永远比不到）。
 * 未初始化时 skill 回 `{"uuid":null}`（退 0），这里同样回 null ⇒ 「我的」按 0 计（不谎报）。
 * 程序起不来看不出身份，也只回 null。
 */
export declare function getCurrentIdentity(_workspace?: LedgerWorkspace): Promise<string | null>;
