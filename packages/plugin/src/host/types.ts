/**
 * 后端方法共享类型。
 * 宿主能力（workspaceRegistry / webServer 等）的结构面在 index.ts 与 routes.ts 本地声明——
 * 不 import 官方包（参考插件同款纪律：宿主 rc 接口会无声变，结构化声明 + external/ 文档坐标
 * 比绑死官方类型更稳）。
 */

import type { DegradedInfo } from "./errors.js";

/** 一个活跃台账工作区：宿主 registry 条目 + 本地探测（含 `ledger/`）。 */
export interface LedgerWorkspace {
	/** 宿主工作区 id。 */
	readonly id: string;
	/** 宿主 title（允许重名）。 */
	readonly title: string;
	/** canonical 绝对路径（宿主已 realpath 归一；skill 脚本 --repo 直传它）。 */
	readonly path: string;
}

/** 任务对象的原始字段（skill 脚本 list --json 的值形状；缺字段按可选处理）。 */
export interface TaskRecord {
	title?: string;
	status?: string;
	/** 发起人 uuid（身份唯一键）。 */
	creator?: string | null;
	/** 负责人 uuid；池里那条为空。 */
	owner?: string | null;
	/** 发起人显示名（脚本算好的冗余字段，**只用于显示 / 搜索**，判定一律比 uuid）。 */
	creator_name?: string | null;
	/** 负责人显示名（同上：只用于显示 / 搜索）。 */
	owner_name?: string | null;
	created?: string | null;
	started?: string | null;
	/** 最后一次推进（建 / 认领 / 改状态 / 交接 / 补执行记录）的时间；老数据可能没有。 */
	updated?: string | null;
	finished?: string | null;
	category?: string | null;
	tags?: string[] | null;
	worklog?: string | null;
	/* ── 脚本算好的派生字段（`list --json` 每行都带；插件不重算，只搬）── */
	age_days?: number | null;
	idle_days?: number | null;
	waiting_days?: number | null;
	stale?: boolean;
	overdue?: boolean;
	backlog?: boolean;
	/** 是不是本机身份名下的（skill 比 uuid 得出来的）。 */
	mine?: boolean;
}

/**
 * 一条在办任务 = 原始字段 + 任务号 + 归属工作区（读取时打上）
 * + skill 算好的派生面（插件只搬字段，不重算）。
 */
export interface TaskRow extends TaskRecord {
	readonly id: string;
	readonly workspace: LedgerWorkspace;
	readonly ageDays: number | null;
	readonly idleDays: number | null;
	readonly waitingDays: number | null;
	readonly stale: boolean;
	readonly overdue: boolean;
	readonly backlog: boolean;
	readonly mine: boolean;
}

/** `list` 的过滤面（与 skill 脚本 `list` 参数一一对应）。 */
export interface LedgerFilter {
	/** 状态（open/doing；旧数据可能残留 blocked，读侧当进行中处理）。 */
	status?: string;
	/** 负责人 **uuid**（脚本 `--owner` 只收 uuid，传名字脚本会退 1）。 */
	owner?: string;
	/** 负责人显示名模糊筛（脚本 `--owner-name`，子串、不分大小写）；只筛不判定。 */
	ownerName?: string;
	category?: string;
	tag?: string;
	/** 创建时间起 / 止（YYYY-MM-DD [HH:mm[:ss]]，脚本会补全）。 */
	since?: string;
	until?: string;
}

/**
 * 8 个统计卡的面。**数字全部来自 skill**（在办各面取 `stats --json`，本周/上周完成取趋势桶），
 * 插件只做跨工作区求和与阈值透传——不自己判停滞 / 逾期 / 积压。
 */
export interface BoardStatsView {
	/** 我的进行中（skill `my_doing`）。 */
	readonly myActive: number;
	/** 我的逾期（skill `my_overdue`）。 */
	readonly myOverdue: number;
	/** 我的停滞（skill `my_stale`）。 */
	readonly myStale: number;
	/** 待认领（skill `open`）。 */
	readonly open: number;
	/** 进行中（skill `doing`，含旧数据的 blocked）。 */
	readonly doing: number;
	/** 逾期（skill `overdue`，按时间判定不是状态）。 */
	readonly overdue: number;
	/** 停滞（skill `stale`）。 */
	readonly stale: number;
	/** 积压（skill `backlog`）。 */
	readonly backlog: number;
	/** 停滞 / 逾期 / 积压阈值（天）——skill 回显，界面文案不硬编码。 */
	readonly staleDays: number;
	readonly overdueDays: number;
	readonly backlogDays: number;
	/** 最老一条待认领躺了多少天（没有待认领 = null）。 */
	readonly oldestOpenDays: number | null;
	/** 本周 / 上周完成数（= 趋势最后两个桶）；趋势全读不到时为 null（界面留 —）。 */
	readonly weekDone: number | null;
	readonly lastWeekDone: number | null;
	/** 其中取消的数量（卡片小字「结案 X · 取消 Y」）；0 时不显示小字。 */
	readonly weekCancelled: number | null;
	readonly lastWeekCancelled: number | null;
	/** 两周的区间（界面悬停用，含边界）。 */
	readonly weekFrom: string;
	readonly weekTo: string;
	readonly lastWeekFrom: string;
	readonly lastWeekTo: string;
}

