import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { IdentityMissingError } from "../errors.js";

/**
 * 内嵌 skill 入口的默认路径：dist/host/repositories/runner.js → 包根 skill/scripts/progress
 * （比原 host/script.js 深一层 ⇒ 相对路径多一级 `../`）。
 *
 * 这是个薄 shell 包装，按平台 exec `skill/scripts/bin/ledger-<os>-<arch>`（自带运行时的
 * 静态二进制）——所以本插件不需要系统装任何运行时。
 * 构建时 scripts/copy-skill.mjs 把 packages/skill 的运行时拷到 packages/plugin/skill/。
 */
const DEFAULT_SCRIPT_PATH = fileURLToPath(
	new URL("../../../skill/scripts/progress", import.meta.url),
);

/** 单次脚本调用超时上限（ms）。实测单仓 5 万行全量 1.2s，10s 是宽松上限。 */
const DEFAULT_TIMEOUT_MS = 10_000;

/** 脚本绝对路径（界面上要写给用户复制的命令用；别在别处再拼一份）。 */
export function scriptPath(): string {
	return DEFAULT_SCRIPT_PATH;
}

/**
 * 脚本失败的统一出口：**没身份单独成类**（→ `LEDGER_IDENTITY_MISSING`），其余照旧是普通 Error。
 * 各处别自己 `new Error(result.error)` —— 那样「没身份」就淹进「台账坏了」里，界面分不出来。
 */
export function failureOf(
	result: { readonly error: string; readonly identityMissing?: boolean },
	prefix = "",
	workspaceId: string | null = null,
): Error {
	const message = `${prefix}${result.error}`;
	return result.identityMissing === true
		? new IdentityMissingError(message, workspaceId)
		: new Error(message);
}

export type LedgerScriptResult<T> =
	| { ok: true; data: T }
	| {
			ok: false;
			error: string;
			/** 脚本退出码 4 = 这台机器还没有身份（`env.Current` 的专用码，文案不变）。 */
			identityMissing?: boolean;
	  };

/** skill 侧 `ExitIdentityMissing`（`packages/skill/src/internal/shell/runner.go`）。 */
const IDENTITY_MISSING_EXIT = 100;

export interface RunOptions {
	/** 测试用：覆盖脚本路径。 */
	scriptPath?: string;
	/** 覆盖超时。 */
	timeoutMs?: number;
}

type ExecResult =
	| { ok: true; stdout: string; stderr: string }
	| { ok: false; error: string; exitCode?: number };

/**
 * 起一次台账程序、收 stdout / stderr。出错一律归一成人话（起不了程序 / 超时 / 非零退出）。
 * 解析留给调用方：读命令要 JSON，写命令要原文。
 */
function exec(
	sub: string,
	args: readonly string[],
	opts?: RunOptions,
): Promise<ExecResult> {
	const scriptPath = opts?.scriptPath ?? DEFAULT_SCRIPT_PATH;
	const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	return new Promise((resolve) => {
		const child = spawn(scriptPath, [sub, ...args], {
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		let settled = false;
		const timer = setTimeout(() => {
			child.kill();
			settle({
				ok: false,
				error: `skill 脚本超时（>${timeoutMs}ms）：${sub} ${args.join(" ")}`,
			});
		}, timeoutMs);
		const settle = (result: ExecResult): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(result);
		};
		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		child.on("error", (error: Error) => {
			settle({
				ok: false,
				error: `起不了台账程序（${error.message}）——内嵌 skill 的二进制可能缺失或不可执行`,
			});
		});
		child.on("close", (code: number | null) => {
			if (code !== 0) {
				settle({
					ok: false,
					error: stderr.trim() || `台账程序退出码 ${String(code)}`,
					exitCode: code ?? undefined,
				});
				return;
			}
			settle({ ok: true, stdout, stderr: stderr.trim() });
		});
	});
}

/**
 * 读命令：跑内嵌台账程序，收 stdout JSON。
 * 不解析任何台账格式——解析真源只有 skill 脚本一份（2026-10-17 用户拍板）。
 *
 * @param sub - 子命令（list / history / show…）
 * @param args - 参数数组，由调用方自拼（含 --repo / --json / --months 等）
 * @param opts.scriptPath - 测试用：覆盖脚本路径
 * @param opts.timeoutMs - 覆盖超时
 */
export async function runLedgerScript<T = unknown>(
	sub: string,
	args: readonly string[],
	opts?: RunOptions,
): Promise<LedgerScriptResult<T>> {
	return parseScriptResult<T>(await exec(sub, args, opts));
}

/** 写命令结果：写动作只回人话（`shell/render.go` 的 RenderResult），**不认 --json** ⇒ 不解析 stdout。 */
export type LedgerCommandResult =
	| { readonly ok: true; readonly output: string }
	| { readonly ok: false; readonly error: string; readonly identityMissing?: boolean };

/** 写命令：认领 / 释放 / 结案这类改台账的动作走它（读命令走 `runLedgerScript`）。 */
export async function runLedgerCommand(
	sub: string,
	args: readonly string[],
	opts?: RunOptions,
): Promise<LedgerCommandResult> {
	const result = await exec(sub, args, opts);
	if (!result.ok)
		return {
			ok: false,
			error: result.error,
			identityMissing: result.exitCode === IDENTITY_MISSING_EXIT,
		};
	return { ok: true, output: result.stdout.trim() };
}

function parseScriptResult<T>(result: ExecResult): LedgerScriptResult<T> {
	if (!result.ok)
		return {
			ok: false,
			error: result.error,
			identityMissing: result.exitCode === IDENTITY_MISSING_EXIT,
		};
	try {
		return { ok: true, data: JSON.parse(result.stdout) as T };
	} catch {
		return {
			ok: false,
			error: `skill 脚本输出不是 JSON：${result.stdout.slice(0, 200)}`,
		};
	}
}
