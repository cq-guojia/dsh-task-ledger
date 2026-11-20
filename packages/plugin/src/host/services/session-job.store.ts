/**
 * 会话作业的**状态唯一真源**：核心 `TaskStreamSource` 的本仓实现（2026-11-21 按 v0.43.8 重写）。
 *
 * 为什么住宿主进程：作业的执行者在宿主（agent 会话由宿主建、由宿主驱动），状态寿命 = 执行者寿命。
 * 页面只是订阅者，刷新 / 关页 / 换标签页都不影响这里的一行记录。
 *
 * 新协议（v0.43.8）与旧 `TaskCenterStore` 的区别：
 *  - 核心只认三件事：`snapshot(viewer)` 基线、`subscribe(listener, viewer)` 状态投影、
 *    `subscribeNotices(listener, viewer)` 一次性终态通知；旧六方法 + 租约 / 令牌 / tombstone 全删。
 *  - 记录形状换成核心 `TaskRecord`；终态必须带有限数 `settledAt`，running 不得带（核心唯一闸）。
 *  - 通知与状态物理隔离：状态可重放不弹卡；只有终态跃迁那一刻产出带全局 id 的 notice 进 outbox，
 *    订阅时回放未过期 outbox（断线期间结算的也能补投），客户端按 id 永久去重。
 *  - 回显 `project` / `group` / `key`：客户端靠 `(project,key)` 把乐观行归一到服务端真记录。
 *
 * 本文件只管状态：不建会话、不读台账。业务在 `session.service.ts`。
 */
import type { TaskRecord } from "dsh-plugin-core/adv/tasks";
import type { TaskStreamSource } from "dsh-plugin-core/host";

/** 一次性终态通知（核心 `TaskNotice` 未从导出面重导出，这里按契约最小声明）。 */
interface TaskNotice {
	readonly id: string;
	readonly task: TaskRecord;
}

/** 任务中心的一级项目名（与客户端 `TASK_PROJECT` 必须是同一个值）。 */
export const PROJECT = "dsh-task-ledger";
/** 二级分组：本插件只有「会话作业」一类后台任务，不按用途再分。 */
export const GROUP = "session";

/** 「查看会话」按钮 id（客户端 mountTaskUI 的 handler 按它注册）。 */
export const VIEW_SESSION_ACTION = "view-session";

const SECOND = 1_000;
/** 终态记录与通知保留多久：只服务 UI 收尾与跨页去重，过期即清（不是业务数据）。 */
const TERMINAL_TTL_MS = 10 * 60 * SECOND;
/** 看护轮询间隔：只处理「超过 maxDurationMs 还在跑」这一种情况。 */
const REAP_INTERVAL_MS = 5 * SECOND;

/** 详情载荷：任意 JSON 值（与核心 `NotifyDetail` 同结构，结构化克隆过线）。 */
export type JobDetail =
	| string
	| number
	| boolean
	| null
	| readonly JobDetail[]
	| { readonly [key: string]: JobDetail };

/** 新建一条作业需要的东西（由 service 在会话建好之后给）。 */
export interface RegisterInput {
	/** 业务键：`close:<任务号>` —— 判重的唯一依据。 */
	readonly key: string;
	readonly title: string;
	/** 会话 id（随 detail 下发，客户端拿它归档 / 打开）。 */
	readonly sessionId: string;
	readonly taskId: string;
	/** 台账目录绝对路径（detail 里给客户端做跳转备份）。 */
	readonly workspace: string;
	/** 超过它还在跑 ⇒ 判超时失败；0 / 缺省 = 不设上限（作业自己会结束）。 */
	readonly maxDurationMs?: number;
}

/** 终态结算载荷。 */
export interface SettleInput {
	readonly reason?: string;
	readonly result?: JobDetail;
}

type StateListener = (task: TaskRecord) => void;
type NoticeListener = (notice: TaskNotice) => void;

function keyOf(project: string, key: string): string {
	return `${project}\u0000${key}`;
}

/** 行按钮：服务端只声明文案 / 时机 / id，画面由核心 TaskBar 画，handler 在发起页注册。 */
function rowButtons(): readonly { readonly id: string; readonly text: string; readonly when: "always" }[] {
	return [{ id: VIEW_SESSION_ACTION, text: "查看会话", when: "always" }];
}

