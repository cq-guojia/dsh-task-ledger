/**
 * 日期口径（纯函数层，零 IO）：本机时区、周一为一周之始（与 skill 脚本同口径）。
 * 所有函数显式收 `now`——不自己读时钟，便于单测与跨时区复现。
 *
 * ⚠️ **台账存盘时间是 UTC**（skill `core/time.py::now`），`--json` 原样吐 UTC，
 * 只有人话输出才转查看者本地（`fmt_local`）。看板是给人看的 ⇒ 一律先按 UTC 解析出
 * 真实时刻，再按本机时区取日期（等价于脚本的 `fmt_local`）。否则会出现
 * 「脚本表格里是 10-17、看板却算进 10-16 那周」—— 两个界面同一条记录差一天。
 */

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

/** Date → `YYYY-MM-DD`（本机时区）。 */
export function ymd(date: Date): string {
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 台账时刻串 → Date（带时刻的按 **UTC** 解析；纯日期串按本地日历，不涉及时区）。
 * 解析不了回 null，不猜。
 */
function parseStamp(stamp: string): Date | null {
	const text = stamp.trim().replace(" ", "T");
	// 已带时区后缀（`Z` / `+08:00`）的不重复加，加了会二次偏移
	const iso = /\d{1,2}:\d{2}/.test(text)
		? /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(text)
			? text
			: `${text}Z`
		: text;
	const parsed = new Date(iso);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** 时刻串（`YYYY-MM-DD HH:mm:ss` / `YYYY-MM-DD`）→ 本机时区的日期；解析不了回 null。 */
export function dayOf(stamp: string | null | undefined): string | null {
	if (stamp === null || stamp === undefined || stamp === "") return null;
	const text = String(stamp);
	if (/^\d{4}-\d{2}-\d{2}$/.test(text.trim())) return text.trim();
	const parsed = parseStamp(text);
	return parsed === null ? null : ymd(parsed);
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

/** 第 offset 月的起止（offset 0 = 本月，-1 = 上月；含边界）。
 *  同 {@link weekWindow}：本月只到今天，上月才是完整自然月。 */
export function monthWindow(
	offset: number,
	now: Date,
): { from: string; to: string } {
	const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
	const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
	const end = offset === 0 ? now : last;
	return { from: ymd(first), to: ymd(end < last ? end : last) };
}

/** 日期是否落在 [from, to]（含边界，字符串比较即可——ISO 字典序即时间序）。 */
export function inWindow(
	day: string | null,
	window: { from: string; to: string },
): boolean {
	return day !== null && day >= window.from && day <= window.to;
}

/** 「YYYY-MM-DD HH:mm:ss」→ 距今天数（解析不了 / 未来都按 0；不编造）。 */
export function daysSince(
	stamp: string | null | undefined,
	now: Date,
): number | null {
	if (stamp === null || stamp === undefined || stamp === "") return null;
	const parsed = parseStamp(String(stamp));
	if (parsed === null) return null;
	const days = Math.floor((now.getTime() - parsed.getTime()) / 86_400_000);
	return days > 0 ? days : 0;
}

/** 近 N 周的桶骨架（`{week, end}`，历史周 end=周日、当前周 end=今天）。 */
export function buildWeeks(
	count: number,
	now: Date,
): readonly { week: string; end: string }[] {
	const weeks: string[] = [];
	for (let offset = count - 1; offset >= 0; offset -= 1)
		weeks.push(weekWindow(-offset, now).from);
	return weeks.map((week, i) => {
		const monday = new Date(`${week}T00:00:00`);
		const sunday = new Date(monday);
		sunday.setDate(sunday.getDate() + 6);
		return { week, end: i === weeks.length - 1 ? ymd(now) : ymd(sunday) };
	});
}
