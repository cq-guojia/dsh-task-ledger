/**
 * 列表视图的筛选 / 分区 / 排序（**唯一**实现，纯函数、不碰网络）：页面只渲染，不各写一份过滤。
 * 定稿见 docs/design/features/board-home.md §二.3：两区结构（我的待办平铺 / 按工作区分组），
 * 已结案**不在首页**（去统计 tab）。
 *
 * 单独成文件是为了能被冒烟直测（store.ts 引 api.ts，Node 剥类型解析不了无扩展名相对导入）。
 */

import type { Query } from "./store";
import type { BoardPayload, BoardTask, HistoryRecord } from "./types";

/** 列表行：在办与已结案两套形状，行件按 kind 分支（不做「统一成一个假结构」的归一化）。 */
export type Row =
	| { kind: "task"; key: string; task: BoardTask; mine: boolean }
	| { kind: "closed"; key: string; record: HistoryRecord };

/**
 * 界面上显示人名的**唯一**口径：显示名（`owner_name` / `creator_name`）优先，
 * 旧数据 / 名册里没名字才退回 uuid。**只用于显示与搜索** —— 归属判定一律比 uuid（见 `isMine`）。
 */
export function displayName(
	name: string | null | undefined,
	uuid: string | null | undefined,
): string {
	const label = (name ?? "").trim();
	return label !== "" ? label : (uuid ?? "").trim();
}

/** 一个工作区分组（计数口径：待认领 / 进行中 / 积压 / 逾期 / 停滞 / 总，供「全部待办」段头统计）。 */
export interface WorkspaceGroup {
	readonly workspaceId: string;
	readonly title: string;
	readonly doingCount: number;
	readonly overdueCount: number;
	readonly staleCount: number;
	readonly backlogCount: number;
	readonly openCount: number;
	readonly total: number;
	readonly rows: readonly Row[];
}

/** 两区视图：第一区我的待办 + 第二区按工作区分组（第二区含全部任务，会与第一区重叠——用户 2026-10-18 要「全部待办」）。 */
export interface BoardView {
	readonly mine: readonly Row[];
	readonly groups: readonly WorkspaceGroup[];
	/** 第二区（全部待办）任务数。 */
	readonly total: number;
	/** 第二区全量计数（**不受状态过滤影响**，供 segmented 角标；异常标记相互独立；含我的）。 */
	readonly allCounts: {
		readonly total: number;
		readonly doing: number;
		readonly open: number;
		readonly overdue: number;
		readonly stale: number;
		readonly backlog: number;
	};
}

/** 关键字命中（标题 / 任务号 / 人 / 分类 / 标签；已结案另含「完成了什么」）。 */
function hitKeyword(
	keyword: string,
	parts: readonly (string | null | undefined)[],
): boolean {
	const needle = keyword.trim().toLowerCase();
	if (needle === "") return true;
	return parts.some((part) => part?.toLowerCase().includes(needle) === true);
}

/** uuid 比较：两边都 trim + 小写（身份键不分大小写，与脚本 `normalize` 同口径）。 */
export function sameUuid(
	a: string | null | undefined,
	b: string | null | undefined,
): boolean {
	const left = (a ?? "").trim().toLowerCase();
	const right = (b ?? "").trim().toLowerCase();
	return left !== "" && left === right;
}

/** 「我的」判定：owner = 本机身份 uuid，且状态是进行中（blocked 是旧数据，照收；与 host 同口径）。 */
export function isMine(task: BoardTask, board: BoardPayload | null): boolean {
	if (board === null) return false;
	const identity = board.identities[task.workspace.id] ?? null;
	if (identity === null || identity === "") return false;
	return (
		sameUuid(task.owner, identity) &&
		(task.status === "doing" || task.status === "blocked")
	);
}

/**
 * 任务动作权限（**唯一**判定，两区共用——用户 2026-10-18：不许各判各的）。
 * 传任务 + 快照进去，返回「能做哪些动作」；界面只按返回值画按钮，不再自己判断是不是我的。
 * ⇒ 第二区（全部待办）里**我的**任务也能继续 / 结束 / 释放，跟第一区一模一样。
 */
export interface TaskActions {
	/** 查看详情（两区、所有任务都有）。 */
	readonly view: boolean;
	/** 认领：只有**没人认领**（待认领）的任务能认领。 */
	readonly claim: boolean;
	readonly resume: boolean;
	readonly finish: boolean;
	readonly release: boolean;
}

export function resolveActions(
	task: BoardTask,
	board: BoardPayload | null,
): TaskActions {
	const mine = isMine(task, board);
	return {
		view: true,
		claim: !mine && task.status === "open",
		resume: mine,
		finish: mine,
		release: mine,
	};
}

/** 已结案行（统计 tab）：只有查看，没有在办动作。 */
export const CLOSED_ACTIONS: TaskActions = {
	view: true,
	claim: false,
	resume: false,
	finish: false,
	release: false,
};

/** 状态档命中（积压 / 逾期 / 停滞由 host 标记，前端不判阈值）——只作用于第二区。 */
function statusHit(task: BoardTask, status: Query["status"]): boolean {
	if (status === "all") return true;
	if (status === "active")
		return task.status === "doing" || task.status === "blocked";
	if (status === "open") return task.status === "open";
	if (status === "backlog") return task.backlog === true;
	if (status === "overdue") return task.overdue === true;
	return task.stale === true;
}

