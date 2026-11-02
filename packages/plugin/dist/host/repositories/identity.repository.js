import { runLedgerScript } from "./runner.js";
/**
 * 改昵称的超时：要逐本台账走「取最新 → 改 → 提交 → 推送」，
 * 一本就可能几秒，十个目录轻松过一分钟 —— 绝不能吃默认的 10s。
 */
const RENAME_TIMEOUT_MS = 180_000;
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
    if (input.action === "rename") {
        args.push("--rename", input.name);
    }
    else if (input.action === "new") {
        args.push("--new", "--name", input.name);
    }
    else {
        args.push("--claim", input.uuid, "--repo", input.repo);
    }
    const result = await runLedgerScript("switch", args, {
        timeoutMs: input.action === "rename" ? RENAME_TIMEOUT_MS : undefined,
    });
    if (!result.ok)
        throw new Error(result.error);
    if (input.action === "rename") {
        const identity = viewOf(result.data);
        if (identity.uuid === null || identity.name === null)
            throw new Error("改昵称的回执里没有身份（脚本输出异常）");
        return {
            uuid: identity.uuid,
            name: identity.name,
            previous: typeof result.data.previous === "string" ? result.data.previous : "",
            dirs: dirsOf(result.data.dirs),
        };
    }
    return viewOf(result.data);
}
/** `dirs[]` 原样搬过来（形状不对的行直接丢掉，不编造）。 */
function dirsOf(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const row of raw) {
        if (row === null || typeof row !== "object")
            continue;
        const item = row;
        if (typeof item.dir !== "string")
            continue;
        const status = item.status;
        if (status !== "changed" &&
            status !== "commit-only" &&
            status !== "skipped" &&
            status !== "failed")
            continue;
        out.push({
            dir: item.dir,
            status,
            reason: typeof item.reason === "string" ? item.reason : "",
        });
    }
    return out;
}
