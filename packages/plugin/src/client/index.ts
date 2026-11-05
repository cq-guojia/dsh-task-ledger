/**
 * 浏览器半入口（client bundle，产物 dist/client.js）：装配层，不写业务逻辑。
 *
 * 四处注册各自挂进「服务就位才触发」的 slots 注入（参考插件真机教训：顶层 inject 声明
 * 组合满足不了的依赖会让 entry 一直 pending、卡死整个 dsh 启动）：
 *  · locale 字典（zh / en）——界面语言跟随宿主，插件不自备开关；
 *  · `main` keyed 槽整页（看板首页）；
 *  · 侧栏入口（`sidebar.panellist` 一级 / `sidebar.panellist.actions`「更多」）——
 *    位置与显示名由插件设置决定（见 `config-panel.ts`）；
 *  · `plugins.bundle.config` keyed 槽（插件详情页的配置区）。
 *
 * 宿主能力一律**本地结构化声明**，不 import 官方包（rc 接口会无声变）；
 * `t` 席位由宿主渲染器按注册项的 `locale:` 声明合成进组件 props。
 */
import { createStyleKit } from "dsh-plugin-core/design";
import { connectFs } from "dsh-plugin-core/explorer";
import { connectHost, setStyleKit } from "dsh-plugin-core/ui";
import { createElement as h } from "react";
import {
	MenuItemButton,
	SettingsFormModel,
	settingsTextField,
} from "@deepseek-ai/dsh-client-ui-primitives";
import type { SettingsFormScope } from "@deepseek-ai/dsh-client-ui-primitives";
import { FS_PATH } from "./api";
import { BoardHome } from "./board-home";
import {
	ConfigPanel,
	DISPLAY_NAME_FIELD,
	ENTRY_MODE_FIELD,
	type PanelState,
} from "./config-panel";
import {
	en,
	fallbackTranslate,
	interpolateTranslate,
	setActiveTranslate,
	type LocaleKey,
	type Translate,
	zh,
} from "./locales";
import { setSessions, setUiConversation, type SessionsLike } from "./close-session";
import type { UiConversationFace } from "dsh-plugin-core/session";
import { setSessionArchiver, setSessionOpener } from "./nav";
import { LedgerIcon } from "./ui";

// 核心控件样式设施：id 插件内唯一（多插件同页互不覆盖）；控件首次渲染时 ensureControls() 挂载。
setStyleKit(createStyleKit({ id: "dsh-task-ledger" }));

/** 命名空间（settings / locale / 面板 id / 详情页配置槽 key 同名，便于对应）。 */
/** 模块级 t 席位（侧栏 label 渲染期求值用；绑不上就回落键名，绝不上界面）。 */
let runtimeT: Translate = (key) => key;

const NS = "dsh-task-ledger";
/** 控制台前缀（与宿主日志区分）。 */
const LOG = "[task-ledger]";
/** `main` 槽的 key（非 `conversation` ⇒ 不绑 Session）。 */
const PANEL_ID = NS;
/** 插件详情页配置区的槽位（keyed，key 必须与包名逐字相同）。 */
const BUNDLE_CONFIG_SLOT = "plugins.bundle.config";

/** 入口位置：`first` = 左侧第一级（默认）/ `more` = 「更多」菜单。 */
let entryMode: "first" | "more" = "first";
/** 自定义显示名；空串 = 用词典默认名（`panelTitle`）。 */
let customName = "";

/** 浏览器插件上下文：只声明本文件实际用到的服务面。 */
interface ClientContext {
	inject(deps: readonly string[], callback: (ctx: ClientContext) => void): void;
	effect(setup: () => void): void;
	locale?: {
		register(
			ns: string,
			dictionaries: Record<string, Record<string, string>>,
		): void;
		/** 绑一份无参 t（侧栏 label 在渲染期求值，拿不到组件 props 的 t 席位）。 */
		bind(ns: string): Translate;
	};
	layout?: {
		selectPanel(panelId: string | null): void;
	};
	/** 会话导航 / 归档（「继续」跳过去、「完成」结案后归档）：自己 retain mainView，插件不得自己 retain。 */
	uiWorkspace?: {
		openSession(sessionId: string): void;
		archiveSession?(sessionId: string, options?: { stopActivity?: boolean }): Promise<void>;
	};
	/** 官方客户端会话面（「完成」由 Agent 结案：create / retain / prompt / subscribe）。 */
	sessions?: SessionsLike;
	/** 官方会话视图数据面（核心 `openSessionView` 要它）；缺席 ⇒ 没有会话视图，只能跳官方会话页。 */
	uiConversation?: UiConversationFace;
	/** 官方设置表单服务（`@deepseek-ai/dsh-client-ui-settings` 提供）：插件设置文档的读写面。 */
	configForms?: {
		get<T>(namespace: string): SettingsFormScope<T>;
		/** 宿主实际登记的命名空间清单（宿主内部 ns 未必逐字等于包名）。 */
		describe?(): {
			getSnapshot(): {
				view?: { namespaces?: readonly { ns: string }[] };
			};
		};
	};
	slots: {
		inject(slot: string, factory: () => () => void): () => void;
		register(options: Record<string, unknown>, component: unknown): () => void;
	};
}

