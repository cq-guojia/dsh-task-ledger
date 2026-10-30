/**
 * 列表视图的筛选 / 排序（**唯一**实现，纯函数、不碰网络）：页面只渲染，不各写一份过滤。
 *
 * 口径（2026-10-30）：**按工作区分组**（组头 SectionHead），组内按「我在做 → 别人在做 →
 * 积压待认领 → 其余待认领」排优先级；组顺序 = 宿主注册的工作区顺序（固定，不跟任务数跳）。
 * 行上的 `mine` / `stale` / `overdue` / `backlog` **全部是 skill 算好的**，这里只做布尔判断；
 * 六档、工作区、执行人、搜索**全在浏览器里筛**（快照已含全部在办，不发请求）。
 *
 * 单独成文件是为了能被冒烟直测（store.ts 引 api.ts，Node 剥类型解析不了无扩展名相对导入）。
 */

import type { PickerGroup, PickerOption } from "dsh-plugin-core/ui";
import type { Translate } from "./locales";
import type { Query } from "./store";
import type { BoardPayload, BoardTask, Workspace } from "./types";

/** 列表行。 */
export interface Row {
	readonly kind: "task";
	readonly key: string;
	readonly task: BoardTask;
	readonly mine: boolean;
}

/**
 * 界面上显示人名的**唯一**口径：显示名（`owner_name` / `creator_name`）优先，
 * 旧数据 / 名册里没名字才退回 uuid。**只用于显示与搜索** —— 归属判定看 skill 给的 `mine`。
 */
export function displayName(
	name: string | null | undefined,
	uuid: string | null | undefined,
): string {
	const label = (name ?? "").trim();
	return label !== "" ? label : (uuid ?? "").trim();
}

/** 当前筛选下的单区列表 + 六档角标计数。
 *  角标口径（用户 2026-10-30 纠正）：**先按档位无关的筛选（工作区 / 执行人 / 搜索）收窄**，
 *  再逐档数 —— 改了工作区角标跟着重算；但**不吃档位本身**，否则选中某档就把它自己算成 0 条。 */
export interface BoardView {
	readonly rows: readonly Row[];
	readonly counts: {
		readonly all: number;
		readonly mine: number;
		readonly open: number;
		readonly doing: number;
		readonly backlog: number;
		readonly overdue: number;
		readonly stale: number;
	};
}

/**
 * 「我的」判定：**直接读 skill 算好的 `mine`**（`list --json` 每行带，脚本比 uuid）。
 * 前端不再拿 identities 自己比一遍——两套真源迟早对不上。
 */
export function isMine(task: BoardTask): boolean {
	return task.mine === true;
}

/**
 * 任务动作权限（**唯一**判定）：界面只按返回值画按钮，不再自己判断是不是我的。
 */
export interface TaskActions {
	/** 查看详情（所有任务都有）。 */
	readonly view: boolean;
	/** 认领：只有**没人认领**（待认领）的任务能认领。 */
	readonly claim: boolean;
	readonly resume: boolean;
	readonly finish: boolean;
	readonly release: boolean;
	/**
	 * 取消：与 skill 的 `close --cancel` 可用范围一致（用户 2026-10-29）——
	 * 公共池（待认领）任务可直接取消，我名下的也能取消；**别人名下的不行**。
	 */
	readonly cancel: boolean;
}

export function resolveActions(task: BoardTask): TaskActions {
	const mine = isMine(task);
	return {
		view: true,
		claim: !mine && task.status === "open",
		resume: mine,
		finish: mine,
		release: mine,
		cancel: mine || task.status === "open",
	};
}

/** 六档菜单命中。标记（`stale` / `overdue` / `backlog`）都由 skill 判定，前端只读布尔。 */
function tabHit(task: BoardTask, tab: Query["tab"]): boolean {
	switch (tab) {
		case "all":
			return true;
		case "mine":
			return task.mine === true;
		case "open":
			return task.status === "open";
		case "doing":
			return task.status === "doing" || task.status === "blocked";
		case "backlog":
			return task.backlog === true;
		case "overdue":
			return task.overdue === true;
		case "stale":
			return task.stale === true;
	}
}

/** 执行人命中：空 = 全部；否则按 uuid 精确比（取自快照的 `owner` 字段，不比名字）。 */
function ownerHit(task: BoardTask, owner: string): boolean {
	return owner === "" || task.owner === owner;
}

