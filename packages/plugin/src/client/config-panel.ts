/**
 * 插件详情页的配置区（官方 `plugins.bundle.config` 槽位，key = 包名）。
 *
 * 版式照兄弟仓 `dsh-session-title-pattern` 的配置表单（用户 2026-11-05：「去抄」）：
 *
 *  · **两个设置项一行左右各半**：左「显示名称」、右「入口位置」。
 *  · **保存与两个链接同一排，保存最前**。
 *  · 「是否改过」的提示：改过的字段出「自定义」标签 +「恢复默认」，没改过两者都不出现。
 *
 * 控件一律走核心控件库（用户 2026-11-05：「不要自己手搓…用核心空间里面的」）：
 * `Input` / `Picker`（下拉单选）/ `Chip`（标签）/ `Button`。本文件只排 label、hint 与两列
 * 的容器（`.dtl-config__*` 一组类，颜色只吃 `--dtl-*`），不写控件皮肤。
 *
 * 两个字段 = host 侧 `Config` 的两个 volatile 字段（`src/index.ts`）：`entryMode` /
 * `displayName`。显示名为空串时用词典默认名（`panelTitle`）；**填成与默认名相同则不落盘**
 * ——保存前把它折成「清空」，用户层不留这一项。
 */
import {
	createElement as h,
	useEffect,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { IconLinkOutlineRegular } from "@deepseek-ai/dsh-client-ui-primitives";
import { Button, Chip, Input, Picker } from "dsh-plugin-core/ui";
import type { Translate } from "./locales";
import { ensureUiBase } from "./ui";

/** 本仓库地址（设置区的第一个链接）。 */
const PROJECT_URL = "https://github.com/cq-guojia/dsh-task-ledger";
/** 友情链接：蓝鲸组件库（UI 基础控件包）。 */
const COMPONENTS_URL = "https://github.com/cq-guojia/dsh-plugin-core";

/** 字段名：与 host 侧 `Config` 的键逐字一致。 */
export const ENTRY_MODE_FIELD = "entryMode";
export const DISPLAY_NAME_FIELD = "displayName";

/** 入口位置两档：`first` = 左侧第一级（默认）/ `more` = 「更多」菜单。 */
type EntryMode = "first" | "more";

/** 配置区投影：卡片级状态 + 两个字段的控件态。 */
export interface PanelState {
	available: boolean;
	writable: boolean;
	dirty: boolean;
	invalid: boolean;
	saving: boolean;
	failed: boolean;
	entryMode: { text: string; overridden: boolean; invalid: boolean };
	displayName: { text: string; overridden: boolean; invalid: boolean };
}

/** 组件读过的最小订阅面（官方 `SnapshotStore`）。 */
interface PanelStore {
	getSnapshot(): PanelState;
	subscribe(listener: () => void): () => void;
}

export interface ConfigPanelProps {
	/** 详情页要求的视图：配置区只渲染 `page`。 */
	view: "summary" | "page";
	store: PanelStore;
	t: Translate;
	/** 当前语言的默认显示名；草稿与它相同即视为「没设」。 */
	defaultName: string;
	save: () => void;
	edit: (field: string, text: string) => void;
	resetField: (field: string) => void;
	discard: () => void;
}

/** 一个字段：标签行（标签 + 改过徽标 + 恢复默认）→ 控件 → 说明。 */
function configField(props: {
	id: string;
	label: string;
	hint: string;
	overridden: boolean;
	resetLabel: string;
	overriddenLabel: string;
	disabled: boolean;
	onReset: () => void;
	control: ReactNode;
}): ReactNode {
	return h(
		"div",
		{ className: "dtl-config__field" },
		h(
			"div",
			{ className: "dtl-config__head" },
			h("span", { className: "dtl-config__label", id: props.id }, props.label),
			props.overridden
				? h(Chip, { tone: "neutral", size: "xs" }, props.overriddenLabel)
				: null,
			props.overridden
				? h(
						Button,
						{
							variant: "link",
							size: "sm",
							disabled: props.disabled,
							onClick: props.onReset,
						},
						props.resetLabel,
					)
				: null,
		),
		props.control,
		h("p", { className: "dtl-config__hint" }, props.hint),
	);
}

/** 一个小外链按钮（图标 + 文案，核心 Button）。 */
const linkButton = (label: string, url: string): ReactNode =>
	h(
		Button,
		{
			size: "lg",
			variant: "outline",
			icon: h(IconLinkOutlineRegular, { size: 16 }),
			onClick: () => {
				window.open(url, "_blank", "noopener");
			},
		},
		label,
	);

export function ConfigPanel(props: ConfigPanelProps): ReactNode {
	// 详情页不经过看板，样式表要自己唤一次（幂等，已挂载就原地比对）。
	ensureUiBase();
	const { t, store } = props;
	const [, bump] = useState(0);
	// 订阅设置文档：宿主接受写入后（或外部改动）重渲。hooks 必须在 return 之前调。
	useEffect(() => store.subscribe(() => bump((n) => n + 1)), [store]);
	// 官方表单的规矩是「离开页面丢弃草稿」，自己接。
	const discard = useRef(props.discard);
	discard.current = props.discard;
	useEffect(() => () => discard.current(), []);

	if (props.view !== "page") return null;

	const state = store.getSnapshot();
	if (!state.available)
		return h(
			"p",
			{ className: "dtl-config__note", role: "status" },
			t("configUnavailable"),
		);

	const mode: EntryMode = state.entryMode.text === "more" ? "more" : "first";

	const handleSave = (): void => {
		// 两个字段同一个口径：**跟默认值一样就不算「自定义」**，保存前折成「清空」，
		// 用户层不留这一项（只在这一项真被覆盖过时折，免得 stage 一个空 clear 永远存不完）。
		if (state.entryMode.overridden && mode === "first")
			props.resetField(ENTRY_MODE_FIELD);
		if (
			state.displayName.overridden &&
			state.displayName.text.trim() === props.defaultName
		)
			props.resetField(DISPLAY_NAME_FIELD);
		props.save();
	};

	return h(
		"div",
		null,
		h(
			"div",
			{ className: "dtl-config__pair" },
			configField({
				id: "dtl-config-name",
				label: t("configNameLabel"),
				hint: t("configNameHint"),
				overridden: state.displayName.overridden,
				resetLabel: t("configReset"),
				overriddenLabel: t("configOverridden"),
				disabled: !state.writable,
				onReset: () => props.resetField(DISPLAY_NAME_FIELD),
				control: h(Input, {
					value: state.displayName.text,
					onChange: (text) => props.edit(DISPLAY_NAME_FIELD, text),
					placeholder: props.defaultName,
					size: "lg",
					error: state.displayName.invalid,
					disabled: !state.writable,
					"aria-label": t("configNameLabel"),
				}),
			}),
			configField({
				id: "dtl-config-entry",
				label: t("configEntryLabel"),
				hint: t("configEntryHint"),
				overridden: state.entryMode.overridden,
				resetLabel: t("configReset"),
				overriddenLabel: t("configOverridden"),
				disabled: !state.writable,
				onReset: () => props.resetField(ENTRY_MODE_FIELD),
				control: h(Picker, {
					value: mode,
					options: [
						{ value: "first", label: t("configEntryFirst") },
						{ value: "more", label: t("configEntryMore") },
					],
					mode: "single",
					size: "lg",
					width: "100%",
					disabled: !state.writable,
					ariaLabel: t("configEntryLabel"),
					onChange: (next) => {
						// 选中的就是当前值 ⇒ 不算改动，别把表单弄脏（否则保存后凭空多出「自定义」）。
						const picked = String(next);
						if (picked !== mode) props.edit(ENTRY_MODE_FIELD, picked);
					},
				}),
			}),
		),
		// ── 一排：保存最前，其后两个链接 ──
		h(
			"div",
			{ className: "dtl-config__row" },
			h(
				Button,
				{
					variant: "primary",
					size: "lg",
					disabled: !state.dirty || state.invalid || state.saving,
					onClick: handleSave,
				},
				state.saving ? t("configSaving") : t("configSave"),
			),
			linkButton(t("configGithub"), PROJECT_URL),
			linkButton(t("configComponents"), COMPONENTS_URL),
			state.failed
				? h(
						"p",
						{ className: "dtl-config__failed", role: "status" },
						t("configSaveFailed"),
					)
				: null,
			!state.writable
				? h(
						"p",
						{ className: "dtl-config__note", role: "status" },
						t("configReadOnly"),
					)
				: null,
		),
	);
}
