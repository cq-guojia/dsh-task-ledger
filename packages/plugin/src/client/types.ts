/**
 * 客户端数据面：host 路由响应结构的**客户端投影**（与 host/host/types.ts 同形，各自声明——
 * UI 侧不许 import `src/host/`（2026-10-17 定稿：方法与页面严格分家），也不 import 官方包。
 */

/** 一个活跃台账工作区（宿主 id + title + 归一绝对路径）。 */
export interface Workspace {
	readonly id: string;
	readonly title: string;
	readonly path: string;
}

/** 一条在办任务（`GET /board` 的 tasks[]）。 */
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

/** host 附加工资字段（阈值 / 天数在 host 算，前端只渲染）。 */
export interface TaskMeta {
	/** 认领后未动天数（进行中；open 与解析不了为 null）。 */
	readonly ageDays: number | null;
	/** 最后更新至今的天数（进行中；open 与解析不了为 null）——停滞提示用。 */
	readonly idleDays: number | null;
	/** 创建至今的天数（**只对待认领**有值）——积压提示用。 */
	readonly waitingDays: number | null;
	/** 停滞 = 进行中且 updated 至今满 STALE_DAYS 天没更新。 */
	readonly stale: boolean;
	/** 逾期 = 进行中且接任务至今满 OVERDUE_DAYS 天还没做完（不看中途更新）。 */
	readonly overdue: boolean;
	/** 积压 = 待认领且 created 至今满 BACKLOG_DAYS 天没人接。 */
	readonly backlog: boolean;
	/** 归本机身份（skill 比 uuid 判定，前端不再比）。 */
	readonly mine: boolean;
}

/** 在办行 = 任务 + host 附加字段。 */
export type BoardTask = TaskRow & TaskMeta;

/** 一条已结案记录（`GET /history` 的 records[]）。 */
export interface HistoryRecord {
	/** 结案时间（首列）。 */
	readonly time?: string;
	readonly created?: string | null;
	readonly workpackage?: string;
	readonly category?: string | null;
	readonly tags?: string[] | null;
	readonly owner?: string;
	/** 发起人（creator）：任务创建者，与 owner 区分（owner 可被 claim 改走）。 */
	readonly creator?: string | null;
	/** 显示名（uuid 的冗余字段，只用于显示 / 搜索）。 */
	readonly owner_name?: string | null;
	readonly creator_name?: string | null;
	/** 「完成了什么」列。 */
	readonly summary?: string;
	/** 过程文档路径列。 */
	readonly log?: string | null;
	/** 行所在历史文件（相对工作区）。 */
	readonly src?: string;
	/** 行格式（脚本 `fmt`）与行号（脚本 `line`）：排查坏历史行时用来定位。 */
	readonly fmt?: string;
	readonly line?: number;
	readonly workspace?: Workspace;
}

/** 一个自然周期内的两个计数（核心永远是「完成」，新增只作对照）。 */
export interface PeriodCounts {
	readonly done: number;
	readonly created: number;
	/** 周期起（YYYY-MM-DD，含）。 */
	readonly from: string;
	/** 周期止（YYYY-MM-DD，含）。 */
	readonly to: string;
}

/** 统计台四个自然周期。 */
export interface TrendPeriods {
	readonly thisWeek: PeriodCounts;
	readonly lastWeek: PeriodCounts;
	readonly thisMonth: PeriodCounts;
	readonly lastMonth: PeriodCounts;
}

/** 趋势图一桶（一周）：完成 + 新增 + 截止时未完成。 */
export interface WeeklyBucket {
	/** 该周周一（YYYY-MM-DD）。 */
	readonly week: string;
	/** 该周截止日（YYYY-MM-DD）：x 轴标它，数据按截止日判。 */
	readonly end: string;
	readonly done: number;
	readonly created: number;
	/** 该周截止时仍未完成（在办）的任务数。 */
	readonly remaining: number;
}

/** 趋势图数据（按范围各一份，切换零请求）。 */
export interface ClosedSummary {
	readonly weekly: {
		readonly all: readonly WeeklyBucket[];
		readonly mine: readonly WeeklyBucket[];
	};
}

/** 8 个统计卡的面（`GET /board/snapshot`）：数字全由 host 从 skill 取，前端只渲染。 */
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
 * `GET /board/snapshot` 响应：首屏一次拿全（8 卡 + 在办列表 + 工作区 + 身份 + 各工作区花名册）。
 * 行上 `mine` / 三个标记 / 三个天数**都是 skill 给的**，前端只筛。
 */
export interface BoardPayload {
	readonly at: string;
	readonly workspaces: readonly Workspace[];
	readonly tasks: readonly BoardTask[];
	readonly stats: BoardStatsView;
	/** 工作区 id → 本机身份 uuid（取不到为 null）。行级「是不是我的」以 skill 的 `mine` 为准，这里只备查。 */
	readonly identities: Readonly<Record<string, string | null>>;
	/** 每个工作区的成员名单（跨工作区去重 / 分组由前端 `ownerGroups` 做）。 */
	readonly workspaceOwners: readonly WorkspaceOwners[];
	/** 降级信息：哪些工作区读挂了、为什么（单工作区坏不拖垮其余；空 = 全部正常）。 */
	readonly degraded?: readonly DegradedInfo[];
}

/** `GET /board/trend` 响应（**慢路径**：读 history；与快路径分开拉，首屏不等它）。 */
export interface TrendPayload {
	readonly closed: ClosedSummary;
	readonly trend: TrendPeriods;
	/** 降级信息（op 恒为 history）：哪些工作区历史读挂了。 */
	readonly degraded?: readonly DegradedInfo[];
	/**
	 * 被 skill 脚本**整行跳过**的历史行（不是十一列 / 结案时间不合法）：
	 * 这些行不进统计 ⇒ 图与周期卡的数字已经少算了，界面必须说出口。
	 */
	readonly warnings?: readonly string[];
}

/** 一个读失败的工作区（host `degraded` 条目；UI 标红 + 人话原因）。 */
export interface DegradedInfo {
	readonly workspaceId: string;
	readonly workspaceTitle: string;
	readonly op: "list" | "history";
	readonly code: string;
	readonly message: string;
}

/** `POST /close` 响应：会话已建，`sessionId` 给 `openSession` 跳转。 */
export interface CloseHandoff {
	readonly sessionId: string;
	/** 非致命问题（如会话没挂进工作区列表 / 宿主没有 attachSession 面），如实展示，不吞。 */
	readonly warning?: string;
}

/** `GET /filters` 响应：去重候选。 */
export interface FilterOptions {
	readonly owners: string[];
	readonly categories: string[];
	readonly tags: string[];
}

/** `GET /task` 响应。 */
export interface TaskDetail {
	readonly task: TaskRow;
	/** 过程文档正文（文件缺失为 null）。 */
	readonly worklog: string | null;
}
