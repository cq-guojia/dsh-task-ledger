/**
 * 首页**慢路径**用例：近 8 周趋势 + 四个自然周期。
 * 读 history（months=RECENT_MONTHS）+ 在办 + 本机身份——首屏不等它（异步/按需拉）。
 *
 * ⚠️ 窗口必须是 13 个月而不是 2：8 周桶在月初会横跨 3 个自然月（如 10 月第 1 周回溯到 8 月），
 * `--months` 是**文件级**过滤，缩到 2 会静默漏掉 8 月结案记录、趋势少算（2026-10-18 架构评审结论）。
 */

import { type DegradedInfo, settleWorkspaces } from "../errors.js";
import { sameUuid } from "./uuid.js";
import { getCurrentIdentity } from "../repositories/identity.repository.js";
import { readHistory, readTasks } from "../repositories/ledger.repository.js";
import type {
	ClosedSummary,
	HistoryRecord,
	LedgerFilter,
	LedgerWorkspace,
	TrendPeriods,
	TrendScope,
	WeeklyBucket,
} from "../types.js";
import {
	buildWeeks,
	dayOf,
	inWindow,
	mondayOf,
	monthWindow,
	weekWindow,
	ymd,
} from "./dates.js";

/** 历史窗口：只读最近 13 个月的文件（2026-10-17 拍板；脚本默认读全部，窗口由插件显式传）。 */
export const RECENT_MONTHS = 13;

/** 趋势图桶数：近 8 周（2026-10-17 定稿）。 */
export const WEEKLY_WEEKS = 8;

/** 慢路径读法：单工作区 readTasks + readHistory(months) + 本机身份（并行；供 settle 逐工作区调）。 */
export async function readTrendScope(
	workspace: LedgerWorkspace,
): Promise<TrendScope> {
	const [tasks, history, identity] = await Promise.all([
		readTasks(workspace),
		readHistory(workspace, { months: RECENT_MONTHS }),
		getCurrentIdentity(workspace),
	]);
	return { workspace, tasks, history, identity };
}

interface Buckets {
	done: number;
	created: number;
	remaining: number;
}

/**
 * 近 N 周分组桶（完成按结案时间、新增按创建时间）× 所有 / 我的（纯函数）。
 *
 * 新增必须**合并两个来源**：已结案的任务被 close 移出 progress.json，只在 history 里；
 * 在办的只在 progress.json 里。两者不相交（close 是移动），合并即全集、不会重复计。
 * remaining：某任务在「第 i 周截止时」仍未完成 ⇔ 创建 ≤ weekEnd_i 且（未结案 或 结案 > weekEnd_i）。
 */
