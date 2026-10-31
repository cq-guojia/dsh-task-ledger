/**
 * 历史页下半部分：筛选行（工作区 / 执行人）+ 结案记录表格。
 *
 * 结构（2026-10-31 用户定稿）：
 *  2026-10-31                       ← 每天一个 SectionHead（带短竖线）
 *    [C.dsh-plugin-core | 执行人 | 开始时间 | 结束时间]   ← 当天每个工作区一小段，
 *    任务行…                                              表头第一格直接写工作区名
 *    [W.NAS-Docker | 执行人 | 开始时间 | 结束时间]
 *    任务行…
 *  2026-10-30
 *    …
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
import { createElement as h, useCallback, useEffect, useMemo, useState } from "react";
import { fetchHistoryList } from "./api";
import { formatRelative } from "./format";
import type { Translate } from "./locales";
import { displayName } from "./rows";
import type { HistoryRecord } from "./types";
import { Select, Button, SectionHead, Tag } from "./ui";

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

/** 工作区段首行（跨满全列）。 */
function workspaceRow(title: string, colSpan: number): TableRow {
	return {
		key: `ws:${title}`,
		cells: {
			task: {
				content: h("div", { className: "dtl-histlist__ws" }, title),
				colSpan,
			},
		},
	};
}

/** 一条记录 → 一行。第一列排版**照抄待办行**：标题 + `[@谁 创建于 X 前]` 灰徽，第二行标签。 */
function rowOf(
	record: HistoryRecord,
	opts: {
		readonly solo: boolean;
		readonly t: Translate;
		readonly onOwner: (uuid: string) => void;
	},
): TableRow {
	// 行内点击会被 Table 的行点击接走（打开文档）⇒ 标签 / 人名这些「自己的事」先拦住冒泡；
	// 待办行是同一套做法（`target.closest("button")`），只是这里 Table 不给事件对象，只能就地拦。
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
	// 创建徽：与待办同一套文案与格式；单人台账只留时间、不写名字
	const creatorAge = record.created === "" ? null : formatRelative(record.created, opts.t);
	const creatorName = displayName(record.creatorName, record.creator);
	const stampText =
		creatorAge === null
			? ""
			: opts.solo || creatorName === ""
				? `[${opts.t("fieldCreatorStamp", { age: creatorAge })}]`
				: `[@${creatorName} ${opts.t("fieldCreatorStamp", { age: creatorAge })}]`;
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
					stampText === ""
						? null
						: h("span", { className: "dtl-histlist__stamp" }, stampText),
				),
				record.tags.length === 0
					? null
					: h(
							"div",
							{ className: "dtl-histlist__tags", onClick: stop },
							...record.tags.map((tag) =>
								h(Tag, { key: tag, text: `#${tag}`, maxWidth: 160 }),
							),
						),
			),
			owner: who,
			start: record.created.slice(0, 16),
			end: record.finished.slice(0, 16),
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
	/** 选中行的 key（核心 Table 的选中态：淡蓝底 + 左竖条）。 */
	const [selected, setSelected] = useState<string | null>(null);

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

	const pages = useMemo(() => sliceByDay(records), [records]);
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

	// 单人台账：执行人整列不摆（与待办里「单人不显示执行人名」同一条规矩）
	const columnsOf = useCallback(
		(title: string): readonly TableColumn[] => [
			{ key: "task", title },
			...(props.solo
				? []
				: [{ key: "owner", title: t("histColOwner"), width: 140 }]),
			{ key: "start", title: t("histColStart"), width: 150 },
			{ key: "end", title: t("histColEnd"), width: 150 },
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

	/** 点行 = 选中 + 把路径交给核心（不做任何合并 / 排队 / 延迟）。 */
	const handleRowClick = (row: TableRow): void => {
		const key = String(row.key);
		if (key.startsWith("day:") || key.startsWith("ws:")) return;
		setSelected(key);
		const file = fileOf.get(key);
		if (file !== undefined) props.onOpen(file);
	};

	/** 一天的表格列数：跨列的段首行要盖满。 */
	const colSpan = props.solo ? 3 : 4;

	const body =
		days.length === 0
			? [
					h(Table, {
						key: "state",
						columns: columnsOf(t("histColTask")),
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
						{ key: block.day, className: "dtl-histlist__dayblock" },
						h(
							"div",
							{ className: "dtl-histlist__daytitle" },
							h(SectionHead, { title: block.day, accent: "default" }),
						),
						h(Table, {
							columns: columnsOf(t("histColTask")),
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
		error === null
			? null
			: h("div", { className: "dtl-histlist__error" }, `${t("loadFailed")}：${error}`),
		...body,
	);
}