/** 搜索命中：标题 / 任务号 / 执行人 / 创建人 / 分类 / 标签 的子串匹配（不区分大小写）。 */
function keywordHit(task: BoardTask, keyword: string): boolean {
	const kw = keyword.trim().toLowerCase();
	if (kw === "") return true;
	const hay = [
		task.title,
		task.id,
		displayName(task.owner_name, task.owner),
		displayName(task.creator_name, task.creator),
		task.category,
		...(task.tags ?? []),
	]
		.filter((s): s is string => s !== null && s !== undefined && s !== "")
		.map((s) => s.toLowerCase());
	return hay.some((s) => s.includes(kw));
}

/**
 * 组内优先级（用户 2026-10-30）：我在做 → 别人在做 → 积压待认领 → 其余待认领。
 * 越靠前越需要本人动手；同档再按时间倒序（沿用「我的待办」的老口径）。
 */
function rankOf(task: BoardTask): number {
	const doing = task.status === "doing" || task.status === "blocked";
	if (doing) return task.mine === true ? 0 : 1;
	return task.backlog === true ? 2 : 3;
}

/** 组头要数的那几档（不含「全部」和「我的待办」）：与左侧菜单同一套判据。 */
const GROUP_TABS = ["open", "doing", "backlog", "overdue", "stale"] as const;
export type GroupTab = (typeof GROUP_TABS)[number];
/** 该组各档条数（0 的档界面不显示）。 */
export type GroupCounts = Readonly<Record<GroupTab, number>>;

/** 一个工作区的分组（组头 + 该区行 + 该区各档计数）。 */
export interface WorkspaceGroup {
	readonly workspace: Workspace;
	readonly rows: readonly Row[];
	readonly counts: GroupCounts;
}

/** 按工作区切段：**顺序不在这里定** —— `selectView` 已按「工作区注册序 + 组内优先级」排好，
 *  这里只把连续同区的行切开，顺带数该组各档（纯函数，冒烟可直测）。
 *  计数口径 = 组内**当前显示的行**，与左侧六档菜单同一个 `tabHit` ⇒ 组头数字和列出来的行对得上。 */
export function groupRows(rows: readonly Row[]): readonly WorkspaceGroup[] {
	const groups: { workspace: Workspace; rows: Row[] }[] = [];
	for (const row of rows) {
		const last = groups[groups.length - 1];
		if (last !== undefined && last.workspace.id === row.task.workspace.id) {
			last.rows.push(row);
		} else {
			groups.push({ workspace: row.task.workspace, rows: [row] });
		}
	}
	return groups.map((group) => {
		const counts: Record<GroupTab, number> = {
			open: 0,
			doing: 0,
			backlog: 0,
			overdue: 0,
			stale: 0,
		};
		for (const row of group.rows) {
			for (const tab of GROUP_TABS) if (tabHit(row.task, tab)) counts[tab] += 1;
		}
		return { ...group, counts };
	});
}

/** 当前筛选下的平铺列表，已按「工作区分组 + 组内优先级 + 时间倒序」排好。 */
export function selectView(current: {
	board: BoardPayload | null;
	query: Query;
}): BoardView {
	const board = current.board;
	const empty = {
		rows: [] as readonly Row[],
		counts: { all: 0, mine: 0, open: 0, doing: 0, backlog: 0, overdue: 0, stale: 0 },
	};
	if (board === null) return empty;
	const { tasks } = board;
	const { tab, workspace, owner, keyword } = current.query;
	// 计数与列表共用这一层「档位无关」的范围：角标只随工作区 / 执行人 / 搜索变。
	const scope = tasks
		.filter((task) => workspace === "" || task.workspace.id === workspace)
		.filter((task) => ownerHit(task, owner))
		.filter((task) => keywordHit(task, keyword));
	const counts: Record<keyof BoardView["counts"], number> = {
		all: scope.length,
		mine: 0,
		open: 0,
		doing: 0,
		backlog: 0,
		overdue: 0,
		stale: 0,
	};
	for (const task of scope) {
		if (task.mine === true) counts.mine += 1;
		if (task.status === "open") counts.open += 1;
		if (task.status === "doing" || task.status === "blocked") counts.doing += 1;
		if (task.backlog === true) counts.backlog += 1;
		if (task.overdue === true) counts.overdue += 1;
		if (task.stale === true) counts.stale += 1;
	}
	// 组顺序 = 宿主注册的工作区顺序（不随任务增减跳动）；不在列表里的兜底排最后。
	// ⚠️ sort 必须先把「工作区」这一档比完再比组内优先级，否则同区行不连续、切不出组。
	const wsOrder = new Map(board.workspaces.map((ws, index) => [ws.id, index]));
	const rows: Row[] = scope
		.filter((task) => tabHit(task, tab))
		.sort(
			(a, b) =>
				(wsOrder.get(a.workspace.id) ?? Number.MAX_SAFE_INTEGER) -
					(wsOrder.get(b.workspace.id) ?? Number.MAX_SAFE_INTEGER) ||
				rankOf(a) - rankOf(b) ||
				String(b.created ?? b.started ?? "").localeCompare(
					String(a.created ?? a.started ?? ""),
				),
		)
		.map((task) => ({
			kind: "task",
			key: `${task.workspace.id}:${task.id}`,
			task,
			mine: task.mine === true,
		}));
	return { rows, counts };
}

