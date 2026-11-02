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
	IconCheckOutlineRegular,
	IconCloseOutlineRegular,
	IconDownloadOutlineRegular,
	IconFlatListOutlineRegular,
} from "@deepseek-ai/dsh-client-ui-primitives";
import { createElement as h, type ReactNode, useEffect, useRef, useState } from "react";
import { fetchDirs, fetchRoster, postForgetIdentity, postSwitchIdentity } from "./api";
import type { LocaleKey, Translate } from "./locales";
import type { IdentityView, LedgerDirView, RosterPayload } from "./types";
import { Button, Card, Checkbox, IconButton, Input, InputGroup, Loader, MarqueeText, Modal, Surface, Table, Tag, confirmModal, notify } from "./ui";

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

/** 表格一行：一个身份（`workspaceId` = 认领请求要的工作区；`workspace` = 那一列显示什么）。 */
interface RosterRow {
	readonly uuid: string;
	readonly name: string;
	readonly workspaceId: string;
	readonly workspace: string;
	/** 分组键：连续同组的行只有一个标签（公用身份共用一个键）。 */
	readonly group: string;
}

/** 名册 → 表格行（用户 2026-11-02）：多个工作区都有的身份合并成一行、工作区列写「通用用户」，
 *  只在一个工作区出现的按各自工作区名；通用的排前面。 */
