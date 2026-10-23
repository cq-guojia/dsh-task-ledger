/**
 * 读缓存（方案 B 的落地件，2026-10-18 拍板的三条口径，无黑魔法）：
 *
 * ① 进程内 `Map`，key = `op:workspace:filter`（filter 已序列化），值 = 结果 + 时间戳；
 * ② 命中且 1.5s 内直接返回、**不起进程**；同 key 并发**单飞**（只跑一次脚本，其余等同一个 Promise）；
 * ③ `fresh=1` 绕过（路由层先 `invalidate()` 再算）；写路径成功后 `invalidate(workspaceId)` 钩子。
 *
 * 边界：只缓存 skill 脚本的两读（在办 list / 历史 history）。worklog 正文不缓存——它会被
 * 会话里的 Agent 实时改写，缓存 1.5s 也会让用户看到上一版。**失败不入缓存**（错就是错，重试要能重新跑）。
 * 命中返回的是**同一个引用**：调用方只许读（上层 service 全是纯计算，不原地改数组）。
 */
/** 缓存有效期（2026-10-18 拍板 1.5s：够挡同一屏的重复读，短到不会让人看到旧数据）。 */
export declare const CACHE_TTL_MS = 1500;
/** 缓存的操作种类（= skill 脚本子命令；worklog 不进缓存故不在此列）。 */
export type CacheOp = "list" | "history";
/** 缓存键：`op:workspace:filter` 三条信息都要，否则不同筛选 / 不同工作区会串味。 */
export declare function cacheKey(workspaceId: string, op: CacheOp, detail: string): string;
/**
 * 取数（命中即返回，未命中跑 `load` 并落缓存）。
 * `now` 仅供冒烟注入；业务代码不传，默认取当前时刻。
 */
export declare function cached<T>(key: string, load: () => Promise<T>, now?: number): Promise<T>;
/**
 * 让缓存失效：不传 = 全清（`fresh=1` 手动刷新用）；传工作区 id = 只清该工作区。
 * 写路径（任务 4，未拍板）落地后在其成功后调本函数；现在只有手动刷新这一处用。
 */
export declare function invalidate(workspaceId?: string): void;
