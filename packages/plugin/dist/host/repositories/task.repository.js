import { failureOf, runLedgerCommand, } from "./runner.js";
/**
 * 任务写动作（认领 / 释放 / 取消归档）—— 一律走 skill，插件不碰台账文件。
 *
 * 写命令只回人话（`shell/render.go` 的 RenderResult），**不认 --json** ⇒ 走 `runLedgerCommand`
 * 而不是 `runLedgerScript`。每条写命令内部都是「取最新 → 改 → 提交 → 推送」，
 * 默认 10s 会被判超时（脚本被 kill 时可能改到一半）⇒ 与 rename / forget 同档给足时间。
 */
const WRITE_TIMEOUT_MS = 120_000;
const ACTION_NAME = {
    claim: "认领",
    release: "释放",
    cancel: "取消",
    close: "结案",
};
/**
 * 跑一条任务写命令。
 *
 * @param summary - 「取消」与「结案」都用：一句话理由 / 结案摘要，写进历史行与执行记录。
 *   留空就不传 `--summary`（skill 允许取消不带摘要；正常结案由界面强制填）。
 * @param onStep - 过程步骤回调（逐条转发给界面做进度翻牌），不传就不让 skill 打标记。
 */
export async function runTaskAction(repo, id, action, summary = "", onStep) {
    const opts = {
        timeoutMs: WRITE_TIMEOUT_MS,
        ...(onStep === undefined
            ? {}
            : {
                // skill 侧 key 是字符串，这里收窄成阶段联合类型（多一个 key 也不该让整条命令失败）
                onStep: (step) => onStep(step),
            }),
    };
    let result;
    switch (action) {
        case "claim":
            result = await runLedgerCommand("claim", ["--id", id, "--repo", repo], opts);
            break;
        case "release":
            result = await runLedgerCommand("set", ["--id", id, "--release", "--repo", repo], opts);
            break;
        case "close":
            result = await runLedgerCommand("close", [
                "--id",
                id,
                ...(summary === "" ? [] : ["--summary", summary]),
                "--repo",
                repo,
            ], opts);
            break;
        case "cancel":
            result = await runLedgerCommand("close", [
                "--id",
                id,
                "--cancel",
                ...(summary === "" ? [] : ["--summary", summary]),
                "--repo",
                repo,
            ], opts);
            break;
    }
    if (!result.ok)
        throw failureOf(result, `${ACTION_NAME[action]}失败：`);
}
