/**
 * 会话规则注入：写死的默认文案、插件自有设置读写、host 半 pre-step 注入。
 *
 * 设置只落本机私有文件，不经宿主官方配置区；注入逻辑照同栈已实机跑通的 pre-step 实现，
 * 不自加判据（用户 2026-11-10 定：不要过度设计）。
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
/** 恢复默认的唯一参照：用户保存的值另存，写入不覆盖它。 */
export const DEFAULT_RULES_TEXT = "凡任务进度、工作事项与工作日志（新建 / 推进 / 查询 / 结案）一律调用 task-ledger skill 管理；进度 / 历史类问题一律走它作答，不凭对话记忆或自建清单顶替。用户明确说要新建（如「开个新坑」「建个任务」）才登记；提问 / 查询 / 讨论 / 顺手小改不算。";
/** 注入块标记：去重与压缩判定靠它，照同栈实现。 */
const MANAGED_HEADER = "<!-- dsh-task-ledger:managed -->";
function settingsFile() {
    const home = process.env.TASK_LEDGER_HOME ?? join(homedir(), ".taskledger");
    return join(home, "rules-injection.json");
}
/** 文件不存在或坏掉都按默认处理，不覆盖磁盘。 */
export function readSettings() {
    let enabled = false;
    let text = null;
    try {
        const raw = JSON.parse(readFileSync(settingsFile(), "utf8"));
        if (raw !== null && typeof raw === "object") {
            const saved = raw;
            if (typeof saved.enabled === "boolean")
                enabled = saved.enabled;
            if (typeof saved.text === "string")
                text = saved.text;
        }
    }
    catch {
        return { enabled: false, text: DEFAULT_RULES_TEXT, defaultText: DEFAULT_RULES_TEXT };
    }
    return {
        enabled,
        text: text ?? DEFAULT_RULES_TEXT,
        defaultText: DEFAULT_RULES_TEXT,
    };
}
/** 原子替换写盘；恢复默认只清用户值，不动写死的常量。 */
export function writeSettings(input) {
    const current = readSettings();
    const stored = {
        enabled: typeof input.enabled === "boolean" ? input.enabled : current.enabled,
        text: input.reset === true
            ? null
            : typeof input.text === "string"
                ? input.text
                : current.text === current.defaultText
                    ? null
                    : current.text,
    };
    const file = settingsFile();
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(stored, null, 2), "utf8");
    renameSync(tmp, file);
    return {
        enabled: stored.enabled,
        text: stored.text ?? DEFAULT_RULES_TEXT,
        defaultText: DEFAULT_RULES_TEXT,
    };
}
function hasUserTurn(messages) {
    return messages.some((message) => {
        if (message === null || typeof message !== "object")
            return false;
        const record = message;
        const source = record.source;
        const isUser = source === "user" ||
            (source !== null &&
                typeof source === "object" &&
                source.kind === "user");
        if (!isUser)
            return false;
        const content = record.content;
        if (typeof content === "string")
            return content.trim().length > 0;
        if (Array.isArray(content))
            return content.some((part) => {
                if (part === null || typeof part !== "object")
                    return false;
                const text = part.text;
                return typeof text === "string" && text.trim().length > 0;
            });
        return false;
    });
}
/** 照同栈实现：只扫最近 30 条事件，按标记判存在；读不到日志一律 unknown（视为仍在）。 */
function stillInContext(session) {
    const snap = session?.snapshotEvents;
    const read = typeof snap === "function"
        ? () => snap.call(session) ?? []
        : Array.isArray(session?.events)
            ? () => session?.events ?? []
            : undefined;
    if (read === undefined)
        return "unknown";
    try {
        const events = read();
        for (let i = events.length - 1; i >= Math.max(0, events.length - 30); i--) {
            if (JSON.stringify(events[i]).includes(MANAGED_HEADER))
                return true;
        }
        return false;
    }
    catch {
        return "unknown";
    }
}
/** 注册 pre-step 监听；开关关时不注入，注入链路出错只记日志、不中断会话。 */
export function installRulesInjection(ctx) {
    const states = new Map();
    const onPreStep = async (payload, next) => {
        const decision = await next();
        try {
            const settings = readSettings();
            if (!settings.enabled)
                return decision;
            if (payload?.signal?.aborted === true)
                return decision;
            if (decision.kind !== undefined && decision.kind !== "enter")
                return decision;
            const messages = Array.isArray(decision.messages) ? decision.messages : [];
            if (!hasUserTurn(messages))
                return decision;
            const session = payload?.agent?.session;
            if (session?.header?.origin === "subagent")
                return decision;
            const id = session?.id ?? "default";
            const state = states.get(id) ?? { injected: false, observed: false };
            const present = stillInContext(session);
            if (state.injected) {
                if (present === "unknown")
                    return decision;
                if (present === true) {
                    state.observed = true;
                    states.set(id, state);
                    return decision;
                }
                if (!state.observed)
                    return decision;
                state.injected = false;
            }
            const message = {
                id: randomUUID(),
                role: "user",
                content: [{ type: "text", text: `${MANAGED_HEADER}\n${settings.text}` }],
                source: { kind: "plugin:dsh-task-ledger", form: "recall" },
            };
            state.injected = true;
            states.set(id, state);
            return { ...decision, messages: [...messages, message] };
        }
        catch (error) {
            console.warn("[task-ledger] 会话规则注入失败，本轮跳过", error);
            return decision;
        }
    };
    ctx.on("agent/pre-step", onPreStep);
    ctx.on("agent/disposed", ((payload) => {
        const id = payload?.session?.id;
        if (typeof id === "string")
            states.delete(id);
    }));
}