/** 把结算 result 并进 detail（detail 是 JSON 值，只有普通对象能就地加键）。 */
function withResult(detail: TaskRecord["detail"], result: JobDetail): TaskRecord["detail"] {
	if (detail !== null && typeof detail === "object" && !Array.isArray(detail)) {
		return { ...detail, result };
	}
	return { ...(detail === undefined ? {} : { detail }), result };
}

/** toast / notify 配置随记录走：任何页面看到同一条都按同一份配置渲染。 */
function completionConfig(title: string) {
	return {
		toast: {
			success: { title: `已完成：${title}` },
			failure: { title: `失败：${title}` },
		},
		notify: {
			success: { message: `后台任务已完成：${title}`, scope: "all" as const, broadcast: "plugin" as const },
			failure: { message: `后台任务失败：${title}`, scope: "all" as const, broadcast: "plugin" as const },
		},
	};
}

export interface SessionJobStore extends TaskStreamSource {
	/**
	 * 原子占位（消除 TOCTOU）：起会话的 await 之前先占住 key，返回 true 表示拿到；
	 * 并发第二个同 key 立刻拿到 false，不会再起第二个会话。失败要 release。
	 */
	claim(key: string, title: string): boolean;
	/** 占位失败时释放（createSession 抛错 / 非 DSH）；没占住就是空操作。 */
	release(key: string): void;
	/** 把占位记录填成正式 running（带 sessionId 等详情）。 */
	register(input: RegisterInput): TaskRecord;
	/** 结算成 done / failed（幂等：已终态直接返回旧记录）。 */
	settle(key: string, state: "done" | "failed", input?: SettleInput): TaskRecord | undefined;
	/** 读一条（不含终态也返回，供 service 判「已经在跑」）。 */
	find(key: string): TaskRecord | undefined;
	/** 摘掉看护定时器（插件 dispose 时调）。 */
	dispose(): void;
}

/**
 * 建一个进程内 store。不落盘是刻意的：宿主重启 ⇒ 会话必然已中断 ⇒ 记录随之消失才是真实状态。
 */
