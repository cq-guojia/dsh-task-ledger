/**
 * 身份与设置（滑轨第三段，跟「待办 / 历史」平级）。
 *
 * ⚠️ 当前处于**样式预览**阶段（用户 2026-11-01：「先不用写程序，就把样式写出来，先确定样式」）：
 * 上面左栏把「有身份 / 没身份」两种状态**同时摆出来**看得清楚，名字用指定的示例值。
 * 样式定稿后把示例值换成真实身份（`props.identity`），预览那段删掉即可。
 *
 * 版式：上半左栏两张（有身份 / 没身份）、右栏「台账怎么跑」四格小图（纯 CSS）；
 * 下半台账目录表格。写动作（显示 / 改名 / 移除 / 添加）仍空着，下一轮接。
 */
import { createElement as h, type ReactNode, useEffect, useState } from "react";
import { fetchDirs, fetchRoster, postSwitchIdentity } from "./api";
import type { LocaleKey, Translate } from "./locales";
import type { IdentityView, LedgerDirView, RosterPayload } from "./types";
import { Button, Card, Checkbox, Input, Loader, Modal, Surface } from "./ui";

/** 本轮的写动作一律空着（界面先定，方法下一轮接）。 */
const notYet = (): void => {};

/** 样式预览用的示例身份（定稿后删）。 */
const PREVIEW = { name: "GuoJia-Agent", uuid: "3f9c2a71" } as const;

