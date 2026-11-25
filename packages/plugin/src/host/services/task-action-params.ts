/**
 * 任务写动作的公共参数校验（`/task/action` 旧路由与任务中心 submit 共用的单一真源）。
 *
 * 历史行删除既要走同步 NDJSON（认领等场景保留），也要走后台 submit（三个新动作）；
 * 两处若各自写一份校验，规则一旦漂移，错误就会从「提交期可见」退化成「后台跑完 git 才失败」。
 * 这里只判形状、不产中文：错误分类交给调用方按自己的文案口径呈现。
 */

/** 历史行删除的定位参数（与 skill `delete --src --line --expect` 一一对应）。 */
export interface HistoryDeleteParams {
	readonly src: string;
	readonly line: number;
	readonly fingerprint: string;
}

/** 校验结果：`reason` 只用于调用方选文案，不对外展示原文。 */
export type ParamCheck<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly reason: "path" | "line" | "fingerprint" };

/**
 * 历史删除三参数校验：
 *  - `src` 必须以 `history/` 开头、`.md` 结尾、不含 `..`（防越出 ledger 目录）；
 *  - `line` 是正整数；
 *  - `fingerprint` 是 `history --json` 给的 12 位十六进制行指纹（证明行还是用户看到的那条）。
 */
export function checkHistoryDelete(
	src: string,
	line: number,
	fingerprint: string,
): ParamCheck<HistoryDeleteParams> {
	if (!src.startsWith("history/") || !src.endsWith(".md") || src.includes(".."))
		return { ok: false, reason: "path" };
	if (!Number.isInteger(line) || line <= 0) return { ok: false, reason: "line" };
	if (!/^[0-9a-f]{12}$/.test(fingerprint)) return { ok: false, reason: "fingerprint" };
	return { ok: true, value: { src, line, fingerprint } };
}

/**
 * 从 `delete-hist:<src>:<行号>` 拆出 src / 行号（与客户端 deleteHistJobKey 同构）。
 * src 形如 `history/202611.md`，不含冒号 ⇒ 用最后一个冒号分行号。
 */
export function parseDeleteHistKey(
	key: string,
): { readonly src: string; readonly line: number } | null {
	const prefix = "delete-hist:";
	if (!key.startsWith(prefix)) return null;
	const body = key.slice(prefix.length);
	const at = body.lastIndexOf(":");
	if (at <= 0) return null;
	const src = body.slice(0, at);
	const line = Number(body.slice(at + 1));
	if (!Number.isInteger(line) || line <= 0) return null;
	return { src, line };
}
