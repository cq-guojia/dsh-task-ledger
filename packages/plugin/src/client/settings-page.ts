/**
 * 身份与设置（滑轨第三段，跟「待办 / 历史」平级）。
 *
 * 身份卡按**真实身份**二选一（用户 2026-11-01：不并列两张）：有身份 = 绿条 + 真实名字 / uuid，
 * 没身份 = 红条 + 去建的引导；色条方位走核心 `Card` 的 `bar.side`（当前在**上边**，仍在挑）。
 *
 * 版式：上半左栏两张（有身份 / 没身份）、右栏「台账怎么跑」四格小图（纯 CSS）；
 * 下半台账目录表格。写动作（显示 / 改名 / 移除 / 添加）仍空着，下一轮接。
 */
import {
	IconChecklistOutlineRegular,
	IconDownloadOutlineRegular,
	IconFlatListOutlineRegular,
} from "@deepseek-ai/dsh-client-ui-primitives";
import { createElement as h, type ReactNode, useEffect, useState } from "react";
import { fetchDirs, fetchRoster, postSwitchIdentity } from "./api";
import type { LocaleKey, Translate } from "./locales";
import type { IdentityView, LedgerDirView, RosterPayload } from "./types";
import { Button, Card, Checkbox, IconButton, Input, Loader, MarqueeText, Modal, Surface, Tip } from "./ui";

/** GitHub 官方 mark（16×16，monochrome，fill 走 currentColor）。核心图标库没有品牌图标，自绘一份。 */
const GithubMark = (): ReactNode =>
	h(
		"svg",
		{ width: 16, height: 16, viewBox: "0 0 16 16", "aria-hidden": true, fill: "currentColor" },
		h("path", {
			d: "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z",
		}),
	);

/** npm 官方 mark（24×24 simple-icons 路径，evenodd 让「npm」字母镂空）。 */
const NpmMark = (): ReactNode =>
	h(
		"svg",
		{ width: 16, height: 16, viewBox: "0 0 24 24", "aria-hidden": true, fill: "currentColor" },
		h("path", {
			fillRule: "evenodd",
			d: "M0 0v24h24V0H0zm19.2 19.2h-2.4v-9.6h-2.4v9.6H4.8V4.8h14.4v14.4z",
		}),
	);

