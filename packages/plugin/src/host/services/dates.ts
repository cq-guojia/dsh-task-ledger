/**
 * 日期口径（纯函数层，零 IO）：本机时区、周一为一周之始（与 skill 脚本同口径）。
 * 所有函数显式收 `now`——不自己读时钟，便于单测与跨时区复现。
 *
 * 现在只有「本周 / 上周结案数」用得到（`history --count-only` 的时间窗）。
 * 台账时刻的解析与天数派生**已全部删除**：那些是 skill 算好的（`age_days` / `idle_days` /
 * `waiting_days` 随 `list --json` 每行下发），插件不再保留第二套算法。
 */

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

/** Date → `YYYY-MM-DD`（本机时区）。 */
export function ymd(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 某日期所在周的周一（00:00）。 */
export function mondayOf(day: string): Date {
	const date = new Date(`${day}T00:00:00`);
	date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
	return date;
}

/**
 * 第 offset 周的起止（offset 0 = 本周，-1 = 上周；返回日期串，含边界）。
 * ⚠️ 本周只到今天（周还没结束），上周才是完整周一~周日——否则「本周」会把明天之后的
 * 日子也画进区间，tooltip 里的截止日撒谎。
 */
export function weekWindow(
	offset: number,
	now: Date,
): { from: string; to: string } {
	const monday = mondayOf(ymd(now));
	monday.setDate(monday.getDate() + offset * 7);
	const sunday = new Date(monday);
	sunday.setDate(sunday.getDate() + 6);
	const last = offset === 0 ? now : sunday;
	return { from: ymd(monday), to: ymd(last < sunday ? last : sunday) };
}
