/**
 * 带一句留言的任务弹窗：取消归档 / 删除共用同一套结构（只换文案键）。
 *
 * 弹窗 / 输入框都用核心件（Modal + Input），不另画遮罩。提交中锁住所有关闭路径（遮罩 / Esc / ✕），
 * 免得请求还在跑就被关掉、错误无处显示；失败时弹窗不关，改完留言可以直接重试。
 *
 * 底栏与核心 `ConfirmModal` 对齐（2026-11-04 修）：按钮 `flex-end` 居右、`outline` + `primary`、
 * 同为 `lg` 档；过程提示交给 `Modal.notice` 的左侧插槽，footer 里不再画 span。
 * 原写法用 `space-between`，notice 缺席时左边没占位 ⇒ 两个按钮被顶到最左；`md` 也比核心小一档。
 */
import { createElement as h, type ReactNode, useState } from "react";
import type { LocaleKey, Translate } from "./locales";
import { Button, Input, Modal } from "./ui";

export type ReasonKind = "cancel" | "delete";

const LABELS: Record<
	ReasonKind,
	{ title: LocaleKey; body: LocaleKey; placeholder: LocaleKey; ok: LocaleKey }
> = {
	cancel: {
		title: "cancelModalTitle",
		body: "cancelModalBody",
		placeholder: "cancelModalPlaceholder",
		ok: "cancelModalOk",
	},
	delete: {
		title: "deleteModalTitle",
		body: "deleteModalBody",
		placeholder: "deleteModalPlaceholder",
		ok: "deleteModalOk",
	},
};

export interface ReasonTaskModalProps {
	t: Translate;
	/** 取消归档 / 删除：只换文案，结构完全一致。 */
	kind: ReasonKind;
	/** 任务标题（正文里点名，确认动的是这一条）。 */
	taskTitle: string;
	/** 提交中：确定键转圈、其余按钮与关闭路径全禁。 */
	busy: boolean;
	/** 底栏左侧的过程提示（提交中才给；不给 = 不占位）。 */
	notice?: string;
	/** host 回的人话错误：红字列在输入框下。 */
	error: string | null;
	onClose: () => void;
	onSubmit: (note: string) => void;
}

export function ReasonTaskModal(props: ReasonTaskModalProps): ReactNode {
	const { t } = props;
	const labels = LABELS[props.kind];
	const [note, setNote] = useState("");
	const submit = (): void => {
		if (!props.busy) props.onSubmit(note.trim());
	};
	return h(
		Modal,
		{
			size: "sm",
			width: "420px",
			title: t(labels.title),
			// busy 时不给关闭回调 ⇒ 核心连 ✕ 都不画，只剩等结果或看错误
			onClose: props.busy ? undefined : props.onClose,
			closeOnMask: !props.busy,
			escClose: !props.busy,
			notice: props.notice,
			footer: h(
				"div",
				{
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "flex-end",
						gap: "8px",
						width: "100%",
					},
				},
				h(
					Button,
					{
						variant: "outline",
						size: "lg",
						disabled: props.busy,
						onClick: props.onClose,
					},
					t("settingsCancel"),
				),
				h(
					Button,
					{
						variant: "primary",
						size: "lg",
						loading: props.busy,
						// 无 icon ⇒ loading 时清掉文案、只留居中的圈（核心自己锁宽，中英文都不跳）
						loadingText: false,
						onClick: submit,
					},
					t(labels.ok),
				),
			),
		},
		h(
			"div",
			{
				style: {
					display: "flex",
					flexDirection: "column",
					gap: "var(--dtl-space-3)",
				},
			},
			h(
				"div",
				{
					style: {
						fontSize: "var(--dtl-font-md)",
						lineHeight: "var(--dtl-line-md)",
						color: "var(--dtl-fg-2)",
					},
				},
				t(labels.body, { title: props.taskTitle }),
			),
			h(Input, {
				value: note,
				onChange: setNote,
				placeholder: t(labels.placeholder),
				size: "md",
				"aria-label": t(labels.placeholder),
				disabled: props.busy,
				error: props.error !== null,
				onKeyDown: (event) => {
					if (event.key === "Enter") submit();
				},
			}),
			props.error === null
				? null
				: h(
						"div",
						{
							style: {
								color: "var(--dtl-danger)",
								fontSize: "var(--dtl-font-sm)",
							},
						},
						props.error,
					),
		),
	);
}

/** 取消归档：薄包装，任务行沿用这个入口。 */
export function CancelTaskModal(
	props: Omit<ReasonTaskModalProps, "kind">,
): ReactNode {
	return h(ReasonTaskModal, { ...props, kind: "cancel" });
}
