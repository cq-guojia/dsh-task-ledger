/**
 * 后端方法共享类型。
 * 宿主能力（workspaceRegistry / webServer 等）的结构面在 index.ts 与 routes.ts 本地声明——
 * 不 import 官方包（参考插件同款纪律：宿主 rc 接口会无声变，结构化声明 + external/ 文档坐标
 * 比绑死官方类型更稳）。
 */

/** 一个活跃台账工作区：宿主 registry 条目 + 本地探测（ledger/progress.json 存在）。 */
export interface LedgerWorkspace {
	/** 宿主工作区 id。 */
	readonly id: string;
	/** 宿主 title（允许重名）。 */
	readonly title: string;
	/** canonical 绝对路径（宿主已 realpath 归一；skill 脚本 --repo 直传它）。 */
	readonly path: string;
}

/** progress.json 任务对象的原始字段（skill 脚本 list --json 的值形状；缺字段按可选处理）。 */
export interface TaskRecord {
	title?: string;
	status?: string;
	creator?: string | null;
	owner?: string | null;
	created?: string | null;
	started?: string | null;
	/** 最后一次推进（建 / 认领 / 改状态 / 交接 / 补执行记录）的时间；老数据可能没有。 */
	updated?: string | null;
	finished?: string | null;
	category?: string | null;
	tags?: string[] | null;
	worklog?: string | null;
}

/** 一条在办任务 = 原始字段 + 任务号 + 归属工作区（读取时打上）。 */
export interface TaskRow extends TaskRecord {
	readonly id: string;
	readonly workspace: LedgerWorkspace;
}

/** history 一条已结案记录（脚本 history --json 的 record 形状；字段名以脚本为准）。 */
export interface HistoryRecord {
	/** 结案时间（首列）。 */
	time?: string;
	created?: string | null;
	workpackage?: string;
	category?: string | null;
	tags?: string[] | null;
	owner?: string;
	/** 发起人（creator）：任务的「创建者」，与 owner 区分（owner 可被 claim 改走）。历史 9 列新增；旧 8 列由 skill 回链 worklog 头部补。 */
	creator?: string | null;
	/** 「完成了什么」列。 */
	summary?: string;
	/** 过程文档链接列。 */
	log?: string | null;
	/** 行所在历史文件（相对工作区，脚本打上）。 */
	src?: string;
	/** 归属工作区（读取时打上）。 */
	readonly workspace?: LedgerWorkspace;
}

/** list / history 共用的过滤面（与 skill 脚本参数一一对应）。 */
export interface LedgerFilter {
	/** 状态（open/doing；旧数据可能残留 blocked，读侧当进行中处理）。 */
	status?: string;
	owner?: string;
	category?: string;
	tag?: string;
	/** 创建时间起 / 止（YYYY-MM-DD [HH:mm[:ss]]，脚本会补全）。 */
	since?: string;
	until?: string;
	/** 列表分页大小（history 侧；script 的 --limit 在过滤 + 倒序后取前 N）。 */
	limit?: number;
	/** 只读最近 N 个月的历史文件（插件传 13；不传 = 脚本默认读全部）。 */
	months?: number;
}

/* ── 视图 / 聚合类型（原 board.ts，随 services 拆分上移；类型不归任何一层所有）───── */

/** 一个自然周期内的两个计数（核心永远是「完成」，新增只作对照）。 */
export interface PeriodCounts {
	readonly done: number;
	readonly created: number;
	/** 周期起（YYYY-MM-DD，含）。 */
	readonly from: string;
	/** 周期止（YYYY-MM-DD，含）。 */
	readonly to: string;
}

/** 统计台四个自然周期（用户 2026-10-17 定稿：本周 / 上周 / 本月 / 上月，不用 7/30 天）。 */
export interface TrendPeriods {
	readonly thisWeek: PeriodCounts;
	readonly lastWeek: PeriodCounts;
	readonly thisMonth: PeriodCounts;
	readonly lastMonth: PeriodCounts;
}

/** 趋势图一桶（一周）：完成 + 新增 + 截止时仍未完成。 */
export interface WeeklyBucket {
	/** 该周周一（YYYY-MM-DD）。 */
	readonly week: string;
	/** 该周截止日（YYYY-MM-DD）：历史周=当周周日，当前周=今天——图表 x 轴标它，因为数据是按截止日判的。 */
	readonly end: string;
	readonly done: number;
	readonly created: number;
	/** 该周截止时仍未完成（在办）的任务数：cumulative(创建 - 完成) 到该周末，含窗口前遗留。 */
	readonly remaining: number;
}

