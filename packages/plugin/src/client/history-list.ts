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
import { fetchHistoryList, isIdentityMissing, postTaskAction, type TaskActionStep } from "./api";
import { ReasonTaskModal } from "./cancel-task-modal";
import type { LocaleKey, Translate } from "./locales";
import { displayName } from "./rows";
import { markIdentityMissing } from "./store";
import type { HistoryRecord } from "./types";
import {
	Select, Button, SectionHead, Segmented, SplitGroup, Surface, Tag, Loader,
	IconButton, Icon, Tip, notify,
} from "./ui";

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
	/** 删除成功后通知页面层重取统计与趋势（删掉的行不该还留在图表里）。 */
	readonly onDeleted: () => void;
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
		readonly t: Translate;
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
	// 标签只摆一行：放不下的由容器 `overflow:hidden` 直接裁掉（行高必须定死，
	// 换行会把虚拟窗口算歪）。取消的任务在最前面多一枚「取消」标识（用户 2026-11-03）。
	const cancelled = record.result === "cancelled";
	return {
		task: h(
			"div",
			{ className: "dtl-histlist__task" },
			h(
				"div",
				{ className: "dtl-histlist__head" },
				h(
					"span",
					{ className: "dtl-histlist__title" },
					record.title,
				),
			),
			!cancelled && record.tags.length === 0
				? null
				: h(
						"div",
						{ className: "dtl-histlist__tags" },
						cancelled
							? h(Tag, {
									key: "__cancelled",
									text: opts.t("historyCancelled"),
									tone: "danger",
									maxWidth: 60,
								})
							: null,
						...record.tags.map((tag) => h(Tag, { key: tag, text: `#${tag}`, maxWidth: 160 })),
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
	/** 当前 `records` 属于哪个月：切月首帧还是旧月份的数据，滚动请求必须等它对上再处理。 */
	const [loadedYm, setLoadedYm] = useState<string | null>(null);
	/** 选中行的 key（淡蓝底 + 左竖条）。 */
	const [selected, setSelected] = useState<string | null>(null);
	/** 延后的「打开文档」定时器：先让选中样式提交并绘制，再把链接扔给 dock。 */
	const pendingOpen = useRef<number | null>(null);
	/** 已经处理过的滚动请求 token（同一次点击只滚一次）。 */
	const lastScrollToken = useRef<number>(-1);
	/** 取过的月份（`ym|工作区|执行人` → 记录 + 取回时刻）：来回切月不再请求，60 秒后重取。 */
	const monthCache = useRef(new Map<string, { records: readonly HistoryRecord[]; at: number }>());
	/** 表里这批记录属于哪个筛选键：同一键的**重取**（删完一行刷新）不清表，只静默替换。 */
	const loadedKey = useRef<string | null>(null);
	/** 删除后的滚动锚点：被删行之后第一条还活着的记录 + 它在删除前的表格偏移（见 captureDeletion）。 */
	const deleteAnchor = useRef<{ key: string; oldOffset: number; scrollTop: number } | null>(null);
	/** 删除弹窗：目标历史行 / 提交状态 / 阶段 / host 回的人话错误。 */
	const [deleteTarget, setDeleteTarget] = useState<HistoryRecord | null>(null);
	const [deleteBusy, setDeleteBusy] = useState(false);
	const [deleteStep, setDeleteStep] = useState<TaskActionStep | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	/** 删除成功后让取数 effect 重跑（月份缓存会清掉，不能让 60 秒内的旧行再冒出来）。 */
	const [reloadToken, setReloadToken] = useState(0);
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
		// 同一套筛选的重取（删完一行后的刷新）⇒ 保留旧数据：清表会闪一屏空表，
		// 内容一归零浏览器还会把 scrollTop 夹到顶上（删一行 = 跳回列表开头）。
		const sameFilter = loadedKey.current === key;
		const hit = monthCache.current.get(key);
		if (hit !== undefined && Date.now() - hit.at < 60_000) {
			setRecords(hit.records);
			loadedKey.current = key;
			setLoadedYm(props.ym);
			setLoading(false);
			setError(null);
			return;
		}
		setLoading(true);
		setError(null);
		if (!sameFilter) {
			setRecords([]);
			setLoadedYm(null);
		}
		fetchHistoryList({ ym: props.ym, workspace, owner })
			.then((payload) => {
				if (!alive) return;
				monthCache.current.set(key, { records: payload.records, at: Date.now() });
				loadedKey.current = key;
				setRecords(payload.records);
				setLoadedYm(props.ym);
			})
			.catch((reason: unknown) => {
				if (!alive) return;
				// 没身份不是「这一月读挂了」：整页切身份页（用户 2026-11-01 的登录闸口径）
				if (isIdentityMissing(reason)) {
					markIdentityMissing();
					return;
				}
				// 表里还是同一套筛选的旧行（没清过）⇒ 它们仍然属于这个月，别把列表判成「没数据」
				if (sameFilter) setLoadedYm(props.ym);
				setError(reason instanceof Error ? reason.message : String(reason));
			})
			.finally(() => {
				if (alive) setLoading(false);
			});
		return () => {
			alive = false;
		};
	}, [owner, props.ym, workspace, reloadToken]);

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

	/**
	 * 删除前记下滚动锚点（用户 2026-11-04）：
	 * 删一行会让它下面的一切整体上移一格，于是「删完列表跳一下」。
	 * 先记住**被删行之后第一条还活着的记录**在表格坐标系里的偏移，新列表渲染完再按它回填
	 * （见下面那个 useLayoutEffect）。
	 *
	 * 为什么按身份回填、而不是「scrollTop 减去行高」：浏览器自带 scroll anchoring 也会在
	 * DOM 变短时自己调 scrollTop，减法会和它叠成两次。按存活行重算绝对位置才是可叠加、可验证的。
	 */
	const captureDeletion = (key: string): void => {
		deleteAnchor.current = null;
		if (heights === null || offsets === null) return;
		const table = tableRef.current;
		const container = props.scrollContainer();
		if (table === null || container === null) return;
		const index = items.findIndex((item) => item.key === key);
		if (index < 0) return;
		// 视口顶端落在表格坐标系里的位置：容器滚动量减去「表格顶边在滚动内容里的偏移」
		const base = container.scrollTop + (table.getBoundingClientRect().top - container.getBoundingClientRect().top);
		const viewTop = container.scrollTop - base;
		// 被删行整个在视口下方 ⇒ 上面的内容一格都没动，不用回填
		if ((offsets[index] ?? 0) >= viewTop + container.clientHeight) return;
		let nextIndex = -1;
		for (let i = index + 1; i < items.length; i += 1) {
			if (items[i]?.kind === "rec") {
				nextIndex = i;
				break;
			}
		}
		// 它是本页最后一条记录：下面没有需要保持位置的东西
		if (nextIndex < 0) return;
		const next = items[nextIndex];
		if (next === undefined) return;
		deleteAnchor.current = {
			key: next.key,
			oldOffset: offsets[nextIndex] ?? 0,
			scrollTop: container.scrollTop,
		};
	};

	// 删除后回填（布局阶段、绘制之前）：把锚点行放回它删除前所在的屏幕位置。
	// 必须排在下面那个 recompute 的 layout effect 之前 —— 窗口要按回填后的 scrollTop 算。
	useLayoutEffect(() => {
		const anchor = deleteAnchor.current;
		if (anchor === null) return;
		deleteAnchor.current = null;
		if (offsets === null) return;
		const container = props.scrollContainer();
		if (container === null) return;
		const index = items.findIndex((item) => item.key === anchor.key);
		// 锚点没了（理论上不会：它是另一条记录）⇒ 不动，交给浏览器夹紧
		if (index < 0) return;
		container.scrollTop =
			anchor.scrollTop + (offsets[index] ?? 0) - anchor.oldOffset;
	}, [items, offsets, props.scrollContainer]);

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

	// 点图表里的日 / 周 / 月 / 「本周结案」卡 ⇒ 滚到该周期的第一天（用户 2026-11-02）。
	// 正序列表：取「目标日或其后」的第一个日期头（目标日当天没记录就落到该周期内第一天）；
	// 目标日晚于本月所有记录时，退回最后一个日期头。
	useEffect(() => {
		const target = props.scrollTo;
		if (target === null || target.token === lastScrollToken.current) return;
		// ⚠️ 必须先判 loading：首帧 records 还空时，会把「数据没到」算成「本月没有记录」
		// ⚠️ 还要判月份：点别的月的柱子时，这一帧拿到的仍是上个月的行（loading 还没翻成 true），
		// 在旧行里找不到目标日就会把 token 记成「已处理」⇒ 新数据到了也不再滚（用户 2026-11-01 真机）。
		if (loading || offsets === null || items.length === 0 || loadedYm !== props.ym) return;
		const finish = (): void => {
			lastScrollToken.current = target.token;
			props.onScrolled();
		};
		let index = items.findIndex((item) => item.kind === "day" && item.day >= target.date);
		if (index < 0) {
			for (let i = items.length - 1; i >= 0; i -= 1) {
				const found = items[i];
				if (found !== undefined && found.kind === "day") {
					index = i;
					break;
				}
			}
		}
		const table = tableRef.current;
		const container = props.scrollContainer();
		if (index < 0 || table === null || container === null) {
			// 本月没有任何日期头：没有可滚的位置，直接记为已处理
			finish();
			return;
		}
		const containerRect = container.getBoundingClientRect();
		const tableRect = table.getBoundingClientRect();
		const base = container.scrollTop + (tableRect.top - containerRect.top);
		container.scrollTo({ top: base + offsets[index], behavior: "smooth" });
		finish();
	}, [items, loadedYm, loading, offsets, props.onScrolled, props.scrollContainer, props.scrollTo, props.ym]);

	// 单人台账：执行人整列不摆（与待办里「单人不显示执行人名」同一条规矩）
	// 末尾多一列放删除钮：**不写表头文字**，定宽 48px 靠右（用户 2026-11-04）。
	// 执行时间列 185→150：两排 `S/E 2026-10-31 09:56` 实测约 143px 够用，不再空一大截。
	const columns = props.solo ? ([175, 150, 48] as const) : ([175, 140, 150, 48] as const);
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

	/** 删除写命令的阶段 → 底栏进度文案（与在办页同一套键）。 */
	const stepLabel: Record<TaskActionStep, LocaleKey> = {
		check: "actionStepCheck",
		sync: "actionStepSync",
		write: "actionStepWrite",
		commit: "actionStepCommit",
		push: "actionStepPush",
	};
	const deleteNotice = (): string | undefined =>
		deleteBusy
			? deleteStep === null
				? t("actionSyncing")
				: t(stepLabel[deleteStep])
			: undefined;

	/** 删除历史行：按 src + line 让 skill 原地打删除三列；成功后清月份缓存并重取。 */
	const deleteRecord = async (note: string): Promise<void> => {
		const target = deleteTarget;
		if (
			target === null ||
			target.src === "" ||
			target.line <= 0 ||
			target.fingerprint === ""
		)
			return;
		setDeleteBusy(true);
		setDeleteStep(null);
		setDeleteError(null);
		try {
			await postTaskAction(
				{
					action: "delete",
					workspace: target.workspaceId,
					src: target.src,
					line: target.line,
					fingerprint: target.fingerprint,
					...(note === "" ? {} : { summary: note }),
				},
				(next) => setDeleteStep(next),
			);
			setDeleteTarget(null);
			setSelected(null);
			if (pendingOpen.current !== null) {
				window.clearTimeout(pendingOpen.current);
				pendingOpen.current = null;
			}
			// 就地摘掉这一行（不等重取）：列表不闪、滚动位置按锚点回填。
			// 重取只是把本地视图与台账重新对齐（别的会话可能也刚改过）。
			captureDeletion(target.key);
			setRecords((prev) => prev.filter((row) => row.key !== target.key));
			monthCache.current.clear();
			setReloadToken((value) => value + 1);
			props.onDeleted();
			notify(t("actionDeleteDone", { title: target.title }), { variant: "success" });
		} catch (error) {
			setDeleteError(error instanceof Error ? error.message : String(error));
		} finally {
			setDeleteBusy(false);
			setDeleteStep(null);
		}
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
			// 操作列表头：一个字都不写，只占位对齐（读屏仍给个列名）
			h("th", {
				key: "delete",
				className: "dtl-histlist__headcell",
				scope: "col",
				style: cellHeight("day"),
				"aria-label": t("actionDelete"),
			}),
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
		const cells = cellsOf(record, {
			solo: props.solo,
			onOwner: setOwner,
			t: props.t,
		});
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
			// 删除钮：行 hover 才显（CSS 管显隐）。外层 div 拦住点击冒泡，
			// 否则点删除会顺带把这一行的过程文档打开到右侧 dock。
			h(
				"td",
				{
					key: "delete",
					className: "dtl-histlist__cell dtl-histlist__opcell",
					style: cellHeight("rec"),
				},
				h(
					"div",
					{
						className: "dtl-histlist__delete",
						onClick: (event: { stopPropagation: () => void }) => event.stopPropagation(),
					},
					h(Tip, {
						label: t("tipDelete"),
						children: h(IconButton, {
							variant: "plain",
							size: "md",
							label: t("actionDelete"),
							title: "",
							className: "dtl-iconbtn--muted",
							icon: h(Icon, { name: "common.base:shanchu" }),
							disabled:
								deleteBusy ||
								record.src === "" ||
								record.line <= 0 ||
								record.fingerprint === "",
							onClick: () => {
								setDeleteError(null);
								setDeleteTarget(record);
							},
						}),
					}),
				),
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
		// 表格外框（四边 1px + 圆角 12）交核心 Surface，表格自己只画内部分隔线
		h(Surface, { className: "dtl-histlist__frame", padding: null }, body),
		deleteTarget === null
			? null
			: h(ReasonTaskModal, {
					kind: "delete",
					t,
					taskTitle: deleteTarget.title || deleteTarget.key,
					busy: deleteBusy,
					notice: deleteNotice(),
					error: deleteError,
					onClose: () => setDeleteTarget(null),
					onSubmit: (note) => void deleteRecord(note),
				}),
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
					icon: h(Icon, { name: "common.base:gongzuoqu" }),
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
							icon: h(Icon, { name: "common.base:yonghu" }),
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