/** 宿主没给 t 席位时的兜底（键名绝不上界面）。 */
const t: Translate = interpolateTranslate(
	(key: LocaleKey, params?: Record<string, string | number>) =>
		fallbackTranslate(key, params),
);

/** 侧栏 / 「更多」菜单里那一行的文案：设了名字用自己的，否则用词典默认名。 */
const entryLabel = (): string =>
	customName === "" ? runtimeT("panelTitle") : customName;

/**
 * 取宿主实际登记的本插件设置命名空间。
 *
 * `cordis.patch.yml` 的 entry id 是 `dsh-task-ledger`，但宿主内部命名空间不保证逐字相同
 * （兄弟项目 demo 的 `resolveServedEntryId` 同款顾虑）；问不到就按包名兜底。
 */
function resolveSettingsNamespace(
	forms: NonNullable<ClientContext["configForms"]>,
): string {
	try {
		const served =
			forms.describe?.().getSnapshot().view?.namespaces?.map((item) => item.ns) ?? [];
		return served.find((ns) => ns === NS) ?? served.find((ns) => ns.includes(NS)) ?? NS;
	} catch {
		return NS;
	}
}

/** 「更多」菜单里的一行：点开跳整页，并收起菜单（收起由宿主给的 onDismiss 负责）。 */
function MoreEntry(props: { onDismiss: () => void }): ReturnType<typeof h> {
	return h(MenuItemButton, {
		icon: h(LedgerIcon, { size: 16 }),
		onSelect: () => {
			props.onDismiss();
			selectPanel(PANEL_ID);
		},
		children: entryLabel(),
	});
}

// ── 侧栏入口：按设置在一级菜单 / 「更多」之间切换 ──
/** slots 服务引用（apply 时赋值）。 */
let slotsRef: ClientContext["slots"] | null = null;
/** 当前入口的注册 disposer；切换位置时先摘旧的再挂新的。 */
let entryDisposer: (() => void) | null = null;
/** 当前 `slots.inject` 的 disposer（反复切换不能让 factory 越积越多）。 */
let entryInjected: (() => void) | null = null;

/**
 * 把入口注册成 `entryMode` 说的样子。
 *
 * 两个 slot 的 owner 到达顺序、以及设置与 slots 两个注入块谁先到都没有保证 ⇒ 每次都用
 * **模块级当前值**重挂一遍：先摘旧 factory 与旧条目，再按现值注册。重复调用是无害的。
 */
function applySidebarEntry(): void {
	const slots = slotsRef;
	if (slots === null) return;
	entryInjected?.();
	entryDisposer?.();
	entryInjected = null;
	entryDisposer = null;
	if (entryMode === "more") {
		entryInjected = slots.inject("sidebar.panellist.actions", () => {
			console.info(`${LOG} 入口已挂到 sidebar.panellist.actions（「更多」菜单）`);
			entryDisposer = slots.register(
				{
					name: "sidebar.panellist.actions",
					id: `${PANEL_ID}-more`,
					order: 30,
					locale: NS,
				},
				(props: { onDismiss: () => void }) =>
					h(MoreEntry, { onDismiss: props.onDismiss }),
			);
			return entryDisposer;
		});
		return;
	}
	entryInjected = slots.inject("sidebar.panellist", () => {
		console.info(`${LOG} 入口已挂到 sidebar.panellist（一级菜单）`);
		entryDisposer = slots.register(
			{
				name: "sidebar.panellist",
				id: PANEL_ID,
				order: 30,
				label: entryLabel,
				locale: NS,
			},
			(props: { size?: number }) => h(LedgerIcon, { size: props.size ?? 18 }),
		);
		return entryDisposer;
	});
}

/** 布局服务：浮标点开整页 / 整页返回会话 / 「更多」那一行跳整页。 */
let selectPanel: (id: string | null) => void = () => {};

