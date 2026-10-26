/**
 * 日期口径（纯函数层，零 IO）：本机时区、周一为一周之始（与 skill 脚本同口径）。
 * 所有函数显式收 `now`——不自己读时钟，便于单测与跨时区复现。
 *
 * ⚠️ **台账存盘时间是 UTC**（skill `core/time.py::now`），`--json` 原样吐 UTC，
 * 只有人话输出才转查看者本地（`fmt_local`）。看板是给人看的 ⇒ 一律先按 UTC 解析出
 * 真实时刻，再按本机时区取日期（等价于脚本的 `fmt_local`）。否则会出现
 * 「脚本表格里是 10-17、看板却算进 10-16 那周」—— 两个界面同一条记录差一天。
 */
/** Date → `YYYY-MM-DD`（本机时区）。 */
export declare function ymd(date: Date): string;
/** 时刻串（`YYYY-MM-DD HH:mm:ss` / `YYYY-MM-DD`）→ 本机时区的日期；解析不了回 null。 */
export declare function dayOf(stamp: string | null | undefined): string | null;
/** 某日期所在周的周一（00:00）。 */
export declare function mondayOf(day: string): Date;
/**
 * 第 offset 周的起止（offset 0 = 本周，-1 = 上周；返回日期串，含边界）。
 * ⚠️ 本周只到今天（周还没结束），上周才是完整周一~周日——否则「本周」会把明天之后的
 * 日子也画进区间，tooltip 里的截止日撒谎。
 */
export declare function weekWindow(offset: number, now: Date): {
    from: string;
    to: string;
};
/** 第 offset 月的起止（offset 0 = 本月，-1 = 上月；含边界）。
 *  同 {@link weekWindow}：本月只到今天，上月才是完整自然月。 */
export declare function monthWindow(offset: number, now: Date): {
    from: string;
    to: string;
};
/** 日期是否落在 [from, to]（含边界，字符串比较即可——ISO 字典序即时间序）。 */
export declare function inWindow(day: string | null, window: {
    from: string;
    to: string;
}): boolean;
/** 「YYYY-MM-DD HH:mm:ss」→ 距今天数（解析不了 / 未来都按 0；不编造）。 */
export declare function daysSince(stamp: string | null | undefined, now: Date): number | null;
/** 近 N 周的桶骨架（`{week, end}`，历史周 end=周日、当前周 end=今天）。 */
export declare function buildWeeks(count: number, now: Date): readonly {
    week: string;
    end: string;
}[];
