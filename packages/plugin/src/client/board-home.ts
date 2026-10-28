/**
 * 看板首页（`main` 槽整页内容）：上 = 8 统计卡 + 趋势图位（**留空**）；下 = 单区任务列表。
 *
 * 2026-10-28：列表沿用原「我的待办」卡片样式，改成**左侧六档菜单 + 右侧三个过滤**的平铺列表。
 *  - 菜单六档**全部真筛**（积压 / 逾期 / 停滞 用 skill 下发的布尔）；
 *  - 工作区 / 执行人 / 搜索 **全部本地筛**（快照已含全部在办，不发请求）。
 *
 * 数据纪律：行上的 `mine` / `stale` / `overdue` / `backlog` 与阈值都来自 skill，
 * 前端只做布尔判断与渲染。刷新 = 挂载首读 + 手动刷新按钮，**不轮询**。
 */
import {
	IconFolderCloseRegular,
	IconRefreshOutlineRegular,
	IconUsersOutlineRegular,
} from "@deepseek-ai/dsh-client-ui-primitives";
import {
	createElement as h,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
} from "react";
import type { LocaleKey, Translate } from "./locales";
import { formatCount } from "./format";
import { openFilePreview } from "dsh-plugin-core/explorer";
import { ownerGroups, selectView, type Row } from "./rows";
import {
	boardSnapshot,
	boardSubscribe,
	refresh,
	setQuery,
	type TabFilter,
} from "./store";
import { TaskRowView } from "./task-row";
import type { BoardStatsView } from "./types";
import {
	Button,
	EmptyState,
	ensureUiBase,
	notify,
	SearchInput,
	Segmented,
	Select,
	StatCard,
} from "./ui";

// 构建期由 tsdown.client.config.ts 的 define 注入（版本读 package.json，编码是编译时刻时间戳）。
declare const __PLUGIN_VERSION__: string;
declare const __BUILD_STAMP__: string;

/** 主内容：占满、自己滚动；padding 只在内层，dock 才不会继承内边距。 */
const pageStyle: Record<string, string | number> = {
	height: "100%",
	width: "100%",
	flex: "1 1 auto",
	minWidth: 0,
	boxSizing: "border-box",
	overflow: "auto",
	padding: "24px 22px",
	color: "var(--dtl-fg)",
};
/** dock 的挂载行：**不带 padding**，dock 作为直接子项才能贴右/上/下边。 */
const mountStyle: Record<string, string | number> = {
	display: "flex",
	height: "100%",
	width: "100%",
	boxSizing: "border-box",
	minWidth: 0,
};
const headerStyle: Record<string, string | number> = {
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	gap: "var(--dtl-space-3)",
	flexWrap: "wrap",
	marginBottom: "var(--dtl-space-4)",
};
const titleStyle: Record<string, string | number> = {
	fontSize: "var(--dtl-font-xl)",
	fontWeight: 600,
};
/** 标题后的版本 + 构建编码：特别小的字（用户 2026-10-26 要求，一眼确认看到的是不是刚 build 的）。 */
const buildTagStyle: Record<string, string | number> = {
	marginLeft: "var(--dtl-space-2)",
	fontSize: "10px",
	lineHeight: "1",
	fontWeight: 400,
	color: "var(--dtl-fg-dim)",
	fontVariantNumeric: "tabular-nums",
	whiteSpace: "nowrap",
};
/** 统计区：左 8 块（2 行 × 4 列）+ 右趋势图位，参考图同款分栏。
 *  列数写死 4 → 2（媒体查询在 ui.ts 的 .dtl-stats / .dtl-stats__cards 里），
 *  绝不给 3 列——3 列会排出 3+1 的非对称（用户 2026-10-17：必须上下对称）。 */
const statsRowStyle: Record<string, string | number> = {
	marginBottom: "var(--dtl-space-4)",
};
const chartCardStyle: Record<string, string | number> = {
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	padding: "var(--dtl-space-4)",
};
const hintStyle: Record<string, string | number> = {
	fontSize: "var(--dtl-font-sm)",
	color: "var(--dtl-fg-2)",
};
/** 列表段头：滑块居左、过滤三件居右（用户 2026-10-28 去掉左侧标题）。 */
const regionHeadRowStyle: Record<string, string | number> = {
	display: "flex",
	alignItems: "center",
	gap: "6px",
	flexWrap: "wrap",
	margin: "calc(var(--dtl-space-4) * 2) 0 calc(var(--dtl-space-2) * 2)",
};
/** 工作区 / 执行人下拉宽度：核心 Picker 现已支持 min/max（超长省略号）。
 *  下限略大于旧 131 口径，上限兜底长名不被撑开压住后一个下拉。 */
