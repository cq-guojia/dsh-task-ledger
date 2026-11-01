import { failureOf, runLedgerScript } from "./runner.js";

/**
 * 机器级台账目录清单（`~/.taskledger/ledgers.json`，真源在 skill 侧）。
 *
 * **写只走 skill**（`dirs --add`），插件只读 —— 将来的其它看板（网页 / APP）也照此办理，
 * 免得两套写法把同一个文件写坏（2026-11-01 用户拍板）。
 */
export interface LedgerDir {
	readonly path: string;
	readonly name: string;
	readonly hidden: boolean;
}

interface RawDir {
	readonly path?: unknown;
	readonly name?: unknown;
	readonly hidden?: unknown;
}

interface DirsPayload {
	readonly dirs?: readonly RawDir[];
	readonly added?: unknown;
	readonly reason?: unknown;
}

function parseDirs(data: DirsPayload): LedgerDir[] {
	const rows = Array.isArray(data.dirs) ? data.dirs : [];
	const out: LedgerDir[] = [];
	for (const row of rows) {
		if (typeof row?.path !== "string" || row.path === "") continue;
		out.push({
			path: row.path,
			name: typeof row.name === "string" ? row.name : "",
			hidden: row.hidden === true,
		});
	}
	return out;
}

/**
 * 读清单。skill 侧会顺手清掉失效条目（目录没了 / 已经不是台账）再返回。
 * 损坏的清单按空处理，不让「看台账」这件事失败。
 */
export async function readDirs(): Promise<LedgerDir[]> {
	const result = await runLedgerScript<DirsPayload>("dirs", ["--json"]);
	if (!result.ok) throw failureOf(result, "读台账目录清单失败：");
	return parseDirs(result.data);
}

/**
 * 登记一个目录（幂等）。不是台账根时 skill 返回 `added:false` + 原因，不算错误。
 * 返回登记后的整份清单，调用方不必再读一次。
 */
export async function addDir(
	path: string,
	name: string,
): Promise<{ readonly dirs: LedgerDir[]; readonly added: boolean; readonly reason: string }> {
	const args = ["--dir", path, "--add", "--json"];
	if (name !== "") args.push("--name", name);
	const result = await runLedgerScript<DirsPayload>("dirs", args);
	if (!result.ok) throw failureOf(result, "登记台账目录失败：");
	return {
		dirs: parseDirs(result.data),
		added: result.data.added === true,
		reason: typeof result.data.reason === "string" ? result.data.reason : "",
	};
}
