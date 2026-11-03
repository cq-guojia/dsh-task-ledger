/**
 * 取消（归档）任务的弹窗：正文点名任务，中间一个理由输入框（可留空），
 * 理由随 `close --cancel --summary` 落进历史行摘要与执行记录（`cancelled: <理由>`）。
 *
 * 弹窗 / 输入框都用核心件（Modal + Input），不另画遮罩。提交中锁住所有关闭路径（遮罩 / Esc / ✕），
 * 免得请求还在跑就被关掉、错误无处显示；失败时弹窗不关，改完理由可以直接重试。
 */
import { createElement as h, type ReactNode, useState } from "react";
import type { Translate } from "./locales";
import { Button, Input, Modal } from "./ui";

export function CancelTaskModal(props: {
	t: Translate;
	/** 任务标题（正文里点名，确认取消的是这一条）。 */
	taskTitle: string;
	/** 提交中：确定键转圈、其余按钮与关闭路径全禁。 */
	busy: boolean;
	/** host 回的人话错误：红字列在输入框下。 */
	error: string | null;
	onClose: () => void;
	onSubmit: (reason: string) => void;
}): ReactNode {
	const { t } = props;
	const [reason, setReason] = useState("");
	const submit = (): void => {
		if (!props.busy) props.onSubmit(reason.trim());
	};
	return h(
		Modal,
		{
			size: "sm",
			width: "420px",
			title: t("cancelModalTitle"),
			// busy 时不给关闭回调 ⇒ 核心连 ✕ 都不画，只剩等结果或看错误
			onClose: props.busy ? undefined : props.onClose,
			closeOnMask: !props.busy,
			escClose: !props.busy,
			footer: h(
				"div",
				{
					style: {
						display: "flex",
						justifyContent: "flex-end",
						gap: "var(--dtl-space-2)",
						width: "100%",
					},
				},
				h(
					Button,
					{
						variant: "secondary",
						size: "md",
						disabled: props.busy,
						onClick: props.onClose,
					},
					t("settingsCancel"),
				),
				h(
					Button,
					{
						variant: "primary",
						size: "md",
						loading: props.busy,
						// 无 icon ⇒ loading 时清掉文案、只留居中的圈（核心自己锁宽，中英文都不跳）
						loadingText: false,
						onClick: submit,
					},
					t("cancelModalOk"),
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
				t("cancelModalBody", { title: props.taskTitle }),
			),
			h(Input, {
				value: reason,
				onChange: setReason,
				placeholder: t("cancelModalPlaceholder"),
				size: "md",
				"aria-label": t("cancelModalPlaceholder"),
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
