import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { IdentityMissingError } from "../errors.js";

/**
 * 内嵌 skill 的平台入口：dist/host/repositories/runner.js → 包根 skill/scripts（比原
 * host/script.js 深一层 ⇒ 相对路径多一级 `../`）。
 *
 * POSIX：`scripts/progress` 这个薄 shell 包装，按平台 exec `scripts/bin/ledger-<os>-<arch>`
 * （自带运行时的静态二进制）——所以本插件不需要系统装任何运行时。
 *
 * Windows：不能起这个包装。CreateProcessW 不执行无扩展名的 sh 脚本，还会按扩展名补
 * `.exe` 去找 `scripts/progress.exe`，结果就是 spawn ENOENT（issue #1）⇒ 直接起
 * `scripts/bin/` 下的静态二进制。Windows 资产目前只有 amd64 一份，Intel 与 ARM64 都能跑。
 *
 * 构建时 scripts/copy-skill.mjs 把 packages/skill 的运行时拷到 packages/plugin/skill/。
 */
function defaultScriptPath(): string {
	if (process.platform === "win32") {
		return fileURLToPath(
			new URL(
				"../../../skill/scripts/bin/ledger-windows-amd64.exe",
				import.meta.url,
			),
		);
	}
	return fileURLToPath(new URL("../../../skill/scripts/progress", import.meta.url));
}

const DEFAULT_SCRIPT_PATH = defaultScriptPath();

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
	/**
	 * 过程步骤回调（写命令专用）：skill 每进一个阶段就在 stderr 打一行 `#step <key>`
	 * （`shell/render.go` 的 stepf，只有宿主设了 `TASK_LEDGER_STEPS=1` 才打）。
	 * 给了它才让 skill 打标记，读命令不传、不产生任何额外输出。
	 */
	onStep?: (step: string) => void;
}

/** skill 过程标记的行前缀（`shell/render.go` 的 stepf）。 */
const STEP_PREFIX = "#step ";

/** 去掉 stderr 里的过程标记行：报错文案只留人话，别把 `#step` 漏到界面上。 */
function withoutSteps(stderr: string): string {
	return stderr
		.split("\n")
		.filter((line) => !line.startsWith(STEP_PREFIX))
		.join("\n")
		.trim();
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
	const onStep = opts?.onStep;
	return new Promise((resolve) => {
		const child = spawn(scriptPath, [sub, ...args], {
			stdio: ["ignore", "pipe", "pipe"],
			env:
				onStep === undefined
					? process.env
					: { ...process.env, TASK_LEDGER_STEPS: "1" },
		});
		let stdout = "";
		let stderr = "";
		/** 未收完的一行（stderr 是流，标记可能被切在两个 chunk 里）。 */
		let stderrRest = "";
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
			const text = chunk.toString();
			stderr += text;
			if (onStep === undefined) return;
			stderrRest += text;
			const lines = stderrRest.split("\n");
			stderrRest = lines.pop() ?? "";
			for (const line of lines) {
				if (line.startsWith(STEP_PREFIX)) onStep(line.slice(STEP_PREFIX.length));
			}
		});
		child.on("error", (error: Error) => {
			settle({
				ok: false,
				error: `起不了台账程序（${error.message}）——内嵌 skill 的二进制可能缺失或不可执行`,
			});
		});
		child.on("close", (code: number | null) => {
			const message = withoutSteps(stderr);
			if (code !== 0) {
				settle({
					ok: false,
					error: message || `台账程序退出码 ${String(code)}`,
					exitCode: code ?? undefined,
				});
				return;
			}
			settle({ ok: true, stdout, stderr: message });
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
