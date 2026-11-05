import { runLedgerScript } from "./runner.js";
/**
 * 改昵称的超时：要逐本台账走「取最新 → 改 → 提交 → 推送」，
 * 一本就可能几秒，十个目录轻松过一分钟 —— 绝不能吃默认的 10s。
 */
const RENAME_TIMEOUT_MS = 180_000;
/** 删人同样逐本台账走 git（取最新 → 改 → 提交 → 推送），10s 默认值不够。 */
const FORGET_TIMEOUT_MS = 120_000;
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
export async function forgetOwner(repo, uuid, onStep) {
    // 删人也走一遍「写前取最新 → 改 → 提交 → 推送」，一次网络往返就可能几秒，
    // 默认的 10s 会把它判超时（脚本被 kill 时连分片都还没删）。
    //
    // **--keep-identity**：界面删自己会逐本台账各跑一次，谁先跑完谁把 identity.json 删了，
    // 后面几本就会报「这台机器还没有初始化身份」（用户 2026-11-02 实测）。清身份留到最后一步。
    const result = await runLedgerScript("forget", ["--id", uuid, "--keep-identity", "--repo", repo, "--json"], {
        timeoutMs: FORGET_TIMEOUT_MS,
        ...(onStep === undefined ? {} : { onStep }),
    });
    if (!result.ok)
        throw new Error(result.error);
    return {
        removed: result.data.removed === true,
        name: typeof result.data.name === "string" ? result.data.name : "",
        tasks: typeof result.data.tasks === "number" ? result.data.tasks : 0,
    };
}
/**
 * 清掉本机身份（skill `logout`）：台账一个字节都不动。
 * 只删 ~/.taskledger/identity.json —— 路径归 skill 管，插件不复制这份知识。
 */
export async function logout(repo) {
    const result = await runLedgerScript("logout", ["--json", "--repo", repo], { timeoutMs: 30_000 });
    if (!result.ok)
        throw new Error(result.error);
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