export function computeClosedSummary(
	scopes: readonly TrendScope[],
	now: Date,
): ClosedSummary {
	const weeks = buildWeeks(WEEKLY_WEEKS, now);
	const weekEnds = weeks.map((slot) => slot.end);
	const make = (): Map<string, Buckets> =>
		new Map(
			weeks.map((slot) => [slot.week, { done: 0, created: 0, remaining: 0 }]),
		);
	const bucketsAll = make();
	const bucketsMine = make();
	const bump = (
		map: Map<string, Buckets>,
		week: string,
		field: "done" | "created",
	): void => {
		const bucket = map.get(week);
		if (bucket !== undefined)
			map.set(week, { ...bucket, [field]: bucket[field] + 1 });
	};
	const bumpRemaining = (
		map: Map<string, Buckets>,
		createdDay: string | null,
		closeDay: string | null,
	): void => {
		if (createdDay === null) return;
		for (let i = 0; i < weeks.length; i += 1) {
			if (
				createdDay <= weekEnds[i] &&
				(closeDay === null || closeDay > weekEnds[i])
			) {
				const bucket = map.get(weeks[i].week);
				if (bucket !== undefined) bucket.remaining += 1;
			}
		}
	};
	for (const scope of scopes) {
		const identity = scope.identity;
		for (const task of scope.tasks) {
			const created = dayOf(task.created);
			if (created === null) continue;
			const week = ymd(mondayOf(created));
			const createdMine = sameUuid(task.creator, identity);
			bump(bucketsAll, week, "created");
			if (createdMine) bump(bucketsMine, week, "created");
			const ownedMine = sameUuid(task.owner, identity);
			bumpRemaining(bucketsAll, created, null);
			if (ownedMine) bumpRemaining(bucketsMine, created, null);
		}
		for (const record of scope.history) {
			const closed = dayOf(record.time);
			if (closed !== null) {
				const week = ymd(mondayOf(closed));
				bump(bucketsAll, week, "done");
				if (sameUuid(record.owner, identity)) bump(bucketsMine, week, "done");
			}
			const created = dayOf(record.created);
			if (created !== null) {
				const week = ymd(mondayOf(created));
				bump(bucketsAll, week, "created");
				// 新增（我的）= 我创建的（creator）；旧 8 列历史无 creator 列 ⇒ 兜底 owner
				const createdMine =
					sameUuid(record.creator, identity) ||
					((record.creator ?? null) === null && sameUuid(record.owner, identity));
				if (createdMine) bump(bucketsMine, week, "created");
			}
			const ownedMine = sameUuid(record.owner, identity);
			bumpRemaining(bucketsAll, created, closed);
			if (ownedMine) bumpRemaining(bucketsMine, created, closed);
		}
	}
	const toBuckets = (map: Map<string, Buckets>): readonly WeeklyBucket[] =>
		weeks.map((slot, i) => ({
			week: slot.week,
			end: weekEnds[i],
			...(map.get(slot.week) ?? { done: 0, created: 0, remaining: 0 }),
		}));
	return {
		weekly: { all: toBuckets(bucketsAll), mine: toBuckets(bucketsMine) },
	};
}

/** 四个自然周期（只算「全部工作区」范围；图表切换不带动卡片）——纯函数。 */
export function computeTrendPeriods(
	scopes: readonly TrendScope[],
	now: Date,
): TrendPeriods {
	const windows = {
		thisWeek: weekWindow(0, now),
		lastWeek: weekWindow(-1, now),
		thisMonth: monthWindow(0, now),
		lastMonth: monthWindow(-1, now),
	};
	const doneEntries = scopes.flatMap((scope) =>
		scope.history.map((record) => ({
			day: dayOf(record.time),
			owner: record.owner ?? null,
		})),
	);
	const createdEntries = scopes.flatMap((scope) => [
		...scope.tasks.map((task) => ({
			day: dayOf(task.created),
			owner: task.owner ?? null,
		})),
		...scope.history.map((record: HistoryRecord) => ({
			day: dayOf(record.created),
			owner: record.owner ?? null,
		})),
	]);
	const period = (window: { from: string; to: string }) => ({
		done: doneEntries.filter((entry) => inWindow(entry.day, window)).length,
		created: createdEntries.filter((entry) => inWindow(entry.day, window))
			.length,
		from: window.from,
		to: window.to,
	});
	return {
		thisWeek: period(windows.thisWeek),
		lastWeek: period(windows.lastWeek),
		thisMonth: period(windows.thisMonth),
		lastMonth: period(windows.lastMonth),
	};
}

/** 慢路径端点：趋势 + 周期（读 history）。异步加载，首屏不等。单工作区坏 ⇒ 进 degraded。 */
export async function getTrend(
	workspaces: readonly LedgerWorkspace[],
): Promise<{
	closed: ClosedSummary;
	trend: TrendPeriods;
	degraded: readonly DegradedInfo[];
}> {
	const now = new Date();
	const { data: scopes, degraded } = await settleWorkspaces(
		workspaces,
		"history",
		readTrendScope,
		(rows) => rows,
	);
	return {
		closed: computeClosedSummary(scopes, now),
		trend: computeTrendPeriods(scopes, now),
		degraded,
	};
}

/** 趋势端点用的历史 filter（窗口由本模块策略决定，repository 零默认值注入）。 */
export function trendHistoryFilter(extra: LedgerFilter = {}): LedgerFilter {
	return { months: RECENT_MONTHS, ...extra };
}
