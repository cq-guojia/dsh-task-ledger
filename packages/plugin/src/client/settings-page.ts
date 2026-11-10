/**
 * 身份与设置（滑轨第三段，跟「待办 / 历史」平级）。
 *
 * 身份卡按**真实身份**二选一（用户 2026-11-01：不并列两张）：有身份 = 绿条 + 真实名字 / uuid，
 * 没身份 = 红条 + 去建的引导；色条方位走核心 `Card` 的 `bar.side`（当前在**上边**，仍在挑）。
 *
 * 版式：上半左栏两张（有身份 / 没身份）、右栏「台账怎么跑」四格小图（纯 CSS）；
 * 下半台账目录表格。写动作（登记 / 显示 / 改名 / 移除）全部接通：登记走核心选目录弹窗
 * （`pickWorkspaceFile({ filter: { dirs: true } })`，只能选目录、不限工作区）。
 */
import {
	IconChecklistOutlineRegular,
	IconCheckOutlineRegular,
	IconCloseOutlineRegular,
	IconCopyOutlineRegular,
	IconDownloadOutlineRegular,
	IconFlatListOutlineRegular,
	Switch,
} from "@deepseek-ai/dsh-client-ui-primitives";
import { pickWorkspaceFile } from "dsh-plugin-core/adv/explorer";
import { createElement as h, Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { fetchDirs, fetchRoster, fetchRulesInjection, postDirs, postForgetIdentity, postRulesInjection, postSwitchIdentity, type DirsWriteBody, type ForgetStep } from "./api";
import type { LocaleKey, Translate } from "./locales";
import { STEP_LABEL } from "./task-row";
import type { DirsPayload, IdentityView, LedgerDirView, RosterPayload } from "./types";
import { Button, Card, ConfirmModal, FieldHint, IconButton, Input, InputGroup, ListRow, Loader, MarqueeText, Modal, SectionHead, Segmented, Surface, Table, Tag, Textarea, Tip, confirmModal, notify } from "./ui";

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
	/** 台账目录表的筛选档（用户 2026-11-02：所有 / 只显示中的 / 只隐藏的）。 */
	const [dirFilter, setDirFilter] = useState<"all" | "shown" | "hidden">("all");
	const [renaming, setRenaming] = useState<string | null>(null);
	const [draft, setDraft] = useState("");
	// 点了「重命名」输入框直接能打字（核心 Input 没有 autoFocus，走它给的 inputRef）
	const renameInputRef = useRef<HTMLInputElement | null>(null);
	useEffect(() => {
		if (renaming !== null) renameInputRef.current?.focus();
	}, [renaming]);
	const [copied, setCopied] = useState<string | null>(null);
	/** 目录写动作的进行中标记（`动作:路径`）：同一个记录不让连点。 */
	const [dirBusy, setDirBusy] = useState<string | null>(null);

	// 会话规则注入：设置放插件自有文件，默认文案写死在 host（恢复默认 = 清掉用户值）
	const [rulesEnabled, setRulesEnabled] = useState(false);
	const [rulesText, setRulesText] = useState("");
	const [rulesBusy, setRulesBusy] = useState(false);
	const [rulesError, setRulesError] = useState<string | null>(null);

	useEffect(() => {
		let alive = true;
		fetchRulesInjection()
			.then((payload) => {
				if (!alive) return;
				setRulesEnabled(payload.enabled);
				setRulesText(payload.text);
			})
			.catch((failure: unknown) => {
				if (alive)
					setRulesError(
						failure instanceof Error ? failure.message : String(failure),
					);
			});
		return () => {
			alive = false;
		};
	}, []);

	/** 保存 / 恢复默认都走同一条写路由；回执里的 text 就是当前生效文案。 */
	const writeRules = async (body: {
		readonly enabled?: boolean;
		readonly text?: string;
		readonly action?: "reset";
	}, done: string): Promise<void> => {
		if (rulesBusy) return;
		setRulesBusy(true);
		setRulesError(null);
		try {
			const payload = await postRulesInjection(body);
			setRulesEnabled(payload.enabled);
			setRulesText(payload.text);
			notify(done, { variant: "success" });
		} catch (failure: unknown) {
			setRulesError(failure instanceof Error ? failure.message : String(failure));
		} finally {
			setRulesBusy(false);
		}
	};

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
	// 返回 Promise ⇒ InputGroup 的按钮自己转圈（核心 0.22.1 起 run 会把 onClick 的返回值交回去）。
	const create = (): Promise<void> => {
		const trimmed = name.trim();
		if (trimmed === "") return Promise.resolve();
		return run("new", async () => {
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

	/**
	 * 小叉：先开确认框，真删在框里跑（`removeUser`）—— 逐本台账各跑一条写命令，一本几秒，
	 * 所以底栏左侧跟着 skill 的阶段翻文案（用户 2026-11-05）。用声明式 `ConfirmModal`：
	 * Promise 版的 `notice` 只能在开框时给一次，运行中改不了。
	 */
	const [forgetRow, setForgetRow] = useState<RosterRow | null>(null);
	const [forgetStep, setForgetStep] = useState<ForgetStep | null>(null);

	const forgetUser = (row: RosterRow): void => {
		if (pending !== null) return;
		setError(null);
		setForgetStep(null);
		setForgetRow(row);
	};

	/** 从所有登记过他的台账里摘掉；哪本里还有任务，那本不删并由 host 回报。 */
	const removeUser = async (): Promise<void> => {
		const row = forgetRow;
		if (row === null || pending !== null) return;
		setPending(`forget:${row.uuid}`);
		setError(null);
		setForgetStep(null);
		try {
			const report = await postForgetIdentity(row.uuid, setForgetStep);
			// 一次操作只给**一条**回执（用户 2026-11-02：又绿又红谁看得懂）。
			// 全成 ⇒ 绿；有任何一本没删成/失败 ⇒ 一条黄或红，正文逐行写清是哪本、为什么。
			if (report.failed.length === 0 && report.kept.length === 0) {
				notify(t("settingsForgetDone", { name: row.name }), { variant: "success" });
			} else {
				const lines: string[] = [];
				if (report.removed.length > 0) {
					lines.push(
						t("settingsForgetDoneCount", { count: String(report.removed.length) }),
					);
				}
				for (const item of report.kept) {
					lines.push(
						t("settingsForgetKeptRow", {
							workspace: item.workspace,
							tasks: String(item.tasks),
						}),
					);
				}
				for (const item of report.failed) {
					lines.push(
						t("settingsForgetFailedRow", {
							workspace: item.workspace,
							error: item.error,
						}),
					);
				}
				// 标题分两档：有失败说「移除失败」，只是还有未结任务说「移除未完成」
				notify(
					t(
						report.failed.length > 0
							? "settingsForgetFailedTitle"
							: "settingsForgetPartialTitle",
						{ name: row.name },
					),
					{
						variant: report.failed.length > 0 ? "error" : "warning",
						durationMs: 12_000,
						description: lines.join("\n"),
					},
				);
			}
			// 删完**不关**「用户弹窗」（用户 2026-11-02）：可能想接着清好几个人；关掉的只是上面的确认框。
			// 名册已经变了：丢掉缓存让它在弹窗里就地重取，被删的人立刻从列表上消失。
			setRoster(null);
			onSwitched();
			setForgetRow(null);
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : String(failure));
			// 不关框：确认键恢复可点，能原地重试（口径同 task-row 的动作确认框）
			throw failure;
		} finally {
			setPending(null);
			setForgetStep(null);
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
				// 复制成功：按钮换小勾（1.5s 后复原）+ 一条 Toast，路径文字本身不动（用户 2026-11-02）
				setCopied(path);
				notify(t("settingsPathCopied"), { variant: "success" });
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
				// 图标徽标用核心 IconButton（plain、lg=32 方）：圆角与控件同档，我们只定颜色。
				// 纯装饰 ⇒ 不进 tab 序列、读屏跳过、不弹 title、不响应 hover（用户 2026-11-02）。
				h(IconButton, {
					icon,
					label: title,
					title: "",
					variant: "plain",
					size: "lg",
					background: `var(--dtl-${tone}-soft)`,
					color: `var(--dtl-${tone})`,
					tabIndex: -1,
					ariaHidden: true,
					className: "dtl-flow__icon",
				}),
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

	/** 一行：npm 包名（整行可点 → npm 页）+ GitHub / npm 两个图标钮。
	 *  整行用核心 `ListRow`（自带底色、hover、右侧操作槽，点右侧不连带整行），不再自建框。
	 *  悬停提示走本地 `Tip`（官方 Tooltip + 真 DOM 锚点；用户 2026-11-03 点名要加，文案就
	 *  「GitHub」「NPM」两个词）。IconButton 是函数组件挂不上 ref，Tip 的垫片 span 正好当锚点；
	 *  `title: ""` 仍压原生提示，避免系统 title 与官方气泡双出（口径同 task-row 的动作钮）。 */
	const NpmLink = ({ pkg }: { pkg: string }): ReactNode => {
		const openNpm = (): void => {
			window.open(`https://www.npmjs.com/package/${pkg}`, "_blank", "noopener,noreferrer");
		};
		return h(
			ListRow,
			{
				onClick: openNpm,
				actions: h(
					Fragment,
					null,
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
						label: "NPM",
						children: h(IconButton, {
							icon: h(NpmMark, null),
							label: "npm",
							title: "",
							onClick: openNpm,
						}),
					}),
				),
			},
			h("code", { className: "dtl-flow__cmd" }, pkg),
		);
	};

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

	/* ── 下半：台账目录表格（框架全走核心：标题 = SectionHead、表 = Table）────── */

	/** 目录写动作的统一出口（用户 2026-11-02）：**成功静默**（就地换清单），
	 *  失败一条红 Toast，正文用 host / skill 给的原文。 */
	const postDirBody = async (
		key: string,
		body: DirsWriteBody,
	): Promise<DirsPayload | null> => {
		if (dirBusy !== null) return null;
		setDirBusy(key);
		try {
			const payload = await postDirs(body);
			setDirs(payload.dirs);
			return payload;
		} catch (failure) {
			notify(t("settingsDirOpFailed"), {
				variant: "error",
				// 台账路径与脚本原因都可能很长，留够时间读完
				durationMs: 10_000,
				description: failure instanceof Error ? failure.message : String(failure),
			});
			return null;
		} finally {
			setDirBusy(null);
		}
	};

	const writeDir = async (
		key: string,
		body: DirsWriteBody,
		onDone?: () => void,
	): Promise<void> => {
		const payload = await postDirBody(key, body);
		if (payload === null) return;
		onDone?.();
		// 显示 / 移除会改变「哪些台账参与汇总」⇒ 让看板整轮重读
		onSwitched();
	};

	/**
	 * 添加目录：弹核心的选目录面板（只能选目录、不限工作区），选中后交给 host 判「自己或一级子目录
	 * 里有没有台账」。`anchor` = 触发按钮本身（弹窗贴着它弹，不给就落到左上角）。
	 *
	 * 三种结果各自一句：没台账 / 本来就在清单里 / 新增（1 个或多个）。
	 */
	const addDirFromPicker = async (anchor: HTMLElement | null): Promise<void> => {
		if (dirBusy !== null) return;
		// 用户 2026-11-03 定：按钮下方、往左展开（面板右缘对齐按钮右缘）。`bottom-start` 与旧的
		// `auto` 在下方有空间时完全一样，所以看不到变化 —— 这档才真的把面板挪到按钮左边。
		const picked = await pickWorkspaceFile({
			anchor,
			placement: "bottom-end",
			filter: { dirs: true },
		});
		if (picked === null) return;
		// 选中之后才进「忙」态：选目录面板阶段不该转圈（用户 2026-11-03）
		setDirBusy("add");
		let payload: Awaited<ReturnType<typeof postDirBody>> = null;
		try {
			payload = await postDirBody(`add:${picked.path}`, {
				action: "add",
				path: picked.path,
			});
		} finally {
			setDirBusy(null);
		}
		if (payload === null) return;
		if (payload.added === false) {
			// 技术原因（路径 + skill 原文）只进控制台，界面给人话
			console.warn("[task-ledger] 添加台账目录失败：", payload.reason);
			notify(t("settingsAddInvalid"), {
				variant: "error",
				description: t("settingsAddInvalidBody"),
			});
			return;
		}
		if (payload.existed === true) {
			notify(t("settingsAddExisted"), {
				description: t("settingsAddExistedBody"),
			});
			return;
		}
		const names = (payload.paths ?? []).map(
			(path) => payload.dirs.find((dir) => dir.path === path)?.name ?? path,
		);
		notify(
			names.length > 1 ? t("settingsAddDoneMany") : t("settingsAddDone"),
			{
				description:
					names.length > 1
						? t("settingsAddDoneManyBody", {
								count: names.length,
								names: names.join(t("settingsListSep")),
							})
						: t("settingsAddDoneBody", { name: names[0] ?? "" }),
			},
		);
		onSwitched();
	};

	/** 保存改名：空名 = 回落目录名（skill 口径，与占位提示一致）。 */
	const saveRename = (dir: LedgerDirView): void => {
		void writeDir(
			`rename:${dir.path}`,
			{ action: "rename", path: dir.path, name: draft.trim() },
			() => {
				setRenaming(null);
			},
		);
	};

	/** 从看板移除：先确认（书面口径：只摘出看板，不动任何文件与台账数据）。 */
	const removeDirOf = async (dir: LedgerDirView): Promise<void> => {
		if (dirBusy !== null) return;
		const ok = await confirmModal({
			title: t("settingsDirRemoveConfirmTitle", { name: dir.name }),
			message: t("settingsDirRemoveConfirmBody"),
			confirmText: t("settingsDirRemoveConfirmOk"),
			cancelText: t("settingsCancel"),
			tone: "danger",
		});
		if (ok) await writeDir(`remove:${dir.path}`, { action: "remove", path: dir.path });
	};

	/** 表格行：按顶部三档筛过，重命名时整行让给输入框（跨四列）。 */
	const dirRows = (dirs ?? [])
		.filter((dir) =>
			dirFilter === "all" ? true : dirFilter === "shown" ? !dir.hidden : dir.hidden,
		)
		.map((dir) => {
			if (renaming === dir.path)
				return {
					key: dir.path,
					cells: {
						name: {
							colSpan: 4,
							content: h(
								"div",
								{ className: "dtl-dir__edit" },
								h(
									"div",
									{ className: "dtl-form__grow" },
									h(Input, {
										// type=search 才带核心的清除小叉（有焦点且有内容时出现）
										type: "search",
										value: draft,
										onChange: setDraft,
										placeholder: t("settingsRenamePlaceholder"),
										"aria-label": t("settingsRenamePlaceholder"),
										inputRef: renameInputRef,
									}),
								),
								// 与这一行的输入框同档（Input 默认 lg = 32px 高）
								h(
									Button,
									{
										variant: "info",
										size: "lg",
										icon: h(IconCheckOutlineRegular, { size: 14 }),
										loading: dirBusy === `rename:${dir.path}`,
										disabled: dirBusy !== null,
										onClick: () => {
											saveRename(dir);
										},
									},
									t("settingsSave"),
								),
								h(
									Button,
									{
										// 灰底、不描边（用户 2026-11-02：取消不要做成纯文字）
										variant: "secondary",
										size: "lg",
										onClick: () => {
											setRenaming(null);
										},
									},
									t("settingsCancel"),
								),
							),
						},
					},
				};
			return {
				key: dir.path,
				cells: {
					name: h("span", { className: "dtl-dir__name" }, dir.name),
					// 路径**本身不可点**（用户 2026-11-02）：复制钮常显，悬停提示走核心 Tip（不是原生 title）
					path: h(
						"div",
						{ className: "dtl-dir__path" },
						h(Tip, {
							label: dir.path,
							maxWidth: 420,
							children: h("span", { className: "dtl-dir__pathtext" }, dir.path),
						}),
						h(Tip, {
							label: t("settingsPathCopy"),
							children: h(IconButton, {
								icon:
									copied === dir.path
										? h(IconCheckOutlineRegular, { size: 14 })
										: h(IconCopyOutlineRegular, { size: 14 }),
								label: t("settingsPathCopy"),
								size: "sm",
								className: "dtl-dir__copy",
								onClick: () => {
									copyPath(dir.path);
								},
							}),
						}),
					),
					// 开关不带文字：表头已写明这一列是「显示」（用户 2026-11-02）
					visible: h(Switch, {
						checked: !dir.hidden,
						onChange: (next: boolean) => {
							void writeDir(`visible:${dir.path}`, {
								action: next ? "unhide" : "hide",
								path: dir.path,
							});
						},
						label: t("settingsDirVisible"),
						disabled: dirBusy !== null,
					}),
					actions: h(
						"div",
						{ className: "dtl-dir__acts" },
						// 默认动作：有底色、不描边（用户 2026-11-02）
						h(
							Button,
							{
								variant: "secondary",
								size: "sm",
								onClick: () => {
									setRenaming(dir.path);
									setDraft(dir.name);
								},
							},
							t("settingsDirRename"),
						),
						// 移除：只留一个小叉（危险动作，与身份表的删除同色）
						h(IconButton, {
							icon: h(IconCloseOutlineRegular, { size: 14 }),
							label: t("settingsDirRemove"),
							size: "sm",
							variant: "danger",
							color: "var(--dtl-danger)",
							background: "var(--dtl-danger-soft)",
							// 图标钮本身定宽定高，loading 换圈不跳
							loading: dirBusy === `remove:${dir.path}`,
							disabled: dirBusy !== null,
							onClick: () => {
								void removeDirOf(dir);
							},
						}),
					),
				},
			};
		});

	const dirsBody =
		dirsError !== null
			? h("div", { className: "dtl-set__error" }, `${t("loadFailed")}：${dirsError}`)
			: dirs === null
				? h("div", { className: "dtl-loading" }, h(Loader, { variant: "blocks", size: "md" }))
				: h(Table, {
						ariaLabel: t("settingsDirsTitle"),
						emptyText:
							dirFilter === "all" || (dirs !== null && dirs.length === 0)
								? t("settingsDirsEmpty")
								: t("settingsDirsFilterEmpty"),
						borders: "none",
						columns: [
							{ key: "name", title: t("settingsColDir") },
							{ key: "path", title: t("settingsColPath") },
							// 说明文字挂「显示」表头后面（用户 2026-11-02）：问号走核心 FieldHint，气泡向下弹
							{
								key: "visible",
								title: h(
									"span",
									{ className: "dtl-dir__colhead" },
									t("settingsDirVisible"),
									h(FieldHint, { text: t("settingsDirsHint"), side: "bottom", maxWidth: 380 }),
								),
								width: 92,
								align: "center",
							},
							// 操作列：不写表头文案（改名 / 删除两个钮自明）+ 定宽 + 靠右（用户 2026-11-02）
							{ key: "actions", title: "", width: 132, align: "right" },
						],
						rows: dirRows,
					});

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
					// 两块**直接当底栏的子项**：不套一层 footer 容器 —— 核心 foot 是 flex 一行，
					// 容器一撑满宽就会和 `notice` 抢同一行（见 close-task-modal 的教训）。
					footer: h(
						Fragment,
						null,
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
												{ className: "dtl-roster__uuid" },
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
															// 无 icon ⇒ loading 时清掉文案、只留居中的圈（核心自己锁宽）
															loadingText: false,
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
												// 图标钮定宽定高，loading 换圈不跳
												loading: pending === `forget:${row.uuid}`,
												disabled: pending !== null,
												onClick: () => {
													forgetUser(row);
												},
											}),
										),
									},
								})),
							}),
						),
			)
		: null;

	/**
	 * 移除确认框：底栏左侧那行跟着 skill 的阶段翻（还没收到第一个阶段就先说「正在同步」）。
	 * ⚠️ `notice` 只在**真的在跑**时给：它一给就占位显示 —— 刚打开、还没点就冒出「正在同步」是 bug
	 * （用户 2026-11-05 当场撞到）。
	 */
	const forgetDialog =
		forgetRow === null
			? null
			: h(ConfirmModal, {
					title: t("settingsDeleteConfirmTitle"),
					message: t("settingsDeleteConfirmBody", { name: forgetRow.name }),
					confirmText: t("settingsDeleteConfirmOk"),
					cancelText: t("settingsCancel"),
					tone: "danger",
					...(pending === null
						? {}
						: {
								notice:
									forgetStep === null
										? t("actionSyncing")
										: t("settingsForgetStep", {
												step: t(STEP_LABEL[forgetStep.step]),
												workspace: forgetStep.workspace,
											}),
							}),
					// 跑着的时候整框锁死（核心 0.31 的 `locked`：inert 全禁 + 灰层 + 三条关闭路径一起封）。
					// 命令是逐本台账 fire-and-forget，中途停不下来 ⇒ 别让人以为能取消（用户 2026-11-05）。
					locked: pending !== null,
					onCancel: () => {
						setForgetRow(null);
					},
					onConfirm: removeUser,
				});

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
			// 标题行 = 核心 SectionHead（icon + 标题 + 右槽）：右槽放三档筛选与「添加目录」
			h(SectionHead, {
				icon: h(IconFlatListOutlineRegular, { size: 16 }),
				title: t("settingsDirsTitle"),
				right: h(
					"div",
					{ className: "dtl-set__tools" },
					h(Segmented<"all" | "shown" | "hidden">, {
						items: [
							{ value: "all", label: t("settingsDirsFilterAll") },
							{ value: "shown", label: t("settingsDirsFilterShown") },
							{ value: "hidden", label: t("settingsDirsFilterHidden") },
						],
						value: dirFilter,
						onChange: setDirFilter,
						size: "md",
						tone: "business",
						label: t("settingsDirsTitle"),
					}),
					h(
						Button,
						{
							variant: "outline",
							size: "md",
							loading: dirBusy === "add",
							disabled: dirBusy !== null,
							// 无 icon ⇒ loading 时清掉文案、只留居中的圈（核心自己锁宽）
							loadingText: false,
							onClick: (event) => {
								void addDirFromPicker(event.currentTarget);
							},
						},
						t("settingsDirsAdd"),
					),
				),
			}),
			h("div", { className: "dtl-set__body" }, dirsBody),
		),
		h(
			Surface,
			{ padding: "lg" },
			h(SectionHead, {
				icon: h(IconChecklistOutlineRegular, { size: 16 }),
				title: t("settingsRulesTitle"),
			}),
			h(
				"div",
				{ className: "dtl-set__body" },
				h("p", null, t("settingsRulesHint")),
				h(Switch, {
					checked: rulesEnabled,
					onChange: setRulesEnabled,
					label: t("settingsRulesSwitch"),
					disabled: rulesBusy,
				}),
				h(Textarea, {
					value: rulesText,
					onChange: setRulesText,
					"aria-label": t("settingsRulesTextLabel"),
					disabled: rulesBusy,
				}),
				h(
					"div",
					{ className: "dtl-set__tools" },
					h(
						Button,
						{
							variant: "secondary",
							size: "md",
							loading: rulesBusy,
							disabled: rulesBusy,
							onClick: () => {
								void writeRules(
									{ enabled: rulesEnabled, text: rulesText },
									t("settingsRulesSaved"),
								);
							},
						},
						t("settingsSave"),
					),
					h(
						Button,
						{
							variant: "outline",
							size: "md",
							disabled: rulesBusy,
							onClick: () => {
								void writeRules(
									{ action: "reset" },
									t("settingsRulesResetDone"),
								);
							},
						},
						t("settingsRulesReset"),
					),
				),
				rulesError !== null
					? h("p", null, t("settingsRulesFailed", { message: rulesError }))
					: null,
			),
		),
		userModal,
		forgetDialog,
	);
}

