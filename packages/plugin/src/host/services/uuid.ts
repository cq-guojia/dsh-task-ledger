/**
 * 身份比较的唯一口径：**两边都 trim + 小写再比**。
 *
 * 台账里的 owner / creator 存的是 uuid，本机身份也取 uuid；但两边来源不同
 * （identity.json 可能是手写的、台账里可能是旧版本写的），大小写不一定一致。
 * 脚本侧 `core/identity.normalize` 就是这么比的，这里必须同口径，
 * 否则脚本说「是你的」，界面说「不是你的」。
 *
 * 空值一律不算相等（`"" === ""` 会让「没 init」被误判成「是我的」）。
 */
export function sameUuid(
	a: string | null | undefined,
	b: string | null | undefined,
): boolean {
	const left = (a ?? "").trim().toLowerCase();
	const right = (b ?? "").trim().toLowerCase();
	return left !== "" && left === right;
}
