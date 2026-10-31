/**
 * 历史页下半部分：筛选行（工作区 / 执行人）+ 结案记录表格。
 *
 * 结构（与改版前逐像素一致）：
 *    [日期 | 创建人 | 执行人 | 时间]   ← 表头第一格为「日期」，每天一行
 *      C.dsh-plugin-core                    ← 当天某工作区一段，段首一行跨满全列写工作区名
 *      任务行…
 *
 * 渲染：**一张表，只画窗口内的行**（2026-11-01）。原来是一天一张表，块间无间距、
 * 相邻边框合并 ⇒ 合成一张表后仍是「每天插一行日期头」，外观不变。
 * 屏幕外的行用首尾两个等高占位行撑住滚动高度 ⇒ DOM 行数与总条数无关。
 * 分页、按天分片全部取消：整月数据一次取回、全在内存，滚动时只按行号重算窗口。
 */
import {
	IconFolderCloseRegular,
	IconUsersOutlineRegular,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { PickerGroup } from "dsh-plugin-core/ui";
import {
	createElement as h,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
	type Ref,
} from "react";
import { fetchHistoryList } from "./api";
import type { Translate } from "./locales";
import { displayName } from "./rows";
import type { HistoryRecord } from "./types";
import { Select, Button, SectionHead, Segmented, SplitGroup, Tag, Loader } from "./ui";

const WEEKDAY_KEYS = [
	"weekdaySun",
	"weekdayMon",
	"weekdayTue",
	"weekdayWed",
	"weekdayThu",
	"weekdayFri",
	"weekdaySat",
] as const;

const MONTH_KEYS = [
	"month1",
	"month2",
	"month3",
	"month4",
	"month5",
	"month6",
	"month7",
	"month8",
	"month9",
	"month10",
	"month11",
	"month12",
] as const;

/** `2026-10-31` → 本地化星期（随 `t` 走中英）。按年月日构造本地时间，避免 UTC 偏移。 */
function weekdayOf(day: string, t: Translate): string {
	const [year, month, date] = day.split("-").map(Number);
	if (year === undefined || month === undefined || date === undefined) return "";
	const index = new Date(year, month - 1, date).getDay();
	return t(WEEKDAY_KEYS[index] ?? "weekdaySun");
}

const SELECT_MIN_WIDTH = 140;
const SELECT_MAX_WIDTH = 240;
/** 窗口上下各多画的像素：快速拖动时不留白。 */
const OVERSCAN_PX = 600;
/** 一行最多摆几个标签，其余收成 `+N`（行高必须定死，标签不能换行）。 */
const MAX_TAGS = 3;
/** 首帧量行高时先画多少行（够带上日期头 / 工作区段头 / 记录三种行就行）。 */
const MEASURE_ROWS = 40;

export interface HistoryListProps {
	readonly t: Translate;
	readonly workspaceOptions: readonly { readonly value: string; readonly label: string }[];
	readonly ownerGroups: PickerGroup[];
	/** 单人台账：执行人下拉整件隐藏（与在办页同一口径）。 */
	readonly solo: boolean;
	/** 点行：在右侧 dock 打开该行的过程文档（与在办页「查看」同一条链路）。 */
	readonly onOpen: (filePath: string) => void;
	/** 选中的月份（`YYYY-MM`）：受控在页面层，与上方图表联动（用户 2026-10-31）。 */
	readonly ym: string;
	readonly onYmChange: (next: string) => void;
	/** 点图表日 / 周后要滚到的那一天；`token` 每次点击自增（同一天连点也能再滚）。 */
	readonly scrollTo: { date: string; token: number } | null;
	/** 这次滚动请求已经处理完 ⇒ 请页面层清掉 `scrollTo`（列表切走会卸载、ref 归零，
	 *  留着旧 token 会在切回来时再滚一遍）。 */
	readonly onScrolled: () => void;
	/** 页面滚动层（`.dtl-page`）：虚拟窗口按它的可视区算，不是 window。 */
	readonly scrollContainer: () => HTMLElement | null;
}

/** 一行是什么：日期头 / 工作区段头 / 记录。 */
type RowKind = "day" | "ws" | "rec";

interface Item {
	readonly kind: RowKind;
	readonly key: string;
	/** 所属日期（三种行都有，按天跳转时用）。 */
	readonly day: string;
	readonly title?: string;
	readonly record?: HistoryRecord;
}

/** 三类行的固定行高（首帧量出来，之后偏移全靠它算）。 */
interface Heights {
	readonly day: number;
	readonly ws: number;
	readonly rec: number;
}

/** 记录 → 各列内容。第一列：标题 + 标签（创建徽已挪到「创建人」列，2026-10-31 用户定）。 */
function cellsOf(
	record: HistoryRecord,
	opts: {
		readonly solo: boolean;
		readonly onOwner: (uuid: string) => void;
	},
): Record<string, ReactNode> {
	// 行内点击会被行点击接走（打开文档）。人名就地拦 = 点人名是「切执行人筛选」。
	const stop = (event: { stopPropagation: () => void }): void => event.stopPropagation();
	const who =
		opts.solo || record.ownerName === ""
			? record.ownerName
			: h(
					"span",
					{ onClick: stop },
					h(
						Button,
						{
							variant: "link",
							size: "sm",
							maxWidth: 180,
							onClick: () => opts.onOwner(record.owner),
						},
						`@${record.ownerName}`,
					),
				);
	const creatorName = displayName(record.creatorName, record.creator);
	const created = record.created.slice(0, 16);
	const finished = record.finished.slice(0, 16);
	// 标签只摆一行：超出的收成 `+N`（行高必须定死，换行会把虚拟窗口算歪）
	const shown = record.tags.slice(0, MAX_TAGS);
	const rest = record.tags.length - shown.length;
	return {
		task: h(
			"div",
			{ className: "dtl-histlist__task" },
			h(
				"div",
				{ className: "dtl-histlist__head" },
				h(
					"span",
					{ className: "dtl-histlist__title", title: record.summary },
					record.title,
				),
			),
			record.tags.length === 0
				? null
				: h(
						"div",
						{ className: "dtl-histlist__tags" },
						...shown.map((tag) => h(Tag, { key: tag, text: `#${tag}`, maxWidth: 160 })),
						rest > 0
							? h(
									"span",
									{ key: "+n", className: "dtl-histlist__tags-rest" },
									`+${String(rest)}`,
								)
							: null,
					),
		),
		creator: h(
			"div",
			{ className: "dtl-histlist__creator" },
			h(
				"span",
				{ className: "dtl-histlist__creator-name" },
				creatorName === "" ? "" : `@${creatorName}`,
			),
			h("span", { className: "dtl-histlist__creator-time" }, created),
		),
		owner: who,
		time: h(
			"div",
			{ className: "dtl-histlist__time" },
			h(
				"span",
				{ className: "dtl-histlist__time-row" },
				h("span", { className: "dtl-histlist__time-mark" }, "S"),
				created,
			),
			h(
				"span",
				{ className: "dtl-histlist__time-row" },
				h("span", { className: "dtl-histlist__time-mark" }, "E"),
				finished,
			),
		),
	};
}

/** 记录 → 拍平的行序列：一天一行日期头，天内按工作区分段（段序与工作区下拉一致）。 */
function buildItems(
	records: readonly HistoryRecord[],
	orderOf: (id: string) => number,
): readonly Item[] {
	const out: Item[] = [];
	const days: {
		day: string;
		groups: Map<string, { title: string; rows: HistoryRecord[] }>;
	}[] = [];
	for (const record of records) {
		const day = record.finished.slice(0, 10);
		let block = days[days.length - 1];
		if (block === undefined || block.day !== day) {
			block = { day, groups: new Map() };
			days.push(block);
		}
		let group = block.groups.get(record.workspaceId);
		if (group === undefined) {
			group = { title: record.workspaceTitle, rows: [] };
			block.groups.set(record.workspaceId, group);
		}
		group.rows.push(record);
	}
	for (const block of days) {
		out.push({ kind: "day", key: `day:${block.day}`, day: block.day });
		const groups = [...block.groups.entries()].sort((a, b) => orderOf(a[0]) - orderOf(b[0]));
		for (const [id, group] of groups) {
			out.push({ kind: "ws", key: `ws:${block.day}:${id}`, day: block.day, title: group.title });
			for (const record of group.rows)
				out.push({ kind: "rec", key: record.key, day: block.day, record });
		}
	}
	return out;
}

/** 行起点表（`offsets[i]` = 第 i 行顶边）。二分查「某个像素位置落到第几行」。 */
function offsetsOf(items: readonly Item[], heights: Heights): Float64Array {
	const out = new Float64Array(items.length + 1);
	for (let index = 0; index < items.length; index += 1) {
		const kind = items[index].kind;
		out[index + 1] =
			out[index] + (kind === "day" ? heights.day : kind === "ws" ? heights.ws : heights.rec);
	}
	return out;
}

/** 最大的 i，使 `offsets[i] <= value`（`offsets` 单调递增）。 */
function rowAt(offsets: Float64Array, value: number): number {
	const last = offsets.length - 2;
	if (last < 0) return 0;
	let lo = 0;
	let hi = last;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (offsets[mid] <= value) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

export function HistoryList(props: HistoryListProps): ReturnType<typeof h> {
	const { t } = props;
	const [workspace, setWorkspace] = useState("");
	const [owner, setOwner] = useState("");
	const [records, setRecords] = useState<readonly HistoryRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	/** 选中行的 key（淡蓝底 + 左竖条）。 */
	const [selected, setSelected] = useState<string | null>(null);
	/** 延后的「打开文档」定时器：先让选中样式提交并绘制，再把链接扔给 dock。 */
	const pendingOpen = useRef<number | null>(null);
	/** 已经处理过的滚动请求 token（同一次点击只滚一次）。 */
	const lastScrollToken = useRef<number>(-1);
	/** 取过的月份（`ym|工作区|执行人` → 记录 + 取回时刻）：来回切月不再请求，60 秒后重取。 */
	const monthCache = useRef(new Map<string, { records: readonly HistoryRecord[]; at: number }>());
	/** 三类行的固定行高：首帧量一次，之后所有偏移都按它算。 */
	const [heights, setHeights] = useState<Heights | null>(null);
	/** 表格本身（**不是**外层容器：容器里还有筛选条，行号偏移从表格顶边算）。 */
	const tableRef = useRef<HTMLTableElement | null>(null);
	/** 当前渲染的窗口（行号闭区间）。 */
	const [range, setRange] = useState<{ start: number; end: number }>({ start: 0, end: -1 });

	useEffect(
		() => () => {
			if (pendingOpen.current !== null) window.clearTimeout(pendingOpen.current);
		},
		[],
	);

	// 首屏 + 筛选 / 月份变化：**只取选中的那个月**（date 窗在 host 侧收窄）
	useEffect(() => {
		let alive = true;
		const key = `${props.ym}|${workspace}|${owner}`;
		const hit = monthCache.current.get(key);
		if (hit !== undefined && Date.now() - hit.at < 60_000) {
			setRecords(hit.records);
			setLoading(false);
			setError(null);
			return;
		}
		setLoading(true);
		setError(null);
		setRecords([]);
		fetchHistoryList({ ym: props.ym, workspace, owner })
			.then((payload) => {
				if (!alive) return;
				monthCache.current.set(key, { records: payload.records, at: Date.now() });
				setRecords(payload.records);
			})
			.catch((reason: unknown) => {
				if (alive) setError(reason instanceof Error ? reason.message : String(reason));
			})
			.finally(() => {
				if (alive) setLoading(false);
			});
		return () => {
			alive = false;
		};
	}, [owner, props.ym, workspace]);

	// 天 → 工作区段（段序跟「全部工作区」下拉一致）
	const orderOf = useCallback(
		(id: string): number => {
			const index = props.workspaceOptions.findIndex((option) => option.value === id);
			return index < 0 ? Number.MAX_SAFE_INTEGER : index;
		},
		[props.workspaceOptions],
	);
	const items = useMemo(() => buildItems(records, orderOf), [orderOf, records]);
	const offsets = useMemo(
		() => (heights === null ? null : offsetsOf(items, heights)),
		[heights, items],
	);

	// 首帧：先按自然高度画前几行，量出三类行的真实行高（样式一改自动跟着走，不许在 JS 里写死像素），
	// 量到之后整表换成「定高 + 窗口」。量的就是真行，不另建探针表 —— 少一份可能对不上的样式。
	useLayoutEffect(() => {
		if (heights !== null) return;
		const table = tableRef.current;
		if (table === null) return;
		const heightOf = (kind: RowKind): number => {
			const node = table.querySelector<HTMLElement>(`[data-kind='${kind}']`);
			return node === null ? 0 : node.getBoundingClientRect().height;
		};
		const day = heightOf("day");
		const ws = heightOf("ws");
		const rec = heightOf("rec");
		if (day > 0 && ws > 0 && rec > 0) setHeights({ day, ws, rec });
	});

	/** 按滚动位置重算窗口；不在可视区时窗口为空（占位行撑住滚动高度）。 */
	const recompute = useCallback((): void => {
		const table = tableRef.current;
		const container = props.scrollContainer();
		if (table === null || container === null || offsets === null) return;
		const containerRect = container.getBoundingClientRect();
		const tableRect = table.getBoundingClientRect();
		// 表格第一行在容器坐标系里的位置（容器滚动 + 相对偏移）—— 必须用表格，不能用包住筛选条的外层
		const base = container.scrollTop + (tableRect.top - containerRect.top);
		const from = container.scrollTop - base - OVERSCAN_PX;
		const to = container.scrollTop + container.clientHeight - base + OVERSCAN_PX;
		const last = offsets.length - 2;
		const start = Math.max(0, rowAt(offsets, Math.max(0, from)));
		const end = Math.min(last, rowAt(offsets, Math.max(0, to)));
		setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
	}, [offsets, props.scrollContainer]);

	// 首帧（行高量完、行起点表变了的这一刻）先在绘制前算一次窗口，否则会闪一帧空表
	useLayoutEffect(() => {
		recompute();
	}, [recompute]);

	useEffect(() => {
		const container = props.scrollContainer();
		if (container === null || offsets === null) return;
		let frame = 0;
		const onScroll = (): void => {
			if (frame !== 0) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				recompute();
			});
		};
		container.addEventListener("scroll", onScroll, { passive: true });
		const observer =
			typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => recompute());
		observer?.observe(container);
		recompute();
		return () => {
			container.removeEventListener("scroll", onScroll);
			observer?.disconnect();
			if (frame !== 0) cancelAnimationFrame(frame);
		};
	}, [offsets, props.scrollContainer, recompute]);

	// 点图表里的日 / 周 / 「本周结案」卡 ⇒ 滚到列表里那一天（用户 2026-10-31）。
	// 整天都在内存里 ⇒ 直接按行号算位置；目标天没有记录时落到「目标日或更早的最近一天」。
	useEffect(() => {
		const target = props.scrollTo;
		if (target === null || target.token === lastScrollToken.current) return;
		// ⚠️ 必须先判 loading：首帧 records 还空时，会把「数据没到」算成「本月没有记录」
		if (loading || offsets === null || items.length === 0) return;
		const finish = (): void => {
			lastScrollToken.current = target.token;
			props.onScrolled();
		};
		const index = items.findIndex((item) => item.kind === "day" && item.day <= target.date);
		const table = tableRef.current;
		const container = props.scrollContainer();
		if (index < 0 || table === null || container === null) {
			// 本月没有目标日或更早的天：没有可滚的位置，直接记为已处理
			finish();
			return;
		}
		const containerRect = container.getBoundingClientRect();
		const tableRect = table.getBoundingClientRect();
		const base = container.scrollTop + (tableRect.top - containerRect.top);
		container.scrollTo({ top: base + offsets[index], behavior: "smooth" });
		finish();
	}, [items, loading, offsets, props.onScrolled, props.scrollContainer, props.scrollTo]);

	// 单人台账：执行人整列不摆（与待办里「单人不显示执行人名」同一条规矩）
	const columns = props.solo ? ([175, 185] as const) : ([175, 140, 185] as const);
	const colSpan = columns.length + 1;
	const labels = props.solo
		? [t("histColCreator"), t("histColTime")]
		: [t("histColCreator"), t("histColOwner"), t("histColTime")];

	/** 行 key → 过程文档路径（没有 worklog 的不在表里 ⇒ 点了只选中、不打开）。 */
	const fileOf = useMemo(() => {
		const map = new Map<string, string>();
		for (const record of records)
			if (record.filePath !== "") map.set(record.key, record.filePath);
		return map;
	}, [records]);

	/** 点行 = 选中 + 把路径交给核心。选中态当场提交；dock 的打开推到本帧绘制之后。 */
	const handleRowClick = (key: string): void => {
		setSelected(key);
		const file = fileOf.get(key);
		if (file === undefined) return;
		// 2026-10-31 真机：点五六次才有选中样式。根因是这里同步打开 dock（核心要建 React 根、
		// 改宿主布局、强制重排），把 setSelected 的 commit + paint 一起拖到它后面。
		if (pendingOpen.current !== null) window.clearTimeout(pendingOpen.current);
		pendingOpen.current = window.setTimeout(() => {
			pendingOpen.current = null;
			props.onOpen(file);
		}, 0);
	};

	/** 可选年份：今年往前 5 年。 */
	const now = new Date();
	const currentYear = now.getFullYear();
	const currentMonth = now.getMonth() + 1;
	const [yearPart, monthPart] = props.ym.split("-").map(Number);
	const year = yearPart ?? currentYear;
	const month = monthPart ?? currentMonth;
	const setYearMonth = (nextYear: number, nextMonth: number): void => {
		props.onYmChange(`${String(nextYear)}-${String(nextMonth).padStart(2, "0")}`);
	};
	const years = useMemo(
		() => Array.from({ length: 6 }, (_, index) => currentYear - index),
		[currentYear],
	);
	/** 今年只显示到当月（用户 2026-10-31），往年 12 个月全显示。 */
	const shownMonths = year === currentYear ? currentMonth : 12;

	/** 三类行各自的行高：量出来之前不写（首帧按自然高度量），量出来之后每行都钉死 ——
	 *  没有标签的行也占满同样的高度，否则偏移会一格一格错下去。 */
	const cellHeight = (kind: RowKind): { height: string } | undefined =>
		heights === null ? undefined : { height: `${String(heights[kind])}px` };

	const dayRow = (day: string, first: boolean): ReactNode =>
		h(
			"tr",
			{
				key: `day:${day}`,
				className: "dtl-histlist__dayrow",
				"data-kind": "day",
				"data-first": first ? "true" : undefined,
			},
			h(
				"th",
				{ className: "dtl-histlist__headcell", scope: "col", style: cellHeight("day") },
				h(SectionHead, {
					title: `${day} · ${weekdayOf(day, t)}`,
					accent: "default",
					flush: true,
				}),
			),
			...labels.map((label) =>
				h(
					"th",
					{ key: label, className: "dtl-histlist__headcell", scope: "col", style: cellHeight("day") },
					label,
				),
			),
		);

	const wsRow = (item: Item): ReactNode =>
		h(
			"tr",
			{ key: item.key, className: "dtl-histlist__row", "data-kind": "ws" },
			h(
				"td",
				{ className: "dtl-histlist__cell", colSpan, style: cellHeight("ws") },
				h(Tag, { text: item.title ?? "", tone: "workspace" }),
			),
		);

	const recRow = (record: HistoryRecord): ReactNode => {
		const cells = cellsOf(record, { solo: props.solo, onOwner: setOwner });
		const keys = props.solo ? (["task", "creator", "time"] as const) : (["task", "creator", "owner", "time"] as const);
		return h(
			"tr",
			{
				key: record.key,
				className: "dtl-histlist__row",
				"data-kind": "rec",
				"data-interactive": "true",
				"data-selected": selected === record.key ? "true" : undefined,
				tabIndex: 0,
				onClick: () => {
					handleRowClick(record.key);
				},
				onKeyDown: (event: { key: string; preventDefault: () => void }) => {
					if (event.key !== "Enter" && event.key !== " ") return;
					event.preventDefault();
					handleRowClick(record.key);
				},
			},
			...keys.map((key) =>
				h("td", { key, className: "dtl-histlist__cell", style: cellHeight("rec") }, cells[key] ?? null),
			),
		);
	};

	/** 表格外壳：colgroup 只给固定列宽，首列吃掉剩余宽度（与改版前同一条算式）。 */
	const tableOf = (rows: readonly ReactNode[], extra?: { ref?: Ref<HTMLTableElement> }): ReactNode =>
		h(
			"table",
			{ className: "dtl-histlist__table", ref: extra?.ref, "aria-label": t("histListLabel") },
			h(
				"colgroup",
				null,
				h("col", { key: "task" }),
				...columns.map((width, index) => h("col", { key: String(index), style: { width: `${String(width)}px` } })),
			),
			h("tbody", null, ...rows),
		);

	const last = items.length - 1;
	// 行高还没量到：先把前几十行按自然高度画出来（量完这一帧就换成定高窗口）
	const measuring = heights === null;
	const start = measuring ? 0 : Math.min(range.start, last);
	const end = measuring ? Math.min(last, MEASURE_ROWS - 1) : Math.min(range.end, last);
	const rows: ReactNode[] = [];
	if (!measuring && start > 0)
		rows.push(
			h(
				"tr",
				{ key: "spacer-top", className: "dtl-histlist__spacer", "aria-hidden": "true" },
				h("td", { colSpan, style: { height: `${String(offsets?.[start] ?? 0)}px` } }),
			),
		);
	for (let index = start; index <= end; index += 1) {
		const item = items[index];
		if (item === undefined) continue;
		if (item.kind === "day") rows.push(dayRow(item.day, index === 0));
		else if (item.kind === "ws") rows.push(wsRow(item));
		else if (item.record !== undefined) rows.push(recRow(item.record));
	}
	// 量行高那一帧：没画出来的尾巴先用「够高」的占位顶着，免得内容一短、浏览器把滚动位置夹到
	// 顶上（切回来再滚一次那种跳）。这一帧在绘制前就被替换，用户看不到。
	if (measuring && last >= MEASURE_ROWS)
		rows.push(
			h(
				"tr",
				{ key: "spacer-measure", className: "dtl-histlist__spacer", "aria-hidden": "true" },
				h("td", { colSpan, style: { height: `${String((last + 1 - MEASURE_ROWS) * 80)}px` } }),
			),
		);
	if (!measuring && end < last)
		rows.push(
			h(
				"tr",
				{ key: "spacer-bottom", className: "dtl-histlist__spacer", "aria-hidden": "true" },
				h("td", {
					colSpan,
					style: { height: `${String((offsets?.[last + 1] ?? 0) - (offsets?.[end + 1] ?? 0))}px` },
				}),
			),
		);

	const body =
		items.length === 0
			? tableOf([
					h(
						"tr",
						{ key: "state" },
						h(
							"td",
							{ className: "dtl-histlist__cell dtl-histlist__empty", colSpan },
							loading ? h(Loader, { variant: "blocks", size: "xl" }) : t("historyEmpty"),
						),
					),
				], { ref: tableRef })
			: tableOf(rows, { ref: tableRef });

	return h(
		"div",
		{ className: "dtl-histlist" },
		filtersOf(),
		error === null
			? null
			: h("div", { className: "dtl-histlist__error" }, `${t("loadFailed")}：${error}`),
		body,
	);

	/** 筛选行（工作区 / 执行人 + 年月）。 */
	function filtersOf(): ReactNode {
		return h(
			"div",
			{ className: "dtl-histlist__filters" },
			h(
				"div",
				{ className: "dtl-histlist__filters-main" },
				// 核心 SplitGroup：左 = 年份下拉（Picker），右 = 月份滑动块（Segmented），
				// 两格焊成一体。两格传同一个 size 才等高（核心约定）。
				h(
					SplitGroup,
					{ label: t("histMonthLabel") },
					h(Select<string>, {
						size: "lg",
						width: 96,
						value: String(year),
						options: years.map((item) => ({ value: String(item), label: String(item) })),
						ariaLabel: t("histYearLabel"),
						onChange: (next) => {
							const nextYear = Number(next);
							const cap = nextYear === currentYear ? currentMonth : 12;
							setYearMonth(nextYear, Math.min(month, cap));
						},
					}),
					h(Segmented<string>, {
						size: "lg",
						// 选中片用 business 蓝，不用核心默认的灰/白片（用户 2026-10-31）
						tone: "business",
						label: t("histMonthLabel"),
						items: Array.from({ length: shownMonths }, (_, index) => ({
							value: String(index + 1),
							label: t(MONTH_KEYS[index] ?? "month1"),
						})),
						value: String(month),
						onChange: (next) => setYearMonth(year, Number(next)),
					}),
				),
			),
			h(
				"div",
				{ className: "dtl-histlist__filters-side" },
				h(Select<string>, {
					searchable: true,
					size: "lg",
					minWidth: SELECT_MIN_WIDTH,
					maxWidth: SELECT_MAX_WIDTH,
					icon: h(IconFolderCloseRegular, { size: 16 }),
					value: workspace,
					options: props.workspaceOptions,
					ariaLabel: t("workspaceLabel"),
					onChange: setWorkspace,
				}),
				props.solo
					? null
					: h(Select<string>, {
							searchable: true,
							size: "lg",
							minWidth: SELECT_MIN_WIDTH,
							maxWidth: SELECT_MAX_WIDTH,
							icon: h(IconUsersOutlineRegular, { size: 16 }),
							value: owner,
							options: [{ value: "", label: t("ownerAll") }],
							groups: props.ownerGroups,
							ariaLabel: t("ownerLabel"),
							onChange: setOwner,
						}),
			),
		);
	}
}
