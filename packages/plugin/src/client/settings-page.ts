/**
 * 身份与设置页（2026-11-01 用户拍板：进面板先问身份，没身份就把整个面板换成这一页）。
 *
 * 本页第一版只做「能用起来所需的最小集」：
 *  - 没身份：新建一个 / 认领某本台账里已有的人 / 复制终端命令自己跑；
 *  - 有身份：只显示「我是谁」（切换与改名入口按用户要求推迟，暂不做）。
 *
 * 换身份之后由 `onSwitched` 让看板整轮重读（uuid 变了，mine / 统计全变）。
 */
import { createElement as h, type ReactNode, useEffect, useState } from "react";
import type { LocaleKey, Translate } from "./locales";
import { fetchRoster, postSwitchIdentity } from "./api";
import type { IdentityView, RosterPayload } from "./types";
import { Button, Input, Loader } from "./ui";

const pageStyle: Record<string, string | number> = {
	height: "100%",
	width: "100%",
	flex: "1 1 auto",
	minWidth: 0,
	boxSizing: "border-box",
	overflow: "auto",
	padding: "24px 22px 0",
	color: "var(--dtl-fg)",
};
const innerStyle: Record<string, string | number> = {
	width: "100%",
	maxWidth: "720px",
	margin: "0 auto",
	boxSizing: "border-box",
};
const headerStyle: Record<string, string | number> = {
	display: "flex",
	alignItems: "center",
	gap: "var(--dtl-space-3)",
	flexWrap: "wrap",
	marginBottom: "var(--dtl-space-4)",
};
const titleStyle: Record<string, string | number> = {
	fontSize: "var(--dtl-font-xl)",
	fontWeight: 600,
};
const cardStyle: Record<string, string | number> = {
	padding: "var(--dtl-space-4)",
	marginBottom: "var(--dtl-space-4)",
	border: "1px solid var(--dtl-border)",
	borderRadius: "var(--dtl-radius-md)",
	background: "var(--dtl-surface-1)",
};
const cardTitleStyle: Record<string, string | number> = {
	fontSize: "var(--dtl-font-md)",
	fontWeight: 600,
	marginBottom: "var(--dtl-space-2)",
};
const hintStyle: Record<string, string | number> = {
	fontSize: "var(--dtl-font-sm)",
	lineHeight: "var(--dtl-line-sm)",
	color: "var(--dtl-fg-3)",
};
const rowStyle: Record<string, string | number> = {
	display: "flex",
	alignItems: "center",
	gap: "var(--dtl-space-2)",
	marginTop: "var(--dtl-space-3)",
};
const errorStyle: Record<string, string | number> = {
	marginTop: "var(--dtl-space-2)",
	fontSize: "var(--dtl-font-sm)",
	color: "var(--dtl-danger)",
};
const ownerRowStyle: Record<string, string | number> = {
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	gap: "var(--dtl-space-2)",
	padding: "6px 0",
};
const rosterGroupStyle: Record<string, string | number> = {
	marginTop: "var(--dtl-space-3)",
};
const codeStyle: Record<string, string | number> = {
	display: "block",
	marginTop: "var(--dtl-space-2)",
	padding: "var(--dtl-space-2)",
	borderRadius: "var(--dtl-radius-sm)",
	background: "var(--dtl-table-head-bg)",
	fontSize: "var(--dtl-font-sm)",
	lineHeight: "var(--dtl-line-sm)",
	whiteSpace: "pre-wrap",
	wordBreak: "break-all",
	userSelect: "all",
};

/** 在途动作（按目标 key，避免一次只锁一个按钮却点出两个请求）。 */
type Pending = string | null;

