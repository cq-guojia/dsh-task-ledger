/**
 * 官方 UI primitives 的本地最小类型声明（本仓惯例：官方包不在依赖里、不做跨版本引类型，
 * 只复述我们要消费的那一面）。
 *
 * 事实来源：`@deepseek-ai/dsh-client-ui-primitives@0.2.0-rc.2` 解包产物 `lib/types/*.d.ts`
 * （2026-10-17 逐条核实：Button.d.ts / StateDot.d.ts / SegmentedControl.d.ts /
 * markdown/MarkdownText.d.ts / markdown/render.d.ts / icons/index.d.ts）。
 * 该包是 dsh 浏览器内核的**平台模块**（见 tsdown.client.config.ts 的 PLATFORM_MODULES），
 * 运行时由内核模块表 require() 解析 ⇒ **无需**写进 package.json 的 dsh.client.inject。
 */
declare module "@deepseek-ai/dsh-client-ui-primitives" {
	import type { ComponentType, ReactNode } from "react";

	/** 官方按钮（variant 各由 --dsw-alias-button-* token 族驱动，明暗自适应）。 */
	export const Button: import("react").ForwardRefExoticComponent<
		{
			variant?: "primary" | "ghost" | "outline" | "toolbar";
			size?: "md" | "sm";
			icon?: ReactNode;
			className?: string;
			children?: ReactNode;
		} & import("react").ButtonHTMLAttributes<HTMLButtonElement> &
			import("react").RefAttributes<HTMLButtonElement>
	>;

	/** 官方悬停提示（气泡挂 body、悬停即出、支持 \n 多行；children 为单个被包裹元素）。 */
	export function Tooltip(props: {
		label: string;
		side?: "right" | "bottom" | "top";
		align?: "center" | "end";
		delayMs?: number;
		focusDelayMs?: number;
		gap?: number;
		disabled?: boolean;
		portal?: boolean;
		maxWidth?: number;
		openOnClick?: boolean;
		children: import("react").ReactElement;
	}): ReactNode;

	/** 官方状态点（done 绿 / warning 琥珀 / ongoing 灰蓝 / error 红 / idle 中性灰）。 */
	export function StateDot(props: {
		state: "done" | "warning" | "ongoing" | "error" | "idle";
		size?: number;
		className?: string;
		appearance?: "dot" | "step";
	}): ReactNode;

	/** 官方分段控件（滑块指示器；至少两项）。 */
	export interface SegmentedControlOption<Value extends string> {
		value: Value;
		label: string;
		disabled?: boolean;
		title?: string;
	}
	export function SegmentedControl<Value extends string>(props: {
		id: string;
		value: Value;
		options: readonly SegmentedControlOption<Value>[];
		onChange: (next: Value) => void;
		label: string;
		disabled?: boolean;
		className?: string;
	}): ReactNode;

	/** 官方开关（受控，渲染成 `button[role=switch]`，不带可见文字 ⇒ `label` 是必填的无障碍名）。
	 *  `lib/types/Switch.d.ts` 亲验（2026-11-02）：核心 dsh-plugin-core 没有这一档。 */
	export function Switch(props: {
		checked: boolean;
		onChange: (next: boolean) => void;
		label: string;
		disabled?: boolean;
		title?: string;
		className?: string;
	}): ReactNode;

	/** markdown 代码块的本地化文案。 */
	export interface MarkdownCodeLabels {
		copyLabel: string;
		copiedLabel: string;
	}
	/** markdown 文档的本地化外壳文案。 */
	export interface MarkdownLabels {
		code: MarkdownCodeLabels;
		footnotes: string;
	}
	/** 官方 markdown 渲染器（labels 需引用稳定 ⇒ 调用方 useMemo）。 */
	export const MarkdownText: ComponentType<{
		text: string;
		labels: MarkdownLabels;
		streaming?: boolean;
		variant?: "body" | "compact";
	}>;

