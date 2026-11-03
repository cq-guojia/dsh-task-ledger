/**
 * 台账目录清单（机器级；真源在 skill `dirs` + `~/.taskledger/ledgers.json`）。
 *
 * 写一律走 skill 命令，插件不碰那个文件 —— 既有规矩，见 dirs.repository.ts 头注。
 */
import { type LedgerDir } from "../repositories/dirs.repository.js";
/** 清单条目 + 「是不是宿主工作区」。工作区目录只能隐藏不能移除（移除会被下次进看板的同步补回来）。 */
export interface DirListView extends LedgerDir {
    readonly inRegistry: boolean;
}
/** 设置页「台账目录」块要的清单：**含隐藏项**（关了显示还得能开回来）。 */
export declare function listDirs(registryPaths: readonly string[]): Promise<{
    readonly dirs: readonly DirListView[];
}>;
/** 一次目录写动作（登记 / 显示 / 改名 / 移除），返回改完之后的完整清单。 */
export type DirWriteInput = {
    readonly action: "hide" | "unhide" | "remove";
    readonly path: string;
} | {
    readonly action: "rename";
    readonly path: string;
    readonly name: string;
} | {
    readonly action: "add";
    readonly path: string;
};
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
export declare function writeDirs(input: DirWriteInput): Promise<DirWriteResult>;
