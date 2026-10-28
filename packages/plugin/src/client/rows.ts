/**
 * 列表视图的筛选 / 排序（**唯一**实现，纯函数、不碰网络）：页面只渲染，不各写一份过滤。
 *
 * 口径（2026-10-28）：单区平铺（沿用「我的待办」卡片样式），左侧六档菜单 + 工作区 / 执行人 / 搜索。
 * 行上的 `mine` / `stale` / `overdue` / `backlog` **全部是 skill 算好的**，这里只做布尔判断；
 * 六档、工作区、执行人、搜索**全在浏览器里筛**（快照已含全部在办，不发请求）。
 *
 * 单独成文件是为了能被冒烟直测（store.ts 引 api.ts，Node 剥类型解析不了无扩展名相对导入）。
 */

import type { PickerGroup, PickerOption } from "dsh-plugin-core/ui";
import type { Translate } from "./locales";
import type { Query } from "./store";
import type { BoardPayload, BoardTask } from "./types";

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

/** 当前筛选下的单区列表 + 六档角标计数（角标是**全量**，不受工作区 / 关键字影响）。 */
export interface BoardView {
	readonly rows: readonly Row[];
	readonly counts: {
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
}

export function resolveActions(task: BoardTask): TaskActions {
	const mine = isMine(task);
	return {
		view: true,
		claim: !mine && task.status === "open",
		resume: mine,
		finish: mine,
		release: mine,
	};
}

/** 六档菜单命中。标记（`stale` / `overdue` / `backlog`）都由 skill 判定，前端只读布尔。 */
function tabHit(task: BoardTask, tab: Query["tab"]): boolean {
	switch (tab) {
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

/** 当前筛选下的平铺列表，按创建 / 开始时间倒序（沿用「我的待办」的排序口径）。 */
export function selectView(current: {
	board: BoardPayload | null;
	query: Query;
}): BoardView {
	const board = current.board;
	const empty = {
		rows: [] as readonly Row[],
		counts: { mine: 0, open: 0, doing: 0, backlog: 0, overdue: 0, stale: 0 },
	};
	if (board === null) return empty;
	const { tasks } = board;
	const { tab, workspace, owner, keyword } = current.query;
	const rows: Row[] = tasks
		.filter((task) => tabHit(task, tab))
		.filter((task) => workspace === "" || task.workspace.id === workspace)
		.filter((task) => ownerHit(task, owner))
		.filter((task) => keywordHit(task, keyword))
		.sort((a, b) =>
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
	return {
		rows,
		counts: {
			mine: tasks.filter((task) => task.mine === true).length,
			open: tasks.filter((task) => task.status === "open").length,
			doing: tasks.filter(
				(task) => task.status === "doing" || task.status === "blocked",
			).length,
			backlog: tasks.filter((task) => task.backlog === true).length,
			overdue: tasks.filter((task) => task.overdue === true).length,
			stale: tasks.filter((task) => task.stale === true).length,
		},
	};
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
