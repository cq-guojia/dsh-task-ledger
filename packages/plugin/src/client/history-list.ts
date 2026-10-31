/**
 * 历史页下半部分：筛选行（工作区 / 执行人）+ 结案记录表格。
 *
 * 结构：
 *    [日期 | 执行人 | 开始时间 | 结束时间]   ← 表头第一格为「日期」，每天一张表
 *      C.dsh-plugin-core                    ← 当天某工作区一段，段首一行跨满全列写工作区名
 *      任务行…
 *    [W.NAS-Docker | …]
 *      任务行…
 * 某天所有工作区加起来不到 `PAGE_MIN` 条就并到后一天一起展示（「再读一天」）。
 *
 * 分页：host 一次下发整窗（近一年），这里**本地按天切片**（每片至少 PAGE_MIN 条、
 * 以整天为界），翻页零请求；滚动到底由最后一张表的哨兵触发。
 */
import {
	IconFolderCloseRegular,
	IconUsersOutlineRegular,
} from "@deepseek-ai/dsh-client-ui-primitives";
import { Table, type PickerGroup, type TableColumn, type TableRow } from "dsh-plugin-core/ui";
import { createElement as h, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fetchHistoryList } from "./api";
import type { Translate } from "./locales";
import { displayName } from "./rows";
import type { HistoryRecord } from "./types";
import { Select, Button, SectionHead, Segmented, SplitGroup, Tag } from "./ui";

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

/** 一片至少多少条；不足就把后面整天并进来（用户：一天不到 20 条就再读一天）。 */
const PAGE_MIN = 20;
const SELECT_MIN_WIDTH = 140;
const SELECT_MAX_WIDTH = 240;

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
}

/** 当天某个工作区的一段（同一天里按工作区分段，段首一行写工作区名）。 */
interface WorkspaceBlock {
	readonly id: string;
	readonly title: string;
	readonly rows: readonly TableRow[];
}

/** 一天的块：一个日期标题 + **一张表**（表内按工作区分段）。 */
interface DayBlock {
	readonly day: string;
	readonly groups: readonly WorkspaceBlock[];
}

/** 工作区段首行（跨满全列）：工作区名包成 business 实心底色的标签（2026-10-31 用户定）。 */
function workspaceRow(title: string, colSpan: number): TableRow {
	return {
		key: `ws:${title}`,
		cells: {
			task: {
				content: h(Tag, { text: title, tone: "workspace" }),
				colSpan,
			},
		},
	};
}

