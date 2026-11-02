/**
 * 机器级台账目录清单（`~/.taskledger/ledgers.json`，真源在 skill 侧）。
 *
 * **写只走 skill**（`dirs --add`），插件只读 —— 将来的其它看板（网页 / APP）也照此办理，
 * 免得两套写法把同一个文件写坏（2026-11-01 用户拍板）。
 */
export interface LedgerDir {
    readonly path: string;
    readonly name: string;
    readonly hidden: boolean;
}
/**
 * 读清单。skill 侧会顺手清掉失效条目（目录没了 / 已经不是台账）再返回。
 * 损坏的清单按空处理，不让「看台账」这件事失败。
 */
export declare function readDirs(): Promise<LedgerDir[]>;
/** 看板上显示 / 不显示这一个台账（只动清单，目录与台账文件一个都不碰）。 */
export declare function setDirHidden(path: string, hidden: boolean): Promise<LedgerDir[]>;
/** 改台账名；空名 = 回落目录名（skill 口径）。 */
export declare function renameDir(path: string, name: string): Promise<LedgerDir[]>;
/** 从清单移除（不是删目录：台账数据与文件全部原样保留）。 */
export declare function removeDir(path: string): Promise<LedgerDir[]>;
/**
 * 登记一个目录（幂等）。不是台账根时 skill 返回 `added:false` + 原因，不算错误。
 * 返回登记后的整份清单，调用方不必再读一次。
 */
export declare function addDir(path: string, name: string): Promise<{
    readonly dirs: LedgerDir[];
    readonly added: boolean;
    readonly reason: string;
}>;
