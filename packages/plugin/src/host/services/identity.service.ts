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