export function createSessionJobStore(): SessionJobStore {
	const records = new Map<string, TaskRecord>();
	const outbox: TaskNotice[] = [];
	const stateListeners = new Set<StateListener>();
	const noticeListeners = new Set<NoticeListener>();

	let noticeSeq = 0;
	const deadlineByKey = new Map<string, number>();
	let reaper: ReturnType<typeof setInterval> | null = null;

	const emitState = (record: TaskRecord): void => {
		for (const listener of [...stateListeners]) {
			try {
				listener(record);
			} catch {
				/* 订阅方自己炸了不该连累记录写入 */
			}
		}
	};

	const emitNotice = (notice: TaskNotice): void => {
		for (const listener of [...noticeListeners]) {
			try {
				listener(notice);
			} catch {
				/* 同上 */
			}
		}
	};

	const purgeExpired = (now: number): void => {
		for (const [id, record] of records) {
			if (record.state === "running") continue;
			if (record.settledAt !== undefined && now - record.settledAt > TERMINAL_TTL_MS) {
				records.delete(id);
				deadlineByKey.delete(record.key ?? "");
			}
		}
		for (let i = outbox.length - 1; i >= 0; i--) {
			const task = outbox[i].task;
			if (task.settledAt !== undefined && now - task.settledAt > TERMINAL_TTL_MS) outbox.splice(i, 1);
		}
	};

	const ensureReaper = (): void => {
		if (reaper !== null) return;
		reaper = setInterval(() => {
			const now = Date.now();
			for (const [key, deadline] of [...deadlineByKey]) {
				if (deadline === 0 || now <= deadline) continue;
				settle(key, "failed", { reason: "timeout" });
			}
			purgeExpired(now);
		}, REAP_INTERVAL_MS);
		(reaper as { unref?: () => void }).unref?.();
	};

	function settle(
		key: string,
		state: "done" | "failed",
		input: SettleInput = {},
	): TaskRecord | undefined {
		const id = keyOf(PROJECT, key);
		const current = records.get(id);
		if (current === undefined) return undefined;
		if (current.state !== "running") return current;
		const now = Date.now();
		const next: TaskRecord = {
			...current,
			state,
			settledAt: now,
			...(input.reason === undefined ? {} : { reason: input.reason }),
			...(input.result === undefined ? {} : { detail: withResult(current.detail, input.result) }),
		};
		records.set(id, next);
		deadlineByKey.delete(key);
		const notice: TaskNotice = {
			id: `${PROJECT}:${key}:${String(++noticeSeq)}`,
			task: next,
		};
		outbox.push(notice);
		emitState(next);
		emitNotice(notice);
		return next;
	}

	function claim(key: string, title: string): boolean {
		const id = keyOf(PROJECT, key);
		const existing = records.get(id);
		if (existing !== undefined && existing.state === "running") return false;
		const now = Date.now();
		const record: TaskRecord = {
			id: `${PROJECT}:${key}:${String(now)}`,
			key,
			project: PROJECT,
			group: GROUP,
			title,
			state: "running",
			startedAt: now,
			kind: "session-job",
			rowButtons: rowButtons(),
			...completionConfig(title),
		};
		// 占位只在服务端内存里占 key，**不推 SSE**：createSession 期间会话还没建起来，
		// 推一条无 sessionId 的 running 行会给所有标签页画出点了没反应的「查看会话」死按钮；
		// createSession 失败时也没有删除帧可发，会留幽灵锁行。等 register 成功才对外可见。
		records.set(id, record);
		return true;
	}

	function release(key: string): void {
		const id = keyOf(PROJECT, key);
		const current = records.get(id);
		if (current === undefined || current.state !== "running") return;
		if (current.detail !== undefined) return; // 已填详情 = 真在跑，不能误删
		// 用终态帧收口，不静默删除：并发提交者的本地乐观行靠这条 failed 帧按 (project,key)
		// 归一解锁；核心没有「删除帧」，静默删会让别的标签页的乐观行永久卡在 running。
		settle(key, "failed", { reason: "session-start-failed" });
	}

	function register(input: RegisterInput): TaskRecord {
		const id = keyOf(PROJECT, input.key);
		const now = Date.now();
		const maxDurationMs = input.maxDurationMs ?? 0;
		const prior = records.get(id);
		const record: TaskRecord = {
			...(prior ?? {
				id: `${PROJECT}:${input.key}:${String(now)}`,
				key: input.key,
				project: PROJECT,
				group: GROUP,
				title: input.title,
				state: "running" as const,
				startedAt: now,
			}),
			title: input.title,
			state: "running",
			detail: {
				sessionId: input.sessionId,
				taskId: input.taskId,
				workspace: input.workspace,
			},
			kind: "session-job",
			rowButtons: rowButtons(),
			...completionConfig(input.title),
		};
		records.set(id, record);
		deadlineByKey.set(input.key, maxDurationMs > 0 ? now + maxDurationMs : 0);
		emitState(record);
		ensureReaper();
		return record;
	}

	return {
		claim,
		release,
		register,
		settle,
		find(key) {
			return records.get(keyOf(PROJECT, key));
		},
		dispose() {
			if (reaper !== null) clearInterval(reaper);
			reaper = null;
			stateListeners.clear();
			noticeListeners.clear();
		},
		async snapshot(_viewer: string) {
			return [...records.values()].sort((a, b) => b.startedAt - a.startedAt);
		},
		subscribe(listener: StateListener, _viewer: string) {
			stateListeners.add(listener);
			return () => {
				stateListeners.delete(listener);
			};
		},
		subscribeNotices(listener: NoticeListener, _viewer: string) {
			// 回放 outbox：断线 / 刷新期间结算的终态也能补投；客户端按 notice.id 永久去重。
			for (const notice of [...outbox]) {
				try {
					(listener as (n: TaskNotice) => void)(notice);
				} catch {
					/* 订阅方异常不影响回放其余通知 */
				}
			}
			noticeListeners.add(listener);
			return () => {
				noticeListeners.delete(listener);
			};
		},
	};
}

/** 业务键：同一条任务同一时刻只允许一个结案作业（跨刷新、跨标签页成立）。 */
export function closeJobKey(taskId: string): string {
	return `close:${taskId}`;
}
