import { failureOf, runLedgerCommand, type LedgerCommandResult } from "./runner.js";

/**
 * 任务写动作（认领 / 释放 / 取消归档）—— 一律走 skill，插件不碰台账文件。
 *
 * 写命令只回人话（`shell/render.go` 的 RenderResult），**不认 --json** ⇒ 走 `runLedgerCommand`
 * 而不是 `runLedgerScript`。每条写命令内部都是「取最新 → 改 → 提交 → 推送」，
 * 默认 10s 会被判超时（脚本被 kill 时可能改到一半）⇒ 与 rename / forget 同档给足时间。
 */
const WRITE_TIMEOUT_MS = 120_000;

/** 界面行内按钮对应的动作：认领 / 释放 / 取消归档 / 正常结案。 */
export type TaskAction = "claim" | "release" | "cancel" | "close";

const ACTION_NAME: Record<TaskAction, string> = {
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
 */
export async function runTaskAction(
	repo: string,
	id: string,
	action: TaskAction,
	summary = "",
): Promise<void> {
	const opts = { timeoutMs: WRITE_TIMEOUT_MS };
	let result: LedgerCommandResult;
	switch (action) {
		case "claim":
			result = await runLedgerCommand("claim", ["--id", id, "--repo", repo], opts);
			break;
		case "release":
			result = await runLedgerCommand(
				"set",
				["--id", id, "--release", "--repo", repo],
				opts,
			);
			break;
		case "close":
			result = await runLedgerCommand(
				"close",
				[
					"--id",
					id,
					...(summary === "" ? [] : ["--summary", summary]),
					"--repo",
					repo,
				],
				opts,
			);
			break;
		case "cancel":
			result = await runLedgerCommand(
				"close",
				[
					"--id",
					id,
					"--cancel",
					...(summary === "" ? [] : ["--summary", summary]),
					"--repo",
					repo,
				],
				opts,
			);
			break;
	}
	if (!result.ok) throw failureOf(result, `${ACTION_NAME[action]}失败：`);
}
