import type { LedgerWorkspace } from "../types.js";
import { runLedgerScript } from "./runner.js";

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

/** 换身份：要么建全新身份，要么认领某个工作区名册里已有的人（要给出那本台账的根）。 */
export type SwitchInput =
	| { readonly action: "new"; readonly name: string }
	| { readonly action: "claim"; readonly uuid: string; readonly repo: string };

const UNKNOWN_IDENTITY: IdentityView = { uuid: null, name: null };

function viewOf(data: { uuid?: unknown; name?: unknown }): IdentityView {
	const uuid = typeof data.uuid === "string" ? data.uuid.trim() : "";
	const name = typeof data.name === "string" ? data.name.trim() : "";
	return {
		uuid: uuid === "" ? null : uuid.toLowerCase(),
		name: name === "" ? null : name,
	};
}

export async function readIdentity(): Promise<IdentityView> {
	const result = await runLedgerScript<{ uuid?: unknown; name?: unknown }>(
		"whoami",
		["--json"],
	);
	if (!result.ok) return UNKNOWN_IDENTITY;
	return viewOf(result.data);
}

/** 只要 uuid（看板行级的「是不是我的」以 skill 的 `mine` 为准，这里只备查）。 */
export async function getCurrentIdentity(
	_workspace?: LedgerWorkspace,
): Promise<string | null> {
	return (await readIdentity()).uuid;
}

/**
 * 换身份。调的是隐藏命令 `switch`（不进 SKILL.md）：它允许覆盖已有身份、不受真终端限制，
 * 正是 `init` 做不到的两件事。失败把人话抛给路由（→ 500 → 界面原地显示）。
 */
export async function switchIdentity(input: SwitchInput): Promise<IdentityView> {
	const args: string[] = ["--json"];
	if (input.action === "new") {
		args.push("--new", "--name", input.name);
	} else {
		args.push("--claim", input.uuid, "--repo", input.repo);
	}
	const result = await runLedgerScript<{ uuid?: unknown; name?: unknown }>(
		"switch",
		args,
	);
	if (!result.ok) throw new Error(result.error);
	return viewOf(result.data);
}
