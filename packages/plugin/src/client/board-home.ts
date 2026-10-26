/**
 * 看板首页（`main` 槽整页内容）：8 统计卡 + 近 8 周趋势图 + 两区任务列表。
 * 定稿见 docs/design/features/board-home.md §二（2026-10-17 专家组改版）；
 * 按钮矩阵归「任务按钮与会话交接」任务（写入路径 A/B 未拍板），本页**不画**任务动作按钮。
 *
 * 刷新纪律（2026-10-17 拍板）：挂载首读 + 手动刷新按钮，**不轮询**；空态三分
 * （未就绪不渲染 / 真空引导卡 / 筛选空小字）。
 */

import {
	IconChecklistOutlineRegular,
	IconFlatListOutlineRegular,
	IconFolderCloseRegular,
	IconFolderOpenRegular,
	IconRefreshOutlineRegular,
} from "@deepseek-ai/dsh-client-ui-primitives";
import {
	type ChangeEvent,
	createElement as h,
	type ReactNode,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from "react";
import type { LocaleKey, Translate } from "./locales";
import { isMine, selectView, type WorkspaceGroup } from "./rows";
import {
	boardSnapshot,
	boardSubscribe,
	refresh,
	type StatusFilter,
	setQuery,
} from "./store";
import { TaskRowView } from "./task-row";
import type { BoardPayload, PeriodCounts } from "./types";
import {
	Button,
	ChartLegend,
	EmptyState,
	ensureUiBase,
	GroupedBarChart,
	SearchInput,
	Segmented,
	Select,
	StripCard,
	StatCard,
} from "./ui";

// 构建期由 tsdown.client.config.ts 的 define 注入（版本读 package.json，编码是编译时刻时间戳）。
declare const __PLUGIN_VERSION__: string;
declare const __BUILD_STAMP__: string;

type Tab = "tasks" | "stats";

/** 整页容器：占满中栏、自己滚动。 */
const pageStyle: Record<string, string | number> = {
	height: "100%",
	width: "100%",
	boxSizing: "border-box",
	overflow: "auto",
	padding: "24px 22px",
	color: "var(--dtl-fg)",
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
/** 统计区：左 8 块（2 行 × 4 列）+ 右趋势图，参考图同款分栏。
 *  列数写死 4 → 2（媒体查询在 ui.ts 的 .dtl-stats / .dtl-stats__cards 里），
 *  绝不给 3 列——3 列会排出 3+1 的非对称（用户 2026-10-17：必须上下对称）。 */
const statsRowStyle: Record<string, string | number> = {
	marginBottom: "var(--dtl-space-4)",
};
const chartCardStyle: Record<string, string | number> = {
	display: "flex",
	flexDirection: "column",
	gap: "var(--dtl-space-2)",
	padding: "var(--dtl-space-2) var(--dtl-space-3)",
};
const hintStyle: Record<string, string | number> = {
	fontSize: "var(--dtl-font-sm)",
	color: "var(--dtl-fg-2)",
};
/** 分区标题行：垂直居中（用户 2026-10-17：图标 / 标题 / 计数不许像下楼梯一样逐个低）；
 *  上下留白**翻倍**（用户 2026-10-18：两个大标题太挤）。 */
const regionHeadRowStyle: Record<string, string | number> = {
	display: "flex",
	alignItems: "center",
	gap: "var(--dtl-space-2)",
	margin: "calc(var(--dtl-space-4) * 2) 0 calc(var(--dtl-space-2) * 2)",
};
const regionHeadTitleStyle: Record<string, string | number> = {
	fontSize: "var(--dtl-font-lg)",
	fontWeight: 600,
};
/** 工作区下拉最小宽度（用户 2026-10-17：内容自适应，下限 = 旧定宽 175 的 3/4 ≈ 131）。 */
const WORKSPACE_SELECT_MIN = 131;
/** 搜索框宽度（用户 2026-10-17：两区同款，96×2 = 192）。 */
const SEARCH_WIDTH = 192;

/** 分组默认折叠阈值（组内太多条时先收起，用户点开）。 */
const GROUP_COLLAPSE_OVER = 30;

export function BoardHome(props: {
	t: Translate;
	onBack: () => void;
}): ReactNode {
	const { t, onBack } = props;
	ensureUiBase();
	const state = useSyncExternalStore(boardSubscribe, boardSnapshot);
	const [tab, setTab] = useState<Tab>("tasks");

	// 打开面板首读（后端纯按需，无推送无轮询）。
	useEffect(() => {
		void refresh();
	}, []);

	const board = state.board;
	const view = useMemo(() => selectView(state), [state]);
	const stats = board?.stats;
	// 趋势走慢路径（`/board/trend`，读 history）：晚到不影响列表；未到 / 失败时由统计卡与图表区各自兜底。
	const trend = state.trend;
	const periods = trend?.trend;
	const trendPending =
		state.trendStatus === "idle" || state.trendStatus === "loading";
	/** 快照 + 趋势两段各自的降级工作区（op 不同，合并展示，别装没看见）。 */
	const degraded = [...(board?.degraded ?? []), ...(trend?.degraded ?? [])];
	// 工作区下拉候选（用户 2026-10-17）：不读系统全量工作区，只从「我的」任务里提取工作区并排重
	// ⇒ 没有我任务的工作区不出现；口径与第一区一致（isMine 同源）。
	const workspaceOptions = useMemo(
		() => [
			{ value: "", label: t("workspaceAll") },
			...[
				...new Map(
					(board?.tasks ?? [])
						.filter((task) => isMine(task, board))
						.map((task) => [task.workspace.id, task.workspace.title]),
				),
			].map(([id, title]) => ({ value: id, label: title })),
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
			value,
			hint,
			title,
			interactive: false,
		});

	/** 子集卡占比小字：分母为 0 或自己没有 ⇒ 不显示（不拿 0% 充数）。 */
	const share = (part: number, whole: number, key: LocaleKey): string =>
		part > 0 && whole > 0
			? t(key, { n: Math.round((part / whole) * 100) })
			: "";

	/** 统计台卡：不可点（首页没有已结案可筛），hover 给具体日期区间。
	 *  趋势未到 / 读挂 ⇒ 数字留 '—'（StatCard 对 0 的处理）、小字整条不显示，**不拿 0 充数**。 */
	const periodCard = (
		label: LocaleKey,
		period: PeriodCounts | undefined,
	): ReactNode =>
		h(StatCard, {
			label: t(label),
			value: period?.done ?? 0,
			hint:
				period === undefined
					? undefined
					: t("statCreatedHint", { n: period.created }),
			interactive: false,
			title:
				period === undefined
					? undefined
					: t("periodRange", { from: period.from, to: period.to }),
		});

	const [chartScope, setChartScope] = useState<"all" | "mine">("all");
	const chartWeeks = useMemo(
		() =>
			(trend?.closed.weekly[chartScope] ?? []).map((bucket) => {
				// 容错：host 旧版可能不带 end（客户端/宿主版本错配时），退回用 week，绝不崩面板。
				const end = bucket.end ?? bucket.week ?? "";
				return {
					label: end.slice(5) || bucket.week?.slice(5) || "",
					done: bucket.done,
					remaining: bucket.remaining,
					created: bucket.created,
					title:
						chartScope === "mine"
							? `截至 ${end}（${t("chartOnlyMine")}）`
							: `截至 ${end}`,
				};
			}),
		[trend, chartScope, t],
	);
	const chartEmpty = chartWeeks.every(
		(week) => week.done === 0 && week.created === 0 && week.remaining === 0,
	);
	/** 被 skill 脚本整行跳过的历史行（列数不对 / 时间不合法）：图表数字已少算，要写出来。 */
	const trendWarnings = trend?.warnings ?? [];

	return h(
		"div",
		{ style: pageStyle },
		h(
			"div",
			{ style: { display: "flex", justifyContent: "center" } },
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
						"div",
						{
							style: {
								display: "flex",
								alignItems: "center",
								gap: "var(--dtl-space-2)",
							},
						},
						h(Segmented<Tab>, {
							id: "dtl-tab",
							value: tab,
							label: t("panelTitle"),
							items: [
								{ value: "tasks", label: t("tabTasks") },
								{ value: "stats", label: t("tabStats") },
							],
							onChange: setTab,
						}),
						h(
							Button,
							{
								variant: "outline",
								// lg：与同排 tab 滑轨同高（用户 2026-10-26：一行控件别一大一小）
								size: "lg",
								icon: h(IconRefreshOutlineRegular, { size: 16 }),
								disabled: state.refreshing,
								title: t("refresh"),
								onClick: () => {
									void refresh();
								},
							},
							state.refreshing ? t("refreshing") : t("refresh"),
						),
					),
				),
				tab === "stats"
					? // 统计报表尚未开建（另立任务）：占位说明，不画假图表。
						h("div", { style: hintStyle }, t("statsPlaceholder"))
					: h(
							"div",
							null,
							// ── 统计区：左 8 块（操作台 4 + 统计台 4）+ 右趋势图 ──
							stats === undefined
								? null
								: h(
										"div",
										{ className: "dtl-stats", style: statsRowStyle },
										h(
											"div",
											{ className: "dtl-stats__cards" },
											// 按列成对（用户 2026-10-19 选 A）：每列上下是同一对象的两个视角，
											// 子集关系一眼可见 —— 积压 ⊂ 待认领、逾期 / 停滞 ⊂ 进行中。
											// DOM 按**列序**写，CSS 的 grid-auto-flow:column 保证 4 列 / 2 列两种排布下都成对。
											// 小字一律给本卡独有的增量信息，**不重复全集**（用户 2026-10-19）：
											// 三块子集卡一律报**占全集的比例**（用户 2026-10-19 二选一时定占比），0 条时整条不显示。
											card(
												"statMyActive",
												stats.myActive,
												[
													stats.myOverdue > 0
														? t("statMyOverdueHint", { n: stats.myOverdue })
														: null,
													stats.myStale > 0
														? t("statMyStaleHint", { n: stats.myStale })
														: null,
												]
													.filter((part) => part !== null)
													.join(" ｜ "),
											),
											card(
												"statDoing",
												stats.doing,
												stats.doing - stats.myActive > 0
													? t("statDoingHint", {
															n: stats.doing - stats.myActive,
														})
													: t("statDoingAllMine"),
											),
											card(
												"statOpen",
												stats.open,
												stats.oldestOpenDays === null
													? ""
													: t("statOpenHint", { n: stats.oldestOpenDays }),
											),
											card(
												"statBacklog",
												stats.backlog,
												share(stats.backlog, stats.open, "statBacklogHint"),
												t("statBacklogTitle", { n: stats.backlogDays }),
											),
											card(
												"statOverdue",
												stats.overdue,
												share(stats.overdue, stats.doing, "statOverdueHint"),
												t("statOverdueTitle", { n: stats.overdueDays }),
											),
											card(
												"statStale",
												stats.stale,
												share(stats.stale, stats.doing, "statStaleHint"),
												t("statStaleTitle", { n: stats.staleDays }),
											),
											periodCard("statWeekDone", periods?.thisWeek),
											periodCard("statLastWeekDone", periods?.lastWeek),
										),
										h(
											"div",
											{ className: "dtl-card", style: chartCardStyle },
											// 右上角只留一个「只看我的」小复选框：勾上 = 我的，不勾 = 所有（用户 2026-10-17）
											h(
												"div",
												{
													style: {
														display: "flex",
														alignItems: "center",
														justifyContent: "flex-end",
													},
												},
												h(
													"label",
													{ className: "dtl-check" },
													h("input", {
														type: "checkbox",
														checked: chartScope === "mine",
														onChange: (
															event: ChangeEvent<HTMLInputElement>,
														) => {
															setChartScope(
																event.target.checked ? "mine" : "all",
															);
														},
													}),
													t("chartOnlyMine"),
												),
											),
											// 趋势是慢路径：未到给占位、读挂给兜底文案（带原因），就绪才画图——绝不画空图冒充「没有记录」。
											trendPending
												? h(
														"div",
														{
															style: {
																...hintStyle,
																padding: "var(--dtl-space-4) 0",
															},
														},
														t("chartLoading"),
													)
												: state.trendStatus === "error"
													? h(
															"div",
															{
																style: {
																	...hintStyle,
																	padding: "var(--dtl-space-4) 0",
																},
															},
															`${t("chartUnavailable")}${state.trendError === null ? "" : `：${state.trendError}`}`,
														)
													: chartEmpty
														? h(
																"div",
																{
																	style: {
																		...hintStyle,
																		padding: "var(--dtl-space-4) 0",
																	},
																},
																t("chartEmpty"),
															)
														: h(GroupedBarChart, {
																weeks: chartWeeks,
																ariaLabel: t("chartTitle"),
																doneLabel: t("chartLegendDone"),
																remainingLabel: t("chartLegendRemaining"),
																createdLabel: t("chartLegendCreated"),
															}),
											h(ChartLegend, {
												doneLabel: t("chartLegendDone"),
												remainingLabel: t("chartLegendRemaining"),
												createdLabel: t("chartLegendCreated"),
											}),
											// 被脚本跳过的坏历史行：数字已经少算，必须说出来（悬停看逐条原因）
											trendWarnings.length > 0
												? h(
														"div",
														{
															style: {
																...hintStyle,
																color: "var(--dtl-warning)",
															},
															title: trendWarnings.join("\n"),
														},
														t("chartWarnings", {
															n: trendWarnings.length,
														}),
													)
												: null,
										),
									),

							// ── 列表 ──
							state.status === "loading" && board === null
								? null // 未就绪：不渲染
								: state.status === "error" && board === null
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
									: board !== null && board.workspaces.length === 0
										? h(EmptyState, {
												tone: "guide",
												title: t("emptyNoWorkspace"),
												hint: t("emptyNoWorkspaceHint"),
											})
										: h(
												"div",
												null,
												// 降级横幅：有工作区读挂 ⇒ 红色警告 + 人话原因（单工作区坏不拖垮其余，别装没看见）
												board !== null && (board.degraded?.length ?? 0) > 0
													? h(
															"div",
															{
																style: {
																	display: "flex",
																	alignItems: "flex-start",
																	gap: "var(--dtl-space-2)",
																	padding:
																		"var(--dtl-space-2) var(--dtl-space-3)",
																	marginBottom: "var(--dtl-space-3)",
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
														)
													: null,
												// 第一区：我的待办——定死全量、不过滤（用户 2026-10-17），空了给引导卡；
												// 标题行右侧挂搜索框（只作用第三区），计数用小圆徽
												h(
													"div",
													{ style: regionHeadRowStyle },
													h(
														"span",
														{
															style: {
																color: "var(--dtl-fg-3)",
																display: "inline-flex",
																flex: "none",
															},
														},
														h(IconChecklistOutlineRegular, { size: 16 }),
													),
													h(
														"span",
														{ style: regionHeadTitleStyle },
														t("regionMine"),
													),
													view.mine.length > 0
														? h(
																"span",
																{ className: "dtl-count" },
																t("mineCount", { n: view.mine.length }),
															)
														: null,
													h("span", { style: { flex: "1 1 auto" } }),
													// 工作区下拉：核心 Picker 带筛选（用户 2026-10-26）；控件统一 lg 档
													h(Select<string>, {
														searchable: true,
														size: "lg",
														value: workspaceOptions.some(
															(option) =>
																option.value === state.query.workspace,
														)
															? state.query.workspace
															: "",
														options: workspaceOptions,
														ariaLabel: t("workspaceLabel"),
														minWidth: WORKSPACE_SELECT_MIN,
														onChange: (next) => {
															setQuery({ workspace: next });
														},
													}),
													// 搜索框：在下拉右边、与「其他待办」同宽 192（用户 2026-10-17）；统一 lg 档
													h(
														"div",
														{
															style: {
																width: `${SEARCH_WIDTH}px`,
																flex: "none",
															},
														},
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
												),
												view.mine.length === 0
													? h(EmptyState, {
															tone: "guide",
															title: t("mineEmpty"),
															hint: t("mineEmptyHint"),
														})
													: view.mine.map((row) =>
															h(TaskRowView, {
																key: row.key,
																t,
																row,
																variant: "mine",
																board,
															}),
														),
												// 第二区：全部待办 —— **永远渲染**（用户 2026-10-18：选「进行中」没数据也不能整块消失；
												// 且不要过滤掉自己，所以含我的任务，会与第一区重叠——顶部快看 / 底部全量）；
												// 标题行：图标 + 名 + 状态滑轨（带全量角标）+ 搜索（最右）；表格区无数据给虚线空态
												h(
													"div",
													null,
													h(
														"div",
														{ style: regionHeadRowStyle },
														h(
															"span",
															{
																style: {
																	color: "var(--dtl-fg-3)",
																	display: "inline-flex",
																	flex: "none",
																},
															},
															h(IconFlatListOutlineRegular, { size: 16 }),
														),
														h(
															"span",
															{
																style: {
																	...regionHeadTitleStyle,
																	fontSize: "var(--dtl-font-md)",
																},
															},
															t("regionAll"),
														),
														h("span", { style: { flex: "1 1 auto" } }),
														// 状态滑轨：角标 = 第二区**全量**计数（不受滑轨自身影响）；0 不标数字
														h(Segmented<StatusFilter>, {
															id: "dtl-others-status",
															value: state.query.status,
															label: t("statusLabel"),
															items: [
																{
																	value: "all",
																	label: t("statusAll"),
																	badge: orZero(view.allCounts.total),
																},
																{
																	value: "active",
																	label: t("statusActive"),
																	badge: orZero(view.allCounts.doing),
																},
																{
																	value: "open",
																	label: t("statusOpen"),
																	badge: orZero(view.allCounts.open),
																},
																{
																	value: "backlog",
																	label: t("statusBacklog"),
																	badge: orZero(view.allCounts.backlog),
																},
																{
																	value: "overdue",
																	label: t("statusOverdue"),
																	badge: orZero(view.allCounts.overdue),
																},
																{
																	value: "stale",
																	label: t("statusStale"),
																	badge: orZero(view.allCounts.stale),
																},
															],
															onChange: (next) => {
																setQuery({ status: next });
															},
														}),
														h(
															"div",
															{
																style: {
																	width: `${SEARCH_WIDTH}px`,
																	flex: "none",
																},
															},
															h(SearchInput, {
																size: "lg",
																value: state.query.othersKeyword,
																placeholder: t("searchPlaceholder"),
																ariaLabel: t("searchPlaceholder"),
																onChange: (next) => {
																	setQuery({ othersKeyword: next });
																},
															}),
														),
													),
													view.groups.length === 0
														? // 空态：虚线框 + 两排字 + 按钮（参考 dispatch 空态；按钮先接「回会话」，
															// 真正的「起会话建任务」归会话交接任务）
															h(
																"div",
																{
																	className: "dtl-empty-guide",
																	style: { marginTop: "var(--dtl-space-2)" },
																},
																h(
																	"div",
																	{
																		style: {
																			fontSize: "var(--dtl-font-lg)",
																			fontWeight: 600,
																			marginBottom: "var(--dtl-space-1)",
																		},
																	},
																	t("allEmptyTitle"),
																),
																h(
																	"div",
																	{
																		style: {
																			fontSize: "var(--dtl-font-md)",
																			color: "var(--dtl-fg-2)",
																			marginBottom: "var(--dtl-space-3)",
																		},
																	},
																	t("allEmptyHint"),
																),
																h(
																	Button,
																	{
																		variant: "primary",
																		size: "md",
																		onClick: onBack,
																	},
																	t("allEmptyAction"),
																),
															)
														: h(
																"div",
																{ style: { marginTop: "var(--dtl-space-2)" } },
																view.groups.map((group) =>
																	h(WorkspaceGroupView, {
																		key: group.workspaceId,
																		t,
																		group,
																		board,
																	}),
																),
															),
												),
											),
						),
			),
		),
	);
}

/** 角标：>0 才给数字，0 = undefined（不标）。 */
function orZero(n: number): number | undefined {
	return n > 0 ? n : undefined;
}

/** 一个工作区分组（全部待办表格段）：段头（点+名+统计）→ 列头行 → 任务行。
 *  统计口径（用户 2026-10-18）：共 N｜待办 N｜进行中 N 常显（0 也显）；
 *  积压 / 逾期 / 停滞**只在 >0 时出现**。 */
function WorkspaceGroupView(props: {
	t: Translate;
	group: WorkspaceGroup;
	/** 传下去只为问动作权限（是不是我的）——第二区含我的任务，按钮得跟第一区一致。 */
	board: BoardPayload | null;
}): ReactNode {
	const { t, group, board } = props;
	const [open, setOpen] = useState(group.rows.length <= GROUP_COLLAPSE_OVER);
	const stats = [
		t("groupTotal", { n: group.total }),
		t("groupOpen", { n: group.openCount }),
		t("groupDoing", { n: group.doingCount }),
		...(group.backlogCount > 0
			? [t("groupBacklog", { n: group.backlogCount })]
			: []),
		...(group.overdueCount > 0
			? [t("groupOverdue", { n: group.overdueCount })]
			: []),
		...(group.staleCount > 0 ? [t("groupStale", { n: group.staleCount })] : []),
	].join(" ｜ ");
	// 段头统计条：核心 StripCard（色条 / 浅底 / 折叠 caret 全是核心外观，用户 2026-10-26 拍板）
	return h(
		"div",
		{ className: "dtl-group" },
		h(
			StripCard,
			{
				accent: "business",
				expanded: open,
				onToggle: () => {
					setOpen(!open);
				},
				// 统计放核心 action 槽（右侧，垂直居中）；caret 由 StripCard 自动补
				action: h(
					"span",
					{
						style: {
							fontSize: "var(--dtl-font-xs)",
							color: "var(--dtl-fg-2)",
							whiteSpace: "nowrap",
						},
					},
					stats,
				),
			},
			h(
				"div",
				{ style: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 } },
				// 段头标识：展开 = 开文件夹、收起 = 合文件夹；图标缺席就不显示（StripCard 自有色条兜底）
				IconFolderOpenRegular === undefined ||
					IconFolderCloseRegular === undefined
					? null
					: h(
							"span",
							{
								style: {
									display: "inline-flex",
									flex: "none",
									color: "var(--dtl-fg-3)",
								},
							},
							h(open ? IconFolderOpenRegular : IconFolderCloseRegular, {
								size: 14,
							}),
						),
				h(
					"span",
					{
						style: {
							fontSize: "var(--dtl-font-lg)",
							fontWeight: 700,
							lineHeight: "var(--dtl-line-lg)",
							color: "var(--dtl-fg)",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						},
					},
					group.title,
				),
			),
		),
		open
			? h(
					"div",
					null,
					// 无列头行（用户 2026-10-18：表头就是段头——左工作区名、右统计，不放「任务/创建人」那排）
					group.rows.map((row) =>
						h(TaskRowView, {
							key: row.key,
							t,
							row,
							variant: "others",
							board,
						}),
					),
				)
			: null,
	);
}