export function SettingsPage(props: {
	t: Translate;
	identity: IdentityView;
	/** 换完身份：让看板整轮重读（uuid 变了，统计与「我的」全变）。 */
	onSwitched: () => void;
}): ReactNode {
	const { t, onSwitched } = props;

	// 用户弹窗：一律不自动弹（用户 2026-11-01：先看页面本身的 UI，别一进来就盖住）
	const [userOpen, setUserOpen] = useState(false);
	const [name, setName] = useState("");
	const [roster, setRoster] = useState<RosterPayload | null>(null);
	const [pending, setPending] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const [dirs, setDirs] = useState<readonly LedgerDirView[] | null>(null);
	const [dirsError, setDirsError] = useState<string | null>(null);
	const [renaming, setRenaming] = useState<string | null>(null);
	const [draft, setDraft] = useState("");
	const [copied, setCopied] = useState<string | null>(null);
	const [addOpen, setAddOpen] = useState(false);
	const [addPath, setAddPath] = useState("");

	useEffect(() => {
		let alive = true;
		fetchDirs()
			.then((payload) => {
				if (alive) setDirs(payload.dirs);
			})
			.catch((failure: unknown) => {
				if (alive)
					setDirsError(
						failure instanceof Error ? failure.message : String(failure),
					);
			});
		return () => {
			alive = false;
		};
	}, []);

	// 名册：弹窗打开且还没取到时才取（没有身份时也要能认领别人）
	useEffect(() => {
		if (!userOpen || roster !== null) return;
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
	}, [userOpen, roster]);

	const run = async (key: string, action: () => Promise<unknown>): Promise<void> => {
		if (pending !== null) return;
		setPending(key);
		setError(null);
		try {
			await action();
			setUserOpen(false);
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

	const copyPath = (path: string): void => {
		const clip = navigator.clipboard;
		if (clip === undefined) return;
		clip.writeText(path).then(
			() => {
				setCopied(path);
				window.setTimeout(() => {
					setCopied((current) => (current === path ? null : current));
				}, 1500);
			},
			notYet,
		);
	};

	const candidates = (roster?.workspaces ?? []).filter(
		(group) => group.owners.length > 0,
	);

	const openUserModal = (): void => {
		setUserOpen(true);
	};

	/* ── 上半 · 左：我是谁（两种状态都画出来比）───────────────────── */

	const profileOf = (who: string | null, uuid: string | null): ReactNode => {
		if (who === null || uuid === null)
			return h(
				"div",
				{ className: "dtl-profile" },
				h("div", { className: "dtl-avatar dtl-avatar--empty" }, "?"),
				h(
					"div",
					{ className: "dtl-profile__main" },
					h("div", { className: "dtl-profile__name" }, t("settingsNoIdentityTitle")),
					h("div", { className: "dtl-profile__hint" }, t("settingsNoIdentityHint")),
					h(
						"div",
						{ className: "dtl-acts" },
						h(
							Button,
							{ variant: "primary", size: "sm", onClick: openUserModal },
							t("settingsGoCreate"),
						),
					),
				),
			);
		const initial = who.trim().slice(0, 1);
		return h(
			"div",
			{ className: "dtl-profile" },
			h("div", { className: "dtl-avatar" }, initial === "" ? "?" : initial),
			h(
				"div",
				{ className: "dtl-profile__main" },
				h("div", { className: "dtl-profile__name" }, `@${who}`),
				h("div", { className: "dtl-profile__uuid" }, uuid),
				h(
					"div",
					{ className: "dtl-acts" },
					h(
						Button,
						{ variant: "outline", size: "sm", onClick: openUserModal },
						t("settingsSwitchUser"),
					),
					h(
						Button,
						{ variant: "primary", size: "sm", onClick: openUserModal },
						t("settingsNewUser"),
					),
				),
			),
		);
	};

	/* ── 上半 · 右：台账工作流（三个方框 + 箭头）─────────────────── */

	/** 一列：编号方框 + 下面一行小字。 */
	const stage = (num: string, name: string, desc: string, tone: string): ReactNode =>
		h(
			"div",
			{ className: "dtl-flow__stage" },
			h(
				Surface,
				{ className: `dtl-flow__box dtl-flow__box--${tone}`, padding: "sm" },
				h("span", { className: "dtl-flow__num" }, num),
				h("span", { className: "dtl-flow__name" }, name),
			),
			h("div", { className: "dtl-flow__desc" }, desc),
		);

	const flow = h(
		"div",
		{ className: "dtl-flow" },
		h("div", { className: "dtl-flow__title" }, t("settingsFlowTitle")),
		h(
			"div",
			{ className: "dtl-flow__rail" },
			stage("1", t("settingsFlow1"), t("settingsFlow1Desc"), "neutral"),
			h("span", { className: "dtl-flow__arrow" }, "→"),
			// 中间一列：工作区里，纵向三步（建 → 领 → 结）
			h(
				"div",
				{ className: "dtl-flow__stage" },
				h(
					Surface,
					{ className: "dtl-flow__box dtl-flow__box--business", padding: "sm" },
					h("span", { className: "dtl-flow__num" }, "2"),
					h("span", { className: "dtl-flow__name" }, t("settingsFlow2")),
				),
				h(
					"div",
					{ className: "dtl-flow__stack" },
					h("span", { className: "dtl-flow__chip" }, t("settingsFlow2Create")),
					h("span", { className: "dtl-flow__down" }, "↓"),
					h("span", { className: "dtl-flow__chip" }, t("settingsFlow2Claim")),
					h("span", { className: "dtl-flow__down" }, "↓"),
					h("span", { className: "dtl-flow__chip" }, t("settingsFlow2Close")),
				),
			),
			h("span", { className: "dtl-flow__arrow" }, "→"),
			stage("3", t("settingsFlow3"), t("settingsFlow3Desc"), "success"),
		),
	);

	/* ── 下半：台账目录表格 ───────────────────────────────────────── */

	const dirRow = (dir: LedgerDirView): ReactNode =>
		renaming === dir.path
			? h(
					"div",
					{ key: dir.path, className: "dtl-tbl__edit" },
					h(
						"div",
						{ className: "dtl-form__grow" },
						h(Input, {
							value: draft,
							onChange: setDraft,
							placeholder: t("settingsRenamePlaceholder"),
							"aria-label": t("settingsRenamePlaceholder"),
						}),
					),
					h(Button, { variant: "primary", size: "sm", onClick: notYet }, t("settingsSave")),
					h(
						Button,
						{
							variant: "ghost",
							size: "sm",
							onClick: () => {
								setRenaming(null);
							},
						},
						t("settingsCancel"),
					),
				)
			: h(
					"div",
					{ key: dir.path, className: "dtl-tbl__row" },
					h("div", { className: "dtl-tbl__cell" }, dir.name),
					h(
						"button",
						{
							type: "button",
							className: "dtl-tbl__path",
							title: t("settingsPathCopyTip"),
							onClick: () => {
								copyPath(dir.path);
							},
						},
						copied === dir.path ? t("settingsPathCopied") : dir.path,
					),
					h(
						"div",
						{ className: "dtl-tbl__cell" },
						h(Checkbox, {
							checked: !dir.hidden,
							onChange: notYet,
							label: t("settingsDirVisible"),
						}),
					),
					h(
						"div",
						{ className: "dtl-acts" },
						h(
							Button,
							{
								variant: "outline",
								size: "sm",
								onClick: () => {
									setRenaming(dir.path);
									setDraft(dir.name);
								},
							},
							t("settingsDirRename"),
						),
						h(Button, { variant: "ghost", size: "sm", onClick: notYet }, t("settingsDirRemove")),
					),
				);

	const dirsBody =
		dirsError !== null
			? h("div", { className: "dtl-set__error" }, `${t("loadFailed")}：${dirsError}`)
			: dirs === null
				? h("div", { className: "dtl-loading" }, h(Loader, { variant: "blocks", size: "md" }))
				: dirs.length === 0
					? h("div", { className: "dtl-set__hint" }, t("settingsDirsEmpty"))
					: h(
							"div",
							{ className: "dtl-tbl" },
							h(
								"div",
								{ className: "dtl-tbl__head" },
								h("div", null, t("settingsColDir")),
								h("div", null, t("settingsColPath")),
								h("div", null, ""),
								h("div", null, t("settingsColActions")),
							),
							...dirs.map(dirRow),
						);

	/* ── 弹窗 ──────────────────────────────────────────────────────── */

	const userModal = userOpen
		? h(
				Modal,
				{
					title: t("settingsUserModalTitle"),
					size: "md",
					onClose: () => {
						if (pending === null) setUserOpen(false);
					},
				},
				h("div", { className: "dtl-set__title" }, t("settingsCreate")),
				h(
					"div",
					{ className: "dtl-form" },
					h(
						"div",
						{ className: "dtl-form__grow" },
						h(Input, {
							value: name,
							onChange: setName,
							placeholder: t("settingsNamePlaceholder"),
							"aria-label": t("settingsNamePlaceholder"),
							disabled: pending !== null,
							onKeyDown: (event) => {
								if (event.key !== "Enter") return;
								event.preventDefault();
								create();
							},
						}),
					),
					h(
						Button,
						{
							variant: "primary",
							loading: pending === "new",
							disabled: pending !== null || name.trim() === "",
							onClick: create,
						},
						t("settingsCreate"),
					),
				),
				error === null
					? null
					: h("div", { className: "dtl-set__error" }, t("settingsFailed", { message: error })),
				h(
					"div",
					{ className: "dtl-roster__group" },
					h("div", { className: "dtl-set__title" }, t("settingsUseExisting")),
					roster === null
						? h("div", { className: "dtl-loading" }, h(Loader, { variant: "blocks", size: "md" }))
						: candidates.length === 0
							? h("div", { className: "dtl-set__hint" }, t("settingsRosterEmpty"))
							: candidates.map((group) =>
									h(
										"div",
										{ key: group.id, className: "dtl-roster__group" },
										h("div", { className: "dtl-roster__group-title" }, group.title),
										...group.owners.map((owner) =>
											h(
												"div",
												{ key: owner.uuid, className: "dtl-roster__item" },
												h("span", null, `@${owner.name}`),
												h(
													Button,
													{
														variant: "outline",
														size: "sm",
														loading: pending === `claim:${owner.uuid}`,
														disabled: pending !== null,
														onClick: () => {
															claim(owner.uuid, group.id);
														},
													},
													t("settingsUseThis"),
												),
											),
										),
									),
								),
				),
			)
		: null;

	const addModal = addOpen
		? h(
				Modal,
				{
					title: t("settingsAddTitle"),
					size: "md",
					onClose: () => {
						setAddOpen(false);
					},
					footer: h(
						"div",
						{ className: "dtl-acts" },
						h(
							Button,
							{
								variant: "ghost",
								onClick: () => {
									setAddOpen(false);
								},
							},
							t("settingsCancel"),
						),
						h(
							Button,
							{ variant: "primary", disabled: addPath.trim() === "", onClick: notYet },
							t("settingsAddConfirm"),
						),
					),
				},
				h("div", { className: "dtl-set__hint" }, t("settingsAddHint")),
				h(
					"div",
					{ className: "dtl-form" },
					h(Input, {
						value: addPath,
						onChange: setAddPath,
						placeholder: t("settingsAddPlaceholder"),
						"aria-label": t("settingsAddPlaceholder"),
					}),
				),
			)
		: null;

	return h(
		"div",
		{ className: "dtl-set" },
		h(
			"div",
			{ className: "dtl-hero" },
			h(
				"div",
				{ className: "dtl-hero__col" },
				// 预览期只摆「有身份」这一张看整体效果；没身份那张（红条）临时收起
				h(Card, { accent: "success" }, profileOf(PREVIEW.name, PREVIEW.uuid)),
			),
			h("div", { className: "dtl-hero__flow" }, h(Surface, { padding: "lg" }, flow)),
		),
		h(
			Surface,
			{ padding: "lg" },
			h(
				"div",
				{ className: "dtl-set__head" },
				h(
					"div",
					null,
					h("div", { className: "dtl-set__title" }, t("settingsDirsTitle")),
					h("div", { className: "dtl-set__hint" }, t("settingsDirsHint")),
				),
				h(
					Button,
					{
						variant: "outline",
						size: "sm",
						onClick: () => {
							setAddOpen(true);
						},
					},
					t("settingsDirsAdd"),
				),
			),
			h("div", { className: "dtl-set__body" }, dirsBody),
		),
		userModal,
		addModal,
	);
}

/** 设置页要用到的键（改文案时漏键会在这里报错）。 */
export type SettingsLocaleKey = Extract<
	LocaleKey,
	| "loadFailed"
	| "settingsSwitchUser"
	| "settingsNewUser"
	| "settingsGoCreate"
	| "settingsUserModalTitle"
	| "settingsNoIdentityTitle"
	| "settingsNoIdentityHint"
	| "settingsNamePlaceholder"
	| "settingsCreate"
	| "settingsUseExisting"
	| "settingsRosterEmpty"
	| "settingsFailed"
	| "settingsUseThis"
	| "settingsDirsTitle"
	| "settingsDirsHint"
	| "settingsDirsEmpty"
	| "settingsDirsAdd"
	| "settingsDirVisible"
	| "settingsDirRename"
	| "settingsDirRemove"
	| "settingsRenamePlaceholder"
	| "settingsSave"
	| "settingsCancel"
	| "settingsPathCopyTip"
	| "settingsPathCopied"
	| "settingsAddTitle"
	| "settingsAddHint"
	| "settingsAddPlaceholder"
	| "settingsAddConfirm"
	| "settingsFlowTitle"
	| "settingsFlow1"
	| "settingsFlow1Desc"
	| "settingsFlow2"
	| "settingsFlow2Desc"
	| "settingsFlow3"
	| "settingsFlow3Desc"
	| "settingsColDir"
	| "settingsColPath"
	| "settingsColActions"
>;