/** 本轮的写动作一律空着（界面先定，方法下一轮接）。 */
const notYet = (): void => {};

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

	/** 本机到底有没有身份（`uuid` / `name` 任一为空都算没有）—— 卡片配色与内容都按它二选一。 */
	const hasIdentity = props.identity.uuid !== null && props.identity.name !== null;

	/* ── 上半 · 左：我是谁（按真实身份二选一，不并列两张）───────────── */

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

	/* ── 上半 · 右：三步说明（**没有大标题**，三块用实线隔成完整的宽格，用户 2026-11-01 定）────
	   每块自上而下：序号 + 小标题 → 图标 → 说明。 */

	/** 一块：图标徽标（左）+ 圈数字（右）→ 小标题 → 自定义内容块。 */
	const stepCell = (
		no: number,
		tone: "business" | "warning" | "success",
		icon: ReactNode,
		title: string,
		body: ReactNode,
	): ReactNode =>
		h(
			"div",
			{ className: "dtl-flow__cell" },
			h(
				"div",
				{ className: "dtl-flow__top" },
				h("span", { className: `dtl-flow__icon dtl-flow__icon--${tone}` }, icon),
				h("span", { className: "dtl-flow__num" }, String(no)),
			),
			h("div", { className: "dtl-flow__name" }, title),
			body,
		);

	/** 一条条要点（行间极淡细线，不画框）。
	 *  文字一律**单行不折行**、放不下三个点、hover 滚一遍看全（核心 MarqueeText，用户 2026-11-02）。 */
	const FlowList = (lines: string[]): ReactNode =>
		h(
			"ul",
			{ className: "dtl-flow__list" },
			lines
				.filter((l) => l.trim() !== "")
				.map((line, i) =>
					h("li", { className: "dtl-flow__item", key: i }, h(MarqueeText, { text: line, title: line })),
				),
		);

	/** npm 包名 + GitHub / npm 两个图标按钮（悬停提示统一走 `Tip`，不再自造）。 */
	const NpmLink = ({ pkg }: { pkg: string }): ReactNode =>
		h(
			Surface,
			{ tone: "sunken", border: "faint", radius: "md", padding: "sm", className: "dtl-flow__code" },
			h("code", { className: "dtl-flow__cmd" }, pkg),
			h(Tip, {
				label: "GitHub",
				children: h(IconButton, {
					icon: h(GithubMark, null),
					label: "GitHub",
					title: "",
					onClick: () => {
						window.open("https://github.com/cq-guojia/dsh-task-ledger", "_blank", "noopener,noreferrer");
					},
				}),
			}),
			h(Tip, {
				label: "npm",
				children: h(IconButton, {
					icon: h(NpmMark, null),
					label: "npm",
					title: "",
					onClick: () => {
						window.open(`https://www.npmjs.com/package/${pkg}`, "_blank", "noopener,noreferrer");
					},
				}),
			}),
		);

	/** 格与格之间的分隔：一条虚线（上下留空）中间骑一个**圆箭头节点**。
	 *  圆 + 箭头都画在同一个 SVG 里：一条 `<path>`（横杆 + `>` 箭头，描边不填充，
	 *  像 Lucide 的 arrow-right；坐标按包围盒中心对齐圆心，绝对居中）。 */
	const sep = (): ReactNode =>
		h(
			"span",
			{ className: "dtl-flow__sep" },
			h(
				"span",
				{ className: "dtl-flow__node" },
				h(
					"svg",
					{ className: "dtl-flow__ring", width: 32, height: 32, viewBox: "0 0 32 32", "aria-hidden": true },
					h("circle", { cx: 16, cy: 16, r: 14.5 }),
					h("path", { className: "dtl-flow__arrow", d: "M10.25 16 H21.75 M16.25 10.5 L21.75 16 L16.25 21.5" }),
				),
			),
		);

	const flow = h(
		Surface,
		{ className: "dtl-flow__frame", padding: null },
		h(
			"div",
			{ className: "dtl-flow__grid" },
			stepCell(
				1,
				"business",
				h(IconDownloadOutlineRegular, { size: 18 }),
				t("settingsFlow1"),
				h(
					"div",
					{ className: "dtl-flow__body" },
					h("div", { className: "dtl-flow__lead" }, t("settingsFlow1Lead")),
					h("div", { className: "dtl-flow__sub" }, t("settingsFlow1Sub")),
					h(NpmLink, { pkg: "task-ledger" }),
				),
			),
			sep(),
			stepCell(
				2,
				"warning",
				h(IconChecklistOutlineRegular, { size: 18 }),
				t("settingsFlow2"),
				FlowList([t("settingsFlow2Create"), t("settingsFlow2Exec"), t("settingsFlow2Close")]),
			),
			sep(),
			stepCell(
				3,
				"success",
				h(IconFlatListOutlineRegular, { size: 18 }),
				t("settingsFlow3"),
				FlowList([t("settingsFlow3Todo"), t("settingsFlow3History"), t("settingsFlow3Stats")]),
			),
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
				// 只摆**一张**卡、按真实身份二选一（用户 2026-11-01：不用两张都摆，正常判断该显示哪张）。
				// 有身份 = 绿条 + 真实名字 / uuid；没身份 = 红条 + 引导去建。
				// 色条回到**左边**（上下都试过，用户 2026-11-01 定：上下都不好看）。
				h(
					Card,
					{
						accent: hasIdentity ? "success" : "danger",
						bar: { side: "left" },
					},
					hasIdentity
						? profileOf(props.identity.name, props.identity.uuid)
						: profileOf(null, null),
				),
			),
			// 右栏 = 一个**大框**（标题也在框内），不再外面再套一层 Surface
			h("div", { className: "dtl-hero__flow" }, flow),
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
