/**
 * 看板首页（`main` 槽整页内容）：上 = 8 统计卡 + 趋势图；下 = 单区任务列表。
 *
 * 2026-10-28：列表沿用原「我的待办」卡片样式，改成**左侧六档菜单 + 右侧三个过滤**的平铺列表。
 *  - 菜单六档**全部真筛**（积压 / 逾期 / 停滞 用 skill 下发的布尔）；
 *  - 工作区 / 执行人 / 搜索 **全部本地筛**（快照已含全部在办，不发请求）。
 *
 * 2026-10-30 首屏加载改版（用户：不要整页 loading，也别铺骨架）：跟历史页一个口径 ——
 * 8 块卡只画标题 + 「—」、图表卡里一个三点 Loader、列表位一个三点 Loader（最大号）；
 * 快照一到就地替换。原来那层屏幕下方的全局 `showLoading` 已删。
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
	useState,
	useSyncExternalStore,
} from "react";
import type { LocaleKey, Translate } from "./locales";
import { formatCount } from "./format";
import { openFilePreview } from "dsh-plugin-core/explorer";
import {
	groupRows,
	isSoloLedger,
	ownerGroups,
	selectView,
	type GroupTab,
	type Row,
} from "./rows";
import {
	boardSnapshot,
	boardSubscribe,
	isDefaultQuery,
	refresh,
	selectTab,
	setQuery,
	type TabFilter,
} from "./store";
import { fetchHistoryTrend } from "./api";
import { HistoryChart, HistoryStats } from "./history-chart";
import { TaskRowView } from "./task-row";
import { TrendChart } from "./trend-chart";
import type { BoardPayload, HistoryGran, HistoryTrendPayload } from "./types";
import {
	Button,
	EmptyState,
	ensureUiBase,
	Loader,
	notify,
	SearchInput,
	SectionHead,
	Segmented,
	Select,
	StatCard,
} from "./ui";

// 构建期由 tsdown.client.config.ts 的 define 注入（版本读 package.json，编码是编译时刻时间戳）。
declare const __PLUGIN_VERSION__: string;
declare const __BUILD_STAMP__: string;

/** 主内容：占满、自己滚动；padding 只在内层，dock 才不会继承内边距。
 *  ⚠️ 底部不留 padding：滚到底的留白改由内容末尾的 `.dtl-page-foot` 实体块承担
 *  （用户 2026-10-30：最后一条贴着浏览器底边 —— 滚动容器未必是这一层，
 *   挂在这一层的 padding-bottom 就落空了，实体块跟着内容走才不会丢）。 */
