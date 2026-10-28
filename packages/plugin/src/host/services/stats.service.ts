/**
 * 8 个统计卡的用例（首屏唯一端点 `/board/stats`）。
 *
 * 数字真源全在 skill：每工作区跑 `stats --json`（在办各面）与两次
 * `history --count-only`（本周 / 上周完成），本文件只做跨工作区求和与降级归集。
 * 趋势图（近 8 周）没有 skill 方法，本轮不提供数据。
 */
import {
	type DegradedInfo,
	codeOf,
	messageOf,
	settleWorkspaces,
} from "../errors.js";
import { getCurrentIdentity } from "../repositories/identity.repository.js";
import { readOwners, readTasks } from "../repositories/ledger.repository.js";
import {
	countClosed,
	readStats,
	type WorkspaceStats,
} from "../repositories/stats.repository.js";
import type {
	BoardHomePayload,
	BoardStatsView,
	LedgerWorkspace,
	StatsPayload,
	TaskRow,
} from "../types.js";
import { weekWindow } from "./dates.js";

interface WeekCounts {
	/** 全部工作区合计数；一个都读不到为 null（界面留 —）。 */
	readonly done: number | null;
	readonly degraded: readonly DegradedInfo[];
}

/**
 * 一个自然周的结案数（跨工作区求和）。
 * 部分工作区失败 ⇒ 数字偏小，degraded 会带出去（界面标红，不装没看见）。
 */
async function countWeek(
	workspaces: readonly LedgerWorkspace[],
	window: { readonly from: string; readonly to: string },
): Promise<WeekCounts> {
	const settled = await Promise.allSettled(
		workspaces.map((workspace) => countClosed(workspace, window)),
	);
	let done = 0;
	let ok = 0;
	const degraded: DegradedInfo[] = [];
	settled.forEach((result, i) => {
		if (result.status === "fulfilled") {
			done += result.value.count;
			ok += 1;
			return;
		}
		const workspace = workspaces[i];
		degraded.push({
			workspaceId: workspace.id,
			workspaceTitle: workspace.title,
			op: "history",
			code: codeOf(result.reason),
			message: messageOf(result.reason),
		});
	});
	return { done: ok === 0 && workspaces.length > 0 ? null : done, degraded };
}

interface TaskScope {
	readonly workspace: LedgerWorkspace;
	readonly tasks: readonly TaskRow[];
	readonly identity: string | null;
}

/** 单工作区在办列表 + 本机身份（都经 skill：`list --json` / `whoami --json`）。 */
async function readTaskScope(workspace: LedgerWorkspace): Promise<TaskScope> {
	const [tasks, identity] = await Promise.all([
		readTasks(workspace),
		getCurrentIdentity(workspace),
	]);
	return { workspace, tasks, identity };
}

/** 降级条目去重：stats 与 list 都挂时同一个工作区会报两遍。 */
function dedupe(rows: readonly DegradedInfo[]): DegradedInfo[] {
	const seen = new Set<string>();
	return rows.filter((row) => {
		const key = `${row.workspaceId}\u0001${row.code}\u0001${row.message}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/**
 * 首屏一次拿全：8 卡 + 在办列表 + 工作区 + 身份 + 各工作区花名册。
 * 三条读并行（`stats` / `list` / `owners`），各自缓存；一个工作区坏只进 degraded，其余照常。
 */
export async function getBoardHome(
	workspaces: readonly LedgerWorkspace[],
	now: Date = new Date(),
): Promise<BoardHomePayload> {
	const [statsPayload, taskScope, ownerScope] = await Promise.all([
		getBoardStats(workspaces, now),
		settleWorkspaces(workspaces, "list", readTaskScope, (rows) => rows),
		settleWorkspaces(workspaces, "owners", readOwners, (rows) => rows),
	]);
	const identities: Record<string, string | null> = {};
	const tasks: TaskRow[] = [];
	for (const scope of taskScope.data) {
		identities[scope.workspace.id] = scope.identity;
		tasks.push(...scope.tasks);
	}
	return {
		...statsPayload,
		workspaces,
		tasks,
		identities,
		workspaceOwners: ownerScope.data,
		degraded: dedupe([
			...statsPayload.degraded,
			...taskScope.degraded,
			...ownerScope.degraded,
		]),
	};
}

export async function getBoardStats(
	workspaces: readonly LedgerWorkspace[],
	now: Date = new Date(),
): Promise<StatsPayload> {
	const thisWeek = weekWindow(0, now);
	const lastWeek = weekWindow(-1, now);
	const [perWorkspace, thisWeekCounts, lastWeekCounts] = await Promise.all([
		settleWorkspaces(workspaces, "list", readStats, (rows) => rows),
		countWeek(workspaces, thisWeek),
		countWeek(workspaces, lastWeek),
	]);
	const sum = (pick: (stats: WorkspaceStats) => number): number =>
		perWorkspace.data.reduce((total, stats) => total + pick(stats), 0);
	// 阈值由 skill 回显；没传过覆盖值 ⇒ 各工作区一致，取首个即可。
	// 一个工作区都没有时给 0——那时所有计数也是 0，阈值文案没有实际含义。
	const first = perWorkspace.data[0];
	const stats: BoardStatsView = {
		myActive: sum((item) => item.myDoing),
		myOverdue: sum((item) => item.myOverdue),
		myStale: sum((item) => item.myStale),
		open: sum((item) => item.open),
		doing: sum((item) => item.doing),
		overdue: sum((item) => item.overdue),
		stale: sum((item) => item.stale),
		backlog: sum((item) => item.backlog),
		staleDays: first?.staleDays ?? 0,
		overdueDays: first?.overdueDays ?? 0,
		backlogDays: first?.backlogDays ?? 0,
		oldestOpenDays:
			perWorkspace.data.length === 0
				? null
				: perWorkspace.data.reduce<number | null>(
						(max, item) =>
							item.oldestOpenDays === null
								? max
								: max === null
									? item.oldestOpenDays
									: Math.max(max, item.oldestOpenDays),
						null,
					),
		weekDone: thisWeekCounts.done,
		lastWeekDone: lastWeekCounts.done,
		weekFrom: thisWeek.from,
		weekTo: thisWeek.to,
		lastWeekFrom: lastWeek.from,
		lastWeekTo: lastWeek.to,
	};
	return {
		at: now.toISOString(),
		stats,
		degraded: [
			...perWorkspace.degraded,
			...thisWeekCounts.degraded,
			...lastWeekCounts.degraded,
		],
	};
}
