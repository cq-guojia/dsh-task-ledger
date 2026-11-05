/**
 * 机器身份（看板「设置页」用）：读是谁、换是谁、列出可以换成谁。
 *
 * 三条都走 skill 脚本，插件不碰 identity.json（布局知识只有 skill 一份）：
 *  - `whoami --json` → 读；未初始化回双 null（退 0，不是错误）；
 *  - `switch --json` → 写（隐藏命令，只给界面用；init 在非终端下仍拒写）；
 *  - `owners --json` → 名册（2026-11-01 起放开，没身份也能读）。
 */
import type { LedgerWorkspace, WorkspaceOwners } from "../types.js";
import {
	forgetOwner as runForget,
	logout as runLogout,
	readIdentity,
	switchIdentity as runSwitch,
	type IdentityView,
	type RenameView,
	type SwitchInput,
} from "../repositories/identity.repository.js";
import { readOwners } from "../repositories/ledger.repository.js";

export type { IdentityView, RenameView, SwitchInput };

export async function getIdentity(): Promise<IdentityView> {
	return await readIdentity();
}

export async function switchIdentity(
	input: SwitchInput,
): Promise<IdentityView | RenameView> {
	return await runSwitch(input);
}

/** 一个工作区里可以被认领的人（名册原样，去掉 uuid 为空的行）。 */
export interface RosterWorkspace {
	readonly id: string;
	readonly title: string;
	readonly owners: readonly { readonly uuid: string; readonly name: string }[];
}

/**
 * 各工作区花名册。**读挂了的工作区直接跳过**——名册索引缺失（`owners.json` 还没被任何写命令建出来）
 * 与新仓库本来就没人是同一件事：引导页要把它当「这里没人，只能新建」，不能当成故障。
 */
/** 摘人结果：删掉的、因为还有任务没删的、出错的，各按工作区列出来。 */
export interface ForgetReport {
	readonly removed: readonly string[];
	readonly kept: readonly { readonly workspace: string; readonly tasks: number }[];
	readonly failed: readonly { readonly workspace: string; readonly error: string }[];
	/** 删的是本机身份、并且**每一本都删成了** ⇒ 顺手退出了登录。 */
	readonly signedOut: boolean;
}

/** 一次摘人过程里的阶段（逐本台账各跑一条 skill 写命令，带台账名免得交错时分不清）。 */
export interface ForgetStep {
	readonly workspace: string;
	/** skill `stepf` 的 key：check / sync / write / commit / push。 */
	readonly step: string;
}

/**
 * 把某个人从**所有登记过他的台账**里摘掉（用户 2026-11-02 定的口径）：
 * 每本台账各删各的，分片里还有任务的那本不删、如实回报；历史记录与其他台账一概不动。
 * 名册里没有他的台账直接跳过（不是失败）。
 *
 * **清本机身份必须是最后一步**：删的是自己时，每本台账都跑一次 forget，若让 forget 顺手
 * 删 identity.json，先跑完的那本会让后面几本读不到身份（报「这台机器还没有初始化身份」）。
 * 所以 forget 一律带 --keep-identity，全部跑完之后才按需要 logout。
 */
export async function forgetOwner(
	workspaces: readonly LedgerWorkspace[],
	uuid: string,
	onStep?: (step: ForgetStep) => void,
): Promise<ForgetReport> {
	const key = uuid.trim().toLowerCase();
	const removed: string[] = [];
	const kept: { workspace: string; tasks: number }[] = [];
	const failed: { workspace: string; error: string }[] = [];
	const listed = await Promise.allSettled(workspaces.map(readOwners));
	const targets = workspaces.filter((_workspace, index) => {
		const result = listed[index];
		if (result.status !== "fulfilled") return false;
		return result.value.owners.some((owner) => owner.uuid === key);
	});
	// 摘的是不是自己：只有「自己」才需要最后退出登录
	const me = await readIdentity().catch(() => ({ uuid: null, name: null }));
	const isSelf = me.uuid !== null && me.uuid === key;

	const outcomes = await Promise.allSettled(
		targets.map((workspace) =>
			runForget(workspace.path, key, (step) => onStep?.({ workspace: workspace.title, step })),
		),
	);
	outcomes.forEach((result, index) => {
		const workspace = targets[index];
		if (result.status === "rejected") {
			const reason = result.reason;
			failed.push({
				workspace: workspace.title,
				error: reason instanceof Error ? reason.message : String(reason),
			});
			return;
		}
		if (result.value.removed) removed.push(workspace.title);
		else kept.push({ workspace: workspace.title, tasks: result.value.tasks });
	});

	// **全部成功才退登录**（用户 2026-11-02 拍板）：只要有一本还留着人（kept）或报错（failed），
	// 本机身份就保住 —— 人还没从台账里清干净，机器先没了身份只会更乱。
	let signedOut = false;
	const allDone = removed.length > 0 && kept.length === 0 && failed.length === 0;
	if (isSelf && allDone) {
		const anchor = (targets[0] ?? workspaces[0])?.path;
		if (anchor === undefined) {
			failed.push({ workspace: me.name ?? key, error: "退出登录失败：没有可用的台账目录" });
		} else {
			try {
				await runLogout(anchor);
				signedOut = true;
			} catch (error) {
				failed.push({
					workspace: me.name ?? key,
					error: `退出登录失败：${error instanceof Error ? error.message : String(error)}`,
				});
			}
		}
	}
	return { removed, kept, failed, signedOut };
}

export async function getRoster(
	workspaces: readonly LedgerWorkspace[],
): Promise<{ readonly workspaces: readonly RosterWorkspace[] }> {
	const settled = await Promise.allSettled(workspaces.map(readOwners));
	const rows: RosterWorkspace[] = [];
	settled.forEach((result, index) => {
		if (result.status !== "fulfilled") return;
		const owners: WorkspaceOwners = result.value;
		rows.push({
			id: workspaces[index].id,
			title: workspaces[index].title,
			owners: owners.owners
				.filter((owner) => owner.uuid !== "")
				.map((owner) => ({ uuid: owner.uuid, name: owner.name })),
		});
	});
	return { workspaces: rows };
}
