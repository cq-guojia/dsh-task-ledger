import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { failureOf, runLedgerScript } from "./runner.js";
function parseDirs(data) {
    const rows = Array.isArray(data.dirs) ? data.dirs : [];
    const out = [];
    for (const row of rows) {
        if (typeof row?.path !== "string" || row.path === "")
            continue;
        out.push({
            path: row.path,
            name: typeof row.name === "string" ? row.name : "",
            hidden: row.hidden === true,
        });
    }
    return out;
}
/**
 * 读清单。skill 侧会顺手清掉失效条目（目录没了 / 已经不是台账）再返回。
 * 损坏的清单按空处理，不让「看台账」这件事失败。
 */
export async function readDirs() {
    // --all：必须拿到隐藏项，否则「这些路径已登记过」判不出来，每轮都会把它们当新目录反复补登记
    const result = await runLedgerScript("dirs", ["--all", "--json"]);
    if (!result.ok)
        throw failureOf(result, "读台账目录清单失败：");
    return parseDirs(result.data);
}
/**
 * 写动作的公共出口：skill 的写命令**恒回全量清单**（含隐藏项，`actions/dirs.go:201`），
 * 调用方拿它就地换掉表格，不必再读一次。
 */
async function writeDirs(args) {
    const result = await runLedgerScript("dirs", [...args, "--json"]);
    if (!result.ok)
        throw failureOf(result, "改台账目录清单失败：");
    return parseDirs(result.data);
}
/** 看板上显示 / 不显示这一个台账（只动清单，目录与台账文件一个都不碰）。 */
export function setDirHidden(path, hidden) {
    return writeDirs(["--dir", path, hidden ? "--hide" : "--unhide"]);
}
/** 改台账名；空名 = 回落目录名（skill 口径）。 */
export function renameDir(path, name) {
    return writeDirs(["--dir", path, "--rename", name]);
}
/** 从清单移除（不是删目录：台账数据与文件全部原样保留）。 */
export function removeDir(path) {
    return writeDirs(["--dir", path, "--remove"]);
}
/**
 * 登记一个目录（幂等）。不是台账根时 skill 返回 `added:false` + 原因，不算错误。
 * 返回登记后的整份清单，调用方不必再读一次。
 */
export async function addDir(path, name) {
    const args = ["--dir", path, "--add", "--json"];
    if (name !== "")
        args.push("--name", name);
    const result = await runLedgerScript("dirs", args);
    if (!result.ok)
        throw failureOf(result, "登记台账目录失败：");
    return {
        dirs: parseDirs(result.data),
        added: result.data.added === true,
        reason: typeof result.data.reason === "string" ? result.data.reason : "",
    };
}
/** 目录下**直接**含 `ledger/` ⇒ 台账根（与 skill `root` 同一判据：`core/roots.go:35`）。 */
async function hasLedger(dir) {
    try {
        return (await stat(join(dir, "ledger"))).isDirectory();
    }
    catch {
        return false;
    }
}
/**
 * 一级子目录里的台账根。用户 2026-11-03：只知道「这个项目有台账」的人会选它的**直属父目录**，
 * 这种选择也算有效 —— 父目录本身不进清单（清单只存台账根），登记它下面这些。
 * 目录读不了 / 没有台账 ⇒ 空数组，由调用方出提示。
 */
export async function ledgerChildrenOf(path) {
    let names;
    try {
        names = await readdir(path);
    }
    catch {
        return [];
    }
    const found = [];
    for (const name of names.sort()) {
        const child = join(path, name);
        if (await hasLedger(child))
            found.push(child);
    }
    return found;
}
