/**
 * 趋势面取数：近 26 周的「完成 / 未结 / 新增」，**整段桶序列一次拿回**（skill `stats --trend`）。
 *
 * 为什么不再拼现有方法：`history` 只给明细、且按**结案时间**过滤（新增取不到）；
 * 插件侧拉全量明细再聚合已被实测否决（20 万条 3s+、30MB 过进程边界）。
 * 桶边界（周一起算 / 本机时区）与「未结 = 该周末仍未结案」的倒推算法全在 skill，
 * 本文件只做形状校验 —— 与 stats 同一条纪律：数字真源只有 skill 一份。
 *
 * 形状不符一律抛 {@link LedgerDataError}（不拿 0 充数）。
 */
import { LedgerDataError } from "../errors.js";
import type { BoardTrendGran, LedgerWorkspace } from "../types.js";
import { cached, cacheKey } from "./cache.js";
import { runLedgerScript } from "./runner.js";

/**
 * 趋势图的窗口（周数）：近半年。
 * 2026-10-30 由 8 周放宽 —— 卡片按宽度能放几周就放几周（宽屏 12~14 周），
 * 8 周不够铺满，也没得翻页；26 周 ≈ 4 屏，左右箭头一次翻 4 周。
 */
export const TREND_WEEKS = 26;

/**
 * 首页趋势图按粒度的一次取数窗口：周 26 周、日 182 天（同一段时间 ⇒ 切档不换可翻范围）。
 * skill 的 day 粒度上限是 365 桶（见 `TrendMaxDayBuckets`），182 天在线内。
 */
const TREND_LAST: Record<BoardTrendGran, string> = {
	day: `${String(TREND_WEEKS * 7)}d`,
	week: `${String(TREND_WEEKS)}w`,
};

/** 一个人在一个周桶里的三个数（skill 口径：新增按 creator、完成 / 未结按 owner）。 */
export interface OwnerCounts {
	readonly added: number;
	readonly done: number;
	readonly cancelled: number;
	readonly open: number;
}

/** 一个周桶；`from` / `to` 是**本机时区**的日期（含边界）。 */
export interface TrendBucket {
	readonly from: string;
	readonly to: string;
	/** 该周新建。 */
	readonly added: number;
	/** 该周结案（全部人合计）。 */
	readonly done: number;
	/** 该周取消（全部人合计）。 */
	readonly cancelled: number;
	/** 该周结束时仍未结案（全部人合计，含窗口前遗留）。 */
	readonly open: number;
	/** uuid → 按人明细（「只看我的」用；没要 / 该人该周没数据则没有这个 key）。 */
	readonly owners?: Readonly<Record<string, OwnerCounts>>;
}

