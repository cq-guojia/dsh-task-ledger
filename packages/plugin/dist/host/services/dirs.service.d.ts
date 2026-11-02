/**
 * 台账目录清单（机器级；真源在 skill `dirs` + `~/.taskledger/ledgers.json`）。
 *
 * 写一律走 skill 命令，插件不碰那个文件 —— 既有规矩，见 dirs.repository.ts 头注。
 */
import { type LedgerDir } from "../repositories/dirs.repository.js";
/** 设置页「台账目录」块要的清单：**含隐藏项**（关了显示还得能开回来）。 */
export declare function listDirs(): Promise<{
    readonly dirs: readonly LedgerDir[];
}>;
/** 一次目录写动作（显示 / 改名 / 移除），返回改完之后的完整清单。 */
export type DirWriteInput = {
    readonly action: "hide" | "unhide" | "remove";
    readonly path: string;
} | {
    readonly action: "rename";
    readonly path: string;
    readonly name: string;
};
export declare function writeDirs(input: DirWriteInput): Promise<{
    readonly dirs: readonly LedgerDir[];
}>;
