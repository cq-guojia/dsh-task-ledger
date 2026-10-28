/**
 * 看板数据仓（client 侧**唯一**取数入口）：首屏一次拉 `/board/snapshot`（8 卡 + 在办列表），
 * 打开面板首读 + 手动刷新按钮，**不轮询**（2026-10-17 拍板）。
 *
 * 消费方式：`useSyncExternalStore(boardSubscribe, boardSnapshot)`。
 * ⚠️ `getSnapshot` 必须返回**稳定引用**（每次新建对象会被判定为「一直在变」⇒ 无限重渲染），
 * 故只在真变了时才换 `state` 对象。
 */
import { fetchBoardSnapshot } from "./api";
import type { BoardPayload } from "./types";

/** 左侧菜单七档：「全部」置顶（不过滤），其后六档各按 skill 口径筛（详见 rows.ts）。 */
export type TabFilter =
	| "all"
	| "mine"
	| "open"
	| "doing"
	| "backlog"
	| "overdue"
	| "stale";

/** 列表筛选（六档菜单 / 工作区 / 执行人 / 搜索全在浏览器里筛，不发请求）。 */
export interface Query {
	tab: TabFilter;
	/** 工作区 id；'' = 全部。 */
	workspace: string;
	/** 通用搜索（标题 / 任务号 / 执行人 / 创建人 / 分类 / 标签，不区分大小写）。 */
	keyword: string;
	/** 负责人 uuid；'' = 全部。 */
	owner: string;
}

/** 行内点人名时补进「执行人」下拉的人：名册里已经查不到（被删 / 别的机器加的）也得能选中，
 *  页面不刷新就一直留在下拉里（用户 2026-10-28 的口径）。 */
export interface ExtraOwner {
	readonly uuid: string;
	readonly name: string;
}

export interface BoardState {
	status: "loading" | "ready" | "error";
	/** 首屏快照（8 卡 + 在办列表）；null = 还没回来。 */
	board: BoardPayload | null;
	error: string | null;
	query: Query;
	/** 手动刷新在途（按钮转圈 / 禁用）。 */
	refreshing: boolean;
	/** 行内点过的人（下拉候选不够时补位）；刷新页面即清空。 */
	extraOwners: readonly ExtraOwner[];
}

const INITIAL_QUERY: Query = {
	tab: "mine",
	workspace: "",
	keyword: "",
	owner: "",
};

let state: BoardState = {
	status: "loading",
	board: null,
	error: null,
	query: INITIAL_QUERY,
	refreshing: false,
	extraOwners: [],
};

const listeners = new Set<() => void>();
/** 首读只触发一次（谁先订阅谁触发），之后一律靠 `refresh()`。 */
let booted = false;
/** 在途轮次：迟到的响应按 token 丢弃，避免旧结果盖新结果。 */
let runToken = 0;

function emit(): void {
	for (const listener of [...listeners]) listener();
}

function set(patch: Partial<BoardState>): void {
	state = { ...state, ...patch };
	emit();
}

export function boardSnapshot(): BoardState {
	return state;
}

export function boardSubscribe(listener: () => void): () => void {
	listeners.add(listener);
	if (!booted) {
		booted = true;
		void refresh();
	}
	return () => {
		listeners.delete(listener);
	};
}

/** 重读首屏。带 `fresh=1`：本函数只由首读与手动刷新触发，都要最新值。 */
export async function refresh(): Promise<void> {
	const token = ++runToken;
	set({ refreshing: true });
	try {
		const board = await fetchBoardSnapshot({ fresh: true });
		if (token !== runToken) return;
		set({ status: "ready", board, error: null });
	} catch (error) {
		if (token !== runToken) return;
		set({
			status: "error",
			error: error instanceof Error ? error.message : String(error),
		});
	} finally {
		if (token === runToken) set({ refreshing: false });
	}
}

/** 改筛选：全部在浏览器里完成（快照已含全部在办），不发请求。 */
export function setQuery(patch: Partial<Query>): void {
	set({ query: { ...state.query, ...patch } });
}

/**
 * 行内点人名 = 选中下拉里的这个人（用户 2026-10-28）。
 * 名册里没有他的人（被删 / 别的机器加的）照样能筛：顺手补进下拉候选，
 * 所以「先看有没有」不用在这里判，合并候选时去重即可。
 */
export function focusOwner(uuid: string, name: string): void {
	if (uuid === "") return;
	const extraOwners = state.extraOwners.some((owner) => owner.uuid === uuid)
		? state.extraOwners
		: [...state.extraOwners, { uuid, name }];
	set({ extraOwners, query: { ...state.query, owner: uuid } });
}
