/**
 * 首页趋势图的用例：跨工作区把「近 26 周」的桶**按周求和**。
 *
 * 数字真源全在 skill（每工作区 `stats --trend week --last 26w`），本文件只做两件事：
 * 按 `from` 把各工作区同周的数加在一起、把读挂的工作区归进 `degraded`。
 *
 * ⚠️ 这里**不抛**「全部失败」：趋势只是首页的一块图，不能因为它把 8 张卡和列表一起打成 500。
 * 全挂时返回空桶 + inherited degraded，界面显示空态（真源口径见 errors.ts 的 settleWorkspaces 注释）。
 */
import { type DegradedInfo, codeOf, messageOf } from "../errors.js";
import { readBoardTrend, type TrendBucket } from "../repositories/trend.repository.js";
import type { BoardTrendGran, LedgerWorkspace, TrendPayload, TrendView } from "../types.js";

const byFrom = (a: TrendBucket, b: TrendBucket): number =>
	a.from < b.from ? -1 : a.from > b.from ? 1 : 0;

/**
 * 跨工作区求和：同一天起止的周桶相加。
 * 工作区之间周界一致（同机同时区、都由 skill 的周一起算），所以直接按 `from` 归并。
 */
export function mergeTrend(rows: readonly { buckets: readonly TrendBucket[]; coverageFrom: string; coverageTo: string }[]): TrendView {
	interface Acc {
		from: string;
		to: string;
		added: number;
		done: number;
		cancelled: number;
		open: number;
		owners: Record<string, { added: number; done: number; cancelled: number; open: number }>;
	}
	const merged = new Map<string, Acc>();
	let coverageFrom = "";
	let coverageTo = "";
	for (const row of rows) {
		for (const bucket of row.buckets) {
			let current = merged.get(bucket.from);
			if (current === undefined) {
				current = {
					from: bucket.from,
					to: bucket.to,
					added: 0,
					done: 0,
					cancelled: 0,
					open: 0,
					owners: {},
				};
				merged.set(bucket.from, current);
			}
			// 已有对象就原地累加（同一份数据只在本函数里生成，不会被外部共享）
			current.added += bucket.added;
			current.done += bucket.done;
			current.cancelled += bucket.cancelled;
			current.open += bucket.open;
			for (const [uuid, cell] of Object.entries(bucket.owners ?? {})) {
				const owner = current.owners[uuid] ?? { added: 0, done: 0, cancelled: 0, open: 0 };
				current.owners[uuid] = {
					added: owner.added + cell.added,
					done: owner.done + cell.done,
					cancelled: owner.cancelled + cell.cancelled,
					open: owner.open + cell.open,
				};
			}
		}
		// 有数据的第一天取各工作区里最早的；最后一天取最晚的
		if (row.coverageFrom !== "") {
			if (coverageFrom === "" || row.coverageFrom < coverageFrom) coverageFrom = row.coverageFrom;
		}
		if (row.coverageTo !== "" && row.coverageTo > coverageTo) coverageTo = row.coverageTo;
	}
	return {
		buckets: [...merged.values()].sort(byFrom),
		coverageFrom,
		coverageTo,
	};
}

/** 趋势图数据：逐工作区读、坏的进 degraded，全挂给空桶（不抛）。 */
export async function getBoardTrendGran(
	workspaces: readonly LedgerWorkspace[],
	gran: BoardTrendGran,
): Promise<TrendPayload> {
	const settled = await Promise.allSettled(
		workspaces.map((workspace) => readBoardTrend(workspace, gran)),
	);
	const rows: Awaited<ReturnType<typeof readBoardTrend>>[] = [];
	const degraded: DegradedInfo[] = [];
	settled.forEach((result, i) => {
		if (result.status === "fulfilled") {
			rows.push(result.value);
			return;
		}
		const workspace = workspaces[i];
		degraded.push({
			workspaceId: workspace.id,
			workspaceTitle: workspace.title,
			op: "trend",
			code: codeOf(result.reason),
			message: messageOf(result.reason),
		});
	});
	return { ...mergeTrend(rows), degraded };
}