const SELECT_MIN_WIDTH = 140;
const SELECT_MAX_WIDTH = 240;
/** 搜索框宽度（用户 2026-10-17：两区同款，96×2 = 192）。 */
const SEARCH_WIDTH = 192;

/** 列表最多渲染条数（用户 2026-10-28：内容过多时只给最新 100 条 + 底部提示）。 */
const LIST_LIMIT = 100;
/** 底部「截断提示」样式（临时：核心暂无对应样式，先按此观感；用户确认后再定型）。 */
const limitHintStyle: Record<string, string | number> = {
	marginTop: "var(--dtl-space-3)",
	padding: "var(--dtl-space-3) var(--dtl-space-4)",
	textAlign: "center",
	fontSize: "var(--dtl-font-sm)",
	lineHeight: "var(--dtl-line-sm)",
	color: "var(--dtl-fg-3)",
};

/** 左侧菜单（「我的待办」置顶、「全部」次之，其后六档本地真筛；角标 = 各档全量计数）。 */
const TABS: readonly { value: TabFilter; label: LocaleKey }[] = [
	{ value: "mine", label: "regionMine" },
	{ value: "all", label: "regionAll" },
	{ value: "open", label: "statOpen" },
	{ value: "doing", label: "statDoing" },
	{ value: "backlog", label: "statBacklog" },
	{ value: "overdue", label: "statOverdue" },
	{ value: "stale", label: "statStale" },
];

