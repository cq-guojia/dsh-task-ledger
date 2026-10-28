/**
 * 客户端时间口径**单源**：补零 / 时刻串（本机时区）。
 * 解析失败按调用方给的兜底返回（不编造时间）。
 *
 * 2026-10-17 改版后首页不再做时间范围过滤（时间只作用于统计卡与趋势图，由 host 聚合）
 * ⇒ 原来的 `rangeToDates` / `withinRange` / `RangeKey` 一并删除；统计 tab 要做时间筛选时
 * 按当时口径在此重建，别处不许再写一份。
 */
import type { Translate } from "./locales";

export function pad2(value: number | string): string {
	return String(value).padStart(2, "0");
}

/**
 * 相对时间（GitHub 口径，用户 2026-10-28）：<1 分钟「刚刚」、<1 小时「N 分钟前」、
 * <24 小时「N 小时前」、<30 天「N 天前」、<12 个月「N 个月前」，再往上「N 年前」；
 * 未来时间（时钟漂移 / 服务端超前）一律按「刚刚」，不出现「-3 分钟前」。
 */
export function formatRelative(iso: string, t: Translate): string {
	const ms = Date.parse(iso);
	if (Number.isNaN(ms)) return t("timeUnknown");
	const mins = Math.floor((Date.now() - ms) / 60_000);
	if (mins < 1) return t("relJustNow");
	if (mins < 60) return t("relMinutes", { n: mins });
	const hours = Math.floor(mins / 60);
	if (hours < 24) return t("relHours", { n: hours });
	const days = Math.floor(hours / 24);
	if (days < 30) return t("relDays", { n: days });
	const months = Math.floor(days / 30);
	if (months < 12) return t("relMonths", { n: months });
	return t("relYears", { n: Math.floor(months / 12) });
}

/** ISO → `YYYY-MM-DD HH:mm`（`seconds: true` 时补 `:ss`）；解析失败返回 `fallback`（缺省原串）。 */
export function formatDateTime(
	iso: string,
	opts?: { seconds?: boolean; fallback?: string },
): string {
	const ms = Date.parse(iso);
	if (Number.isNaN(ms)) return opts?.fallback ?? iso;
	const d = new Date(ms);
	const base = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
	return opts?.seconds === true ? `${base}:${pad2(d.getSeconds())}` : base;
}

/** 计数缩写（统一口径）：<1000 原样；≥1000 用 K，≥100 万用 M，保留 1 位小数并去掉 .0。
 *  例：999→"999"、1000→"1K"、1200→"1.2K"、12345→"12.3K"、1000000→"1M"。 */
export function formatCount(n: number): string {
	if (!Number.isFinite(n)) return String(n);
	const sign = n < 0 ? "-" : "";
	const abs = Math.abs(Math.trunc(n));
	const step = (v: number, unit: string): string => {
		const s = v >= 100 ? v.toFixed(0) : v.toFixed(1);
		return `${sign}${s.replace(/\.0$/, "")}${unit}`;
	};
	if (abs >= 1_000_000) return step(abs / 1_000_000, "M");
	if (abs >= 1_000) return step(abs / 1_000, "K");
	return String(n);
}
