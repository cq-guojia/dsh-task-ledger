import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
/**
 * 本机身份 uuid —— 「我的待办 / 我的结案」判定的**唯一**来源。
 *
 * 身份是**机器级**的：skill 的 `init` 把 `{uuid, name}` 写进
 * `$TASK_LEDGER_HOME/.taskledger/identity.json`（默认 `~/.taskledger/identity.json`），
 * 与工作区、git 配置都无关；任务与历史里的 `owner` / `creator` 存的正是这个 uuid。
 * 参数保留是为了与其它 per-workspace 读法同形（同一个 uuid 对所有工作区都成立）。
 *
 * **只取 `uuid`**：`name` 是冗余显示字段，不参与任何判定（按名字比 owner 永远比不到）。
 * 读不到回 null（没 init / 文件坏 / 没 home 目录），该工作区的「我的」统计按 0 计（不谎报）。
 */
const IDENTITY_HOME_ENV = "TASK_LEDGER_HOME";
/** 机器级身份文件路径（与 skill 侧 `env.identity_file()` 同一口径）。 */
export function identityPath() {
    const base = process.env[IDENTITY_HOME_ENV];
    const dir = base ?? os.homedir();
    return path.join(dir, ".taskledger", "identity.json");
}
export async function getCurrentIdentity(_workspace) {
    try {
        const raw = await readFile(identityPath(), "utf-8");
        const data = JSON.parse(raw);
        const uuid = data !== null && typeof data === "object"
            ? String(data.uuid ?? "").trim()
            : "";
        return uuid === "" ? null : uuid.toLowerCase();
    }
    catch {
        return null;
    }
}