/**
 * 单人台账：**执行人下拉的候选**（各工作区花名册合并去重，与 `ownerGroups` 同一份）里
 * 只有 ≤ 1 个人 ⇒ 行内人名 / 创建人 / 执行人下拉 / 「只看我的」全部隐藏（用户 2026-10-29：
 * 「只有一个人，明显就是他自己在用」）。
 *
 * 只看名册这一份：任务上的 owner / creator 不参与判断 —— 旧任务里留着的别人的 uuid
 * 不该把整板拽回多人形态；某工作区名册读挂也不拦住（那时下拉本来也没人可选）。
 */
export function isSoloLedger(board: BoardPayload | null): boolean {
	if (board === null) return false;
	const uuids = new Set<string>();
	for (const ws of board.workspaceOwners) {
		for (const owner of ws.owners) {
			if (owner.uuid !== "") uuids.add(owner.uuid);
		}
	}
	return uuids.size <= 1;
}

/**
 * 执行人下拉的分组（核心 Picker 原生支持 groups）。
 * 跨工作区合并去重：同一 uuid 出现在 ≥2 个工作区 ⇒ 归「通用人员」组（置顶）；
 * 只出现在一个工作区 ⇒ 归该工作区分组。空工作区（名册读挂）自然不出现。
 * 顶部一段**空标题**（`全部执行人` + 跨工作区的通用人员，都不设标题），
 * 只有「只在一个工作区出现」的人，才各自带工作区小标题分组。
 * 「全部执行人」`value=""` 是当前选中的回显位；筛选逻辑后置。
 */
export function ownerGroups(
	board: BoardPayload | null,
	workspaceOptions: readonly { readonly value: string; readonly label: string }[],
	t: Translate,
): PickerGroup[] {
	if (board === null) return [];
	const byUuid = new Map<string, { name: string; ws: Set<string> }>();
	for (const ws of board.workspaceOwners) {
		for (const owner of ws.owners) {
			let entry = byUuid.get(owner.uuid);
			if (entry === undefined) {
				entry = { name: owner.name, ws: new Set<string>() };
				byUuid.set(owner.uuid, entry);
			}
			entry.ws.add(ws.workspaceId);
		}
	}
	const allOption: PickerOption = { value: "", label: t("ownerAll") };
	const shared: PickerOption[] = [];
	const exclusive = new Map<string, PickerOption[]>();
	for (const [uuid, entry] of byUuid) {
		const option: PickerOption = { value: uuid, label: `@${entry.name}` };
		if (entry.ws.size > 1) {
			shared.push(option);
		} else {
			for (const wsId of entry.ws) {
				const list = exclusive.get(wsId);
				if (list === undefined) exclusive.set(wsId, [option]);
				else list.push(option);
			}
		}
	}
	const groups: PickerGroup[] = [];
	// 顶部空标题段：全部执行人（置顶）+ 跨工作区的通用人员（不单独设「通用人员」标题）。
	groups.push({ value: "_top", label: "", options: [allOption, ...shared] });
	// 工作区独有的人员：各自带工作区小标题分组。
	for (const option of workspaceOptions) {
		if (option.value === "") continue;
		const list = exclusive.get(option.value);
		if (list !== undefined && list.length > 0) {
			groups.push({ value: option.value, label: option.label, options: list });
		}
	}
	return groups;
}
