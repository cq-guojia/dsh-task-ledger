import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
	HistoryRecord,
	LedgerFilter,
	LedgerWorkspace,
	TaskRow,
} from "../types.js";
import { cached, cacheKey } from "./cache.js";
import { parseHistoryRecords, parseTaskList } from "./records.js";
import { runLedgerScript } from "./runner.js";

/** 台账目录名（各工作区根下的这一个目录；布局知识只在本文件出现一次）。 */
const LEDGER_DIR = "ledger";

/**
 * LedgerFilter → skill 脚本参数（只拼调用方给了的；undefined 一律不拼，
 * 让脚本走自己的默认——插件不替脚本决定默认值）。
 *
 * **按子命令裁参数**：`list` 不认 `--limit` / `--months`，`history` 不认 `--status`，
 * 拼错一个就让 argparse 退 2、整块列表 500。口径以 `skill/shell/cli.py` 为准。
 */
export function filterArgs(
	filter: LedgerFilter,
	sub: "list" | "history",
): string[] {
	const args: string[] = [];
	if (sub === "list" && filter.status !== undefined)
		args.push("--status", filter.status);
	// 身份只收 uuid（脚本同样口径）；按名字模糊筛走 --owner-name
	if (filter.owner !== undefined) args.push("--owner", filter.owner);
	if (filter.ownerName !== undefined)
		args.push("--owner-name", filter.ownerName);
	if (filter.category !== undefined) args.push("--category", filter.category);
	if (filter.tag !== undefined) args.push("--tag", filter.tag);
	if (filter.since !== undefined) args.push("--since", filter.since);
	if (filter.until !== undefined) args.push("--until", filter.until);
	if (sub === "history") {
		if (filter.limit !== undefined) args.push("--limit", String(filter.limit));
		if (filter.months !== undefined)
			args.push("--months", String(filter.months));
	}
	return args;
}

/**
 * 台账工作区探测：`<path>/ledger/pool.json` 在才算（分片布局的初始化标志；
 * 未初始化 = 后端不可见，2026-10-17 拍板）。全 host 对台账目录的 IO 只在本文件
 * ——别处再写 existsSync 即为分层倒退。
 */
export function hasLedger(workspacePath: string): boolean {
	// 分片布局（2026-10-23）：公共池 pool.json 在才算初始化；各人分片 owners/*.json 由脚本维护。
	return existsSync(path.join(workspacePath, LEDGER_DIR, "pool.json"));
}

/**
 * 在办任务（包 `list --json`；结果过 records 入口校验后打上 workspace）。
 * 脚本失败 / 形状不符抛错——由 service 层捕获进 degraded，路由层转 500 + 人话，
 * 不静默返空（空 = 撒谎）。**过 1.5s 读缓存**（同屏多端点会反复读同一份在办）。
 */
export async function readTasks(
	workspace: LedgerWorkspace,
	filter: LedgerFilter = {},
): Promise<TaskRow[]> {
	return await cached(
		cacheKey(workspace.id, "list", argsKey(filter, "list")),
		async () => {
			const result = await runLedgerScript<unknown>("list", [
				"--repo",
				workspace.path,
				"--json",
				...filterArgs(filter, "list"),
			]);
			if (!result.ok) throw new Error(`${workspace.title}: ${result.error}`);
			return parseTaskList(result.data, workspace);
		},
	);
}

/** 已结案记录（包 `history --json`；`records` 必须存在且为数组，缺了即坏数据）。同样过读缓存。 */
export async function readHistory(
	workspace: LedgerWorkspace,
	filter: LedgerFilter = {},
): Promise<HistoryRecord[]> {
	return await cached(
		cacheKey(workspace.id, "history", argsKey(filter, "history")),
		async () => {
			const result = await runLedgerScript<unknown>("history", [
				"--repo",
				workspace.path,
				"--json",
				...filterArgs(filter, "history"),
			]);
			if (!result.ok) throw new Error(`${workspace.title}: ${result.error}`);
			return parseHistoryRecords(result.data, workspace);
		},
	);
}

/** 缓存键的 filter 段：脚本参数原样序列化（分隔符取不可见字符，值里带空格也不会串）。 */
function argsKey(filter: LedgerFilter, sub: "list" | "history"): string {
	return filterArgs(filter, sub).join("\u0001");
}

/** 单条在办（展开行 / 详情用）。取不到回 null，不抛。 */
export async function getTask(
	workspace: LedgerWorkspace,
	taskId: string,
): Promise<TaskRow | null> {
	const rows = await readTasks(workspace);
	return rows.find((row) => row.id === taskId) ?? null;
}

/**
 * 过程文档正文（`task.worklog` 相对 `ledger/` 的路径）。
 * 读不到回 null（文件被清 / 路径坏都不炸——由调用方展示「过程文档缺失」）。
 */
export async function readWorklog(
	workspace: LedgerWorkspace,
	task: TaskRow,
): Promise<string | null> {
	const relative = task.worklog;
	if (relative === undefined || relative === null || relative === "")
		return null;
	try {
		return await readFile(
			path.join(workspace.path, LEDGER_DIR, relative),
			"utf-8",
		);
	} catch {
		return null;
	}
}