export function BoardHome(props: {
	t: Translate;
	onBack: () => void;
}): ReactNode {
	const { t, onBack } = props;
	ensureUiBase();
	const state = useSyncExternalStore(boardSubscribe, boardSnapshot);
	const mountRef = useRef<HTMLDivElement>(null);

	/** 查看：右侧 dock 预览过程文档；没有就打开台账文件夹（目录树）。
	 *  文件服务 / 会话 / flex 全由核心（connectHost 接线）接管，这里只给容器 + 路径。 */
	const handleView = (row: Row): void => {
		const mount = mountRef.current;
		if (mount === null) return;
		const base = row.task.workspace.path.replace(/\/+$/, "");
		const rel = row.task.worklog;
		const path =
			rel === null || rel === undefined || rel === ""
				? `${base}/ledger`
				: `${base}/ledger/${String(rel).replace(/^\/+/, "")}`;
		openFilePreview({ mount, path });
	};

	// 打开面板首读（后端纯按需，无推送无轮询）。
	useEffect(() => {
		// 首屏还没数据 ≠ 这一档没有任务：初始化期间给一条 Toast（只在没初始化过时给一次）。
		if (state.board === null) notify(t("dataLoading"));
		void refresh();
	}, []);

	const board = state.board;
	const stats = board?.stats;
	const view = useMemo(() => selectView(state), [state]);
	const degraded = board?.degraded ?? [];

	/** 工作区下拉候选：宿主里所有含台账的工作区（不是从任务里反推，空工作区也要能选）。 */
	const workspaceOptions = useMemo(
		() => [
			{ value: "", label: t("workspaceAll") },
			...(board?.workspaces ?? []).map((workspace) => ({
				value: workspace.id,
				label: workspace.title,
			})),
		],
		[board, t],
	);

	/** 统计卡：纯展示（用户 2026-10-17：先全去掉点击，界面定稿后再议滚动 / 筛选联动）。 */
	const card = (
		label: LocaleKey,
		value: number,
		hint: string,
		title?: string,
	): ReactNode =>
		h(StatCard, {
			label: t(label),
			value: formatCount(value),
			hint,
			title,
			interactive: false,
		});

	/** 子集卡占比小字：分母为 0 或自己没有 ⇒ 不显示（不拿 0% 充数）。 */
	const share = (part: number, whole: number, key: LocaleKey): string =>
		part > 0 && whole > 0
			? t(key, { n: Math.round((part / whole) * 100) })
			: "";

	/** 统计台卡：不可点，hover 给具体日期区间；数字 null（历史读不到）留 '—'，不拿 0 充数。 */
	const weekCard = (
		label: LocaleKey,
		done: number | null,
		from: string,
		to: string,
	): ReactNode =>
		h(StatCard, {
			label: t(label),
			value: formatCount(done ?? 0),
			interactive: false,
			title: t("periodRange", { from, to }),
		});

	/** 左 8 块（2×4）+ 右趋势图位。 */
	const statsGrid = (view: BoardStatsView): ReactNode =>
		h(
			"div",
			{ className: "dtl-stats", style: statsRowStyle },
			h(
				"div",
				{ className: "dtl-stats__cards" },
				// 按列成对（用户 2026-10-19 选 A）：每列上下是同一对象的两个视角，
				// 子集关系一眼可见 —— 积压 ⊂ 待认领、逾期 / 停滞 ⊂ 进行中。
				// DOM 按**列序**写，CSS 的 grid-auto-flow:column 保证 4 列 / 2 列两种排布下都成对。
				card(
					"statMyActive",
					view.myActive,
					[
						view.myOverdue > 0
							? t("statMyOverdueHint", { n: view.myOverdue })
							: null,
						view.myStale > 0
							? t("statMyStaleHint", { n: view.myStale })
							: null,
					]
						.filter((part) => part !== null)
						.join(" ｜ "),
				),
				card(
					"statDoing",
					view.doing,
					view.doing - view.myActive > 0
						? t("statDoingHint", { n: view.doing - view.myActive })
						: t("statDoingAllMine"),
				),
				card(
					"statOpen",
					view.open,
					view.oldestOpenDays === null
						? ""
						: t("statOpenHint", { n: view.oldestOpenDays }),
				),
				card(
					"statBacklog",
					view.backlog,
					share(view.backlog, view.open, "statBacklogHint"),
					t("statBacklogTitle", { n: view.backlogDays }),
				),
				card(
					"statOverdue",
					view.overdue,
					share(view.overdue, view.doing, "statOverdueHint"),
					t("statOverdueTitle", { n: view.overdueDays }),
				),
				card(
					"statStale",
					view.stale,
					share(view.stale, view.doing, "statStaleHint"),
					t("statStaleTitle", { n: view.staleDays }),
				),
				weekCard("statWeekDone", view.weekDone, view.weekFrom, view.weekTo),
				weekCard(
					"statLastWeekDone",
					view.lastWeekDone,
					view.lastWeekFrom,
					view.lastWeekTo,
				),
			),
			h(
				"div",
				{ className: "dtl-card", style: chartCardStyle },
				// 趋势图：skill 侧还没有「按周汇总」方法 ⇒ 卡位留着，不画假图。
				h("div", { style: hintStyle }, t("chartNotReady")),
			),
		);

	/** 段头：六档菜单居左，工作区 / 执行人 / 搜索居右（用户 2026-10-28：不要左侧标题）。 */
	const regionHead = h(
		"div",
		{ style: regionHeadRowStyle },
		h(Segmented<TabFilter>, {
			id: "dtl-list-tab",
			value: state.query.tab,
			label: t("statusLabel"),
			items: TABS.map((tab) => ({
				value: tab.value,
				label: t(tab.label),
				badge:
					view.counts[tab.value] > 0
						? formatCount(view.counts[tab.value])
						: undefined,
			})),
			size: "lg",
			onChange: (next) => {
				setQuery({ tab: next });
			},
		}),
		// 撑开中间，右侧三件靠右。
		h("span", { style: { flex: "1 1 auto" } }),
		// 工作区过滤：真筛。宽度靠外层定，核心 Picker 不吃 width/minWidth。
		// 工作区下拉：核心 Picker 原生 min/max（超长省略号，不被撑开压住后一个下拉）。
		h(
			"div",
			{ style: { flex: "none" } },
			h(Select<string>, {
				searchable: true,
				size: "lg",
				minWidth: SELECT_MIN_WIDTH,
				maxWidth: SELECT_MAX_WIDTH,
				icon: h(IconFolderCloseRegular, { size: 16 }),
				value: workspaceOptions.some(
					(option) => option.value === state.query.workspace,
				)
					? state.query.workspace
					: "",
				options: workspaceOptions,
				ariaLabel: t("workspaceLabel"),
				onChange: (next) => {
					setQuery({ workspace: next });
				},
			}),
		),
		// 执行人过滤：候选 = 各工作区花名册合并（跨工作区去重 / 分组在 `ownerGroups`）。
		// 程序未接（选了不真筛），但选项已按通用 / 工作区分好组；同样给 min/max 防撑开。
		h(
			"div",
			{ style: { flex: "none" } },
			h(Select<string>, {
				searchable: true,
				size: "lg",
				minWidth: SELECT_MIN_WIDTH,
				maxWidth: SELECT_MAX_WIDTH,
				icon: h(IconUsersOutlineRegular, { size: 16 }),
				value: state.query.owner,
				options: [{ value: "", label: t("ownerAll") }],
				groups: ownerGroups(board, workspaceOptions, t),
				ariaLabel: t("ownerLabel"),
				onChange: (next) => {
					setQuery({ owner: next });
				},
			}),
		),
		// 通用搜索：**样式已铺、程序未接**（输入暂不过滤）。
		h(
			"div",
			{ style: { width: `${SEARCH_WIDTH}px`, flex: "none" } },
			h(SearchInput, {
				size: "lg",
				value: state.query.keyword,
				placeholder: t("searchPlaceholder"),
				ariaLabel: t("searchPlaceholder"),
				onChange: (next) => {
					setQuery({ keyword: next });
				},
			}),
		),
	);

	return h(
		"div",
		{ ref: mountRef, style: mountStyle },
		h(
			"div",
			{ style: { ...pageStyle, display: "flex", justifyContent: "center" } },
			h(
				"div",
				{
					style: {
						width: "100%",
						maxWidth: "1280px",
						minWidth: 0,
						boxSizing: "border-box",
					},
				},
				h(
					"div",
					{ style: headerStyle },
					h(
						"div",
						{
							style: {
								display: "flex",
								alignItems: "center",
								gap: "var(--dtl-space-3)",
								minWidth: 0,
							},
						},
						h(
							Button,
							{ variant: "outline", size: "md", onClick: onBack },
							`← ${t("backToConversation")}`,
						),
						h(
							"div",
							{ style: titleStyle },
							t("panelTitle"),
							h(
								"span",
								{
									style: buildTagStyle,
									title: `v${__PLUGIN_VERSION__} · ${__BUILD_STAMP__}`,
								},
								`v${__PLUGIN_VERSION__} ${__BUILD_STAMP__}`,
							),
						),
					),
					h(
						Button,
						{
							variant: "outline",
							size: "lg",
							icon: h(IconRefreshOutlineRegular, { size: 16 }),
							// 转圈 / 禁用都交核心 Button 的 loading 档，不自绘。
							loading: state.refreshing,
							title: t("refresh"),
							onClick: () => {
								void refresh();
							},
						},
						state.refreshing ? t("refreshing") : t("refresh"),
					),
				),
				// 未就绪不渲染；读挂给红色原因 + 重试（不画 0 充数）。
				state.status === "error" && board === null
					? h(
							"div",
							{
								style: {
									display: "flex",
									alignItems: "center",
									gap: "var(--dtl-space-2)",
								},
							},
							h(
								"span",
								{
									style: {
										color: "var(--dtl-danger)",
										fontSize: "var(--dtl-font-md)",
									},
								},
								`${t("loadFailed")}：${state.error ?? ""}`,
							),
							h(
								Button,
								{
									variant: "outline",
									size: "sm",
									onClick: () => {
										void refresh();
									},
								},
								t("retry"),
							),
						)
					: null,
				stats === undefined ? null : statsGrid(stats),
				// 降级横幅：有工作区读挂 ⇒ 红色警告 + 人话原因（数字会少算，别装没看见）
				degraded.length === 0
					? null
					: h(
							"div",
							{
								style: {
									display: "flex",
									alignItems: "flex-start",
									gap: "var(--dtl-space-2)",
									padding: "var(--dtl-space-2) var(--dtl-space-3)",
									marginTop: "var(--dtl-space-3)",
									border: "1px solid var(--dtl-danger)",
									borderRadius: "var(--dtl-radius-md)",
									background: "var(--dtl-danger-soft)",
									color: "var(--dtl-fg)",
									fontSize: "var(--dtl-font-sm)",
									lineHeight: "var(--dtl-line-sm)",
								},
							},
							h(
								"span",
								{
									style: {
										color: "var(--dtl-danger)",
										flex: "none",
										fontWeight: 600,
									},
								},
								t("degradedTitle"),
							),
							h(
								"span",
								null,
								degraded
									.map((item) =>
										t("degradedItem", {
											title: item.workspaceTitle,
											message: item.message,
										}),
									)
									.join("；"),
							),
						),
				regionHead,
				// 首屏没数据（board === null）≠ 空结果：还没初始化就什么都不画，别拿「没有任务」骗人。
				board === null
					? null
					: view.rows.length === 0
						? h(EmptyState, {
								title: t("listEmpty"),
								hint: t("listEmptyHint"),
							})
						: h(
								"div",
								null,
								view.rows
									.slice(0, LIST_LIMIT)
									.map((row) =>
										h(TaskRowView, {
											key: row.key,
											t,
											row,
											onView: handleView,
										}),
									),
							),
				view.rows.length > LIST_LIMIT
					? h("div", { style: limitHintStyle }, t("listLimitHint", { n: LIST_LIMIT }))
					: null,
			),
		),
	);
}