/** 单工作区的趋势。 */
export interface WorkspaceTrend {
	readonly buckets: readonly TrendBucket[];
	/** 实际有数据的第一天（早于窗口起点则等于窗口起点）。 */
	readonly coverageFrom: string;
	readonly coverageTo: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function num(source: Record<string, unknown>, key: string, where: string): number {
	const value = source[key];
	if (typeof value !== "number" || !Number.isFinite(value))
		throw new LedgerDataError(
			where,
			`${where}: stats --trend 输出缺少数字字段 ${key}，格式可能已变`,
		);
	return value;
}

function day(source: Record<string, unknown>, key: string, where: string): string {
	const value = source[key];
	if (typeof value !== "string" || value === "")
		throw new LedgerDataError(
			where,
			`${where}: stats --trend 输出缺少日期字段 ${key}，格式可能已变`,
		);
	return value;
}

/** 按人明细：没有这个字段（没要 --by-owner）返回 undefined；有就必须是合法的三数对象。 */
function parseOwners(
	raw: unknown,
	where: string,
): Readonly<Record<string, OwnerCounts>> | undefined {
	if (raw === undefined) return undefined;
	if (!isPlainObject(raw))
		throw new LedgerDataError(
			where,
			`${where}: stats --trend 的 owners 不是对象，格式可能已变`,
		);
	const out: Record<string, OwnerCounts> = {};
	for (const [uuid, cell] of Object.entries(raw)) {
		if (!isPlainObject(cell))
			throw new LedgerDataError(
				where,
				`${where}: stats --trend 里 ${uuid} 的按人明细不是对象`,
			);
		out[uuid] = {
			added: num(cell, "added", where),
			done: num(cell, "done", where),
			cancelled: num(cell, "cancelled", where),
			open: num(cell, "open", where),
		};
	}
	return out;
}

/** 单工作区趋势（skill `stats --trend <gran> --last <N> --by-owner`；过 1.5s 读缓存）。 */
export async function readBoardTrend(
	workspace: LedgerWorkspace,
	gran: BoardTrendGran,
): Promise<WorkspaceTrend> {
	const last = TREND_LAST[gran];
	// 缓存 op 仍记 "stats"（脚本子命令就是 stats），detail 里写清是哪个窗口的趋势
	return await cached(cacheKey(workspace.id, "stats", `trend:${gran}:${last}`), async () => {
		// 趋势自带 JSON 输出，**不能**再传 --json（skill 那边是用法错）
		const result = await runLedgerScript<unknown>(
			"stats",
			// --by-owner：一次就把「全部」与「按人」两套数都拿回来 ⇒ 勾「只看我的」零请求
			["--repo", workspace.path, "--trend", gran, "--last", last, "--by-owner"],
			// 半年窗口最坏要读 7 个历史文件（skill 有月度缓存），比单月读重：给到 20s 再判超时
			{ timeoutMs: 20_000 },
		);
		if (!result.ok) throw new Error(`${workspace.title}: ${result.error}`);
		return parseTrend(result.data, workspace.title);
	});
}

/**
 * 历史页趋势的取数：`stats --trend <gran> --since --until`（明确窗口 ⇒ 不受
 * day 粒度 365 桶上限的 --last 换算影响）。桶的切分 / 新增口径 / 补空桶全在 skill
 * （用户 2026-10-30 定：聚合算法不自己写，host 只做跨工作区求和）。
 */
export async function readTrendGran(
	workspace: LedgerWorkspace,
	gran: "day" | "week" | "month",
	since: string,
	until: string,
): Promise<WorkspaceTrend> {
	return await cached(
		cacheKey(workspace.id, "stats", `trend:${gran}:${since}:${until}`),
		async () => {
			const result = await runLedgerScript<unknown>(
				"stats",
				["--repo", workspace.path, "--trend", gran, "--since", since, "--until", until],
				// 与周趋势同档：整年窗口最坏要读十几个历史文件
				{ timeoutMs: 20_000 },
			);
			if (!result.ok) throw new Error(`${workspace.title}: ${result.error}`);
			return parseTrend(result.data, workspace.title);
		},
	);
}

/** `stats --trend` → {@link WorkspaceTrend}（容器级严格：缺字段即坏，不当 0）。 */
export function parseTrend(raw: unknown, where: string): WorkspaceTrend {
	if (!isPlainObject(raw))
		throw new LedgerDataError(
			where,
			`${where}: stats --trend 输出不是对象，格式可能已变`,
		);
	const coverage = raw.coverage;
	if (!isPlainObject(coverage))
		throw new LedgerDataError(
			where,
			`${where}: stats --trend 输出缺 coverage，无法判断数据从哪天起有效`,
		);
	if (!Array.isArray(raw.buckets))
		throw new LedgerDataError(
			where,
			`${where}: stats --trend 输出缺 buckets 数组，格式可能已变`,
		);
	const buckets: TrendBucket[] = raw.buckets.map((item: unknown) => {
		if (!isPlainObject(item))
			throw new LedgerDataError(where, `${where}: stats --trend 的桶不是对象`);
		const owners = parseOwners(item.owners, where);
		return {
			from: day(item, "from", where),
			to: day(item, "to", where),
			added: num(item, "added", where),
			done: num(item, "done", where),
			cancelled: num(item, "cancelled", where),
			open: num(item, "open", where),
			...(owners === undefined ? {} : { owners }),
		};
	});
	return {
		buckets,
		coverageFrom: day(coverage, "from", where),
		coverageTo: day(coverage, "to", where),
	};
}