/** 一条记录 → 一行。第一列：标题 + 标签（创建徽已挪到「创建人」列，2026-10-31 用户定）。 */
function rowOf(
	record: HistoryRecord,
	opts: {
		readonly solo: boolean;
		readonly t: Translate;
		readonly onOwner: (uuid: string) => void;
	},
): TableRow {
	// 行内点击会被 Table 的行点击接走（打开文档）。**标签目前不设自己的点击行为，必须放行冒泡**
	// （2026-10-31 用户真机：标签那一行是跨满第一列全宽的 div，它拦了冒泡 ⇒ 点标签、点第一列右侧
	// 那段空白都没反应）；以后给标签单独做方法时再就地拦。人名仍就地拦 = 点人名是「切执行人筛选」。
	const stop = (event: { stopPropagation: () => void }): void => event.stopPropagation();
	const who =
		opts.solo || record.ownerName === ""
			? record.ownerName
			: h(
					"span",
					{ onClick: stop },
					// 与待办行一致：蓝字、不是标签；点人名 = 把执行人筛选切到这个人
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
	// 创建人列：名字 + 创建时间（绝对时刻；原来的「创建于 X 前」灰徽已取消）
	const creatorName = displayName(record.creatorName, record.creator);
	const created = record.created.slice(0, 16);
	const finished = record.finished.slice(0, 16);
	return {
		key: record.key,
		cells: {
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
							...record.tags.map((tag) =>
								h(Tag, { key: tag, text: `#${tag}`, maxWidth: 160 }),
							),
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
		},
	};
}

/** 按天切片：每片至少 PAGE_MIN 条、以整天为界（不足就续下一天）。 */
function sliceByDay(records: readonly HistoryRecord[]): readonly (readonly HistoryRecord[])[] {
	const pages: HistoryRecord[][] = [];
	let current: HistoryRecord[] = [];
	let index = 0;
	while (index < records.length) {
		const day = records[index].finished.slice(0, 10);
		while (index < records.length && records[index].finished.slice(0, 10) === day) {
			current.push(records[index]);
			index += 1;
		}
		if (current.length >= PAGE_MIN) {
			pages.push(current);
			current = [];
		}
	}
	if (current.length > 0) pages.push(current);
	return pages;
}

export function HistoryList(props: HistoryListProps): ReturnType<typeof h> {
	const { t } = props;
	const [workspace, setWorkspace] = useState("");
	const [owner, setOwner] = useState("");
	const [records, setRecords] = useState<readonly HistoryRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [pageCount, setPageCount] = useState(1);
	// 时间筛选（用户 2026-10-31）：一次只看一个月。月份受控在页面层（与上方图表共用），
	// 数据仍由 host 固定取近一年，年月在前端本地过滤。
	const now = new Date();
	const currentYear = now.getFullYear();
	const currentMonth = now.getMonth() + 1;
	const [yearPart, monthPart] = props.ym.split("-").map(Number);
	const year = yearPart ?? currentYear;
	const month = monthPart ?? currentMonth;
	const setYearMonth = (nextYear: number, nextMonth: number): void => {
		props.onYmChange(`${String(nextYear)}-${String(nextMonth).padStart(2, "0")}`);
	};
	/** 选中行的 key（核心 Table 的选中态：淡蓝底 + 左竖条）。 */
	const [selected, setSelected] = useState<string | null>(null);
	/** 延后的「打开文档」定时器：先让选中样式提交并绘制，再把链接扔给 dock。 */
	const pendingOpen = useRef<number | null>(null);
	/** 已经处理过的滚动请求 token（同一次点击只滚一次）。 */
	const lastScrollToken = useRef<number>(-1);
	useEffect(
		() => () => {
			if (pendingOpen.current !== null) window.clearTimeout(pendingOpen.current);
		},
		[],
	);

	// 首屏 + 筛选变化：整表重来（筛选在 host 侧做）
	useEffect(() => {
		let alive = true;
		setLoading(true);
		setError(null);
		setRecords([]);
		setPageCount(1);
		fetchHistoryList({ workspace, owner })
			.then((payload) => {
				if (!alive) return;
				setRecords(payload.records);
			})
			.catch((reason: unknown) => {
				if (alive)
					setError(reason instanceof Error ? reason.message : String(reason));
			})
			.finally(() => {
				if (alive) setLoading(false);
			});
		return () => {
			alive = false;
		};
	}, [workspace, owner]);

	/** 只留所选年月：`finished` 形如 `YYYY-MM-DD HH:mm`，取前 7 位比 `YYYY-MM`。 */
	const scoped = useMemo(() => {
		const prefix = `${year}-${String(month).padStart(2, "0")}`;
		return records.filter((record) => record.finished.slice(0, 7) === prefix);
	}, [month, records, year]);
	const pages = useMemo(() => sliceByDay(scoped), [scoped]);
	const hasMore = pageCount < pages.length;
	const visible = useMemo(() => pages.slice(0, pageCount).flat(), [pageCount, pages]);
	const loadMore = useCallback(() => {
		setPageCount((count) => count + 1);
	}, []);

	// 天 → 工作区段（段序跟「全部工作区」下拉一致，翻页追加不会跳位）
	const orderOf = useCallback(
		(id: string): number => {
			const index = props.workspaceOptions.findIndex((option) => option.value === id);
			return index < 0 ? Number.MAX_SAFE_INTEGER : index;
		},
		[props.workspaceOptions],
	);
	const days = useMemo<readonly DayBlock[]>(() => {
		const out: { day: string; groups: Map<string, { title: string; rows: TableRow[] }> }[] = [];
		for (const record of visible) {
			const day = record.finished.slice(0, 10);
			let block = out[out.length - 1];
			if (block === undefined || block.day !== day) {
				block = { day, groups: new Map() };
				out.push(block);
			}
			let group = block.groups.get(record.workspaceId);
			if (group === undefined) {
				group = { title: record.workspaceTitle, rows: [] };
				block.groups.set(record.workspaceId, group);
			}
			group.rows.push(rowOf(record, { solo: props.solo, t, onOwner: setOwner }));
		}
		return out.map((block) => ({
			day: block.day,
			groups: [...block.groups.entries()]
				.sort((a, b) => orderOf(a[0]) - orderOf(b[0]))
				.map(([id, group]) => ({ id, title: group.title, rows: group.rows })),
		}));
	}, [orderOf, props.solo, t, visible]);

	// 点图表里的日 / 周 / 「本周结案」卡 ⇒ 页面滚到列表里那一天（用户 2026-10-31）。
	// 两层等待，少一层就滚偏：
	//  ① **数据**：列表是整窗一次拉回、前端按天分页，只渲染第一页 ⇒ 先把分页扩到目标天
	//     所在的那一页，等它渲染出来、days 变了再重进本 effect（中间几页照常渲染，不跳过）；
	//  ② **定位**：目标天**没有记录**时（周末、或被工作区/执行人滤掉）落到「目标日或更早的
	//     最近一天」。这一步必须在**全量** scoped 里算 —— 老实现只在已渲染的块里找最近，
	//     于是点「上周结案」（上周日多半没结案）会停在第一页最后一天（用户 2026-10-31 真机）。
	useEffect(() => {
		const target = props.scrollTo;
		if (target === null || target.token === lastScrollToken.current) return;
		// ⚠️ 必须**先**判 loading：首帧 records 还空时，下面会把「数据没到」算成「本月没有记录」
		// 并把 token 记成已处理 —— 之后数据到了也不会再滚（用户 2026-10-31 真机：完全不动）
		if (loading) return;
		const dayOf = (record: HistoryRecord): string => record.finished.slice(0, 10);
		const fallback =
			scoped.find((record) => dayOf(record) < target.date) ?? scoped[scoped.length - 1];
		const day = scoped.some((record) => dayOf(record) === target.date)
			? target.date
			: fallback?.finished.slice(0, 10);
		if (day === undefined) {
			// 本月一条记录都没有：没有可滚的位置，直接记为已处理，别挂在那里等
			lastScrollToken.current = target.token;
			return;
		}
		const pageOfTarget = pages.findIndex((page) => page.some((record) => dayOf(record) === day));
		if (pageOfTarget >= pageCount) {
			// 数据已在内存，只是本地分页没渲染 ⇒ 扩到那一页就等下一次（不标记 token）
			setPageCount((count) => Math.max(count, pageOfTarget + 1));
			return;
		}
		const el = Array.from(document.querySelectorAll<HTMLElement>("[data-dsh-day]")).find(
			(node) => node.dataset.dshDay === day,
		);
		// 那一天还没渲染出来 ⇒ 不标记 token，等 days 变化再进
		if (el === undefined) return;
		lastScrollToken.current = target.token;
		el.scrollIntoView({ block: "start", behavior: "smooth" });
	}, [days, loading, pageCount, pages, props.scrollTo, scoped]);

	// 单人台账：执行人整列不摆（与待办里「单人不显示执行人名」同一条规矩）
	const columnsOf = useCallback(
		(title: ReactNode): readonly TableColumn[] => [
			{ key: "task", title },
			{ key: "creator", title: t("histColCreator"), width: 175 },
			...(props.solo
				? []
				: [{ key: "owner", title: t("histColOwner"), width: 140 }]),
			{ key: "time", title: t("histColTime"), width: 185 },
		],
		[props.solo, t],
	);

	/** 行 key → 过程文档路径（没有 worklog 的不在表里 ⇒ 点了只选中、不打开）。 */
	const fileOf = useMemo(() => {
		const map = new Map<string, string>();
		for (const record of visible)
			if (record.filePath !== "") map.set(record.key, record.filePath);
		return map;
	}, [visible]);

	/** 点行 = 选中 + 把路径交给核心。选中态当场提交；dock 的打开推到本帧绘制之后。 */
	const handleRowClick = (row: TableRow): void => {
		const key = String(row.key);
		if (key.startsWith("day:") || key.startsWith("ws:")) return;
		setSelected(key);
		const file = fileOf.get(key);
		if (file === undefined) return;
		// 2026-10-31 真机：点五六次才有选中样式。根因是这里同步打开 dock（核心要建 React 根、
		// 改宿主布局、强制重排），把 setSelected 的 commit + paint 一起拖到它后面。
		// 先提交选中，再把「扔链接给 dock」推到本帧绘制之后；连点时只开最后一个（新的取消旧的）。
		if (pendingOpen.current !== null) window.clearTimeout(pendingOpen.current);
		pendingOpen.current = window.setTimeout(() => {
			pendingOpen.current = null;
			props.onOpen(file);
		}, 0);
	};

	/** 一天的表格列数：跨列的段首行要盖满。 */
	const colSpan = props.solo ? 3 : 4;

	/** 可选年份：今年往前 5 年。 */
	const years = useMemo(
		() => Array.from({ length: 6 }, (_, index) => currentYear - index),
		[currentYear],
	);
	/** 今年只显示到当月（用户 2026-10-31：「只显示到当前月份」），往年 12 个月全显示。 */
	const shownMonths = year === currentYear ? currentMonth : 12;

	const body =
		days.length === 0
			? [
					h(Table, {
						key: "state",
						columns: columnsOf(t("histColDate")),
						rows: [],
						ariaLabel: t("histListLabel"),
						emptyText: t("historyEmpty"),
						loading,
					}),
				]
			// 一天**一张表**（用户 2026-10-31）：表头只出一次，天内按工作区分段
			// （段首一行写工作区名）。多个表垒起来会让每段表头上叠出两条线。
			: days.map((block, dayIndex) =>
					h(
						"div",
						{
							key: block.day,
							className: "dtl-histlist__dayblock",
							"data-dsh-day": block.day,
						},
						h(Table, {
							columns: columnsOf(
								h(SectionHead, {
									title: `${block.day} · ${weekdayOf(block.day, t)}`,
									accent: "default",
									flush: true,
								}),
							),
							rows: block.groups.flatMap((group) => [
								workspaceRow(group.title, colSpan),
								...group.rows,
							]),
							ariaLabel: block.day,
							className: "dtl-histlist__table",
							// 左右也要外框（用户 2026-10-31）⇒ 四边都画
							borders: "all",
							selectedKeys: selected === null ? [] : [selected],
							onRowClick: handleRowClick,
							// 滚动加载只挂最后一天：每天一张表，每张都挂会重复触发
							...(dayIndex === days.length - 1
								? { onLoadMore: loadMore, hasMore }
								: {}),
						}),
					),
				);

	return h(
		"div",
		{ className: "dtl-histlist" },
		h(
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
		),
		error === null
			? null
			: h("div", { className: "dtl-histlist__error" }, `${t("loadFailed")}：${error}`),
		...body,
	);
}
