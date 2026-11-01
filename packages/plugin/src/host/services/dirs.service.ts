/**
 * 台账目录清单（机器级；真源在 skill `dirs` + `~/.taskledger/ledgers.json`）。
 *
 * 本轮只做读（用户 2026-11-01：先把设置页的界面定下来，写动作下一轮接）。
 * 写一律走 skill 命令，插件不碰那个文件 —— 既有规矩，见 dirs.repository.ts 头注。
 */
import { readDirs, type LedgerDir } from "../repositories/dirs.repository.js";

/** 设置页「台账目录」块要的清单：**含隐藏项**（关了显示还得能开回来）。 */
export async function listDirs(): Promise<{ readonly dirs: readonly LedgerDir[] }> {
	return { dirs: await readDirs() };
}
