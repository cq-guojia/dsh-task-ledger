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
 * 8 个统计卡的面。**数字全部来自 skill**（`stats --json` + `history --count-only`），
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
	/** 本周 / 上周完成数；history 全读不到时为 null（界面留 —，不拿 0 充数）。 */
	readonly weekDone: number | null;
	readonly lastWeekDone: number | null;
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
	readonly workspaces: readonly LedgerWorkspace[];
	readonly tasks: readonly TaskRow[];
	readonly identities: Readonly<Record<string, string | null>>;
	/** 每个工作区的成员名单（跨工作区去重 / 分组由前端做，见 client 的 ownerGroups）。 */
	readonly workspaceOwners: readonly WorkspaceOwners[];
}
