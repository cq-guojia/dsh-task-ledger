/**
 * 会话规则注入：写死的中英默认文案、插件自有设置读写、host 半 pre-step 注入。
 *
 * 设置只落本机私有文件，不经宿主官方配置区；注入逻辑照同栈已实机跑通的 pre-step 实现，
 * 不自加判据（用户 2026-11-10 定：不要过度设计）。
 *
 * 语言（用户 2026-11-10 定）：注入在 host 半，拿不到宿主渲染器的 t 席位，所以由 client
 * 在写请求里带当前界面语言、落盘为 lang；默认文案按 lang 挑，用户自定义文案只有一份、
 * 不分语言。保存时按本次请求语言比对该语言默认值，相等就不落用户值、继续用默认。
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type RulesLang = "zh" | "en";

/** 恢复默认的唯一参照：中英各一份写死常量；用户保存的值另存，写入不覆盖它们。 */
export const DEFAULT_RULES_TEXT_ZH = [
	"任务台账工具[task-ledger skill]使用规则：",
	"",
	"- **凡任务进度、工作事项与工作日志**：（新建 / 推进 / 查询 / 结案）一律调用 task-ledger skill 管理；进度 / 历史任务类问题一律走它作答，不凭对话记忆或自建清单顶替。",
	"- **开工锚点**：仅当用户明确说要新建（如「开个新坑」「先记一下」「建个任务」）才登记；提问 / 查询 / 讨论 / 顺手小改不算，拿不准先问，未经明确指令不得擅自新建任务。",
	"- **怎么建、按什么顺序**：命令的授权与确认口径，一律以 task-ledger skill 的说明为准。",
	"- **顺手问一句**：用户在推进一件跨轮的事（这轮答完、手上还有下一步动作没做完）、却从没提过记账时，答完问一次「你现在这个任务是需要帮你建一个台账吗？（如果无需，忽略这句话，也不用去回复。）」；本会话问过一次就别再问，用户不接就当他不需要。",
].join("\n");

/** 英文与中文条目对齐，格式同为 `- **关键词**：…`；最后那句问话也要说英文（英文界面下出现中文原句是 bug）。 */
export const DEFAULT_RULES_TEXT_EN = [
	"Usage rules for the task-ledger tool [task-ledger skill]:",
	"",
	"- **Task progress, work items and work logs**: (create / advance / query / close) go through the task-ledger skill; answer questions about progress and task history from it, never from conversation memory or a hand-rolled list.",
	'- **Creation anchor**: register a task only when the user explicitly asks for a new one ("open a task", "log this first", "create a task"); questions, queries, discussion and small incidental edits do not count — ask when unsure, and never create a task without an explicit instruction.',
	"- **How to create and in what order**: the authorization and confirmation rules all follow the task-ledger skill's own instructions.",
	'- **Ask in passing**: when the user is pushing forward work that spans turns (this turn ends with actions still on your plate) and has never mentioned tracking it, ask once after answering: "Want me to open a ledger for this task? (Ignore this if not needed — no reply necessary.)"; once asked in a session, do not ask again; no reply means ignore it.',
].join("\n");

const DEFAULTS: Readonly<Record<RulesLang, string>> = {
	zh: DEFAULT_RULES_TEXT_ZH,
	en: DEFAULT_RULES_TEXT_EN,
};

/** 注入块标记：去重与压缩判定靠它，照同栈实现。 */
const MANAGED_HEADER = "<!-- dsh-task-ledger:managed -->";

export interface RulesInjectionView {
	readonly enabled: boolean;
	/** 落盘的语言：注入按它挑默认文案。 */
	readonly lang: RulesLang;
	/** 当前生效文案（用户值或该语言默认值）。 */
	readonly text: string;
	readonly defaultText: string;
	/** 是否保存过用户自定义文案（设置页的小标识用它，不跟着草稿变）。 */
	readonly customized: boolean;
}

interface StoredSettings {
	enabled: boolean;
	lang: RulesLang;
	/** null = 用写死的默认文案。 */
	text: string | null;
}

export interface WriteSettingsInput {
	readonly enabled?: boolean;
	readonly lang?: RulesLang;
	readonly text?: string;
	readonly reset?: boolean;
}

function isRulesLang(value: unknown): value is RulesLang {
	return value === "zh" || value === "en";
}

/** 比对归一化：只用来判断「用户有没有改」，不改落盘值。 */
function normalizeForCompare(value: string): string {
	return value.replace(/\r\n/g, "\n").trim();
}

function settingsFile(): string {
	const home = process.env.TASK_LEDGER_HOME ?? join(homedir(), ".taskledger");
	return join(home, "rules-injection.json");
}

/** 文件不存在或坏掉都按默认处理，不覆盖磁盘。 */
function readStored(): StoredSettings {
	const fallback: StoredSettings = { enabled: true, lang: "zh", text: null };
	try {
		const raw = JSON.parse(readFileSync(settingsFile(), "utf8")) as unknown;
		if (raw === null || typeof raw !== "object") return fallback;
		const saved = raw as Record<string, unknown>;
		return {
			enabled: typeof saved.enabled === "boolean" ? saved.enabled : true,
			lang: isRulesLang(saved.lang) ? saved.lang : "zh",
			text: typeof saved.text === "string" ? saved.text : null,
		};
	} catch {
		return fallback;
	}
}

