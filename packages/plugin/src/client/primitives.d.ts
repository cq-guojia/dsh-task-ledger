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
}
