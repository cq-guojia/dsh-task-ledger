/**
 * 读缓存（方案 B 的落地件，2026-10-18 拍板的三条口径，无黑魔法）：
 *
 * ① 进程内 `Map`，key = `op:workspace:filter`（filter 已序列化），值 = 结果 + 时间戳；
 * ② 命中且 1.5s 内直接返回、**不起进程**；同 key 并发**单飞**（只跑一次脚本，其余等同一个 Promise）；
 * ③ `fresh=1` 绕过（路由层先 `invalidate()` 再算）；写路径成功后 `invalidate(workspaceId)` 钩子。
 *
 * 边界：只缓存 skill 脚本的读命令结果。**失败不入缓存**（错就是错，重试要能重新跑）。
 * 命中返回的是**同一个引用**：调用方只许读（上层 service 全是纯计算，不原地改数组）。
 */

/** 缓存有效期（2026-10-18 拍板 1.5s：够挡同一屏的重复读，短到不会让人看到旧数据）。 */
export const CACHE_TTL_MS = 1_500;

/** 缓存的操作种类（= skill 脚本子命令；worklog 不进缓存故不在此列）。
 *  `history` 供历史页顶部日趋势使用（2026-10-29 重新接入）。 */
export type CacheOp = "history" | "list" | "stats" | "owners";

const SEP = "\u0000";

interface Cached {
	/** **拿到结果那一刻**的时间戳（不是发起时刻：趋势要跑 3s，按发起记会让刚回来就过期）。 */
	readonly at: number;
	readonly value: unknown;
}

/** 已完成的缓存：key → 值与时间戳。 */
const settled = new Map<string, Cached>();
/** 在途单飞：key → 正在跑的 Promise（同 key 并发只跑一次）。 */
const inflight = new Map<string, Promise<unknown>>();
/**
 * 失效代次：`invalidate()` 递增一次。
 * 在飞的 Promise 落地时若代次变了就不写回 `settled`——否则「清缓存 → 旧读回来又填上」，
 * 手动刷新 / 写完立刻刷新都会看到旧数据。
 */
let epoch = 0;

/** 缓存键：`op:workspace:filter` 三条信息都要，否则不同筛选 / 不同工作区会串味。 */
export function cacheKey(
	workspaceId: string,
	op: CacheOp,
	detail: string,
): string {
	return `${op}${SEP}${workspaceId}${SEP}${detail}`;
}

/**
 * 取数（命中即返回，未命中跑 `load` 并落缓存）。
 * `now` 仅供冒烟注入；业务代码不传，默认取当前时刻。
 */
export function cached<T>(
	key: string,
	load: () => Promise<T>,
	now: number = Date.now(),
): Promise<T> {
	const hit = settled.get(key);
	if (hit !== undefined && now - hit.at < CACHE_TTL_MS)
		return Promise.resolve(hit.value as T);
	const pending = inflight.get(key);
	if (pending !== undefined) return pending as Promise<T>;
	const issued = epoch;
	const task = Promise.resolve()
		.then(load)
		.then((value) => {
			if (issued === epoch) settled.set(key, { at: Date.now(), value });
			return value;
		})
		.finally(() => {
			if (inflight.get(key) === task) inflight.delete(key);
		});
	inflight.set(key, task);
	return task;
}

/**
 * 让缓存失效：不传 = 全清（`fresh=1` 手动刷新用）；传工作区 id = 只清该工作区。
 * 写路径（任务 4，未拍板）落地后在其成功后调本函数；现在只有手动刷新这一处用。
 */
export function invalidate(workspaceId?: string): void {
	// 代次一律递增：在飞的结果落地时不再写回（按工作区区分度太细，多跑一次脚本不心疼）
	epoch += 1;
	if (workspaceId === undefined) {
		settled.clear();
		inflight.clear();
		return;
	}
	for (const key of settled.keys()) {
		if (key.split(SEP)[1] === workspaceId) settled.delete(key);
	}
	for (const key of inflight.keys()) {
		if (key.split(SEP)[1] === workspaceId) inflight.delete(key);
	}
}
