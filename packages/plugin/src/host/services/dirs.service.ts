/**
 * 台账目录清单（机器级；真源在 skill `dirs` + `~/.taskledger/ledgers.json`）。
 *
 * 写一律走 skill 命令，插件不碰那个文件 —— 既有规矩，见 dirs.repository.ts 头注。
 */
import {
	readDirs,
	removeDir,
	renameDir,
	setDirHidden,
	type LedgerDir,
} from "../repositories/dirs.repository.js";

/** 设置页「台账目录」块要的清单：**含隐藏项**（关了显示还得能开回来）。 */
export async function listDirs(): Promise<{ readonly dirs: readonly LedgerDir[] }> {
	return { dirs: await readDirs() };
}

/** 一次目录写动作（显示 / 改名 / 移除），返回改完之后的完整清单。 */
export type DirWriteInput =
	| { readonly action: "hide" | "unhide" | "remove"; readonly path: string }
	| { readonly action: "rename"; readonly path: string; readonly name: string };

export async function writeDirs(
	input: DirWriteInput,
): Promise<{ readonly dirs: readonly LedgerDir[] }> {
	switch (input.action) {
		case "hide":
			return { dirs: await setDirHidden(input.path, true) };
		case "unhide":
			return { dirs: await setDirHidden(input.path, false) };
		case "rename":
			return { dirs: await renameDir(input.path, input.name) };
		case "remove":
			return { dirs: await removeDir(input.path) };
	}
}