function toView(stored: StoredSettings): RulesInjectionView {
	return {
		enabled: stored.enabled,
		lang: stored.lang,
		text: stored.text ?? DEFAULTS[stored.lang],
		defaultText: DEFAULTS[stored.lang],
		customized: stored.text !== null,
	};
}

/** GET 与注入都走这里：按文件里落盘的 lang 返回。 */
export function readSettings(): RulesInjectionView {
	return toView(readStored());
}

/** 原子替换写盘；恢复默认或「内容与默认一致」都只清用户值，不动写死的常量。 */
export function writeSettings(input: WriteSettingsInput): RulesInjectionView {
	const current = readStored();
	const lang = isRulesLang(input.lang) ? input.lang : current.lang;
	let text: string | null;
	if (input.reset === true) text = null;
	else if (typeof input.text === "string")
		text =
			normalizeForCompare(input.text) === normalizeForCompare(DEFAULTS[lang])
				? null
				: input.text;
	else text = current.text;
	const stored: StoredSettings = {
		enabled: typeof input.enabled === "boolean" ? input.enabled : current.enabled,
		lang,
		text,
	};
	const file = settingsFile();
	mkdirSync(dirname(file), { recursive: true });
	const tmp = `${file}.${process.pid}.tmp`;
	writeFileSync(tmp, JSON.stringify(stored, null, 2), "utf8");
	renameSync(tmp, file);
	return toView(stored);
}

interface SessionLike {
	readonly id?: string;
	readonly header?: { readonly origin?: string };
	readonly snapshotEvents?: () => readonly unknown[];
	readonly events?: readonly unknown[];
}

interface PreStepPayload {
	readonly agent?: { readonly session?: SessionLike };
	readonly signal?: { readonly aborted?: boolean };
}

type Decision = Record<string, unknown>;
type Listener = (...args: never[]) => unknown;

export interface InjectionContext {
	on(event: string, listener: Listener): unknown;
}

interface SessionState {
	injected: boolean;
	observed: boolean;
}

function hasUserTurn(messages: readonly unknown[]): boolean {
	return messages.some((message) => {
		if (message === null || typeof message !== "object") return false;
		const record = message as Record<string, unknown>;
		const source = record.source;
		const isUser =
			source === "user" ||
			(source !== null &&
				typeof source === "object" &&
				(source as Record<string, unknown>).kind === "user");
		if (!isUser) return false;
		const content = record.content;
		if (typeof content === "string") return content.trim().length > 0;
		if (Array.isArray(content))
			return content.some((part) => {
				if (part === null || typeof part !== "object") return false;
				const text = (part as Record<string, unknown>).text;
				return typeof text === "string" && text.trim().length > 0;
			});
		return false;
	});
}

/** 照同栈实现：只扫最近 30 条事件，按标记判存在；读不到日志一律 unknown（视为仍在）。 */
function stillInContext(session: SessionLike | undefined): true | false | "unknown" {
	const snap = session?.snapshotEvents;
	const read =
		typeof snap === "function"
			? (): readonly unknown[] => snap.call(session) ?? []
			: Array.isArray(session?.events)
				? (): readonly unknown[] => session?.events ?? []
				: undefined;
	if (read === undefined) return "unknown";
	try {
		const events = read();
		for (let i = events.length - 1; i >= Math.max(0, events.length - 30); i--) {
			if (JSON.stringify(events[i]).includes(MANAGED_HEADER)) return true;
		}
		return false;
	} catch {
		return "unknown";
	}
}

/** 注册 pre-step 监听；开关关时不注入，注入链路出错只记日志、不中断会话。 */
export function installRulesInjection(ctx: InjectionContext): void {
	const states = new Map<string, SessionState>();

	const onPreStep = async (
		payload: PreStepPayload,
		next: () => Promise<Decision>,
	): Promise<Decision> => {
		const decision = await next();
		try {
			const settings = readSettings();
			if (!settings.enabled) return decision;
			if (payload?.signal?.aborted === true) return decision;
			if (decision.kind !== undefined && decision.kind !== "enter") return decision;

			const messages = Array.isArray(decision.messages) ? decision.messages : [];
			if (!hasUserTurn(messages)) return decision;

			const session = payload?.agent?.session;
			if (session?.header?.origin === "subagent") return decision;
			const id = session?.id ?? "default";
			const state = states.get(id) ?? { injected: false, observed: false };
			const present = stillInContext(session);
			if (state.injected) {
				if (present === "unknown") return decision;
				if (present === true) {
					state.observed = true;
					states.set(id, state);
					return decision;
				}
				if (!state.observed) return decision;
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
		} catch (error) {
			console.warn("[task-ledger] 会话规则注入失败，本轮跳过", error);
			return decision;
		}
	};

	ctx.on("agent/pre-step", onPreStep as unknown as Listener);
	ctx.on("agent/disposed", ((payload: { session?: { id?: string } }) => {
		const id = payload?.session?.id;
		if (typeof id === "string") states.delete(id);
	}) as unknown as Listener);
}