const pageStyle: Record<string, string | number> = {
	height: "100%",
	width: "100%",
	flex: "1 1 auto",
	minWidth: 0,
	boxSizing: "border-box",
	overflow: "auto",
	padding: "24px 22px 0",
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
/** 组头计数：按「待认领 → 进行中 → 积压 → 逾期 → 停滞」排，` · ` 分隔；
 *  **0 的档整段不出现**（用户 2026-10-30：不显示 0，也不显示杠），「我的待办」不列。 */
const GROUP_STATS: readonly { value: GroupTab; label: LocaleKey }[] = [
	{ value: "open", label: "statOpen" },
	{ value: "doing", label: "statDoing" },
	{ value: "backlog", label: "statBacklog" },
	{ value: "overdue", label: "statOverdue" },
	{ value: "stale", label: "statStale" },
];
/** 底部「截断提示」样式（临时：核心暂无对应样式，先按此观感；用户确认后再定型）。 */
const limitHintStyle: Record<string, string | number> = {
	marginTop: "var(--dtl-space-3)",
	padding: "var(--dtl-space-3) var(--dtl-space-4)",
	textAlign: "center",
	fontSize: "var(--dtl-font-sm)",
	lineHeight: "var(--dtl-line-sm)",
	color: "var(--dtl-fg-3)",
};

/** 左侧菜单（「我的待办」置顶、「全部」次之，其后六档本地真筛；角标 = 当前工作区 / 执行人 / 搜索范围内各档计数）。 */
const TABS: readonly { value: TabFilter; label: LocaleKey }[] = [
	{ value: "mine", label: "regionMine" },
	{ value: "all", label: "regionAll" },
	{ value: "open", label: "statOpen" },
	{ value: "doing", label: "statDoing" },
	{ value: "backlog", label: "statBacklog" },
	{ value: "overdue", label: "statOverdue" },
	{ value: "stale", label: "statStale" },
];

/** 8 块统计卡的标题（DOM 列序，与 `statsGrid` 里的排布一致）：
 *  首屏没数据时只画标题 + 「—」，跟历史页那 4 块一个口径（用户 2026-10-30）。 */
const STAT_LABELS: readonly LocaleKey[] = [
	"statMyActive",
	"statDoing",
	"statOpen",
	"statBacklog",
	"statOverdue",
	"statStale",
	"statWeekDone",
	"statLastWeekDone",
];

/** 错误原文只留第一行并截断：脚本报错常把整段用法提示塞在一行里，toast 装不下。 */
function firstLine(message: string): string {
	const line = (message.split("\n")[0] ?? "").trim();
	return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}

export function BoardHome(props: {
	t: Translate;
	onBack: () => void;
}): ReactNode {
	const { t, onBack } = props;
	ensureUiBase();
	const state = useSyncExternalStore(boardSubscribe, boardSnapshot);
	const mountRef = useRef<HTMLDivElement>(null);
	// 视图模式：在办看板 ↔ 历史查询（入口切换；历史页布局待定稿，先占位）。
	const [viewMode, setViewMode] = useState<"active" | "history">("active");
	// 历史页顶部数据：切到历史才拉（拉过一次就复用，切回在办不清）。
	// 数据按粒度各存一份：切粒度 = 重新请求（桶的口径在 skill，host 有读缓存）；gran 真源在页面层。
	const [gran, setGran] = useState<HistoryGran>("day");
	const [historyByGran, setHistoryByGran] = useState<
		Partial<Record<HistoryGran, HistoryTrendPayload>>
	>({});
	const historyTrend = historyByGran[gran] ?? null;
	const [historyError, setHistoryError] = useState<string | null>(null);
	// 上一次成功拉到的数据：切粒度时先拿它顶住，新桶到了再整体换掉 —— 页面不消失。
	// ⚠️ 必须记着它属于哪个粒度：别粒度的桶 key 对不上当前窗口，画出来是「整屏空柱」，
	// 数据一到柱子再冒出来 ⇒ 就是用户看到的那下莫名闪烁（2026-10-30 抓到）。
	const lastTrendRef = useRef<{ gran: HistoryGran; payload: HistoryTrendPayload } | null>(null);
	useEffect(() => {
		if (historyTrend !== null) lastTrendRef.current = { gran, payload: historyTrend };
	});
	// 只认同粒度的那份兜底；换粒度且没缓存 ⇒ null（走核心加载态），不拿错粒度的数据充数
	const shownTrend =
		historyTrend ??
		(lastTrendRef.current !== null && lastTrendRef.current.gran === gran
			? lastTrendRef.current.payload
			: null);

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
		void refresh();
	}, []);

	// 首读不再开全局加载提示（用户 2026-10-30）：骨架 + 各块局部的三点加载自己表达「在加载」，
	// 数据到了就地替换，不拿一层浮层盖住整页。

	const board = state.board;
	const view = useMemo(() => selectView(state), [state]);
	const degraded = board?.degraded ?? [];
	/** 单人台账：执行人相关界面（下拉 / 人名 / 「只看我的」）全隐藏（用户 2026-10-29）。 */
	const solo = isSoloLedger(board);

	// 降级上报：有工作区读挂 ⇒ 核心的 error toast，一条说完（不再在页面上铺一屏原文，
	// 用户 2026-10-29；脚本的报错常带整段用法提示，铺在卡片里把版面顶烂）。
	// 同一批失败只弹一次：刷新后原因没变就不刷屏，变了才再弹。
	const degradedSig = degraded
		.map((item) => `${item.workspaceId}|${item.op}|${item.message}`)
		.join("\n");
	const shownDegraded = useRef("");
	useEffect(() => {
		if (degradedSig === "" || degradedSig === shownDegraded.current) return;
		shownDegraded.current = degradedSig;
		notify(t("degradedToastTitle", { n: degraded.length }), {
			variant: "error",
			// 这条要读得完：默认 2.6s 太短。
			durationMs: 8000,
			description: degraded
				.slice(0, 2)
				.map((item) =>
					t("degradedItem", {
						title: item.workspaceTitle,
						message: firstLine(item.message),
					}),
				)
				.join("；"),
		});
	}, [degradedSig, degraded, t]);

	// 历史页顶部数据：切到历史才拉；成功/失败都记一次，避免重复请求。
	useEffect(() => {
		if (viewMode !== "history" || historyTrend !== null || historyError !== null)
			return;
		let alive = true;
		fetchHistoryTrend(gran)
			.then((payload) => {
				if (alive)
					setHistoryByGran((prev) => ({ ...prev, [gran]: payload }));
			})
			.catch((error: unknown) => {
				if (alive)
					setHistoryError(error instanceof Error ? error.message : String(error));
			});
		return () => {
			alive = false;
		};
	}, [viewMode, gran, historyTrend, historyError]);

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

	/** 执行人候选：名册分组 + 行内点过的人。名册里没有的（被删 / 别的机器加的）补进
	 *  通用组（首组）末尾，页面不刷新就一直在（用户 2026-10-28）。 */
	const ownerOptionGroups = useMemo(() => {
		const groups = ownerGroups(board, workspaceOptions, t);
		const extra = state.extraOwners.filter(
			(owner) =>
				!groups.some((group) =>
					group.options.some((option) => option.value === owner.uuid),
				),
		);
		if (extra.length === 0) return groups;
		const added = extra.map((owner) => ({
			value: owner.uuid,
			label: `@${owner.name}`,
		}));
		return groups.map((group, index) =>
			index === 0 ? { ...group, options: [...group.options, ...added] } : group,
		);
	}, [board, t, workspaceOptions, state.extraOwners]);

	/** 统计卡：给了 `tab` 才可点 —— 点一下把下方列表切到该档，**其余筛选全部清掉**
	 *  （搜索 / 工作区 / 执行人…，用户 2026-10-28：以后新增的筛选也一样要清）。
	 *  高亮条件更严：只有 tab 对得上 **且** 其余筛选都还是默认值时才亮，
	 *  任何一项被改动 ⇒ 立刻熄灭（对不上就不算选中）。 */
	const card = (
		label: LocaleKey,
		value: number,
		hint: string,
		title?: string,
		tab?: TabFilter,
	): ReactNode =>
		h(StatCard, {
			label: t(label),
			value: formatCount(value),
			hint,
			title,
			active:
				tab !== undefined &&
				state.query.tab === tab &&
				isDefaultQuery(state.query),
			interactive: tab !== undefined,
			onClick: tab === undefined ? undefined : () => selectTab(tab),
		});

	/** 子集卡占比小字：分母为 0 或自己没有 ⇒ 不显示（不拿 0% 充数）。 */
	const share = (part: number, whole: number, key: LocaleKey): string =>
		part > 0 && whole > 0
			? t(key, { n: Math.round((part / whole) * 100) })
			: "";

	/** 统计台卡：数字 = **结案**（完成 + 取消）；有取消时小字拆「完成 X · 取消 Y」
	 *  （术语 2026-10-29 用户拍板：结案是上位词，完成只指正常结案）。
	 *  不可点，hover 给具体日期区间；数字 null（历史读不到）留 '—'，不拿 0 充数。 */
	const weekCard = (
		label: LocaleKey,
		total: number | null,
		cancelled: number | null,
		from: string,
		to: string,
	): ReactNode =>
		h(StatCard, {
			label: t(label),
			value: formatCount(total ?? 0),
			hint:
				cancelled !== null && cancelled > 0
					? t("statWeekSplit", { done: (total ?? 0) - cancelled, cancelled })
					: "",
			interactive: false,
			title: t("periodRange", { from, to }),
		});

	/** 左 8 块（2×4）+ 右趋势图。
	 *  首读没到（`payload = null`）⇒ 8 块只画标题 + 「—」、图表卡里一个三点加载（跟历史页同一套，
	 *  用户 2026-10-30：不铺骨架，加载完才出东西）。 */
	const statsGrid = (payload: BoardPayload | null): ReactNode => {
		if (payload === null) {
			return h(
				"div",
				{ className: "dtl-stats", style: statsRowStyle },
				h(
					"div",
					{ className: "dtl-stats__cards" },
					...STAT_LABELS.map((label) =>
						h(StatCard, { key: label, label: t(label), value: "—" }),
					),
				),
				h(TrendChart, { trend: null, me: null, t }),
			);
		}
		const view = payload.stats;
		return h(
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
					undefined,
					"mine",
				),
				card(
					"statDoing",
					view.doing,
					view.doing - view.myActive > 0
						? t("statDoingHint", { n: view.doing - view.myActive })
						: t("statDoingAllMine"),
					undefined,
					"doing",
				),
				card(
					"statOpen",
					view.open,
					view.oldestOpenDays === null
						? ""
						: t("statOpenHint", { n: view.oldestOpenDays }),
					undefined,
					"open",
				),
				card(
					"statBacklog",
					view.backlog,
					share(view.backlog, view.open, "statBacklogHint"),
					t("statBacklogTitle", { n: view.backlogDays }),
					"backlog",
				),
				card(
					"statOverdue",
					view.overdue,
					share(view.overdue, view.doing, "statOverdueHint"),
					t("statOverdueTitle", { n: view.overdueDays }),
					"overdue",
				),
				card(
					"statStale",
					view.stale,
					share(view.stale, view.doing, "statStaleHint"),
					t("statStaleTitle", { n: view.staleDays }),
					"stale",
				),
				weekCard("statWeekDone", view.weekDone, view.weekCancelled, view.weekFrom, view.weekTo),
				weekCard(
					"statLastWeekDone",
					view.lastWeekDone,
					view.lastWeekCancelled,
					view.lastWeekFrom,
					view.lastWeekTo,
				),
			),
			// 趋势图：每周两根柱（结案 / 未结）+ 新增曲线，一屏几周按卡宽算、箭头翻 4 周
			//（数字全由 skill `stats --trend` 给）；
			// 本机身份是机器级的 ⇒ 各工作区同一个 uuid，取第一个非空即可（「只看我的」用）。
			// 单人台账给 null ⇒ 图里不出「只看我的」（用户 2026-10-29）。
			h(TrendChart, {
				trend: payload.trend,
				me: solo
					? null
					: (Object.values(payload.identities).find((uuid) => uuid !== null) ?? null),
				t,
			}),
		);
	};

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
			tone: "business",
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
		// 单人台账整件隐藏（用户 2026-10-29：只有一个用户，这个下拉没有意义）。
		solo
			? null
			: h(
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
						groups: ownerOptionGroups,
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
				// 视图模式切换（在办看板 ↔ 历史查询）：贴刷新按钮左侧、同高。
						h(
							"div",
							{
								style: {
									display: "flex",
									alignItems: "center",
									gap: "var(--dtl-space-3)",
								},
							},
							h(Segmented<"active" | "history">, {
								id: "dtl-view-mode",
								value: viewMode,
								label: t("viewModeLabel"),
								size: "lg",
								tone: "business",
								items: [
									{ value: "active", label: t("viewActive") },
									{ value: "history", label: t("viewHistory") },
								],
								onChange: (next) => setViewMode(next),
							}),
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
										// 手动刷新 = 全部重来：host 缓存由 fresh=1 全清，前端历史缓存一并清掉，
										// 切回哪个粒度都重新读（用户 2026-10-30：点到每一个再重新读）
										setHistoryByGran({});
										lastTrendRef.current = null;
										setHistoryError(null);
									},
								},
								state.refreshing ? t("refreshing") : t("refresh"),
							),
						),
				),
				// 历史模式：顶部 4 数显 + 按周期柱状图（独立于下方时间筛选）；在办模式：错误行。
				// 渲染条件用「上次成功的数据」兜底：切粒度 / 首读都**不卸载这一块** ——
				// 首读显示骨架（加载卡 + 横杠），切粒度显示旧图，等新桶到了再整体换（不闪）。
				viewMode === "history"
					? (historyError !== null
							? h(
									"div",
									{
										style: {
											color: "var(--dtl-danger)",
											fontSize: "var(--dtl-font-md)",
											paddingTop: "var(--dtl-space-3)",
										},
									},
									`${t("loadFailed")}：${historyError}`,
								)
							: h(
										"div",
										{ className: "dtl-stats dtl-stats--history", style: statsRowStyle },
										h(HistoryChart, {
											data: shownTrend,
											t,
											gran,
											onGranChange: setGran,
										}),
										h(HistoryStats, {
											data: shownTrend,
											t,
										}),
									))
					: (state.status === "error" && board === null
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
							: null),
				// 数据没到也照常画这一行（8 块骨架 + 图表骨架），数据一到就地换掉
				viewMode === "history" ? null : statsGrid(board),
				viewMode === "history" ? null : regionHead,
				// 首屏没数据（board === null）≠ 空结果：列表位只放局部加载，别拿「没有任务」骗人；
				// 读挂了由上面那行错误 + 重试承担，列表位不再空转。
				viewMode === "history"
					? null
					: board === null
						? state.status === "error"
							? null
							: h(
									"div",
									{ className: "dtl-loading" },
									h(Loader, { variant: "blocks", size: "xl" }),
								)
						: view.rows.length === 0
							? h(EmptyState, {
									title: t("listEmpty"),
									hint: t("listEmptyHint"),
								})
							: h(
									"div",
									null,
									// 按工作区分组（用户 2026-10-30）：组头 = 核心 SectionHead；
									// 组顺序 / 组内顺序全在 rows.selectView 排好，这里只切段渲染。
									...groupRows(view.rows.slice(0, LIST_LIMIT)).map((group) => {
										// 0 的档不列；全 0 时整段不出现（不留一段空白 + 8px 外边距）
										const counts = GROUP_STATS.filter(
											(item) => group.counts[item.value] > 0,
										)
											.map(
												(item) =>
													`${t(item.label)} ${group.counts[item.value]}`,
											)
											.join(" · ");
										return h(
											"div",
											{ key: group.workspace.id, className: "dtl-group" },
											// 组头整体右移 4px（用户 2026-10-30：竖线 + 后面整条内容一起挪），
											// 只包组头，任务卡不动。
											h(
												"div",
												{ className: "dtl-group__head" },
												h(SectionHead, {
													icon: h("span", { className: "dtl-group__rule" }),
													title: h(
														"span",
														null,
														group.workspace.title,
														counts === ""
															? null
															: h(
																	"span",
																	{ className: "dtl-group__count" },
																	counts,
																),
													),
												}),
											),
											...group.rows.map((row) =>
												h(TaskRowView, {
													key: row.key,
													t,
													row,
													solo,
													onView: handleView,
												}),
											),
										);
									}),
								),
				viewMode === "history"
					? null
					: view.rows.length > LIST_LIMIT
						? h("div", { style: limitHintStyle }, t("listLimitHint", { n: LIST_LIMIT }))
						: null,
				// 页脚留白：滚到底时最后一条卡不贴浏览器底边（高度与上方内边距同档）
				h("div", { className: "dtl-page-foot" }),
			),
		),
	);
}
