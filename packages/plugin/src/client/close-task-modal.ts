/**
 * 结案任务的弹窗（用户 2026-11-03 定口径，二次修订 2026-11-03 晚）：
 *
 *  · 模式用核心 `Segmented`（**不用勾选框**，用户明确否掉小勾）：`直接结案` / `交给 Agent 结案`；
 *  · 默认 `交给 Agent` —— 它读完进度、写结论与遗留项、补齐漏记，然后结案；
 *  · Agent 模式下输入框是**给 Agent 的留言**（可空）；直接模式下是**结案摘要**（必填）；
 *  · 正文分两行：先是任务名（醒目），换行才是说明 —— 挤成一段没人读。
 *  · 宿主没会话服务时 Agent 段置灰并说明，只剩直接结案。
 *  · 框里**不放任何提示行**（用户 2026-11-04：警示一律走 Toast，别在弹窗里堆 UI）；
 *    工作区不对、复制成功与否都由弹窗外面的 Toast 说。
 *
 * 提交中锁住所有关闭路径（同 cancel-task-modal），失败时弹窗不关、错误红字留在框下可重试。
 */
import { IconCheckCircleOutlineRegular } from "@deepseek-ai/dsh-client-ui-primitives";
import { createElement as h, type ReactNode, useState } from "react";
import type { Translate } from "./locales";
import { Button, Modal, Segmented, Textarea } from "./ui";

type CloseMode = "manual" | "agent";

export function CloseTaskModal(props: {
	t: Translate;
	/** 任务标题（正文第一行点名，确认结的是这一条）。 */
	taskTitle: string;
	/** 提交中：确定键转圈、其余按钮与关闭路径全禁。 */
	busy: boolean;
	/** host 回的人话错误：红字列在输入框下。 */
	error: string | null;
	/** 宿主是否提供会话服务（false ⇒ 「交给 Agent」段置灰，只能直接结案）。 */
	canUseAgent: boolean;
	onClose: () => void;
	onSubmit: (input: { useAgent: boolean; note: string }) => void;
}): ReactNode {
	const { t } = props;
	const [mode, setMode] = useState<CloseMode>(props.canUseAgent ? "agent" : "manual");
	const [note, setNote] = useState("");
	const useAgent = mode === "agent";
	const submitBlocked = !useAgent && note.trim() === "";

	const hint = !props.canUseAgent
		? t("closeModalHintManualOnly")
		: useAgent
			? t("closeModalHintAgent")
			: t("closeModalHintManual");
	const submit = (): void => {
		if (props.busy || submitBlocked) return;
		props.onSubmit({ useAgent, note: note.trim() });
	};
	return h(
		Modal,
		{
			size: "sm",
			width: "460px",
			// 标题带图标：结案是破坏性动作，标题得压得住场（用户 2026-11-03）
			title: h(
				"div",
				{
					style: {
						display: "flex",
						alignItems: "center",
						gap: "var(--dtl-space-2)",
					},
				},
				h(IconCheckCircleOutlineRegular, { size: 16 }),
				t("closeModalTitle"),
			),
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
						loadingText: false,
						disabled: submitBlocked,
						onClick: submit,
					},
					useAgent ? t("closeModalOkAgent") : t("closeModalOkManual"),
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
			// 第一行：任务名；第二行才是说明（不挤成一段）
			h(
				"div",
				{
					style: {
						display: "flex",
						flexDirection: "column",
						gap: "var(--dtl-space-1)",
					},
				},
				h(
					"div",
					{
						style: {
							fontSize: "var(--dtl-font-md)",
							lineHeight: "var(--dtl-line-md)",
							color: "var(--dtl-fg)",
							fontWeight: 600,
						},
					},
					props.taskTitle,
				),
				h(
					"div",
					{
						style: {
							fontSize: "var(--dtl-font-sm)",
							lineHeight: "var(--dtl-line-md)",
							color: "var(--dtl-fg-2)",
						},
					},
					hint,
				),
			),
			h(Segmented<CloseMode>, {
				items: [
					{ value: "manual", label: t("closeModeManual") },
					{
						value: "agent",
						label: t("closeModeAgent"),
						disabled: !props.canUseAgent,
					},
				],
				value: useAgent ? "agent" : "manual",
				onChange: setMode,
				size: "md",
				bordered: true,
				tone: "business",
				label: t("closeModalMode"),
				// 不撑满一行：该多宽多宽，靠左（用户 2026-11-04 从靠右改过来）
				style: { alignSelf: "flex-start" },
			}),
			h(Textarea, {
				value: note,
				onChange: setNote,
				rows: 3,
				placeholder: useAgent
					? t("closeModalNotePlaceholder")
					: t("closeModalSummaryPlaceholder"),
				"aria-label": useAgent
					? t("closeModalNotePlaceholder")
					: t("closeModalSummaryPlaceholder"),
				disabled: props.busy,
				error: props.error !== null,
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
