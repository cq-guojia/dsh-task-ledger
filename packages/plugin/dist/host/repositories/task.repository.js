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
    delete: "删除",
};
/**
 * 跑一条任务写命令。
 *
 * @param summary - 取消 / 结案的摘要、删除的留言；留空就不传 `--summary`。
 * @param onStep - 过程步骤回调（逐条转发给界面做进度翻牌），不传就不让 skill 打标记。
 * @param history - 给就是删历史行（`delete --src/--line [--expect]`），不给就是删在办任务（`delete --id`）。
 *   `fingerprint` 是该行指纹：skill 写前核对，行已变（行号漂移 / 别处改过）就整条拒绝。
 */
export async function runTaskAction(repo, id, action, summary = "", onStep, history) {
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
        case "delete":
            // 留言可选；删除时刻由 skill 外壳统一算，插件不补录。
            result = await runLedgerCommand("delete", [
                ...(history === undefined
                    ? ["--id", id]
                    : [
                        "--src",
                        history.src,
                        "--line",
                        String(history.line),
                        ...((history.fingerprint ?? "") === ""
                            ? []
                            : ["--expect", history.fingerprint ?? ""]),
                    ]),
                ...(summary === "" ? [] : ["--summary", summary]),
                "--repo",
                repo,
            ], opts);
            break;
    }
    if (!result.ok)
        throw failureOf(result, `${ACTION_NAME[action]}失败：`);
}
