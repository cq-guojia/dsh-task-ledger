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

/** 换身份：建全新身份 / 认领某个工作区名册里已有的人 / 改自己的昵称。 */
export type SwitchInput =
	| { readonly action: "new"; readonly name: string }
	| { readonly action: "claim"; readonly uuid: string; readonly repo: string }
	| { readonly action: "rename"; readonly name: string };

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

/**
 * 改昵称的超时：要逐本台账走「取最新 → 改 → 提交 → 推送」，
 * 一本就可能几秒，十个目录轻松过一分钟 —— 绝不能吃默认的 10s。
 */
const RENAME_TIMEOUT_MS = 180_000;

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
export async function switchIdentity(
	input: SwitchInput,
): Promise<IdentityView | RenameView> {
	const args: string[] = ["--json"];
	if (input.action === "rename") {
		args.push("--rename", input.name);
	} else if (input.action === "new") {
		args.push("--new", "--name", input.name);
	} else {
		args.push("--claim", input.uuid, "--repo", input.repo);
	}
	const result = await runLedgerScript<{
		uuid?: unknown;
		name?: unknown;
		previous?: unknown;
		dirs?: unknown;
	}>("switch", args, {
		timeoutMs: input.action === "rename" ? RENAME_TIMEOUT_MS : undefined,
	});
	if (!result.ok) throw new Error(result.error);
	if (input.action === "rename") {
		const identity = viewOf(result.data);
		if (identity.uuid === null || identity.name === null)
			throw new Error("改昵称的回执里没有身份（脚本输出异常）");
		return {
			uuid: identity.uuid,
			name: identity.name,
			previous:
				typeof result.data.previous === "string" ? result.data.previous : "",
			dirs: dirsOf(result.data.dirs),
		};
	}
	return viewOf(result.data);
}

/** `dirs[]` 原样搬过来（形状不对的行直接丢掉，不编造）。 */
function dirsOf(raw: unknown): RenameDirResult[] {
	if (!Array.isArray(raw)) return [];
	const out: RenameDirResult[] = [];
	for (const row of raw) {
		if (row === null || typeof row !== "object") continue;
		const item = row as Record<string, unknown>;
		if (typeof item.dir !== "string") continue;
		const status = item.status;
		if (
			status !== "changed" &&
			status !== "commit-only" &&
			status !== "skipped" &&
			status !== "failed"
		)
			continue;
		out.push({
			dir: item.dir,
			status,
			reason: typeof item.reason === "string" ? item.reason : "",
		});
	}
	return out;
}
