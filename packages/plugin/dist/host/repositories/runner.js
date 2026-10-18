import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
/**
 * 内嵌 skill 脚本的默认路径：dist/host/repositories/runner.js → 包根 skill/scripts/progress.py
 * （比原 host/script.js 深一层 ⇒ 相对路径多一级 `../`）。
 * 构建时 scripts/copy-skill.mjs 把 packages/skill 拷到 packages/plugin/skill/。
 */
const DEFAULT_SCRIPT_PATH = fileURLToPath(new URL('../../../skill/scripts/progress.py', import.meta.url));
/** 单次脚本调用超时上限（ms）。实测单仓 5 万行全量 1.2s，10s 是宽松上限。 */
const DEFAULT_TIMEOUT_MS = 10_000;
/**
 * 全插件唯一碰 Python 的地方：spawn python3 跑内嵌 skill 脚本，收 stdout JSON。
 * 不解析任何台账格式——解析真源只有 skill 脚本一份（2026-10-17 用户拍板）。
 *
 * 出错一律归一为 { ok:false, error }（人话，直接可上界面）：
 * 起不了 python3 / 超时（kill）/ 非零退出（stderr 原文）/ 输出不是 JSON。
 *
 * @param sub - 子命令（list / history / show…）
 * @param args - 参数数组，由调用方自拼（含 --repo / --json / --months 等）
 * @param opts.scriptPath - 测试用：覆盖脚本路径
 * @param opts.timeoutMs - 覆盖超时
 */
export function runLedgerScript(sub, args, opts) {
    const scriptPath = opts?.scriptPath ?? DEFAULT_SCRIPT_PATH;
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    return new Promise((resolve) => {
        const child = spawn('python3', [scriptPath, sub, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const timer = setTimeout(() => {
            child.kill();
            settle({ ok: false, error: `skill 脚本超时（>${timeoutMs}ms）：${sub} ${args.join(' ')}` });
        }, timeoutMs);
        const settle = (result) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve(result);
        };
        child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        child.on('error', (error) => {
            settle({ ok: false, error: `起不了 python3（${error.message}）——本插件需要 python3 运行内嵌 skill 脚本` });
        });
        child.on('close', (code) => {
            if (code !== 0) {
                settle({ ok: false, error: stderr.trim() || `skill 脚本退出码 ${String(code)}` });
                return;
            }
            try {
                settle({ ok: true, data: JSON.parse(stdout) });
            }
            catch {
                settle({ ok: false, error: `skill 脚本输出不是 JSON：${stdout.slice(0, 200)}` });
            }
        });
    });
}