/** 趋势图数据按范围各一份（切换零请求）。 */
export interface ClosedSummary {
	readonly weekly: {
		readonly all: readonly WeeklyBucket[];
		readonly mine: readonly WeeklyBucket[];
	};
}

/** 首页统计卡的六个面（阈值 / 天数全在 host 算，前端只渲染——单一真源）。 */
export interface BoardStats {
	/** 我的 doing（旧数据里的 blocked 也算进行中）。 */
	readonly myActive: number;
	/** 我的逾期（接任务至今满 OVERDUE_DAYS 天未结案）。 */
	readonly myOverdue: number;
	/** 我的停滞（我的进行中里 updated 满 STALE_DAYS 天没更新的）。 */
	readonly myStale: number;
	/** 待认领（open）。 */
	readonly open: number;
	/** 全部 doing（旧数据里的 blocked 也算进行中）。 */
	readonly doing: number;
	/** 全部逾期——按时间判定，不是状态。 */
	readonly overdue: number;
	/** 停滞 = 进行中且 updated 至今满 STALE_DAYS 天没更新。 */
	readonly stale: number;
	/** 积压 = 待认领且 created 至今满 BACKLOG_DAYS 天没人接。 */
	readonly backlog: number;
	/** 停滞 / 逾期 / 积压阈值（天）——随响应下发，界面文案不硬编码（单一真源）。 */
	readonly staleDays: number;
	readonly overdueDays: number;
	readonly backlogDays: number;
	/** 最老一条待认领躺了多少天（没有待认领 = null）。 */
	readonly oldestOpenDays: number | null;
}

/** 列表行附加工资字段（host 算，前端不判阈值）。 */
export interface BoardTask extends TaskRow {
	/** 认领后未动天数（进行中；open 与解析不了的时间为 null）。 */
	readonly ageDays: number | null;
	/** 最后更新至今的天数（进行中；open 与解析不了的时间为 null）——停滞提示用。 */
	readonly idleDays: number | null;
	/** 创建至今的天数（**只对待认领**有值；其余为 null）——积压提示用。 */
	readonly waitingDays: number | null;
	/** 停滞标记：updated 至今满 STALE_DAYS 天没更新（与 ageDays 无关）。 */
	readonly stale: boolean;
	/** 逾期标记：接任务至今满 OVERDUE_DAYS 天还没做完（不看中途更新）。 */
	readonly overdue: boolean;
	/** 积压标记：待认领且创建至今满 BACKLOG_DAYS 天没人接。 */
	readonly backlog: boolean;
}

export interface BoardSnapshot {
	readonly at: string;
	readonly workspaces: readonly LedgerWorkspace[];
	/** 全部在办任务（UI 自己筛「我的 / 待认领」——筛选是前端的事）。 */
	readonly tasks: readonly BoardTask[];
	readonly stats: BoardStats;
	/**
	 * 工作区 id → 本机身份 uuid（取不到为 null）。
	 * 「我的待办」在前端按 `owner === identities[workspace.id]` 筛——身份只在 host 侧读
	 * （`~/.taskledger/identity.json` 的 `uuid`，机器级，与工作区 / git 配置无关），UI 不碰文件。
	 */
	readonly identities: Readonly<Record<string, string | null>>;
}

/** 首页一次 `/board` 的全部聚合（**每个工作区只读一次** list + history + 本机身份）。 */
export interface HomeAggregate {
	readonly snapshot: BoardSnapshot;
	readonly closed: ClosedSummary;
	readonly trend: TrendPeriods;
}

/** 快路径作用域：在办 + 身份。**没有 history 字段**——想从它算趋势，编译器直接拦住。 */
export interface TaskScope {
	readonly workspace: LedgerWorkspace;
	readonly tasks: readonly TaskRow[];
	readonly identity: string | null;
}

/** 慢路径作用域：快路径 + history。趋势 / 筛选候选的原料。 */
export interface TrendScope extends TaskScope {
	readonly history: readonly HistoryRecord[];
}

export interface FilterOptions {
	readonly owners: string[];
	readonly categories: string[];
	readonly tags: string[];
}
