import { runLedgerScript } from "./runner.js";
const UNKNOWN_IDENTITY = { uuid: null, name: null };
function viewOf(data) {
    const uuid = typeof data.uuid === "string" ? data.uuid.trim() : "";
    const name = typeof data.name === "string" ? data.name.trim() : "";
    return {
        uuid: uuid === "" ? null : uuid.toLowerCase(),
        name: name === "" ? null : name,
    };
}
export async function readIdentity() {
    const result = await runLedgerScript("whoami", ["--json"]);
    if (!result.ok)
        return UNKNOWN_IDENTITY;
    return viewOf(result.data);
}
/** 只要 uuid（看板行级的「是不是我的」以 skill 的 `mine` 为准，这里只备查）。 */
export async function getCurrentIdentity(_workspace) {
    return (await readIdentity()).uuid;
}
/**
 * 换身份。调的是隐藏命令 `switch`（不进 SKILL.md）：它允许覆盖已有身份、不受真终端限制，
 * 正是 `init` 做不到的两件事。失败把人话抛给路由（→ 500 → 界面原地显示）。
 */
export async function switchIdentity(input) {
    const args = ["--json"];
    if (input.action === "new") {
        args.push("--new", "--name", input.name);
    }
    else {
        args.push("--claim", input.uuid, "--repo", input.repo);
    }
    const result = await runLedgerScript("switch", args);
    if (!result.ok)
        throw new Error(result.error);
    return viewOf(result.data);
}
