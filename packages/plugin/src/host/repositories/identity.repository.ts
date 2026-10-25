import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LedgerWorkspace } from "../types.js";

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
export function identityPath(): string {
	const base = process.env[IDENTITY_HOME_ENV];
	// 空串按「没设」处理：否则 path.join("", …) 会变成跟着 host 进程 cwd 走的相对路径，
	// 与脚本侧 `if base: … else Path.home()` 的口径就对不上了
	const dir = base !== undefined && base.trim() !== "" ? base : os.homedir();
	return path.join(dir, ".taskledger", "identity.json");
}

export async function getCurrentIdentity(
	_workspace?: LedgerWorkspace,
): Promise<string | null> {
	try {
		const raw = await readFile(identityPath(), "utf-8");
		const data: unknown = JSON.parse(raw);
		const uuid =
			data !== null && typeof data === "object"
				? String((data as { uuid?: unknown }).uuid ?? "").trim()
				: "";
		return uuid === "" ? null : uuid.toLowerCase();
	} catch {
		return null;
	}
}
