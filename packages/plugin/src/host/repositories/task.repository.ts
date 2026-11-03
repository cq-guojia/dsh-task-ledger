import { failureOf, runLedgerCommand } from "./runner.js";

/**
 * 任务写动作（认领 / 释放）—— 一律走 skill，插件不碰台账文件。
 *
 * 写命令只回人话（`shell/render.go` 的 RenderResult），**不认 --json** ⇒ 走 `runLedgerCommand`
 * 而不是 `runLedgerScript`。每条写命令内部都是「取最新 → 改 → 提交 → 推送」，
 * 默认 10s 会被判超时（脚本被 kill 时可能改到一半）⇒ 与 rename / forget 同档给足时间。
 */
const WRITE_TIMEOUT_MS = 120_000;

/** 目前接的两个动作：认领（`claim`）/ 释放（`set --release`）。 */
export type TaskAction = "claim" | "release";

/** 认领 / 释放一条任务；失败把人话抛给上层（路由 → 500 → 界面原地显示）。 */
export async function runTaskAction(
	repo: string,
	id: string,
	action: TaskAction,
): Promise<void> {
	const result =
		action === "claim"
			? await runLedgerCommand("claim", ["--id", id, "--repo", repo], {
					timeoutMs: WRITE_TIMEOUT_MS,
				})
			: await runLedgerCommand("set", ["--id", id, "--release", "--repo", repo], {
					timeoutMs: WRITE_TIMEOUT_MS,
				});
	if (!result.ok) throw failureOf(result, action === "claim" ? "认领失败：" : "释放失败：");
}
