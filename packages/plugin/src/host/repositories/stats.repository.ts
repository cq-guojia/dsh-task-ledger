/**
 * 统计面取数：8 个卡片的数字**全部**来自 skill 方法，插件不自己数。
 *
 * - 在办各面（待认领 / 进行中 / 积压 / 逾期 / 停滞 / 我的）→ `stats --json`；
 *   阈值、mine 判定、最老待认领天数都由 skill 算好回显。
 * - 本周 / 上周完成 → `history --count-only`（结案时间落在区间内；区间界线由插件算，日期窗口归插件）。
 *
 * 形状不符一律抛 {@link LedgerDataError}（不拿 0 充数）。
 */
import { LedgerDataError } from "../errors.js";
import type { LedgerWorkspace } from "../types.js";
import { cached, cacheKey } from "./cache.js";
import { runLedgerScript } from "./runner.js";

/** `stats --json` 的领域投影（只收界面用到的面）。 */
export interface WorkspaceStats {
	readonly total: number;
	readonly open: number;
	readonly doing: number;
	readonly stale: number;
	readonly overdue: number;
	readonly backlog: number;
	readonly mine: number;
	readonly myDoing: number;
	readonly myStale: number;
	readonly myOverdue: number;
	readonly oldestOpenDays: number | null;
	readonly staleDays: number;
	readonly overdueDays: number;
	readonly backlogDays: number;
}

/** 一个时间窗口内的结案数（`history --count-only`）。 */
export interface ClosedCount {
	readonly count: number;
	/** count 到了 skill 的封顶（10000）⇒ 真实值只多不少。 */
	readonly capped: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function num(source: Record<string, unknown>, key: string, where: string): number {
	const value = source[key];
	if (typeof value !== "number" || !Number.isFinite(value))
		throw new LedgerDataError(
			where,
			`${where}: stats 输出缺少数字字段 ${key}，格式可能已变`,
		);
	return value;
}

/** 单工作区在办统计（skill `stats --json`；过 1.5s 读缓存，同屏多端点复用）。 */
export async function readStats(
	workspace: LedgerWorkspace,
): Promise<WorkspaceStats> {
	return await cached(cacheKey(workspace.id, "stats", ""), async () => {
		const result = await runLedgerScript<unknown>("stats", [
			"--repo",
			workspace.path,
			"--json",
		]);
		if (!result.ok) throw new Error(`${workspace.title}: ${result.error}`);
		return parseStats(result.data, workspace.title);
	});
}

/** `stats --json` → {@link WorkspaceStats}（容器级严格：缺字段即坏，不当 0）。 */
export function parseStats(raw: unknown, where: string): WorkspaceStats {
	if (!isPlainObject(raw))
		throw new LedgerDataError(where, `${where}: stats 输出不是对象，格式可能已变`);
	const thresholds = raw.thresholds;
	if (!isPlainObject(thresholds))
		throw new LedgerDataError(
			where,
			`${where}: stats 输出缺 thresholds，阈值不许由插件硬编码`,
		);
	const oldest = raw.oldest_open_days;
	if (oldest !== null && typeof oldest !== "number")
		throw new LedgerDataError(
			where,
			`${where}: stats 的 oldest_open_days 既不是数字也不是 null`,
		);
	return {
		total: num(raw, "total", where),
		open: num(raw, "open", where),
		doing: num(raw, "doing", where),
		stale: num(raw, "stale", where),
		overdue: num(raw, "overdue", where),
		backlog: num(raw, "backlog", where),
		mine: num(raw, "mine", where),
		myDoing: num(raw, "my_doing", where),
		myStale: num(raw, "my_stale", where),
		myOverdue: num(raw, "my_overdue", where),
		oldestOpenDays: oldest,
		staleDays: num(thresholds, "stale_days", where),
		overdueDays: num(thresholds, "overdue_days", where),
		backlogDays: num(thresholds, "backlog_days", where),
	};
}

/**
 * 一个时间窗口内结案了多少条（skill `history --count-only`）。
 * 区间写进缓存键：本周 / 上周两个窗口各算一次，别互相串味。
 */
export async function countClosed(
	workspace: LedgerWorkspace,
	window: { readonly from: string; readonly to: string },
): Promise<ClosedCount> {
	return await cached(
		cacheKey(workspace.id, "history", `count:${window.from}~${window.to}`),
		async () => {
			const result = await runLedgerScript<unknown>("history", [
				"--repo",
				workspace.path,
				"--count-only",
				"--since",
				window.from,
				"--until",
				window.to,
			]);
			if (!result.ok) throw new Error(`${workspace.title}: ${result.error}`);
			if (!isPlainObject(result.data))
				throw new LedgerDataError(
					workspace.title,
					`${workspace.title}: history --count-only 输出不是对象`,
				);
			const count = result.data.count;
			if (typeof count !== "number" || !Number.isFinite(count))
				throw new LedgerDataError(
					workspace.title,
					`${workspace.title}: history --count-only 缺 count 数字`,
				);
			return { count, capped: result.data.capped === true };
		},
	);
}
