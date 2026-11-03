/**
 * 台账目录清单（机器级；真源在 skill `dirs` + `~/.taskledger/ledgers.json`）。
 *
 * 写一律走 skill 命令，插件不碰那个文件 —— 既有规矩，见 dirs.repository.ts 头注。
 */
import {
	addDir,
	ledgerChildrenOf,
	readDirs,
	removeDir,
	renameDir,
	setDirHidden,
	type LedgerDir,
} from "../repositories/dirs.repository.js";

/** 清单条目 + 「是不是宿主工作区」。工作区目录只能隐藏不能移除（移除会被下次进看板的同步补回来）。 */
export interface DirListView extends LedgerDir {
	readonly inRegistry: boolean;
}

/** 设置页「台账目录」块要的清单：**含隐藏项**（关了显示还得能开回来）。 */
export async function listDirs(
	registryPaths: readonly string[],
): Promise<{ readonly dirs: readonly DirListView[] }> {
	const inRegistry = new Set(registryPaths);
	const dirs = await readDirs();
	return { dirs: dirs.map((dir) => ({ ...dir, inRegistry: inRegistry.has(dir.path) })) };
}

/** 一次目录写动作（登记 / 显示 / 改名 / 移除），返回改完之后的完整清单。 */
export type DirWriteInput =
	| { readonly action: "hide" | "unhide" | "remove"; readonly path: string }
	| { readonly action: "rename"; readonly path: string; readonly name: string }
	| { readonly action: "add"; readonly path: string };

/** 写动作回执；`added` / `reason` 只有「登记」会带（`added:false` 时 `reason` 是原因）。 */
export interface DirWriteResult {
	readonly dirs: readonly LedgerDir[];
	/** 登记回执：`false` = 一个都没进清单（`reason` 是原因）。 */
	readonly added?: boolean;
	/** 这些目录**本来就在**清单里（界面据此提示「无需重复添加」）。 */
	readonly existed?: boolean;
	/** 这次涉及的台账根（新增的；全部已存在时是已存在的那些），界面列名字用。 */
	readonly paths?: readonly string[];
	readonly reason?: string;
}

/**
 * 登记：选中的目录**自己**是台账根就登记它；不是的话，把它**一级子目录**里的台账根逐个登记
 * （用户 2026-11-03：只知道「这项目有台账」的人会选它的直属父目录，这种也算有效）。
 * 两样都没有 ⇒ 不落盘，把 skill 给的原因回给界面。
 *
 * 回执里**清单永远是完整的**：skill 在「不是台账根」时不回清单（`dirs` 为 null），
 * 照它回执换表格会把界面清空（2026-11-03 真机踩过）⇒ 失败分支自己再读一次。
 */
async function addDirs(path: string): Promise<DirWriteResult> {
	// 登记前先记一份：skill 的 `--add` 幂等，回执分不出「这次新增」和「本来就有」
	const before = new Set((await readDirs()).map((dir) => dir.path));
	const fresh: string[] = [];
	const known: string[] = [];
	let dirs: readonly LedgerDir[] = [];

	const self = await addDir(path, "");
	if (self.added) {
		dirs = self.dirs;
		(before.has(path) ? known : fresh).push(path);
	} else {
		const children = await ledgerChildrenOf(path);
		if (children.length === 0)
			return { dirs: await readDirs(), added: false, reason: self.reason };
		// 串行：读改写同一个清单文件，并发会互相覆盖
		for (const child of children) {
			const result = await addDir(child, "");
			if (!result.added) continue;
			dirs = result.dirs;
			(before.has(child) ? known : fresh).push(child);
		}
		if (fresh.length === 0 && known.length === 0)
			return {
				dirs: await readDirs(),
				added: false,
				reason: `${path} 下的台账登记失败`,
			};
	}

	if (fresh.length > 0) return { dirs, added: true, paths: fresh };
	return { dirs, added: true, existed: true, paths: known };
}

export async function writeDirs(input: DirWriteInput): Promise<DirWriteResult> {
	switch (input.action) {
		case "hide":
			return { dirs: await setDirHidden(input.path, true) };
		case "unhide":
			return { dirs: await setDirHidden(input.path, false) };
		case "rename":
			return { dirs: await renameDir(input.path, input.name) };
		case "remove":
			return { dirs: await removeDir(input.path) };
		case "add":
			return addDirs(input.path);
	}
}
