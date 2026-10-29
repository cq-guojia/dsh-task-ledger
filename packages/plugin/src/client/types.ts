/**
 * 客户端数据面：host 路由响应结构的**客户端投影**（与 host/types.ts 同形，各自声明——
 * UI 侧不许 import `src/host/`（2026-10-17 定稿：方法与页面严格分家），也不 import 官方包。
 */

/** 一个活跃台账工作区（宿主 id + title + 归一绝对路径）。 */
export interface Workspace {
	readonly id: string;
	readonly title: string;
	readonly path: string;
}

/** 一条在办任务（`/board/snapshot` 的 tasks[]）。 */
export interface TaskRow {
	readonly id: string;
	readonly workspace: Workspace;
	readonly title?: string;
	readonly status?: string;
	readonly creator?: string | null;
	readonly owner?: string | null;
	/** 显示名（uuid 的冗余字段，只用于显示 / 搜索；字段名沿用脚本 JSON 的 snake_case 原样）。 */
	readonly owner_name?: string | null;
	readonly creator_name?: string | null;
	readonly created?: string | null;
	readonly started?: string | null;
	/** 最后一次推进的时间（老数据可能没有）。 */
	readonly updated?: string | null;
	readonly finished?: string | null;
	readonly category?: string | null;
	readonly tags?: string[] | null;
	/** 过程文档相对 `ledger/` 的路径。 */
	readonly worklog?: string | null;
}

/** skill 算好的派生面（阈值 / 天数 / 归属全在 skill 侧，前端只渲染）。 */
export interface TaskMeta {
	/** 接任务至今的天数（进行中；open 与解析不了为 null）。 */
	readonly ageDays: number | null;
	/** 最后更新至今的天数（进行中；open 与解析不了为 null）——停滞提示用。 */
	readonly idleDays: number | null;
	/** 创建至今的天数（**只对待认领**有值）——积压提示用。 */
	readonly waitingDays: number | null;
	/** 停滞 = 进行中且 updated 至今满 skill 默认阈值天没更新。 */
	readonly stale: boolean;
	/** 逾期 = 进行中且接任务至今满 skill 默认阈值天还没做完（不看中途更新）。 */
	readonly overdue: boolean;
	/** 积压 = 待认领且 created 至今满 skill 默认阈值天没人接。 */
	readonly backlog: boolean;
	/** 归本机身份（skill 比 uuid 判定，前端不再比）。 */
	readonly mine: boolean;
}

/** 在办行 = 任务 + skill 派生字段。 */
export type BoardTask = TaskRow & TaskMeta;

/** 8 个统计卡的面（`/board/snapshot`）：数字全由 host 从 skill 取，前端只渲染。 */
export interface BoardStatsView {
	readonly myActive: number;
	readonly myOverdue: number;
	readonly myStale: number;
	readonly open: number;
	readonly doing: number;
	readonly overdue: number;
	readonly stale: number;
	readonly backlog: number;
	/** 阈值（天），由 skill 回显——界面文案不硬编码。 */
	readonly staleDays: number;
	readonly overdueDays: number;
	readonly backlogDays: number;
	readonly oldestOpenDays: number | null;
	/** 本周 / 上周完成数；null = 历史读不到（界面留 —，不拿 0 充数）。 */
	readonly weekDone: number | null;
	readonly lastWeekDone: number | null;
	readonly weekFrom: string;
	readonly weekTo: string;
	readonly lastWeekFrom: string;
	readonly lastWeekTo: string;
}

/** 一个人在一个周桶里的三个数（新增按 creator、完成 / 未结按 owner）。 */
export interface TrendOwnerCounts {
	readonly added: number;
	readonly done: number;
	readonly open: number;
}

/** 趋势图的一根周桶（`from`/`to` 是本机时区日期，含边界）。 */
export interface TrendBucketView {
	readonly from: string;
	readonly to: string;
	readonly added: number;
	readonly done: number;
	readonly open: number;
	/** uuid → 按人明细（「只看我的」用）。 */
	readonly owners: Readonly<Record<string, TrendOwnerCounts>>;
}

/** 趋势图数据（host 已跨工作区求和）。`coverageFrom` = 实际有数据的第一天。 */
export interface TrendView {
	readonly buckets: readonly TrendBucketView[];
	readonly coverageFrom: string;
	readonly coverageTo: string;
}

/** 一个工作区的成员名单（skill `owners --json`）。 */
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
 * `/board/snapshot` 响应：首屏一次拿全（8 卡 + 在办列表 + 工作区 + 身份 + 各工作区花名册）。
 * 行上 `mine` / 三个标记 / 三个天数**都是 skill 给的**，前端只筛。
 */
export interface BoardPayload {
	readonly at: string;
	readonly workspaces: readonly Workspace[];
	readonly tasks: readonly BoardTask[];
	readonly stats: BoardStatsView;
	/** 近 8 周趋势（host 已按周跨工作区求和；全挂时 buckets 为空）。 */
	readonly trend: TrendView;
	/** 工作区 id → 本机身份 uuid（取不到为 null）。行级「是不是我的」以 skill 的 `mine` 为准，这里只备查。 */
	readonly identities: Readonly<Record<string, string | null>>;
	/** 每个工作区的成员名单（跨工作区去重 / 分组由前端 `ownerGroups` 做）。 */
	readonly workspaceOwners: readonly WorkspaceOwners[];
	/** 降级信息：哪些工作区读挂了、为什么（单工作区坏不拖垮其余；空 = 全部正常）。 */
	readonly degraded?: readonly DegradedInfo[];
}

/** 一个读失败的工作区（host `degraded` 条目；UI 标红 + 人话原因）。 */
export interface DegradedInfo {
	readonly workspaceId: string;
	readonly workspaceTitle: string;
	readonly op: "list" | "history" | "owners" | "trend";
	readonly code: string;
	readonly message: string;
}