function rosterRows(roster: RosterPayload, sharedTitle: string): readonly RosterRow[] {
	const seen = new Map<string, string[]>();
	const names = new Map<string, string>();
	for (const workspace of roster.workspaces)
		for (const owner of workspace.owners) {
			const ids = seen.get(owner.uuid);
			if (ids === undefined) {
				seen.set(owner.uuid, [workspace.id]);
				names.set(owner.uuid, owner.name);
			} else ids.push(workspace.id);
		}
	const shared: RosterRow[] = [];
	const own: RosterRow[] = [];
	for (const [uuid, ids] of seen) {
		const name = names.get(uuid) ?? "";
		const workspaceId = ids[0] ?? "";
		if (ids.length > 1)
			shared.push({ uuid, name, workspaceId, workspace: sharedTitle, group: "#shared" });
		else {
			const title =
				roster.workspaces.find((item) => item.id === workspaceId)?.title ?? "";
			own.push({ uuid, name, workspaceId, workspace: title, group: workspaceId });
		}
	}
	return [...shared, ...own];
}

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

	// 名字内联改名：点「修改昵称」进来，保存走 `switch --rename`（本机身份 + 每本台账名册）。
	const [renamingName, setRenamingName] = useState(false);
	const [nameDraft, setNameDraft] = useState("");
	const [savingName, setSavingName] = useState(false);
	const nameInputRef = useRef<HTMLInputElement | null>(null);

	// 点了铅笔就直接能打字（核心 Input 没有 autoFocus，走它给的 inputRef）
	useEffect(() => {
		if (renamingName) nameInputRef.current?.focus();
	}, [renamingName]);
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

	// 建 / 切成功后各回一条**成功**提示（用户 2026-11-02）：弹窗一关就什么都没了，
	// 用户不知道到底成了没有。落款用接口回来的名字，不用输入框里的草稿。
	const create = (): void => {
		const trimmed = name.trim();
		if (trimmed === "") return;
		void run("new", async () => {
			const created = await postSwitchIdentity({ action: "new", name: trimmed });
			notify(t("settingsCreateDone", { name: created.name ?? trimmed }), {
				variant: "success",
			});
		});
	};

	const claim = (uuid: string, workspace: string, shown: string): void => {
		void run(`claim:${uuid}`, async () => {
			const picked = await postSwitchIdentity({ action: "claim", uuid, workspace });
			notify(t("settingsSwitchDone", { name: picked.name ?? shown }), {
				variant: "success",
			});
		});
	};

	/** 小叉：从所有登记过他的台账里摘掉；哪本里还有任务，那本不删并由 host 回报。 */
	const forgetUser = async (row: RosterRow): Promise<void> => {
		if (pending !== null) return;
		const ok = await confirmModal({
			title: t("settingsDeleteConfirmTitle"),
			message: t("settingsDeleteConfirmBody", { name: row.name }),
			confirmText: t("settingsDeleteConfirmOk"),
			cancelText: t("settingsCancel"),
			tone: "danger",
		});
		if (!ok) return;
		setPending(`forget:${row.uuid}`);
		setError(null);
		try {
			const report = await postForgetIdentity(row.uuid);
			if (report.kept.length > 0) {
				notify(t("settingsForgetKeptTitle"), {
					variant: "warning",
					durationMs: 10_000,
					description: report.kept
						.map((item) =>
							t("settingsForgetKeptRow", {
								workspace: item.workspace,
								tasks: String(item.tasks),
							}),
						)
						.join("\n"),
				});
			}
			if (report.failed.length > 0) {
				notify(t("settingsForgetFailedTitle"), {
					variant: "error",
					durationMs: 10_000,
					description: report.failed
						.map((item) => `${item.workspace}：${item.error}`)
						.join("\n"),
				});
			}
			// 真删掉了才有成功回执（删干净的那几本）；一本都没删成时不刷这条，免得和上面两条打架
			if (report.removed.length > 0) {
				notify(t("settingsForgetDone", { name: row.name }), { variant: "success" });
			}
			// 删完**不关**弹窗（用户 2026-11-02）：可能想接着清好几个人。
			// 名册已经变了：丢掉缓存让它在弹窗里就地重取，被删的人立刻从列表上消失。
			setRoster(null);
			onSwitched();
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : String(failure));
		} finally {
			setPending(null);
		}
	};

	/** 点「使用」先确认：切换身份会影响此后所有台账记录的归属，不能一下点上。 */
	const useUser = async (row: RosterRow): Promise<void> => {
		if (pending !== null) return;
		const ok = await confirmModal({
			title: t("settingsUseConfirmTitle"),
			message: t("settingsUseConfirmBody", { name: row.name }),
			confirmText: t("settingsUseConfirmOk"),
			cancelText: t("settingsCancel"),
		});
		if (ok) claim(row.uuid, row.workspaceId, row.name);
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

	const rows = roster === null ? [] : rosterRows(roster, t("settingsSharedUsers"));

	const openUserModal = (): void => {
		// 每次打开都清空昵称：上次建成功之后不该还留着一份旧输入
		setName("");
		setError(null);
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

		/** 「修改昵称」：名字就地变成输入框。 */
		const startRename = (): void => {
			setNameDraft(who);
			setRenamingName(true);
		};
		const stopRename = (): void => {
			setRenamingName(false);
		};

		/** 保存：写本机身份 + 每本已登记台账的名册（有 git 就取/提交/推送），逐本回执。
		 *  结果一律走核心 Toast（用户 2026-11-02：报错别塞进卡片里把版面顶烂）。 */
		const saveName = async (): Promise<void> => {
			const trimmed = nameDraft.trim();
			if (trimmed === "" || trimmed === who || savingName) return;
			setSavingName(true);
			try {
				const result = await postSwitchIdentity({
					action: "rename",
					name: trimmed,
				});
				setRenamingName(false);
				if ("dirs" in result) {
					const problems = result.dirs.filter(
						(row) => row.status === "failed" || row.status === "commit-only",
					);
					if (problems.length > 0)
						notify(t("settingsRenamePartial"), {
							variant: "warning",
							// 台账路径长，得留够时间读完
							durationMs: 10_000,
							description: problems
								.map((row) => `${row.dir}：${row.reason}`)
								.join("\n"),
						});
				}
				onSwitched();
			} catch (failure) {
				notify(t("settingsRenameFailedTitle"), {
					variant: "error",
					durationMs: 8_000,
					description: failure instanceof Error ? failure.message : String(failure),
				});
			} finally {
				setSavingName(false);
			}
		};
		const canSaveName = nameDraft.trim() !== "" && nameDraft.trim() !== who;

		return h(
			"div",
			{ className: "dtl-profile" },
			h("div", { className: "dtl-avatar" }, initial === "" ? "?" : initial),
			h(
				"div",
				{ className: "dtl-profile__main" },
				renamingName
					? h(
							"div",
							{ className: "dtl-profile__editor" },
							h(Input, {
								value: nameDraft,
								onChange: setNameDraft,
								size: "md",
								placeholder: t("settingsNamePlaceholder"),
								"aria-label": t("settingsNamePlaceholder"),
								inputRef: nameInputRef,
								onKeyDown: (event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										void saveName();
										return;
									}
									if (event.key === "Escape") {
										event.preventDefault();
										stopRename();
									}
								},
							}),
						)
					: h(
							"div",
							{ className: "dtl-profile__nameline" },
							h("span", { className: "dtl-profile__nametext" }, `@${who}`),
						),
				h("div", { className: "dtl-profile__uuid" }, uuid),
				renamingName
					? h(
							"div",
							{ className: "dtl-acts" },
							h(
								Button,
								{
									variant: "info",
									size: "sm",
									icon: h(IconCheckOutlineRegular, { size: 14 }),
									loading: savingName,
									disabled: savingName || !canSaveName,
									onClick: () => {
										void saveName();
									},
								},
								t("settingsSave"),
							),
							h(
								Button,
								{ variant: "secondary", size: "sm", disabled: savingName, onClick: stopRename },
								t("settingsCancel"),
							),
						)
					: h(
							"div",
							{ className: "dtl-acts" },
							h(
								Button,
								{ variant: "outline", size: "sm", onClick: startRename },
								t("settingsRenameUser"),
							),
							h(
								Button,
								{ variant: "outline", size: "sm", onClick: openUserModal },
								t("settingsSwitchUser"),
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
					h("li", { className: "dtl-flow__item", key: i }, h(MarqueeText, { text: line })),
				),
		);

	/** npm 包名 + GitHub / npm 两个图标按钮。
	 *  **不挂任何悬停提示**（用户 2026-11-02：没让加的东西别加）。 */
	const NpmLink = ({ pkg }: { pkg: string }): ReactNode =>
		h(
			Surface,
			{ tone: "sunken", border: "faint", radius: "md", padding: "sm", className: "dtl-flow__code" },
			h("code", { className: "dtl-flow__cmd" }, pkg),
			h(IconButton, {
				icon: h(GithubMark, null),
				label: "GitHub",
				title: "",
				onClick: () => {
					window.open("https://github.com/cq-guojia/dsh-task-ledger", "_blank", "noopener,noreferrer");
				},
			}),
			h(IconButton, {
				icon: h(NpmMark, null),
				label: "npm",
				title: "",
				onClick: () => {
					window.open(`https://www.npmjs.com/package/${pkg}`, "_blank", "noopener,noreferrer");
				},
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
					// 固定尺寸（用户 2026-11-02）：宽 = 原 md 的 4/5；高度钉死，内容多少都不变，
					// 超出的部分由核心 body 自己滚（核心约定：body 是唯一滚动容器）
					width: "576px",
					height: "400px",
					onClose: () => {
						if (pending === null) setUserOpen(false);
					},
					// 分隔线归核心 foot（0.20.0 起默认带）。左边留给正在跑的动作（删除要逐本台账走
					// 一次 git 往返，慢），右边是「创建新用户」组合框。
					footer: h(
						"div",
						{ className: "dtl-modal__foot" },
						// 左下角：有动作在跑就晃三个块（删除要逐本台账走网络，慢）
						h(
							"div",
							{ className: "dtl-modal__busy" },
							pending === null ? null : h(Loader, { variant: "blocks", size: "lg" }),
						),
						h(InputGroup, {
						label: t("settingsCreateUser"),
						value: name,
						onChange: setName,
						placeholder: t("settingsNamePlaceholder"),
						size: "lg",
						disabled: pending !== null,
						onSubmit: create,
						// marginLeft:auto 让它始终贴右，左边留白只给 loading
						style: { width: "360px", marginLeft: "auto" },
						actions: [
							{
								label: t("settingsUserModalConfirm"),
								variant: "info",
								icon: h(IconCheckOutlineRegular, { size: 14 }),
								disabled: pending !== null || name.trim() === "",
								onClick: create,
							},
						],
						}),
						),
						},
						error === null
						? null
						: h("div", { className: "dtl-set__error" }, t("settingsFailed", { message: error })),
				roster === null
					? h("div", { className: "dtl-loading" }, h(Loader, { variant: "blocks", size: "md" }))
					: h(
							"div",
							{ className: "dtl-users__wrap" },
							h(Table, {
								ariaLabel: t("settingsUserModalTitle"),
								emptyText: t("settingsRosterEmpty"),
								// 表头整条不要（用户 2026-11-02）：列定义还得给，只是 CSS 把 thead 藏掉
								className: "dtl-users-table",
								// 上下两条外框线也去掉（用户 2026-11-02）
								borders: "none",
								// 用户名在前、台账在后（用户 2026-11-02）：台账标签是分组的，
								// 排第一列时只有一个人也空着一大片，看着像少了东西。
								// 后两列压窄，把宽度让给第一列（昵称 + 完整 uuid 必须一行装下）
								columns: [
									{ key: "name", title: t("settingsColName") },
									{ key: "workspace", title: t("settingsColWorkspace"), width: 160 },
									{ key: "action", title: t("settingsColAction"), width: 110, align: "right" },
								],
								rows: rows.map((row, index) => ({
									key: row.uuid,
									cells: {
										// 公用身份不挂标签（用户 2026-11-02：不显示「通用用户」）；
										// 同一工作区连续几行只留第一个标签，一个标签引领下面的用户
										workspace:
											row.group === "#shared" || rows[index - 1]?.group === row.group
												? null
												: h(Tag, {
														text: row.workspace,
														tone: "workspace",
														maxWidth: 160,
													}),
										// 昵称后面挂 uuid（用户 2026-11-02）：两个人重名时靠它才分得清
										name: h(
											"span",
											{ className: "dtl-roster__who" },
											h("span", { className: "dtl-roster__name" }, `@${row.name}`),
											// 只露尾 8 位（挤不下 36 位），完整值放 title
											h(
												"span",
												{ className: "dtl-roster__uuid", title: row.uuid },
												row.uuid.slice(-8),
											),
										),
										action: h(
											"div",
											{ className: "dtl-users__acts" },
											// 已经是自己 ⇒ 不给「使用」（用户 2026-11-02）
											row.uuid === props.identity.uuid
												? null
												: h(
														Button,
														{
															// 实心蓝（用户 2026-11-02：要带底色，且指定 info 档）
															variant: "info",
															size: "sm",
															loading: pending === `claim:${row.uuid}`,
															disabled: pending !== null,
															onClick: () => {
																void useUser(row);
															},
														},
														t("settingsUseThis"),
													),
											// 删除：底色走核心 0.20 的 color/background 轴；点了先确认再逐本台账摘
											h(IconButton, {
												icon: h(IconCloseOutlineRegular, { size: 14 }),
												label: t("settingsDeleteUser"),
												size: "sm",
												variant: "danger",
												color: "var(--dtl-danger)",
												background: "var(--dtl-danger-soft)",
												disabled: pending !== null,
												onClick: () => {
													void forgetUser(row);
												},
											}),
										),
									},
								})),
							}),
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
	| "settingsRenameUser"
	| "settingsRenamePartial"
	| "settingsRenameFailedTitle"
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