export function apply(ctx: ClientContext): void {
	// ⓪ 接线一次：核心接管文件服务 + 会话解析 + dock 补 flex；查看钮只需给容器和路径。
	connectHost(ctx);
	// 文件面（只读 FS 路由，宿主 apply 里 serveFsRoute 挂的）：选目录弹窗与文件预览都吃它。
	connectFs({ path: FS_PATH });

	// ① 字典注册（宿主语言切换 ⇒ 渲染器换 t 引用 ⇒ 整页重渲染）
	ctx.inject(["locale"], (localeCtx) => {
		ctx.effect(() => localeCtx.locale?.register(NS, { zh, en }));
		// 模块级 t 席位：`sidebar.panellist` 的 label 由侧栏在渲染期求值、api 的错误消息在
		// 模块里拼 —— 两处都拿不到组件 props 的 t，统一从这里取。
		try {
			const bound = localeCtx.locale?.bind(NS);
			if (bound !== undefined) {
				runtimeT = bound;
				setActiveTranslate(interpolateTranslate(bound));
			}
		} catch {
			/* 保持键名兜底 */
		}
	});

	// ② 布局服务：浮标点开整页 / 整页返回会话
	ctx.inject(["layout"], (sub) => {
		const layout = sub.layout;
		if (layout !== undefined)
			selectPanel = (id) => {
				layout.selectPanel(id);
			};
	});

	// ③ 会话导航 / 归档（「继续」跳过去、「完成」结案成功后归档）：服务缺席 = 只是不跳不归档
	ctx.inject(["uiWorkspace"], (sub) => {
		const uiWorkspace = sub.uiWorkspace;
		if (uiWorkspace === undefined) return;
		setSessionOpener((sessionId) => {
			uiWorkspace.openSession(sessionId);
		});
		const archive = uiWorkspace.archiveSession;
		if (archive !== undefined)
			setSessionArchiver((sessionId) => archive.call(uiWorkspace, sessionId));
	});

	// ④ 官方会话面（「完成」交给 Agent）：服务缺席 ⇒ 弹窗里勾选框置灰，只剩手动结案
	ctx.inject(["sessions"], (sub) => {
		const sessions = sub.sessions;
		if (sessions !== undefined) setSessions(sessions);
	});

	// ④b 会话视图数据面：只读预览（结案会话在跑时给人看过程）；缺席 ⇒ 退回跳官方会话页
	ctx.inject(["uiConversation"], (sub) => {
		if (sub.uiConversation !== undefined) setUiConversation(sub.uiConversation);
	});

	// ⑤ 槽位注册（只依赖 slots，自成一块：locale / layout 缺席也不该让入口消失）
	ctx.inject(["slots"], (sub) => {
		slotsRef = sub.slots;
		// 左侧入口：一级菜单条目 / 「更多」菜单行，位置由设置决定。
		applySidebarEntry();
		// 整页面板：`main` keyed 槽。**行按钮、点击、激活态全由侧栏 / 布局服务托管**，
		// 组件只画图标；id 必须与 main 槽的 key 一致（同一 MainPanelId）。
		// 事实见 external/client-ui-layout.md §一/§二（0.2.0-rc.2 亲验）。
		sub.slots.inject("main", () =>
			sub.slots.register(
				{ name: "main", key: PANEL_ID, locale: NS },
				(props: { t?: Translate }) =>
					h(BoardHome, {
						t: props.t ?? t,
						onBack: () => {
							selectPanel(null);
						},
					}),
			),
		);
	});

	// ⑥ 插件详情页配置区（`plugins.bundle.config`）：设置文档是宿主托管的（拨动即存），
	// 所以入口位置与显示名要跟着文档变 —— 订阅一次，变了立刻重挂侧栏条目。
	ctx.inject(["slots", "locale", "configForms"], (sub) => {
		const forms = sub.configForms;
		if (forms === undefined) {
			console.warn(`${LOG} configForms 服务未就位，插件详情页配置区不注册`);
			return;
		}
		// 设置命名空间 = 宿主登记的 entry id，未必逐字等于包名 ⇒ 先问宿主登记了哪些。
		const ns = resolveSettingsNamespace(forms);
		if (ns !== NS)
			console.info(`${LOG} 设置命名空间取宿主登记的 ${ns}（包名 ${NS}）`);
		const scope = forms.get<{ entryMode?: string; displayName?: string }>(ns);
		const model = new SettingsFormModel(
			scope,
			[settingsTextField(ENTRY_MODE_FIELD), settingsTextField(DISPLAY_NAME_FIELD)],
		);
		const store = model.bind<PanelState>(() => ({
			...model.shell(),
			entryMode: model.field(ENTRY_MODE_FIELD),
			displayName: model.field(DISPLAY_NAME_FIELD),
		}));
		const actions = model.actions();
		ctx.effect(() => () => model.dispose());

		const sync = (): void => {
			const snapshot = scope.getSnapshot();
			const value = snapshot.value;
			entryMode = value?.entryMode === "more" ? "more" : "first";
			customName = (value?.displayName ?? "").trim();
			if (snapshot.status === "unavailable")
				console.warn(
					`${LOG} 设置命名空间 ${ns} 未被宿主登记（host 侧 Config schema 没生效？），配置区会显示「不可用」`,
				);
			applySidebarEntry();
		};
		sync();
		ctx.effect(() => scope.subscribe(sync));

		ctx.effect(() =>
			sub.slots.inject(BUNDLE_CONFIG_SLOT, () => {
				console.info(`${LOG} 已注册插件详情页配置区到 ${BUNDLE_CONFIG_SLOT}（${NS}）`);
				return sub.slots.register(
					{ name: BUNDLE_CONFIG_SLOT, key: NS, locale: NS },
					(props: { view?: "summary" | "page"; t?: Translate }) => {
						const translate = props.t ?? t;
						return h(ConfigPanel, {
							view: props.view ?? "page",
							store,
							t: translate,
							defaultName: translate("panelTitle"),
							save: () => {
								void model.save();
							},
							edit: actions.edit,
							resetField: actions.resetField,
							discard: actions.discard,
						});
					},
				);
			}),
		);
	});
}