/** 8 卡的全部数字 + 降级信息。 */
export interface StatsPayload {
	readonly at: string;
	readonly stats: BoardStatsView;
	readonly degraded: readonly DegradedInfo[];
}

/** 一个人在一个周桶里的三个数（新增按 creator、完成 / 未结按 owner，都是 skill 的口径）。 */
export interface TrendOwnerCounts {
	readonly added: number;
	readonly done: number;
	readonly cancelled: number;
	readonly open: number;
}

/** 趋势图的一根周桶（数字全由 skill `stats --trend --by-owner` 给，插件只跨工作区相加）。 */
export interface TrendBucketView {
	readonly from: string;
	readonly to: string;
	readonly added: number;
	readonly done: number;
	readonly cancelled: number;
	readonly open: number;
	/** uuid → 按人明细；「只看我的」直接取自己那条，勾选零请求。 */
	readonly owners: Readonly<Record<string, TrendOwnerCounts>>;
}

/** 趋势图数据：近 8 周桶序列 + 实际有数据的第一天。 */
export interface TrendView {
	readonly buckets: readonly TrendBucketView[];
	readonly coverageFrom: string;
	readonly coverageTo: string;
}

/** 趋势数据 + 降级（自带一条，免得拖垮整个快照）。 */
export interface TrendPayload extends TrendView {
	readonly degraded: readonly DegradedInfo[];
}

/** 历史趋势的周期粒度（一根柱 = 一个周期；桶的切分与口径全在 skill）。 */
export type HistoryGran = "day" | "week" | "month";

/** 历史趋势里某工作区一个周期内的结案数。 */
export interface HistoryWorkspaceCell {
	readonly done: number;
	readonly cancelled: number;
}

/**
 * 历史页顶部的一个周期桶：**数字真源是 skill `stats --trend <gran>`**，
 * host 只做跨工作区求和（用户 2026-10-30 定：不自己写聚合算法）。
 */
export interface HistoryBucket {
	/** 周期起始日（日 = 当天、周 = 周一、月 = 1 号；skill 口径）。 */
	readonly key: string;
	/** 周期结束日（含边界；skill 口径，浮卡的区间标题用）。 */
	readonly to: string;
	readonly done: number;
	readonly cancelled: number;
	/** 该周期新建（含在办 / 待认领）。 */
	readonly added: number;
	/** 工作区 id → 该区该周期的 done / cancelled（分色用）。 */
	readonly byWorkspace: Readonly<Record<string, HistoryWorkspaceCell>>;
}

/** 历史页顶部 4 数显（host 从 day 桶求和：今日 / 本周 / 本月 / 上月的结案数）。 */
export interface HistoryTotals {
	readonly today: number;
	readonly week: number;
	readonly month: number;
	readonly lastMonth: number;
}

/** 历史页顶部数据：当前粒度的桶序列 + 4 数显 + 有数据区间。 */
export interface HistoryTrendView {
	readonly workspaces: readonly { readonly id: string; readonly title: string }[];
	/** 桶序列（升序、连续无缺，覆盖 [from, to] 所在周期；空桶 = 该周期无结案）。 */
	readonly buckets: readonly HistoryBucket[];
	readonly totals: HistoryTotals;
	/** 有数据的最早 / 最晚**天**（由 day 桶判定，柱图与翻页窗口的锚点）。 */
	readonly from: string;
	readonly to: string;
}

/** 历史日趋势 + 降级。 */
export interface HistoryTrendPayload extends HistoryTrendView {
	readonly degraded: readonly DegradedInfo[];
}

/** 一个工作区的花名册（skill `owners --json`：含当前没任务的人）。 */
export interface WorkspaceOwners {
	readonly workspaceId: string;
	readonly workspaceTitle: string;
	readonly owners: readonly {
		readonly uuid: string;
		readonly name: string;
		readonly mine: boolean;
	}[];
}

/**
 * `/board/snapshot` 响应：首屏一次拿全 —— 8 卡 + 在办列表 + 工作区 + 身份 + 各工作区花名册。
 * 列表行直接就是 skill `list --json` 的形状（含 `mine` / 三个标记 / 三个天数），
 * 前端只筛不判。
 */
export interface BoardHomePayload extends StatsPayload {
	/** 首页右侧趋势图（近 8 周）。 */
	readonly trend: TrendView;
	readonly workspaces: readonly LedgerWorkspace[];
	readonly tasks: readonly TaskRow[];
	readonly identities: Readonly<Record<string, string | null>>;
	/** 每个工作区的成员名单（跨工作区去重 / 分组由前端做，见 client 的 ownerGroups）。 */
	readonly workspaceOwners: readonly WorkspaceOwners[];
}