	/** 图标：色随 currentColor。（2026-10-17 rc.2 icons/index.d.ts 亲验新增三个） */
	export const IconRefreshOutlineRegular: ComponentType<{
		size?: number;
		className?: string;
	}>;
	export const IconSearchOutlineRegular: ComponentType<{
		size?: number;
		className?: string;
	}>;
	/** 复制（宿主 lib/types/icons/index.d.ts 核实存在，2026-10-28）。 */
	export const IconCopyOutlineRegular: ComponentType<{
		size?: number;
		className?: string;
	}>;
	/** 左右 chevron（翻页箭头）：rc.2 `lib/types/icons/index.d.ts:50/53` 亲验存在，
	 *  运行时符 `lib/index.js` 里也有同名导出，色随 currentColor（2026-10-29）。 */
	export const IconChevronLeftOutlineRegular: ComponentType<{
		size?: number;
		className?: string;
	}>;
	export const IconChevronRightOutlineRegular: ComponentType<{
		size?: number;
		className?: string;
	}>;
	export const IconChevronDownOutlineRegular: ComponentType<{
		size?: number;
		className?: string;
	}>;
	export const IconPlayOutlineRegular: ComponentType<{
		size?: number;
		className?: string;
	}>;
	export const IconCheckOutlineRegular: ComponentType<{
		size?: number;
		className?: string;
	}>;
	/** 带圈的勾（结案弹窗标题用）：`icons/index.d.ts:342` 与 `lib/index.js` 同名导出亲验（2026-11-03）。 */
	export const IconCheckCircleOutlineRegular: ComponentType<{
		size?: number;
		className?: string;
	}>;
	export const IconUsersOutlineRegular: ComponentType<{
		size?: number;
		className?: string;
	}>;
	export const IconChecklistOutlineRegular: ComponentType<{
		size?: number;
		className?: string;
	}>;
	export const IconCloseOutlineRegular: ComponentType<{
		size?: number;
		className?: string;
	}>;
	/** 垃圾桶（删除）：`lib/types/icons/index.d.ts:142` 声明、`lib/index.js:1176` 定义 / `:12381` 导出亲验（2026-11-04）。 */
	export const IconTrashOutlineRegular: ComponentType<{
		size?: number;
		className?: string;
	}>;
	export const IconFlatListOutlineRegular: ComponentType<{
		size?: number;
		className?: string;
	}>;
	/** 文件夹开 / 合（工作区官方图标，同一套 Artwork 的一对）：
	 *  `lib/index.js:1801` IconFolderOpenRegular、`lib/index.js:1811` IconFolderCloseRegular（2026-10-18 亲验）。 */
	export const IconFolderOpenRegular: ComponentType<{
		size?: number;
		className?: string;
	}>;
	export const IconFolderCloseRegular: ComponentType<{
		size?: number;
		className?: string;
	}>;
	/** 「认领」图标（库里最接近「接进来」的：箭头入盘）——2026-10-18 解包 lib/index.js 亲验存在。 */
	export const IconDownloadOutlineRegular: ComponentType<{
		size?: number;
		className?: string;
	}>;
	/** 设置（齿轮）：`icons/index.d.ts` 与 `lib/index.js` 都有同名导出（2026-11-01 亲验）。 */
	export const IconSettingsOutlineRegular: ComponentType<{
		size?: number;
		className?: string;
	}>;
	/** 链条（外链按钮）：`primitives@0.2.0-rc.1` `icons/index.d.ts:130` 亲验（2026-11-05）。 */
	export const IconLinkOutlineRegular: ComponentType<{
		size?: number;
		className?: string;
	}>;

	/** 「更多」菜单里的一行（`Menu.d.ts` MenuItemButtonProps，2026-11-05 亲验 rc.1）。 */
	export function MenuItemButton(props: {
		children: ReactNode;
		shortcut?: unknown;
		icon?: ReactNode;
		disabled?: boolean;
		danger?: boolean;
		separatorBefore?: boolean;
		onSelect: () => void;
	}): ReactNode;

	// ── 官方设置表单（`settings-form/*.d.ts`，2026-11-05 逐条对照 rc.1） ──
	/** 表单外壳文案（由本插件词典给）。 */
	export interface SettingsFormLabels {
		unavailable: string;
		readOnly: string;
		saveFailed: string;
		save: string;
		saving: string;
	}
	/** 卡片级状态：是否可用 / 可写 / 有草稿 / 保存中 / 上次保存失败。 */
	export interface SettingsFormShell {
		available: boolean;
		writable: boolean;
		dirty: boolean;
		invalid: boolean;
		saving: boolean;
		failed: boolean;
	}
	/** 单个字段的控件态。 */
	export interface SettingsFieldState {
		/** 控件渲染的草稿文本。 */
		text: string;
		/** 保存后是否会在用户层留下这一项（= 覆盖默认值）。 */
		overridden: boolean;
		/** 草稿不是本字段接受的值（阻止保存）。 */
		invalid: boolean;
	}
	/** 一个字段在存储值与草稿文本之间的换算规则。 */
	export interface SettingsFieldSpec {
		field: string;
		format: (value: unknown) => string;
		parse: (text: string) => unknown;
	}
	/** 某个命名空间的设置文档（宿主托管）：读快照 + 原子写。 */
	export interface SettingsFormScope<T> {
		getSnapshot(): {
			status: "loading" | "ready" | "unavailable";
			value: T | undefined;
			base: unknown;
			user: unknown;
			writable: boolean;
			revision: number | undefined;
		};
		subscribe(listener: () => void): () => void;
		mutate(ops: readonly unknown[], expectedRevision?: number): Promise<boolean>;
	}
	/** 自由文本字段：空草稿 = 清掉该项（重新继承默认值）。 */
	export function settingsTextField(field: string): SettingsFieldSpec;
	/** 草稿状态机：dirty / overridden / invalid / saving / failed，save 时一次原子提交。 */
	export class SettingsFormModel<T> {
		constructor(scope: SettingsFormScope<T>, specs: SettingsFieldSpec[]);
		bind<S>(project: () => S): {
			getSnapshot(): S;
			subscribe(listener: () => void): () => void;
		};
		shell(): SettingsFormShell;
		field(field: string): SettingsFieldState;
		actions(): {
			edit: (field: string, text: string) => void;
			resetField: (field: string) => void;
			save: () => void;
			discard: () => void;
		};
		save(): Promise<void>;
		dispose(): void;
	}
	/** 表单框架：只读提示 / 保存按钮 / 不可用分支。 */
	export function SettingsForm(props: {
		labels: SettingsFormLabels;
		state: SettingsFormShell;
		onSave: () => void;
		onDiscard: () => void;
		children: ReactNode;
	}): ReactNode;
}