/** 设置页要用到的键（改文案时漏键会在这里报错）。 */
export type SettingsLocaleKey = Extract<
	LocaleKey,
	| "settingsRulesTitle"
	| "settingsRulesHint"
	| "settingsRulesSwitch"
	| "settingsRulesTextLabel"
	| "settingsRulesReset"
	| "settingsRulesSaved"
	| "settingsRulesResetDone"
	| "settingsRulesFailed"
	| "settingsSave"
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
	| "settingsDirsFilterAll"
	| "settingsDirsFilterShown"
	| "settingsDirsFilterHidden"
	| "settingsDirsFilterEmpty"
	| "settingsDirVisible"
	| "settingsDirRename"
	| "settingsDirRemove"
	| "settingsDirRemoveConfirmTitle"
	| "settingsDirRemoveConfirmBody"
	| "settingsDirRemoveConfirmOk"
	| "settingsDirOpFailed"
	| "settingsRenamePlaceholder"
	| "settingsSave"
	| "settingsCancel"
	| "settingsPathCopied"
	| "settingsPathCopy"
	| "settingsAddInvalid"
	| "settingsAddInvalidBody"
	| "settingsAddExisted"
	| "settingsAddExistedBody"
	| "settingsAddDone"
	| "settingsAddDoneBody"
	| "settingsAddDoneMany"
	| "settingsAddDoneManyBody"
	| "settingsForgetStep"
	| "actionSyncing"
	| "settingsListSep"
	| "settingsFlow1"
	| "settingsFlow1Desc"
	| "settingsFlow2"
	| "settingsFlow2Desc"
	| "settingsFlow3"
	| "settingsFlow3Desc"
	| "settingsColDir"
	| "settingsColPath"
>;
