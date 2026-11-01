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
    const result = await runLedgerScript("dirs", ["--json"]);
    if (!result.ok)
        throw failureOf(result, "读台账目录清单失败：");
    return parseDirs(result.data);
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
