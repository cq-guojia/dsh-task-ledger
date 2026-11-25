/**
 * 无留言的确认弹窗（释放这种「点一下就提交」的动作）：
 * 与结束任务 / 取消 / 删除共用同一套锁定形态 —— 后台作业在跑时，底部只留一颗「后台执行」，
 * 点了就把框收起、作业照跑；终态由调用方的作业态 effect 解封并收窗。
 *
 * 核心 ConfirmModal 不支持自定义 footer / onBackground（locked 时只豁免内置按钮），
 * 所以这里用核心 Modal 自绘，footer 与 ReasonTaskModal 的 locked 分支逐字同构。
 */
import { createElement as h, type ReactNode } from "react";
import type { Translate } from "./locales";
import { Button, Modal, OverlayLockExempt } from "./ui";

export interface ConfirmActionModalProps {
	t: Translate;
	title: string;
	message: string;
	confirmText: string;
	/** 提交中：确定键转圈、其余按钮与关闭路径全禁。 */
	busy: boolean;
	/** 后台作业在跑：底部换成唯一的「后台执行」。 */
	locked?: boolean;
	/** locked 期间唯一可点的「后台执行」，点了只收起弹窗、作业照跑。 */
	onBackground?: () => void;
	/** 底栏左侧的过程提示，读 TaskRecord.progress。 */
	notice?: string;
	onClose: () => void;
	onSubmit: () => void;
}

export function ConfirmActionModal(props: ConfirmActionModalProps): ReactNode {
	const { t } = props;
	const locked = props.locked === true;
	return h(
		Modal,
		{
			size: "sm",
			width: "420px",
			title: props.title,
			onClose: props.busy || locked ? undefined : props.onClose,
			closeOnMask: !props.busy && !locked,
			escClose: !props.busy && !locked,
			notice: props.notice,
			footer: h(
				"div",
				{
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "flex-end",
						gap: "8px",
					},
				},
				locked
					? props.onBackground === undefined
						? null
						: h(
								OverlayLockExempt,
								null,
								h(
									Button,
									{ variant: "primary", size: "lg", onClick: props.onBackground },
									t("bgRun"),
								),
							)
					: h(
							"span",
							{ style: { display: "flex", gap: "8px" } },
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
									loadingText: false,
									onClick: props.onSubmit,
								},
								props.confirmText,
							),
						),
			),
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
			props.message,
		),
	);
}