export function SettingsPage(props: {
	t: Translate;
	identity: IdentityView;
	onBack: () => void;
	/** 换完身份：让看板整轮重读（uuid 变了，统计与「我的」全变）。 */
	onSwitched: () => void;
}): ReactNode {
	const { t, identity, onBack, onSwitched } = props;
	const [name, setName] = useState("");
	const [roster, setRoster] = useState<RosterPayload | null>(null);
	const [pending, setPending] = useState<Pending>(null);
	const [error, setError] = useState<string | null>(null);
	const known = identity.uuid !== null;

	// 没身份才要候选人；有身份时这一页只显示「我是谁」。
	useEffect(() => {
		if (known) return;
		let alive = true;
		fetchRoster()
			.then((payload) => {
				if (alive) setRoster(payload);
			})
			.catch(() => {
				// 名册读不到 = 这里没人可认领，只能新建 —— 不是错误，不打扰用户
				if (alive) setRoster({ workspaces: [] });
			});
		return () => {
			alive = false;
		};
	}, [known]);

	const run = async (key: string, action: () => Promise<unknown>): Promise<void> => {
		if (pending !== null) return;
		setPending(key);
		setError(null);
		try {
			await action();
			onSwitched();
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : String(failure));
		} finally {
			setPending(null);
		}
	};

	const create = (): void => {
		const trimmed = name.trim();
		if (trimmed === "") return;
		void run("new", () => postSwitchIdentity({ action: "new", name: trimmed }));
	};

	const claim = (uuid: string, workspace: string): void => {
		void run(`claim:${uuid}`, () =>
			postSwitchIdentity({ action: "claim", uuid, workspace }),
		);
	};

	const candidates = (roster?.workspaces ?? []).filter(
		(group) => group.owners.length > 0,
	);

	const body = known
		? h(
				"div",
				{ style: cardStyle },
				h("div", { style: cardTitleStyle }, t("settingsCurrent")),
				h(
					"div",
					null,
					`@${identity.name ?? ""}`,
					h("span", { style: { ...hintStyle, marginLeft: "var(--dtl-space-2)" } }, identity.uuid ?? ""),
				),
			)
		: [
				h(
					"div",
					{ key: "new", style: cardStyle },
					h("div", { style: cardTitleStyle }, t("settingsNoIdentityTitle")),
					h("div", { style: hintStyle }, t("settingsNoIdentityHint")),
					h(
						"div",
						{ style: rowStyle },
						h("div", { style: { flex: "1 1 auto", minWidth: 0 } }, h(Input, {
							value: name,
							onChange: setName,
							placeholder: t("settingsNamePlaceholder"),
							size: "lg",
							"aria-label": t("settingsNamePlaceholder"),
							disabled: pending !== null,
							onKeyDown: (event) => {
								if (event.key !== "Enter") return;
								event.preventDefault();
								create();
							},
						})),
						h(
							Button,
							{
								variant: "primary",
								size: "lg",
								loading: pending === "new",
								disabled: pending !== null || name.trim() === "",
								onClick: create,
							},
							t("settingsCreate"),
						),
					),
					error === null ? null : h("div", { style: errorStyle }, t("settingsFailed", { message: error })),
				),
				h(
					"div",
					{ key: "roster", style: cardStyle },
					h("div", { style: cardTitleStyle }, t("settingsUseExisting")),
					roster === null
						? h(Loader, { variant: "blocks", size: "md" })
						: candidates.length === 0
							? h("div", { style: hintStyle }, t("settingsRosterEmpty"))
							: candidates.map((group) =>
									h(
										"div",
										{ key: group.id, style: rosterGroupStyle },
										h("div", { style: hintStyle }, group.title),
										...group.owners.map((owner) =>
											h(
												"div",
												{ key: owner.uuid, style: ownerRowStyle },
												h("span", null, `@${owner.name}`),
												h(
													Button,
													{
														variant: "outline",
														size: "sm",
														loading: pending === `claim:${owner.uuid}`,
														disabled: pending !== null,
														onClick: () => claim(owner.uuid, group.id),
													},
													t("settingsUseThis"),
												),
											),
										),
									),
								),
				),
				h(
					"div",
					{ key: "terminal", style: cardStyle },
					h("div", { style: hintStyle }, t("settingsTerminalHint")),
					h("code", { style: codeStyle }, identity.initCommand ?? "progress init"),
				),
			];

	return h(
		"div",
		{ style: pageStyle },
		h(
			"div",
			{ style: innerStyle },
			h(
				"div",
				{ style: headerStyle },
				known
					? h(Button, { variant: "outline", size: "md", onClick: onBack }, `← ${t("settingsBack")}`)
					: null,
				h("div", { style: titleStyle }, t("settingsTitle")),
			),
			body,
		),
	);
}

/** 设置页要用到的键（供上面的类型检查留痕：改文案时漏键会在这里报错）。 */
export type SettingsLocaleKey = Extract<
	LocaleKey,
	| "settingsEntry"
	| "settingsTitle"
	| "settingsBack"
	| "settingsNoIdentityTitle"
	| "settingsNoIdentityHint"
	| "settingsNamePlaceholder"
	| "settingsCreate"
	| "settingsUseExisting"
	| "settingsRosterEmpty"
	| "settingsTerminalHint"
	| "settingsCurrent"
	| "settingsFailed"
	| "settingsUseThis"
>;