/** 组内排序：别人的进行中在前、待认领在后；各自按创建 / 开始时间倒序。 */
function inGroupOrder(a: Row, b: Row): number {
	if (a.kind !== "task" || b.kind !== "task") return 0;
	const rank = (task: BoardTask): number => (task.status === "open" ? 1 : 0);
	if (rank(a.task) !== rank(b.task)) return rank(a.task) - rank(b.task);
	return String(b.task.created ?? b.task.started ?? "").localeCompare(
		String(a.task.created ?? a.task.started ?? ""),
	);
}

/**
 * 当前筛选下的两区视图（用户 2026-10-18 调整）：
 *  - 第一区「我的待办」= 我名下 doing/blocked，吃工作区下拉 + 标题搜索，按创建时间倒序；
 *  - 第二区「全部待办」= **所有**在办任务按工作区分组（含我的——用户明确不要过滤掉自己），
 *    吃**状态档**（segmented）+ **标题 / 执行人搜索**（othersKeyword）；一个整表（外框连着）。
 *    ⇒ 我的任务会同时出现在两个区，这是预期（顶部快看 / 底部全量）。
 */
export function selectView(current: {
	board: BoardPayload | null;
	query: Query;
}): BoardView {
	const { board, query } = current;
	if (board === null) {
		return {
			mine: [],
			groups: [],
			total: 0,
			allCounts: {
				total: 0,
				doing: 0,
				open: 0,
				overdue: 0,
				stale: 0,
				backlog: 0,
			},
		};
	}
	const allTasks = board.tasks;
	const allCounts = {
		total: allTasks.length,
		doing: allTasks.filter((task) => task.status === "doing").length,
		open: allTasks.filter((task) => task.status === "open").length,
		overdue: allTasks.filter((task) => task.overdue === true).length,
		stale: allTasks.filter((task) => task.stale === true).length,
		backlog: allTasks.filter((task) => task.backlog === true).length,
	};
	const mineRows: Row[] = board.tasks
		.filter((task) => isMine(task, board))
		.filter(
			(task) => query.workspace === "" || task.workspace.id === query.workspace,
		)
		.filter((task) =>
			hitKeyword(query.keyword, [
				task.title,
				task.id,
				// 搜的是**人名**：uuid 是机器键，人不会拿它搜
				displayName(task.owner_name, task.owner),
				displayName(task.creator_name, task.creator),
				task.category,
				...(task.tags ?? []),
			]),
		)
		.sort((a, b) =>
			String(b.created ?? b.started ?? "").localeCompare(
				String(a.created ?? a.started ?? ""),
			),
		)
		.map(
			(task): Row => ({
				kind: "task",
				key: `${task.workspace.id}:${task.id}`,
				task,
				mine: true,
			}),
		);
	const rest =
		query.scope === "mine"
			? []
			: board.tasks
					.filter((task) => statusHit(task, query.status))
					.filter((task) =>
						hitKeyword(query.othersKeyword, [
							task.title,
							displayName(task.owner_name, task.owner),
						]),
					);
	const byWorkspace = new Map<string, { title: string; rows: Row[] }>();
	for (const task of rest) {
		const entry = byWorkspace.get(task.workspace.id) ?? {
			title: task.workspace.title,
			rows: [],
		};
		// mine 必须说实话（第二区现在含全部任务，连我的也在里面）：按钮权限由 resolveActions 判，
		// 但这一位同样是数据面，不许一律写 false。
		entry.rows.push({
			kind: "task",
			key: `${task.workspace.id}:${task.id}`,
			task,
			mine: isMine(task, board),
		});
		byWorkspace.set(task.workspace.id, entry);
	}
	const groups: WorkspaceGroup[] = [...byWorkspace.entries()]
		.map(([workspaceId, entry]) => ({
			workspaceId,
			title: entry.title,
			doingCount: entry.rows.filter(
				(row) => row.kind === "task" && row.task.status === "doing",
			).length,
			overdueCount: entry.rows.filter(
				(row) => row.kind === "task" && row.task.overdue === true,
			).length,
			staleCount: entry.rows.filter(
				(row) => row.kind === "task" && row.task.stale === true,
			).length,
			backlogCount: entry.rows.filter(
				(row) => row.kind === "task" && row.task.backlog === true,
			).length,
			openCount: entry.rows.filter(
				(row) => row.kind === "task" && row.task.status === "open",
			).length,
			total: entry.rows.length,
			rows: entry.rows.sort(inGroupOrder),
		}))
		.sort((a, b) => a.title.localeCompare(b.title, "zh-Hans-CN"));
	return {
		mine: mineRows,
		groups,
		total: groups.reduce((sum, group) => sum + group.rows.length, 0),
		allCounts,
	};
}

/**
 * 已结案列表（统计 tab 用；首页不渲染已结案 ⇒ 这里只留数据面，供后续统计 tab 复用同一套筛选口径）。
 */
export function selectClosed(current: {
	history: readonly HistoryRecord[];
	query: Query;
}): Row[] {
	return current.history
		.filter((record) =>
			hitKeyword(current.query.keyword, [
				record.summary,
				record.workpackage,
				displayName(record.owner_name, record.owner),
				record.category,
				...(record.tags ?? []),
			]),
		)
		.map((record, index) => ({
			kind: "closed",
			key: `${record.src ?? ""}:${record.time ?? ""}:${index}`,
			record,
		}));
}
