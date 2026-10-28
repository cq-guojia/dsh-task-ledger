import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
/**
 * 内嵌 skill 入口的默认路径：dist/host/repositories/runner.js → 包根 skill/scripts/progress
 * （比原 host/script.js 深一层 ⇒ 相对路径多一级 `../`）。
 *
 * 这是个薄 shell 包装，按平台 exec `skill/scripts/bin/ledger-<os>-<arch>`（自带运行时的
 * 静态二进制）——所以本插件不需要系统装任何运行时。
 * 构建时 scripts/copy-skill.mjs 把 packages/skill 的运行时拷到 packages/plugin/skill/。
 */
const DEFAULT_SCRIPT_PATH = fileURLToPath(new URL("../../../skill/scripts/progress", import.meta.url));
/** 单次脚本调用超时上限（ms）。实测单仓 5 万行全量 1.2s，10s 是宽松上限。 */
const DEFAULT_TIMEOUT_MS = 10_000;
/**
 * 起一次台账程序、收 stdout / stderr。出错一律归一成人话（起不了程序 / 超时 / 非零退出）。
 * 解析留给调用方：读命令要 JSON，写命令要原文。
 */
function exec(sub, args, opts) {
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
        const settle = (result) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve(result);
        };
        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });
        child.on("error", (error) => {
            settle({
                ok: false,
                error: `起不了台账程序（${error.message}）——内嵌 skill 的二进制可能缺失或不可执行`,
            });
        });
        child.on("close", (code) => {
            if (code !== 0) {
                settle({
                    ok: false,
                    error: stderr.trim() || `台账程序退出码 ${String(code)}`,
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
export async function runLedgerScript(sub, args, opts) {
    const result = await exec(sub, args, opts);
    if (!result.ok)
        return result;
    try {
        return { ok: true, data: JSON.parse(result.stdout) };
    }
    catch {
        return {
            ok: false,
            error: `skill 脚本输出不是 JSON：${result.stdout.slice(0, 200)}`,
        };
    }
}
