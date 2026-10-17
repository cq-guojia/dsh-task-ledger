window.__ModuleLoader__.load({
	id: "dsh-task-ledger",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region src/client/api.ts
		/** host 路由前缀（全仓唯一；与 host/routes.ts 的 API_PREFIX 对应）。 */
		const API_PREFIX = "api/task-ledger";
		const DEFAULT_TIMEOUT_MS = 8e3;
		/**
		* 错误响应榨人话：host 路由（routes.ts）发的是 `{ error: "..." }`，那里的话是**能直接上界面的**
		* （带工作区名、python3 起不来之类的原文）。不带它界面上只剩「HTTP 500」，等于没报错。
		*/
		function httpErrorMessage(status, body) {
			try {
				const parsed = JSON.parse(body);
				if (typeof parsed.error === "string" && parsed.error !== "") return `HTTP ${status}：${parsed.error}`;
			} catch {}
			const text = body.trim().slice(0, 200);
			return text === "" ? `HTTP ${String(status)}` : `HTTP ${String(status)}：${text}`;
		}
		/** 带超时的 JSON 取数（相对路径，同源）。 */
		async function fetchJson(path, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
			const controller = new AbortController();
			const timer = setTimeout(() => {
				controller.abort(new DOMException(`请求超时（${timeoutMs}ms 未响应）`, "TimeoutError"));
			}, timeoutMs);
			try {
				const res = await fetch(`${API_PREFIX}${path}`, {
					...init,
					signal: controller.signal,
					cache: "no-store"
				});
				if (!res.ok) throw new Error(httpErrorMessage(res.status, await res.text().catch(() => "")));
				return await res.json();
			} finally {
				clearTimeout(timer);
			}
		}
		/** 首页快照（在办全量 + 两个完成类统计 + 各工作区身份）。 */
		function fetchBoard() {
			return fetchJson("/board");
		}
		/** 单条在办 + 过程文档正文（展开行用）。 */
		function fetchTaskDetail(workspaceId, taskId) {
			return fetchJson(`/task?${new URLSearchParams({
				ws: workspaceId,
				id: taskId
			}).toString()}`);
		}
		//#endregion
		//#region src/client/store.ts
		/**
		* 看板数据仓（client 侧**唯一**取数入口）：浮标角标与整页共用同一份快照，
		* 谁先挂载谁触发首读；刷新按钮走同一个 `refresh()`，**不轮询**（2026-10-17 拍板：
		* 后端纯按需，刷新时机归前端 = 打开面板首读 + 手动刷新）。
		*
		* 消费方式：`useSyncExternalStore(boardSubscribe, boardSnapshot)`。
		* ⚠️ `getSnapshot` 必须返回**稳定引用**（每次新建对象会被判定为「一直在变」⇒ 无限重渲染），
		* 故只在真变了时才换 `state` 对象。
		*/
		let state = {
			status: "loading",
			board: null,
			error: null,
			query: {
				scope: "all",
				status: "all",
				workspace: "",
				keyword: ""
			},
			refreshing: false
		};
		const listeners = /* @__PURE__ */ new Set();
		/** 首读只触发一次（谁先订阅谁触发），之后一律靠 `refresh()` / `setQuery()`。 */
		let booted = false;
		/** 在途轮次：迟到的响应按 token 丢弃，避免旧结果盖新结果。 */
		let runToken = 0;
		function emit() {
			for (const listener of [...listeners]) listener();
		}
		function set(patch) {
			state = {
				...state,
				...patch
			};
			emit();
		}
		function boardSnapshot() {
			return state;
		}
		function boardSubscribe(listener) {
			listeners.add(listener);
			if (!booted) {
				booted = true;
				refresh();
			}
			return () => {
				listeners.delete(listener);
			};
		}
		/** 重读：在办快照 + 完成类统计与近 8 周趋势（一次 `/board` 全带回）。 */
		async function refresh() {
			const token = ++runToken;
			set({ refreshing: true });
			try {
				const board = await fetchBoard();
				if (token !== runToken) return;
				set({
					status: "ready",
					board,
					error: null
				});
			} catch (error) {
				if (token !== runToken) return;
				set({
					status: "error",
					error: error instanceof Error ? error.message : String(error)
				});
			} finally {
				if (token === runToken) set({ refreshing: false });
			}
		}
		/** 改筛选：全部在浏览器里完成（快照已含全部在办），不发请求。 */
		function setQuery(patch) {
			set({ query: {
				...state.query,
				...patch
			} });
		}
		//#endregion
		//#region src/client/rows.ts
		/** 关键字命中（标题 / 任务号 / 人 / 分类 / 标签；已结案另含「完成了什么」）。 */
		function hitKeyword(keyword, parts) {
			const needle = keyword.trim().toLowerCase();
			if (needle === "") return true;
			return parts.some((part) => part?.toLowerCase().includes(needle) === true);
		}
		/** 「我的」判定：owner = 该工作区的当前 git 身份，且状态是 doing / blocked（与 host 统计同口径）。 */
		function isMine(task, board) {
			if (board === null) return false;
			const identity = board.identities[task.workspace.id] ?? null;
			if (identity === null || identity === "") return false;
			return task.owner === identity && (task.status === "doing" || task.status === "blocked");
		}
		/** 状态档命中（停滞由 host 标记，前端不判阈值）。 */
		function statusHit(task, status) {
			if (status === "all") return true;
			if (status === "active") return task.status === "doing" || task.status === "blocked";
			if (status === "open") return task.status === "open";
			if (status === "blocked") return task.status === "blocked";
			return task.stale === true;
		}
		/** 组内排序：别人的 doing/blocked 在前、待认领在后；各自按创建 / 开始时间倒序。 */
		function inGroupOrder(a, b) {
			if (a.kind !== "task" || b.kind !== "task") return 0;
			const rank = (task) => task.status === "open" ? 1 : 0;
			if (rank(a.task) !== rank(b.task)) return rank(a.task) - rank(b.task);
			return String(b.task.created ?? b.task.started ?? "").localeCompare(String(a.task.created ?? a.task.started ?? ""));
		}
		/**
		* 当前筛选下的两区视图：
		*  - 第一区「我的待办」= 我名下 doing/blocked（命中状态档 / 工作区 / 关键字）；
		*  - 第二区「按工作区」= 其余任务（别人的 doing/blocked + 全部待认领），按工作区分组；
		*  - 范围=「我的」时只出第一区。
		*/
		function selectView(current) {
			const { board, query } = current;
			if (board === null) return {
				mine: [],
				groups: [],
				total: 0
			};
			const tasks = board.tasks.filter((task) => {
				if (!statusHit(task, query.status)) return false;
				if (query.workspace !== "" && task.workspace.id !== query.workspace) return false;
				return hitKeyword(query.keyword, [
					task.title,
					task.id,
					task.owner,
					task.creator,
					task.category,
					...task.tags ?? []
				]);
			});
			const mineRows = tasks.filter((task) => isMine(task, board)).sort((a, b) => String(b.created ?? b.started ?? "").localeCompare(String(a.created ?? a.started ?? ""))).map((task) => ({
				kind: "task",
				key: `${task.workspace.id}:${task.id}`,
				task,
				mine: true
			}));
			const rest = query.scope === "mine" ? [] : tasks.filter((task) => !isMine(task, board));
			const byWorkspace = /* @__PURE__ */ new Map();
			for (const task of rest) {
				const entry = byWorkspace.get(task.workspace.id) ?? {
					title: task.workspace.title,
					rows: []
				};
				entry.rows.push({
					kind: "task",
					key: `${task.workspace.id}:${task.id}`,
					task,
					mine: false
				});
				byWorkspace.set(task.workspace.id, entry);
			}
			const groups = [...byWorkspace.entries()].map(([workspaceId, entry]) => ({
				workspaceId,
				title: entry.title,
				doingCount: entry.rows.filter((row) => row.kind === "task" && row.task.status !== "open").length,
				openCount: entry.rows.filter((row) => row.kind === "task" && row.task.status === "open").length,
				rows: entry.rows.sort(inGroupOrder)
			})).sort((a, b) => a.title.localeCompare(b.title, "zh-Hans-CN"));
			return {
				mine: mineRows,
				groups,
				total: mineRows.length + groups.reduce((sum, group) => sum + group.rows.length, 0)
			};
		}
		//#endregion
		//#region src/client/format.ts
		/**
		* 客户端时间口径**单源**：补零 / 时刻串（本机时区）。
		* 解析失败按调用方给的兜底返回（不编造时间）。
		*
		* 2026-10-17 改版后首页不再做时间范围过滤（时间只作用于统计卡与趋势图，由 host 聚合）
		* ⇒ 原来的 `rangeToDates` / `withinRange` / `RangeKey` 一并删除；统计 tab 要做时间筛选时
		* 按当时口径在此重建，别处不许再写一份。
		*/
		function pad2(value) {
			return String(value).padStart(2, "0");
		}
		/** ISO → `YYYY-MM-DD HH:mm`（`seconds: true` 时补 `:ss`）；解析失败返回 `fallback`（缺省原串）。 */
		function formatDateTime(iso, opts) {
			const ms = Date.parse(iso);
			if (Number.isNaN(ms)) return opts?.fallback ?? iso;
			const d = new Date(ms);
			const base = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
			return opts?.seconds === true ? `${base}:${pad2(d.getSeconds())}` : base;
		}
		//#endregion
		//#region src/client/tokens.ts
		/**
		* 语义 token 层：`--dtl-*`（dtl = dsh-task-ledger）。
		*
		* 规矩（docs/design/ui-style.md §三，2026-10-17 对齐 dispatch 表后收严）：
		*  - **只有本文件定义 `--dtl-*`**；其它文件一律 `var(--dtl-*)` 消费，不许直接写 `var(--dsw-*)`；
		*  - 每个 token 都带兜底值 ⇒ 宿主升级换名时不炸（最坏退到兜底色，不会白屏）；
		*  - 明暗差异只写在本文件末尾的 `body[data-ds-dark-theme]` 段：能靠宿主 alias 表达的
		*    一律不写覆盖（alias 自己随主题变），只有「固定中性面 / 半透明底」这类 alias 表达不了的才进该段。
		*  - **离散刻度**：圆角 4/8/12/16/20/28、间距 4/8/12/16、控件高 24/28/32、字号 11/12/13/14/16
		*    ——业务文件不许出现 5/7/9px、不许自造高度档（要加档位改本文件）。
		*
		* 明暗判据 = `body[data-ds-dark-theme]`（宿主 0.2.0-rc.2 源码核实：启动脚本 toggleAttribute 写入）。
		* 插件**禁用** `prefers-color-scheme`（它跟系统、不跟用户在宿主里的选择）。
		* 因为判据是纯 CSS 选择器 ⇒ 宿主切主题即生效，**不需要 MutationObserver**。
		*
		* 挂载点 = `body`：插件界面（含将来 portal 到 body 的弹层）全在 body 内，零调用点成本。
		*/
		const UI_TOKENS_CSS = `
body{
  /* ── 文字四档 + 反色面 ───────────────────────────────────────── */
  --dtl-fg:var(--dsw-alias-label-primary,#1f2328);
  --dtl-fg-2:var(--dsw-alias-label-secondary,#5c6370);
  --dtl-fg-3:var(--dsw-alias-label-tertiary,#767d87);
  --dtl-fg-4:var(--dsw-alias-label-caption,#9aa1ab);
  --dtl-fg-dim:var(--dsw-alias-label-dimmed,#b9bfc7);
  /* 反色面上的字（角标 / 实心钮）：暗色下是 bluish-1000 ⇒ 用 -foreground 而非 -inverted */
  --dtl-fg-inverse:var(--dsw-alias-label-primary-foreground,#fff);

  /* ── 面 ──────────────────────────────────────────────────────── */
  --dtl-surface-1:var(--dsw-alias-bg-layer-1,#fff);
  --dtl-surface-2:var(--dsw-alias-bg-layer-2,#fff);
  --dtl-surface-base:var(--dsw-alias-bg-base,#fff);
  /* 「选中亮片」底盘（配 shadow-raised 用） */
  --dtl-surface-raised:var(--dsw-alias-bg-layer-1,#fff);
  /* 固定中性实面（自绘浮标 / 角标这类必须自己变的东西） */
  --dtl-solid:var(--dsw-static-neutral-00,#fff);
  --dtl-on-solid:var(--dsw-alias-label-primary,#1f2328);
  /* 斑马纹 / 次层面（浅色下近白、深色下深一档） */
  --dtl-plate:var(--dsw-static-neutral-50,#fafafa);
  --dtl-plate-hover:var(--dsw-static-neutral-100,#f5f5f5);
  /* 表头底：浅色比斑马纹再深一档（两者不能撞色） */
  --dtl-head-bg:var(--dsw-static-neutral-100,#f5f5f5);

  /* ── 描边四档（宿主真值 l1 4% / l2 10% / l3 12% / l4 16%）────── */
  --dtl-border-faint:var(--dsw-alias-border-l1,#0000000a);
  --dtl-border:var(--dsw-alias-border-l2,#0000001a);
  --dtl-border-strong:var(--dsw-alias-border-l3,#0000001f);
  --dtl-border-heavy:var(--dsw-alias-border-l4,#00000029);

  /* ── 语义色 ──────────────────────────────────────────────────── */
  /* 品牌「面」色：明色近黑、暗色近白（实心钮选中态即此），不是蓝 */
  --dtl-accent:var(--dsw-alias-brand-primary,#0f1115);
  /* 蓝色强调 / 选中 / 焦点一律走这条 */
  --dtl-business:var(--dsw-alias-state-business-primary,#3b5bdb);
  --dtl-success:var(--dsw-alias-state-success-primary,#22c55e);
  /* ⚠️ 宿主是 state-warn（不是 state-warning，后者无此定义） */
  --dtl-warning:var(--dsw-alias-state-warn-primary,#f59e0b);
  --dtl-danger:var(--dsw-alias-state-error-primary,#ec1313);
  --dtl-link:var(--dsw-alias-link,#3b5bdb);
  /* 语义色实面上的字（角标 / 实心提示）：红绿黄都是中调 ⇒ 白字两个主题都可读 */
  --dtl-on-signal:#fff;
  /* 语义色浅底：color-mix 现算 ⇒ 跟随宿主 alias，主题一换自动成立 */
  --dtl-business-soft:color-mix(in srgb,var(--dtl-business) 8%,transparent);
  --dtl-success-soft:color-mix(in srgb,var(--dtl-success) 8%,transparent);
  --dtl-warning-soft:color-mix(in srgb,var(--dtl-warning) 8%,transparent);
  --dtl-danger-soft:color-mix(in srgb,var(--dtl-danger) 8%,transparent);

  /* ── 交互底 ──────────────────────────────────────────────────── */
  --dtl-hover:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));
  --dtl-active:var(--dsw-alias-interactive-bg-active,#2631481a);
  /* 卡 / 行 hover 高亮：淡蓝（灰高亮在卡底上几乎看不出来） */
  --dtl-card-hover:rgba(37,99,235,.07);
  /* 展开行底：带透明度的蓝，透出卡片底色（灰底跟斑马纹分不出来） */
  --dtl-open-bg:rgba(37,99,235,.10);
  --dtl-open-bg-soft:rgba(37,99,235,.05);
  /* chip / 标签小底板：浅色下要看得见 ⇒ 掺 7% 近黑；hover 加倍 */
  --dtl-chip-bg:rgba(15,15,15,.07);
  --dtl-chip-bg-hover:rgba(15,15,15,.14);
  /* 图表「新增」柱：**实底**中性灰。半透明底压在卡上会发糊（用户 2026-10-17：「模模糊糊」） */
  --dtl-chart-created:var(--dsw-static-neutral-300,#d4d4d8);
  /* 图表「没完成」柱：醒目琥珀，与蓝（完成）/ 灰（新增）区分（host 无此件，fallback 兜底） */
  --dtl-chart-remaining:var(--dsw-static-amber-400,#f59e0b);

  /* ── 圆角（宿主真值 4/8/12/16/20/28）──────────────────────────── */
  --dtl-radius-xs:var(--dsw-radius-xs,4px);
  --dtl-radius-sm:var(--dsw-radius-sm,8px);
  --dtl-radius-md:var(--dsw-radius-md,12px);
  --dtl-radius-lg:var(--dsw-radius-lg,16px);
  --dtl-radius-xl:var(--dsw-radius-xl,20px);
  --dtl-radius-panel:var(--dsw-radius-panel,28px);

  /* ── 间距四拍（只许这四档）────────────────────────────────────── */
  --dtl-space-1:4px;
  --dtl-space-2:8px;
  --dtl-space-3:12px;
  --dtl-space-4:16px;

  /* ── 控件高度：离散三档（调用点不许自定义高度）────────────────── */
  --dtl-control-h-sm:24px;
  --dtl-control-h-md:28px;
  --dtl-control-h-lg:32px;

  /* ── 字号 / 行高（直绑宿主字号族 11/12/13/14/16）──────────────── */
  --dtl-font-xs:var(--dsw-font-xxxs-11-font-size,11px);
  --dtl-font-sm:var(--dsw-font-xxs-12-font-size,12px);
  --dtl-font-md:var(--dsw-font-xs-13-font-size,13px);
  --dtl-font-lg:var(--dsw-font-s-14-font-size,14px);
  --dtl-font-xl:var(--dsw-font-base-16-font-size,16px);
  --dtl-line-xs:var(--dsw-font-xxxs-11-line-height,14px);
  --dtl-line-sm:var(--dsw-font-xxs-12-line-height,18px);
  --dtl-line-md:var(--dsw-font-xs-13-line-height,20px);
  --dtl-line-lg:var(--dsw-font-s-14-line-height,22px);
  --dtl-line-xl:var(--dsw-font-base-16-line-height,24px);
  --dtl-font-mono:var(--ds-font-family-code,monospace);
  /* 统计卡主数字：宿主字号族最大 16px，看板主数字要更大 ⇒ 单开一档（别处不许直接写 px） */
  --dtl-font-stat:26px;

  /* ── 投影 / 动效 / 层级 ──────────────────────────────────────── */
  --dtl-shadow-1:var(--dsw-elevation-soft,0 4px 16px 0 #00000008);
  --dtl-shadow-raised:var(--dsw-elevation-soft,0 4px 16px 0 #00000008);
  --dtl-shadow-2:var(--dsw-shadow-lv3,0 12px 32px 0 #00000014);
  --dtl-dur:var(--ds-transition-duration,.2s);
  --dtl-dur-fast:var(--ds-transition-duration-fast,.12s);
  --dtl-ease:var(--ds-ease-in-out,cubic-bezier(.4,0,.2,1));
  --dtl-z-badge:20;
}

/* ── 明暗差异的唯一落点 ─────────────────────────────────────────
   只放 alias 表达不了的固定面 / 半透明底；颜色若能靠 alias 自动跟随，一律不写在这里。 */
body[data-ds-dark-theme]{
  --dtl-solid:var(--dsw-static-neutral-900,#0f0f0f);
  --dtl-on-solid:var(--dsw-static-neutral-00,#fff);
  --dtl-plate:var(--dsw-static-neutral-850,#212123);
  --dtl-plate-hover:var(--dsw-static-neutral-800,#292929);
  /* 暗色表头反过来：比卡片面亮、比斑马纹浅一档 */
  --dtl-head-bg:var(--dtl-surface-2);
  /* 暗色下蓝要更亮、透明度更高才压得住深底 */
  --dtl-open-bg:rgba(96,165,250,.18);
  --dtl-open-bg-soft:rgba(96,165,250,.08);
  --dtl-card-hover:rgba(96,165,250,.13);
  /* 暗色 chip 底板反过来掺白 */
  --dtl-chip-bg:rgba(255,255,255,.08);
  --dtl-chip-bg-hover:rgba(255,255,255,.16);
  --dtl-chart-created:var(--dsw-static-neutral-600,#525252);
  --dtl-chart-remaining:var(--dsw-static-amber-500,#fbbf24);
  /* 语义色浅底在深色下压到 5%（8% 在深底上偏重） */
  --dtl-business-soft:color-mix(in srgb,var(--dtl-business) 5%,transparent);
  --dtl-success-soft:color-mix(in srgb,var(--dtl-success) 5%,transparent);
  --dtl-warning-soft:color-mix(in srgb,var(--dtl-warning) 5%,transparent);
  --dtl-danger-soft:color-mix(in srgb,var(--dtl-danger) 5%,transparent);
}
`;
		/**
		* 控件皮肤（L2）：**一类控件唯一实现**，抄 dispatch 表 controls-css 的规矩——
		* 只消费 var(--dtl-*)，一个颜色 / 尺寸 / 圆角 / 字号字面量都不许出现；
		* 高度只取三档，有边框的变体用 1px 真边框 + 内部 padding 补回 ⇒ 有边 / 无边同高。
		*/
		const UI_CONTROLS_CSS = `
/* ── 分段控件（滑动块）────────────────────────────────────────────
   结构一套 + 两个受控轴：size(sm|md|lg) × variant(default|inset)。
   变体只覆盖两个颜色变量（--seg-track / --seg-thumb），结构 / 尺寸 / 交互零重复。 */
.dtl-seg{display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:var(--dtl-radius-md);background:var(--seg-track);}
.dtl-seg--default{--seg-track:var(--dtl-surface-2);--seg-thumb:var(--dtl-surface-raised);border:1px solid var(--dtl-border);}
.dtl-seg--inset{--seg-track:var(--dtl-hover);--seg-thumb:var(--dtl-surface-raised);border:0;padding:3px;}
.dtl-seg__item{appearance:none;display:inline-flex;align-items:center;gap:4px;box-sizing:border-box;
  height:calc(var(--dtl-control-h-sm) - 6px);padding:0 12px;border:0;border-radius:var(--dtl-radius-sm);
  background:transparent;color:var(--dtl-fg-2);font-family:inherit;font-size:var(--dtl-font-sm);line-height:var(--dtl-line-sm);
  font-weight:400;white-space:nowrap;cursor:pointer;
  transition:color var(--dtl-dur-fast) var(--dtl-ease),background-color var(--dtl-dur-fast) var(--dtl-ease),box-shadow var(--dtl-dur-fast) var(--dtl-ease);}
.dtl-seg--md .dtl-seg__item{height:calc(var(--dtl-control-h-md) - 6px);}
.dtl-seg--lg .dtl-seg__item{height:calc(var(--dtl-control-h-lg) - 6px);}
.dtl-seg__item:hover:not([aria-pressed='true']):not(:disabled){color:var(--dtl-fg);}
.dtl-seg__item[aria-pressed='true']{background:var(--seg-thumb);box-shadow:var(--dtl-shadow-raised);color:var(--dtl-fg);font-weight:600;}
.dtl-seg__item:focus-visible{outline:2px solid var(--dtl-business);outline-offset:-2px;}
.dtl-seg__item:disabled{cursor:default;opacity:.4;}
/* 段内角标（如「待认领 3」）：语义色实面 + 反白字，0 不渲染；必须是正圆 */
.dtl-seg__badge{display:inline-flex;align-items:center;justify-content:center;flex:none;
  width:16px;height:16px;padding:0;overflow:hidden;border-radius:50%;
  background:var(--dtl-danger);color:var(--dtl-on-signal);font-size:10px;line-height:16px;font-weight:500;font-variant-numeric:tabular-nums;}

/* ── 按钮 / 图标钮 ───────────────────────────────────────────────
   与 Segmented 同一条高度纪律；variant 只换颜色，结构 / 尺寸 / 交互只此一份。 */
.dtl-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:var(--dtl-space-1);
  box-sizing:border-box;border:1px solid transparent;border-radius:var(--dtl-radius-md);
  background:transparent;color:var(--dtl-fg);font-family:inherit;font-weight:500;white-space:nowrap;cursor:pointer;
  transition:background-color var(--dtl-dur-fast) var(--dtl-ease),border-color var(--dtl-dur-fast) var(--dtl-ease),color var(--dtl-dur-fast) var(--dtl-ease),opacity var(--dtl-dur-fast) var(--dtl-ease);}
.dtl-btn--sm{height:var(--dtl-control-h-sm);padding:0 10px;font-size:var(--dtl-font-sm);line-height:var(--dtl-line-sm);}
.dtl-btn--md{height:var(--dtl-control-h-md);padding:0 12px;font-size:var(--dtl-font-md);line-height:var(--dtl-line-md);}
.dtl-btn--lg{height:var(--dtl-control-h-lg);padding:0 14px;font-size:var(--dtl-font-md);line-height:var(--dtl-line-md);}
.dtl-btn--primary{background:var(--dtl-accent);color:var(--dtl-fg-inverse);}
.dtl-btn--primary:hover:not(:disabled){opacity:.9;}
.dtl-btn--outline{background:var(--dtl-surface-1);border-color:var(--dtl-border-strong);color:var(--dtl-fg);}
.dtl-btn--outline:hover:not(:disabled){background:var(--dtl-hover);}
.dtl-btn--ghost{color:var(--dtl-fg-2);}
.dtl-btn--ghost:hover:not(:disabled){background:var(--dtl-hover);color:var(--dtl-fg);}
.dtl-btn:focus-visible{outline:2px solid var(--dtl-business);outline-offset:2px;}
.dtl-btn:disabled{cursor:default;opacity:.5;}
.dtl-iconbtn{appearance:none;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;
  border:1px solid transparent;border-radius:var(--dtl-radius-sm);background:transparent;color:var(--dtl-fg-2);
  font-family:inherit;cursor:pointer;flex:none;
  transition:background-color var(--dtl-dur-fast) var(--dtl-ease),border-color var(--dtl-dur-fast) var(--dtl-ease),color var(--dtl-dur-fast) var(--dtl-ease),opacity var(--dtl-dur-fast) var(--dtl-ease);}
.dtl-iconbtn--sm{width:var(--dtl-control-h-sm);height:var(--dtl-control-h-sm);font-size:var(--dtl-font-sm);}
.dtl-iconbtn--md{width:var(--dtl-control-h-md);height:var(--dtl-control-h-md);font-size:var(--dtl-font-md);}
.dtl-iconbtn--lg{width:var(--dtl-control-h-lg);height:var(--dtl-control-h-lg);font-size:var(--dtl-font-md);}
.dtl-iconbtn--outline{background:var(--dtl-surface-1);border-color:var(--dtl-border);color:var(--dtl-fg-2);}
.dtl-iconbtn:hover:not(:disabled){background:var(--dtl-hover);color:var(--dtl-fg);}
.dtl-iconbtn:focus-visible{outline:2px solid var(--dtl-business);outline-offset:1px;}
.dtl-iconbtn:disabled{cursor:default;opacity:.4;}

/* ── 输入 / 搜索框 / 下拉 ──────────────────────────────────────── */
.dtl-input{box-sizing:border-box;border:1px solid var(--dtl-border);border-radius:var(--dtl-radius-md);
  background:var(--dtl-surface-1);color:var(--dtl-fg);font-family:inherit;outline:none;
  transition:border-color var(--dtl-dur-fast) var(--dtl-ease),box-shadow var(--dtl-dur-fast) var(--dtl-ease);}
.dtl-input--sm{height:var(--dtl-control-h-sm);padding:0 8px;font-size:var(--dtl-font-sm);line-height:var(--dtl-line-sm);}
.dtl-input--md{height:var(--dtl-control-h-md);padding:0 10px;font-size:var(--dtl-font-md);line-height:var(--dtl-line-md);}
.dtl-input--lg{height:var(--dtl-control-h-lg);padding:0 12px;font-size:var(--dtl-font-md);line-height:var(--dtl-line-md);}
.dtl-input::placeholder{color:var(--dtl-fg-dim);}
.dtl-input:focus{border-color:var(--dtl-business);box-shadow:0 0 0 1px var(--dtl-business);}
.dtl-input:disabled{cursor:default;opacity:.5;}
/* 原生 select： appearance:none + 自绘箭头 ⇒ 与输入框同宗（宿主没有廉价下拉件） */
.dtl-select{appearance:none;-webkit-appearance:none;box-sizing:border-box;
  border:1px solid var(--dtl-border);border-radius:var(--dtl-radius-md);background:var(--dtl-surface-1);color:var(--dtl-fg);
  font-family:inherit;outline:none;cursor:pointer;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23767d87' stroke-width='1.5'><path d='M4 6.5 8 10.5 12 6.5'/></svg>");
  background-repeat:no-repeat;background-position:right 8px center;background-size:14px;
  transition:border-color var(--dtl-dur-fast) var(--dtl-ease),box-shadow var(--dtl-dur-fast) var(--dtl-ease);}
.dtl-select--sm{height:var(--dtl-control-h-sm);padding:0 26px 0 8px;font-size:var(--dtl-font-sm);line-height:var(--dtl-line-sm);}
.dtl-select--md{height:var(--dtl-control-h-md);padding:0 26px 0 10px;font-size:var(--dtl-font-md);line-height:var(--dtl-line-md);}
.dtl-select--lg{height:var(--dtl-control-h-lg);padding:0 26px 0 12px;font-size:var(--dtl-font-md);line-height:var(--dtl-line-md);}
.dtl-select:focus{border-color:var(--dtl-business);box-shadow:0 0 0 1px var(--dtl-business);}
.dtl-select:disabled{cursor:default;opacity:.5;}

/* ── 卡 / chip / 空态 / 列表行（业务壳，皮肤仍只消费 token）────── */
.dtl-card{background:var(--dtl-surface-1);border:1px solid var(--dtl-border);border-radius:var(--dtl-radius-md);
  transition:background-color var(--dtl-dur-fast) var(--dtl-ease);}
.dtl-card--clickable{cursor:pointer;text-align:left;font:inherit;color:inherit;width:100%;}
.dtl-card--clickable:hover{background:var(--dtl-card-hover);}
.dtl-card--clickable[data-active='true']{border-color:var(--dtl-business);}
.dtl-card--clickable:focus-visible{outline:2px solid var(--dtl-business);outline-offset:1px;}
.dtl-chip{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 8px;border-radius:var(--dtl-radius-sm);
  background:var(--dtl-chip-bg);color:var(--dtl-fg-2);font-size:var(--dtl-font-xs);line-height:var(--dtl-line-xs);white-space:nowrap;}
.dtl-row{display:flex;align-items:center;gap:var(--dtl-space-2);width:100%;box-sizing:border-box;
  padding:var(--dtl-space-2) var(--dtl-space-3);border:0;border-bottom:1px solid var(--dtl-border-faint);
  background:transparent;font:inherit;color:inherit;text-align:left;cursor:pointer;
  transition:background-color var(--dtl-dur-fast) var(--dtl-ease);}
.dtl-row:hover{background:var(--dtl-card-hover);}
.dtl-row:focus-visible{outline:2px solid var(--dtl-business);outline-offset:-2px;}
.dtl-row[data-open='true']{background:var(--dtl-open-bg);}
.dtl-row-body{padding:var(--dtl-space-2) var(--dtl-space-3) var(--dtl-space-3);border-bottom:1px solid var(--dtl-border-faint);
  background:var(--dtl-open-bg-soft);font-size:var(--dtl-font-md);}
.dtl-ellipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

@media (prefers-reduced-motion: reduce){
  .dtl-seg__item,.dtl-btn,.dtl-iconbtn,.dtl-input,.dtl-select,.dtl-card,.dtl-row{transition:none;}
}
`;
		//#endregion
		//#region src/client/ui.ts
		/**
		* UI 基础层：样式单源 + 共用元件（**一类控件只有一份实现**）。
		*
		* 纪律（用户 2026-10-17「样式与方法一律抽象，不要反复重写」；形态抄本机
		* `dsh-task-dispatch-table` 的 `ui/tokens.ts` + `ui/controls-css.ts` + `ui/*.tsx`）：
		*  1. **样式**：颜色 / 圆角 / 字号 / 高度一律 `var(--dtl-*)`（定义只在 tokens.ts），
		*     业务文件不许再写第二份 `var(--dsw-*)`、不许自造 `--dtl-*`、不许自造高度档；
		*  2. **元件**：分段 / 按钮 / 图标钮 / 输入 / 下拉 / 卡 / chip / 空态 / 图表各一份，
		*     页面与浮标共用。官方 primitives 只留「官方做得更好」的（StateDot / MarkdownText / 图标）。
		*/
		/** 基础层样式（tokens + 控件皮肤；幂等注入）。 */
		const UI_BASE_CSS = `
/* 统计卡：可点、hover 淡蓝、选中蓝描边 */
.dtl-stat{display:flex;flex-direction:column;gap:var(--dtl-space-1);
  padding:var(--dtl-space-3) var(--dtl-space-4);text-align:left;}
.dtl-stat__value{font-size:var(--dtl-font-stat);font-weight:600;line-height:1.15;font-variant-numeric:tabular-nums;}
.dtl-stat__hint{font-size:var(--dtl-font-xs);line-height:var(--dtl-line-xs);color:var(--dtl-fg-3);}

/* 列表行：头部可点，hover 淡蓝；展开行走 --dtl-open-bg */
.dtl-row-head{display:flex;align-items:center;gap:var(--dtl-space-2);
  width:100%;padding:var(--dtl-space-2) var(--dtl-space-3);border:0;background:transparent;
  color:inherit;font:inherit;text-align:left;cursor:pointer;
  transition:background-color var(--dtl-dur-fast) var(--dtl-ease);}
.dtl-row-head:hover{background:var(--dtl-card-hover);}
.dtl-row-head:focus-visible{outline:2px solid var(--dtl-business);outline-offset:-2px;}
.dtl-row[data-open="true"]{background:var(--dtl-open-bg);}
.dtl-row-body{padding:var(--dtl-space-2) var(--dtl-space-3) var(--dtl-space-3);
  background:var(--dtl-open-bg-soft);font-size:var(--dtl-font-md);}

/* 空态：真空 = 虚线引导卡；筛选空 = 小字 */
.dtl-empty-guide{padding:var(--dtl-space-4);border:1px dashed var(--dtl-border-strong);border-radius:var(--dtl-radius-md);background:transparent;}
.dtl-empty-filtered{padding:var(--dtl-space-4) 0;color:var(--dtl-fg-3);font-size:var(--dtl-font-md)}

/* 浮标角标：0→n 跳变时一次脉冲，不自动消失 */
.dtl-badge{position:absolute;top:-2px;right:-2px;min-width:16px;height:16px;padding:0 4px;
  border-radius:8px;background:var(--dtl-danger);color:var(--dtl-on-signal);
  font-size:10px;line-height:16px;text-align:center;font-weight:600;}
.dtl-badge[data-pulse="true"]{animation:dtl-pulse 900ms var(--dtl-ease) 1}
@keyframes dtl-pulse{0%{transform:scale(.6);opacity:.4}60%{transform:scale(1.15)}100%{transform:scale(1)}}

/* 统计区整体：左 8 块（2 行 × 4 列）+ 右趋势图，参考图同款分栏。
   ⚠️ 列数写死 4 → 2，绝不给 3：3 列会排出 3+1 的非对称（用户 2026-10-17）。
   两栏**完全等高**：cards 两行 minmax(0,1fr) 均分 + 卡 height:100% ⇒ 图表卡与左边一样高。 */
/* 左 8 块略收窄、右图表略放宽（用户 2026-10-17：左再短一丢丢、右长一丢丢） */
.dtl-stats{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:var(--dtl-space-3);align-items:stretch;}
.dtl-stats__cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));
  gap:var(--dtl-space-3);}
.dtl-stats__cards > .dtl-stat{height:100%;box-sizing:border-box;}
@media (max-width:960px){.dtl-stats{grid-template-columns:minmax(0,1fr);}}
@media (max-width:640px){.dtl-stats__cards{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr));}}

/* 「只看我的」小复选框（替掉右上角的分段切换） */
.dtl-check{display:inline-flex;align-items:center;gap:5px;height:20px;margin-top:-2px;
  font-size:var(--dtl-font-xs);color:var(--dtl-fg-3);cursor:pointer;user-select:none;white-space:nowrap;}
.dtl-check input{width:12px;height:12px;margin:0;accent-color:var(--dtl-business);cursor:pointer;}
.dtl-check:hover{color:var(--dtl-fg-2);}

/* 趋势分组柱状图：绘图区高度**随卡拉伸**（flex），柱 / 刻度 / 网格全用百分比 ⇒ 与卡等高 */
.dtl-gchart-wrap{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;padding-left:30px;padding-bottom:18px;}
.dtl-gchart{position:relative;flex:1 1 auto;min-height:96px;border-bottom:1px solid var(--dtl-border);}
.dtl-gchart__grid{position:absolute;left:0;right:0;border-top:1px solid var(--dtl-border-faint);pointer-events:none;}
.dtl-gchart__ytick{position:absolute;left:-30px;width:26px;text-align:right;font-size:10px;line-height:12px;
  color:var(--dtl-fg-3);transform:translateY(50%);font-variant-numeric:tabular-nums;}
.dtl-gchart__col{position:absolute;top:0;bottom:0;min-width:0;}
/* ⚠️ pair 必须 top/bottom 双锚（或 height:100%）：绝对定位 + 只给 bottom 时高度是 auto，
   子元素的 height:% 没有可解析的包含块 ⇒ 整根柱子塌成 0（2026-10-17 真机教训：
   改百分比柱高后「一个柱子都看不见，只剩数字」）。 */
.dtl-gchart__pair{position:absolute;top:0;bottom:0;left:50%;transform:translateX(-50%);
  display:flex;align-items:flex-end;gap:1px;}
/* 三柱：完成(蓝) / 没完成(琥珀) / 新增(灰)，每根 5px、无圆角（用户 2026-10-17：太粗、不要圆弧） */
.dtl-gchart__bar{width:5px;min-height:0;}
.dtl-gchart__bar--done{background:var(--dtl-business);}
.dtl-gchart__bar--remaining{background:var(--dtl-chart-remaining);}
.dtl-gchart__bar--created{background:var(--dtl-chart-created);}
/* hover：整列三根柱一起提亮（用户 2026-10-17：移上去应该两个都变色，不是只蓝的一根） */
.dtl-gchart__col:hover .dtl-gchart__bar{filter:brightness(1.18);}
.dtl-gchart__val{position:absolute;left:50%;transform:translateX(-50%);font-size:10px;line-height:12px;
  color:var(--dtl-fg-2);font-variant-numeric:tabular-nums;white-space:nowrap;}
.dtl-gchart__label{position:absolute;left:0;right:0;bottom:-16px;text-align:center;
  font-size:10px;line-height:14px;color:var(--dtl-fg-3);white-space:nowrap;}
/* hover 浮卡（参考图同款：日期 + 两个数；原生 title 太慢、长相不一） */
.dtl-gchart__tip{position:absolute;top:0;z-index:2;min-width:104px;box-sizing:border-box;
  padding:6px 8px;border:1px solid var(--dtl-border);border-radius:var(--dtl-radius-sm);
  background:var(--dtl-surface-1);box-shadow:var(--dtl-shadow-2);
  font-size:var(--dtl-font-xs);line-height:var(--dtl-line-sm);color:var(--dtl-fg-2);pointer-events:none;}
.dtl-gchart__tip b{display:block;color:var(--dtl-fg);font-weight:600;}
.dtl-gchart__tip i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;}
.dtl-gchart-legend{display:flex;align-items:center;gap:var(--dtl-space-3);font-size:var(--dtl-font-xs);color:var(--dtl-fg-2);}
.dtl-gchart-legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;}

/* 过程正文：宽度受限、长行折行 */
.dtl-worklog{max-width:72ch;font-size:var(--dtl-font-md);line-height:1.6}
`;
		const STYLE_ID = "dtl-ui-base";
		/** 幂等注入 token 层 + 控件皮肤 + 基础层（面板与浮标谁先挂载都只注入一次）。 */
		function ensureUiBase() {
			if (typeof document === "undefined") return;
			if (document.getElementById(STYLE_ID) !== null) return;
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = `${UI_TOKENS_CSS}\n${UI_CONTROLS_CSS}\n${UI_BASE_CSS}`;
			document.head.appendChild(style);
		}
		/** 分段控件（单选）：同一份结构 + size 轴；外观差异只由 variant 的两个颜色变量表达。 */
		function Segmented(props) {
			ensureUiBase();
			const size = props.size ?? "md";
			const variant = props.variant ?? "default";
			return (0, react.createElement)("div", {
				role: "group",
				"aria-label": props.label,
				id: props.id,
				className: `dtl-seg dtl-seg--${variant} dtl-seg--${size}`,
				style: props.style
			}, props.items.map((item) => (0, react.createElement)("button", {
				key: item.value,
				type: "button",
				className: "dtl-seg__item",
				"aria-pressed": item.value === props.value,
				onClick: () => {
					props.onChange(item.value);
				}
			}, item.label, item.badge !== void 0 && item.badge > 0 ? (0, react.createElement)("span", { className: "dtl-seg__badge" }, String(item.badge)) : null)));
		}
		function Button(props) {
			ensureUiBase();
			return (0, react.createElement)("button", {
				type: "button",
				className: `dtl-btn dtl-btn--${props.variant ?? "outline"} dtl-btn--${props.size ?? "md"}`,
				disabled: props.disabled === true,
				title: props.title,
				onClick: props.onClick
			}, props.icon, props.children);
		}
		/** 原生下拉（工作区 / 状态共用一份；宿主没有廉价下拉件 ⇒ 原生 + token 皮肤）。 */
		function Select(props) {
			ensureUiBase();
			const size = props.size ?? "md";
			return (0, react.createElement)("select", {
				className: `dtl-select dtl-select--${size}`,
				"aria-label": props.ariaLabel,
				style: props.width === void 0 ? void 0 : { width: `${props.width}px` },
				value: props.value,
				onChange: (event) => {
					props.onChange(event.target.value);
				}
			}, props.options.map((option) => (0, react.createElement)("option", {
				key: option.value,
				value: option.value
			}, option.label)));
		}
		/** 搜索框（关键字过滤；占满剩余宽度由调用方的 flex 决定）。 */
		function SearchInput(props) {
			ensureUiBase();
			const size = props.size ?? "md";
			return (0, react.createElement)("input", {
				className: `dtl-input dtl-input--${size}`,
				type: "search",
				"aria-label": props.ariaLabel,
				placeholder: props.placeholder,
				value: props.value,
				spellCheck: false,
				onChange: (event) => {
					props.onChange(event.target.value);
				}
			});
		}
		/** 统计卡：主数字 + 灰色口径小字；点一下联动下方列表筛选。
		*  `value` 为 0 时显示「—」（用户 2026-10-17 定稿：0 会被读成「没数据 / 出错了」）；
		*  `hint` 可以是富文本（如把「停滞」两字标红）；
		*  `interactive: false` = 纯展示卡（统计台：首页没有已结案可筛，不装可点）。 */
		function StatCard(props) {
			ensureUiBase();
			const interactive = props.interactive !== false && props.onClick !== void 0;
			const shown = props.value === 0 || props.value === "0" ? "—" : String(props.value);
			return (0, react.createElement)(interactive ? "button" : "div", {
				type: interactive ? "button" : void 0,
				className: `dtl-card dtl-stat${interactive ? " dtl-card--clickable" : ""}`,
				"data-active": props.active === true,
				title: props.title,
				onClick: interactive ? props.onClick : void 0
			}, (0, react.createElement)("span", { style: {
				fontSize: "var(--dtl-font-sm)",
				color: "var(--dtl-fg-2)"
			} }, props.label), (0, react.createElement)("span", { className: "dtl-stat__value" }, shown), props.hint === void 0 || props.hint === null || props.hint === "" ? null : (0, react.createElement)("span", { className: "dtl-stat__hint" }, props.hint));
		}
		/** chip（分类 / 标签 / 工作区名）。 */
		function Chip(props) {
			ensureUiBase();
			return (0, react.createElement)("span", {
				className: "dtl-chip",
				style: props.color === void 0 ? void 0 : {
					background: props.color,
					color: "var(--dtl-on-signal)"
				},
				title: props.text
			}, props.text);
		}
		/** 空态：`guide` = 真空引导卡（虚线），`filtered` = 筛选空小字。 */
		function EmptyState(props) {
			ensureUiBase();
			if (props.tone === "filtered") return (0, react.createElement)("div", { className: "dtl-empty-filtered" }, props.title);
			return (0, react.createElement)("div", { className: "dtl-empty-guide" }, (0, react.createElement)("div", { style: {
				fontSize: "var(--dtl-font-lg)",
				fontWeight: 600,
				marginBottom: "var(--dtl-space-1)"
			} }, props.title), props.hint === void 0 ? null : (0, react.createElement)("div", { style: {
				fontSize: "var(--dtl-font-md)",
				color: "var(--dtl-fg-2)"
			} }, props.hint));
		}
		/** 台账图标（黑白线条，描边走 currentColor ⇒ 随主题 / 选中态反色）。
		*  侧栏条目与右上浮标共用这一份（图标只画一次，别处不许再画第二个）。 */
		function LedgerIcon(props) {
			const size = props.size ?? 18;
			const stroke = {
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 7,
				strokeLinecap: "round",
				strokeLinejoin: "round"
			};
			return (0, react.createElement)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 128 128",
				"aria-hidden": true
			}, (0, react.createElement)("path", {
				d: "M96 34 A10 10 0 0 1 106 44 V102 A10 10 0 0 1 96 112 H32 A10 10 0 0 1 22 102 V44 A10 10 0 0 1 32 34 Z",
				...stroke
			}), (0, react.createElement)("path", {
				d: "M50 22 V46 M78 22 V46",
				...stroke
			}), (0, react.createElement)("path", {
				d: "M44 66 H84 M44 86 H70",
				...stroke
			}));
		}
		/** 千位压缩（1.2k / 12k）：y 轴刻度与柱顶数值用，避免 4 位数把刻度挤宽。 */
		function compactCount(value) {
			if (value >= 1e4) return `${Math.round(value / 1e3)}k`;
			if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
			return String(value);
		}
		/** 分组柱状图（div 柱，无新依赖）：完成（蓝）/ 没完成（琥珀）/ 新增（灰）各一细柱。
		*  - 高度全用百分比 ⇒ 绘图区随卡片拉伸，图表卡与左边 8 块**完全等高**；
		*  - y 轴三档刻度 + 淡网格线；柱顶只标「完成」（3 系列 × 8 周数值会糊成一片）；
		*  - hover 整列提亮 + 浮卡（日期 + 三个数）——原生 title 太慢；
		*  - **没有**均值线与长注释（用户 2026-10-17：均值不要、注释太长不要）。 */
		function GroupedBarChart(props) {
			ensureUiBase();
			const [hover, setHover] = (0, react.useState)(null);
			const top = Math.max(1, props.weeks.reduce((peak, week) => Math.max(peak, week.done, week.remaining, week.created), 0));
			const ticks = [
				0,
				top / 2,
				top
			];
			const pct = (value) => `${value / top * 100}%`;
			const columnStyle = (index) => ({
				left: `${index / props.weeks.length * 100}%`,
				right: `${(props.weeks.length - index - 1) / props.weeks.length * 100}%`
			});
			const tipStyle = (index) => {
				if (index <= 1) return { left: 0 };
				if (index >= props.weeks.length - 2) return { right: 0 };
				return {
					left: `${(index + .5) / props.weeks.length * 100}%`,
					transform: "translateX(-50%)"
				};
			};
			return (0, react.createElement)("div", { className: "dtl-gchart-wrap" }, (0, react.createElement)("div", {
				className: "dtl-gchart",
				role: "img",
				"aria-label": props.ariaLabel,
				onMouseLeave: () => {
					setHover(null);
				}
			}, ticks.map((tick) => (0, react.createElement)("div", {
				key: `grid-${String(tick)}`,
				className: "dtl-gchart__grid",
				style: { bottom: pct(tick) }
			})), ticks.map((tick) => (0, react.createElement)("span", {
				key: `tick-${String(tick)}`,
				className: "dtl-gchart__ytick",
				style: { bottom: pct(tick) }
			}, compactCount(Math.round(tick)))), props.weeks.map((week, index) => (0, react.createElement)("div", {
				key: week.label,
				className: "dtl-gchart__col",
				style: columnStyle(index),
				onMouseEnter: () => {
					setHover(index);
				}
			}, (0, react.createElement)("div", { className: "dtl-gchart__pair" }, (0, react.createElement)("span", {
				className: "dtl-gchart__bar dtl-gchart__bar--done",
				style: {
					height: pct(week.done),
					minHeight: week.done > 0 ? "2px" : void 0
				}
			}), (0, react.createElement)("span", {
				className: "dtl-gchart__bar dtl-gchart__bar--remaining",
				style: {
					height: pct(week.remaining),
					minHeight: week.remaining > 0 ? "2px" : void 0
				}
			}), (0, react.createElement)("span", {
				className: "dtl-gchart__bar dtl-gchart__bar--created",
				style: {
					height: pct(week.created),
					minHeight: week.created > 0 ? "2px" : void 0
				}
			})), week.done === 0 ? null : (0, react.createElement)("span", {
				className: "dtl-gchart__val",
				style: { bottom: `calc(${pct(week.done)} + 3px)` }
			}, String(week.done)), (0, react.createElement)("span", { className: "dtl-gchart__label" }, week.label))), hover === null ? null : (0, react.createElement)("div", {
				className: "dtl-gchart__tip",
				style: tipStyle(hover)
			}, (0, react.createElement)("b", null, props.weeks[hover].title), (0, react.createElement)("div", null, (0, react.createElement)("i", { style: { background: "var(--dtl-business)" } }), `${props.doneLabel} ${props.weeks[hover].done}`), (0, react.createElement)("div", null, (0, react.createElement)("i", { style: { background: "var(--dtl-chart-remaining)" } }), `${props.remainingLabel} ${props.weeks[hover].remaining}`), (0, react.createElement)("div", null, (0, react.createElement)("i", { style: { background: "var(--dtl-chart-created)" } }), `${props.createdLabel} ${props.weeks[hover].created}`))));
		}
		/** 图例（完成 / 没完成 / 新增 三个色块）。 */
		function ChartLegend(props) {
			ensureUiBase();
			return (0, react.createElement)("div", { className: "dtl-gchart-legend" }, (0, react.createElement)("span", null, (0, react.createElement)("i", { style: { background: "var(--dtl-business)" } }), props.doneLabel), (0, react.createElement)("span", null, (0, react.createElement)("i", { style: { background: "var(--dtl-chart-remaining)" } }), props.remainingLabel), (0, react.createElement)("span", null, (0, react.createElement)("i", { style: { background: "var(--dtl-chart-created)" } }), props.createdLabel));
		}
		//#endregion
		//#region src/client/task-row.ts
		/**
		* 任务列表行（宿主**无表格件** ⇒ 自绘，几何参照官方 `DisclosureRow`，状态走官方 `StateDot`）。
		* 定稿见 docs/design/features/board-home.md §二 与 docs/design/ui-style.md：
		* 状态语义 open=idle / doing=ongoing / blocked=warning / 已结案=done。
		*
		* 行展开 = 过程文档路径 + 过程正文（在办走 `GET /task` 取正文；已结案只有路径——
		* host 没有按历史行取正文的路由，不编造内容）。
		*
		* `showWorkspace`：第一区「我的待办」是跨工作区平铺 ⇒ 工作区升为一列（定宽，不再是
		* 和标签混在一起的小 chip）；第二区分组行由分组标题说明归属，行内不再重复。
		*/
		/** 行的状态点语义（在办三态 + 已结案）。 */
		function dotOf(row) {
			if (row.kind === "closed") return "done";
			if (row.task.status === "blocked") return "warning";
			if (row.task.status === "doing") return "ongoing";
			return "idle";
		}
		/** 行标题：在办 = 任务名（缺则任务号）；已结案 = 任务包名（缺则「完成了什么」首句）。 */
		function titleOf(row) {
			if (row.kind === "task") return row.task.title ?? row.task.id;
			const title = row.record.workpackage ?? row.record.summary;
			return title !== void 0 && title !== "" ? title : row.record.src ?? "—";
		}
		/** 行的「谁」：负责人优先，没有就创建人，都没有 = 未认领。 */
		function whoOf(row) {
			if (row.kind === "task") return row.task.owner ?? row.task.creator ?? null;
			return row.record.owner ?? null;
		}
		/** 工作区徽标（第一区专用列）：色块首字母 + 标题，定宽、超出省略（不猜官方图标名）。 */
		function WorkspaceTag(props) {
			if (props.workspace === void 0) return null;
			const initial = props.workspace.title.trim().slice(0, 1);
			return (0, react.createElement)("span", {
				className: "dtl-ellipsis",
				style: {
					display: "inline-flex",
					alignItems: "center",
					gap: "var(--dtl-space-1)",
					flex: "0 0 140px",
					minWidth: 0,
					color: "var(--dtl-fg-2)",
					fontSize: "var(--dtl-font-xs)"
				},
				title: props.workspace.title
			}, (0, react.createElement)("span", { style: {
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				flex: "none",
				width: "16px",
				height: "16px",
				borderRadius: "var(--dtl-radius-xs)",
				background: "var(--dtl-business-soft)",
				color: "var(--dtl-business)",
				fontSize: "10px",
				fontWeight: 600
			} }, initial === "" ? "·" : initial), props.workspace.title);
		}
		function TaskRowView(props) {
			const { t, row } = props;
			const [open, setOpen] = (0, react.useState)(false);
			const mdLabels = (0, react.useMemo)(() => ({
				code: {
					copyLabel: t("mdCopy"),
					copiedLabel: t("mdCopied")
				},
				footnotes: t("mdFootnotes")
			}), [t]);
			/** 行的时间：在办 doing/blocked 看开始、其余看创建；已结案看结案。 */
			const stamp = row.kind === "closed" ? {
				value: row.record.time ?? row.record.created ?? null,
				label: t("fieldFinished")
			} : row.task.status === "open" ? {
				value: row.task.created ?? null,
				label: t("fieldCreated")
			} : {
				value: row.task.started ?? row.task.created ?? null,
				label: t("fieldStarted")
			};
			const when = stamp.value === null || stamp.value === void 0 || stamp.value === "" ? t("timeUnknown") : formatDateTime(stamp.value, { fallback: t("timeUnknown") });
			const who = whoOf(row);
			const workspace = row.kind === "task" ? row.task.workspace : row.record.workspace;
			const category = row.kind === "task" ? row.task.category : row.record.category;
			const tags = (row.kind === "task" ? row.task.tags : row.record.tags) ?? [];
			const logPath = row.kind === "task" ? row.task.worklog : row.record.log;
			return (0, react.createElement)("div", {
				className: "dtl-row",
				"data-open": open
			}, (0, react.createElement)("button", {
				type: "button",
				className: "dtl-row-head",
				"aria-expanded": open,
				title: open ? t("collapseAria") : t("expandAria"),
				onClick: () => {
					setOpen(!open);
				}
			}, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: dotOf(row) }), props.showWorkspace === true ? (0, react.createElement)(WorkspaceTag, { workspace }) : null, (0, react.createElement)("span", {
				className: "dtl-ellipsis",
				style: {
					flex: "1 1 auto",
					minWidth: 0,
					fontSize: "var(--dtl-font-md)"
				},
				title: titleOf(row)
			}, titleOf(row)), category === null || category === void 0 || category === "" ? null : (0, react.createElement)(Chip, { text: category }), tags.slice(0, 2).map((tag) => (0, react.createElement)(Chip, {
				key: tag,
				text: `#${tag}`
			})), (0, react.createElement)("span", { style: {
				display: "flex",
				alignItems: "center",
				gap: "var(--dtl-space-2)",
				flex: "none",
				color: "var(--dtl-fg-3)",
				fontSize: "var(--dtl-font-xs)",
				whiteSpace: "nowrap"
			} }, (0, react.createElement)("span", { title: stamp.value ?? void 0 }, `${stamp.label} ${when}`), (0, react.createElement)("span", null, who === null || who === "" ? t("ownerUnclaimed") : `@${who}`)), (0, react.createElement)(open ? _deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular : _deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutlineRegular, { size: 16 })), open ? (0, react.createElement)("div", { className: "dtl-row-body" }, (0, react.createElement)("div", { style: {
				margin: "var(--dtl-space-2) 0",
				fontSize: "var(--dtl-font-sm)",
				color: "var(--dtl-fg-2)"
			} }, `${t("worklogTitle")}·${t("worklogPath")}：${logPath === null || logPath === void 0 || logPath === "" ? t("worklogMissing") : logPath}`), row.kind === "closed" ? (0, react.createElement)("div", { style: {
				fontSize: "var(--dtl-font-md)",
				color: "var(--dtl-fg-2)"
			} }, row.record.summary ?? "") : (0, react.createElement)(WorklogBody, {
				t,
				workspaceId: row.task.workspace.id,
				taskId: row.task.id,
				labels: mdLabels
			})) : null);
		}
		/** 在办行的过程正文：**展开才取**（首屏不为正文付代价），且只在挂载时取一次（不随重渲染重取）。 */
		function WorklogBody(props) {
			const { t, workspaceId, taskId, labels } = props;
			const [detail, setDetail] = (0, react.useState)(null);
			const [failed, setFailed] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				let alive = true;
				fetchTaskDetail(workspaceId, taskId).then((body) => {
					if (alive) setDetail(body);
				}).catch((error) => {
					if (alive) setFailed(error instanceof Error ? error.message : String(error));
				});
				return () => {
					alive = false;
				};
			}, [workspaceId, taskId]);
			if (failed !== null) return (0, react.createElement)("div", { style: {
				color: "var(--dtl-danger)",
				fontSize: "var(--dtl-font-sm)"
			} }, `${t("loadFailed")}：${failed}`);
			if (detail === null) return (0, react.createElement)("div", { style: {
				color: "var(--dtl-fg-3)",
				fontSize: "var(--dtl-font-sm)"
			} }, t("loading"));
			if (detail.worklog === null) return (0, react.createElement)("div", { style: {
				color: "var(--dtl-fg-3)",
				fontSize: "var(--dtl-font-sm)"
			} }, t("worklogMissing"));
			return (0, react.createElement)("div", { className: "dtl-worklog" }, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
				text: detail.worklog,
				labels,
				variant: "compact"
			}));
		}
		//#endregion
		//#region src/client/board-home.ts
		/**
		* 看板首页（`main` 槽整页内容）：6 统计卡 + 近 8 周趋势图 + 两区任务列表。
		* 定稿见 docs/design/features/board-home.md §二（2026-10-17 专家组改版）；
		* 按钮矩阵归「任务按钮与会话交接」任务（写入路径 A/B 未拍板），本页**不画**任务动作按钮。
		*
		* 刷新纪律（2026-10-17 拍板）：挂载首读 + 手动刷新按钮，**不轮询**；空态三分
		* （未就绪不渲染 / 真空引导卡 / 筛选空小字）。
		*/
		/** 整页容器：占满中栏、自己滚动。 */
		const pageStyle = {
			height: "100%",
			width: "100%",
			boxSizing: "border-box",
			overflow: "auto",
			padding: "24px 22px",
			color: "var(--dtl-fg)"
		};
		const headerStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: "var(--dtl-space-3)",
			flexWrap: "wrap",
			marginBottom: "var(--dtl-space-4)"
		};
		const titleStyle = {
			fontSize: "var(--dtl-font-xl)",
			fontWeight: 600
		};
		/** 统计区：左 8 块（2 行 × 4 列）+ 右趋势图，参考图同款分栏。
		*  列数写死 4 → 2（媒体查询在 ui.ts 的 .dtl-stats / .dtl-stats__cards 里），
		*  绝不给 3 列——3 列会排出 3+1 的非对称（用户 2026-10-17：必须上下对称）。 */
		const statsRowStyle = { marginBottom: "var(--dtl-space-4)" };
		const chartCardStyle = {
			display: "flex",
			flexDirection: "column",
			gap: "var(--dtl-space-2)",
			padding: "var(--dtl-space-2) var(--dtl-space-3)"
		};
		const filterRowStyle = {
			display: "flex",
			alignItems: "center",
			gap: "var(--dtl-space-2)",
			flexWrap: "wrap",
			marginBottom: "var(--dtl-space-3)"
		};
		const searchWrapStyle = {
			flex: "1 1 220px",
			minWidth: 0
		};
		const hintStyle = {
			fontSize: "var(--dtl-font-sm)",
			color: "var(--dtl-fg-2)"
		};
		const regionHeadStyle = {
			display: "flex",
			alignItems: "baseline",
			gap: "var(--dtl-space-2)",
			margin: "var(--dtl-space-4) 0 var(--dtl-space-2)",
			fontSize: "var(--dtl-font-lg)",
			fontWeight: 600
		};
		const groupHeadStyle = {
			display: "flex",
			alignItems: "center",
			gap: "var(--dtl-space-2)",
			width: "100%",
			padding: "var(--dtl-space-2) var(--dtl-space-3)",
			border: 0,
			borderRadius: "var(--dtl-radius-md)",
			background: "var(--dtl-surface-2)",
			color: "inherit",
			font: "inherit",
			textAlign: "left",
			cursor: "pointer"
		};
		const groupCountStyle = {
			fontSize: "var(--dtl-font-xs)",
			color: "var(--dtl-fg-3)",
			fontWeight: 400
		};
		/** 分组默认折叠阈值（组内太多条时先收起，用户点开）。 */
		const GROUP_COLLAPSE_OVER = 30;
		function BoardHome(props) {
			const { t, onBack } = props;
			ensureUiBase();
			const state = (0, react.useSyncExternalStore)(boardSubscribe, boardSnapshot);
			const [tab, setTab] = (0, react.useState)("tasks");
			(0, react.useEffect)(() => {
				refresh();
			}, []);
			const board = state.board;
			const view = (0, react.useMemo)(() => selectView(state), [state]);
			const stats = board?.stats;
			const days = (value) => value === null || value === void 0 ? t("daysNone") : t("daysValue", { n: value });
			/** 统计卡 → 筛选联动（卡即入口：点一下跳到对应视角）。 */
			const card = (label, value, hint, patch) => (0, react.createElement)(StatCard, {
				label: t(label),
				value,
				hint,
				active: isActive(state.query, patch),
				onClick: () => {
					setQuery(patch);
				}
			});
			/** 统计台卡：不可点（首页没有已结案可筛），hover 给具体日期区间。 */
			const periodCard = (label, period) => (0, react.createElement)(StatCard, {
				label: t(label),
				value: period?.done ?? 0,
				hint: t("statCreatedHint", { n: period?.created ?? 0 }),
				interactive: false,
				title: period === void 0 ? void 0 : t("periodRange", {
					from: period.from,
					to: period.to
				})
			});
			const [chartScope, setChartScope] = (0, react.useState)("all");
			const chartWeeks = (0, react.useMemo)(() => (board === null ? [] : board.closed.weekly[chartScope]).map((bucket) => ({
				label: bucket.week.slice(5),
				done: bucket.done,
				remaining: bucket.remaining,
				created: bucket.created,
				title: `${bucket.week}｜${t("chartLegendDone")} ${bucket.done}｜${t("chartLegendRemaining")} ${bucket.remaining}｜${t("chartLegendCreated")} ${bucket.created}`
			})), [
				board,
				chartScope,
				t
			]);
			const chartEmpty = chartWeeks.every((week) => week.done === 0 && week.created === 0 && week.remaining === 0);
			return (0, react.createElement)("div", { style: pageStyle }, (0, react.createElement)("div", { style: {
				display: "flex",
				justifyContent: "center"
			} }, (0, react.createElement)("div", { style: {
				width: "100%",
				maxWidth: "1280px",
				minWidth: 0,
				boxSizing: "border-box"
			} }, (0, react.createElement)("div", { style: headerStyle }, (0, react.createElement)("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: "var(--dtl-space-3)",
				minWidth: 0
			} }, (0, react.createElement)(Button, {
				variant: "outline",
				size: "md",
				onClick: onBack
			}, `← ${t("backToConversation")}`), (0, react.createElement)("div", { style: titleStyle }, t("panelTitle"))), (0, react.createElement)("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: "var(--dtl-space-2)"
			} }, (0, react.createElement)(Segmented, {
				id: "dtl-tab",
				value: tab,
				label: t("panelTitle"),
				items: [{
					value: "tasks",
					label: t("tabTasks")
				}, {
					value: "stats",
					label: t("tabStats")
				}],
				onChange: setTab
			}), (0, react.createElement)(Button, {
				variant: "outline",
				size: "md",
				icon: (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutlineRegular, { size: 16 }),
				disabled: state.refreshing,
				title: t("refresh"),
				onClick: () => {
					refresh();
				}
			}, state.refreshing ? t("refreshing") : t("refresh")))), tab === "stats" ? (0, react.createElement)("div", { style: hintStyle }, t("statsPlaceholder")) : (0, react.createElement)("div", null, stats === void 0 ? null : (0, react.createElement)("div", {
				className: "dtl-stats",
				style: statsRowStyle
			}, (0, react.createElement)("div", { className: "dtl-stats__cards" }, card("statMyActive", stats.myActive, t("statMyActiveHint", { n: stats.myBlocked }), {
				scope: "mine",
				status: "all",
				workspace: ""
			}), card("statOpen", stats.open, t("statOpenHint", { n: days(stats.oldestOpenDays) }), {
				scope: "all",
				status: "open",
				workspace: ""
			}), card("statDoing", stats.doing, t("statDoingHint", { n: stats.doing - stats.myActive + stats.myBlocked }), {
				scope: "all",
				status: "active",
				workspace: ""
			}), (0, react.createElement)(StatCard, {
				label: t("statBlockedStale"),
				value: stats.blocked,
				hint: stats.stale === 0 ? void 0 : (0, react.createElement)("span", null, (0, react.createElement)("span", { style: {
					color: "var(--dtl-danger)",
					fontWeight: 600
				} }, t("statStaleWord")), ` ${t("statStaleHint", { n: stats.stale })}`),
				active: isActive(state.query, {
					scope: "all",
					status: "blocked",
					workspace: ""
				}),
				title: t("statStaleTitle", { n: stats.staleDays }),
				onClick: () => {
					setQuery({
						scope: "all",
						status: "blocked",
						workspace: ""
					});
				}
			}), periodCard("statWeekDone", board?.trend.thisWeek), periodCard("statLastWeekDone", board?.trend.lastWeek), periodCard("statMonthDone", board?.trend.thisMonth), periodCard("statLastMonthDone", board?.trend.lastMonth)), (0, react.createElement)("div", {
				className: "dtl-card",
				style: chartCardStyle
			}, (0, react.createElement)("div", { style: {
				display: "flex",
				alignItems: "center",
				justifyContent: "flex-end"
			} }, (0, react.createElement)("label", { className: "dtl-check" }, (0, react.createElement)("input", {
				type: "checkbox",
				checked: chartScope === "mine",
				onChange: (event) => {
					setChartScope(event.target.checked ? "mine" : "all");
				}
			}), t("chartOnlyMine"))), chartEmpty ? (0, react.createElement)("div", { style: {
				...hintStyle,
				padding: "var(--dtl-space-4) 0"
			} }, t("chartEmpty")) : (0, react.createElement)(GroupedBarChart, {
				weeks: chartWeeks,
				ariaLabel: t("chartTitle"),
				doneLabel: t("chartLegendDone"),
				remainingLabel: t("chartLegendRemaining"),
				createdLabel: t("chartLegendCreated")
			}), (0, react.createElement)(ChartLegend, {
				doneLabel: t("chartLegendDone"),
				remainingLabel: t("chartLegendRemaining"),
				createdLabel: t("chartLegendCreated")
			}))), (0, react.createElement)("div", { style: filterRowStyle }, (0, react.createElement)(Segmented, {
				id: "dtl-scope",
				value: state.query.scope,
				label: t("scopeLabel"),
				items: [{
					value: "mine",
					label: t("scopeMine")
				}, {
					value: "all",
					label: t("scopeAll")
				}],
				onChange: (next) => {
					setQuery({ scope: next });
				}
			}), (0, react.createElement)(Segmented, {
				id: "dtl-status",
				value: state.query.status,
				label: t("statusLabel"),
				items: [
					{
						value: "all",
						label: t("statusAll")
					},
					{
						value: "active",
						label: t("statusActive")
					},
					{
						value: "open",
						label: t("statusOpen")
					},
					{
						value: "blocked",
						label: t("statusBlocked")
					},
					{
						value: "stale",
						label: t("statusStale")
					}
				],
				onChange: (next) => {
					setQuery({ status: next });
				}
			}), (0, react.createElement)(Select, {
				value: state.query.workspace,
				ariaLabel: t("workspaceLabel"),
				width: 180,
				options: [{
					value: "",
					label: t("workspaceAll")
				}, ...(board?.workspaces ?? []).map((workspace) => ({
					value: workspace.id,
					label: workspace.title
				}))],
				onChange: (next) => {
					setQuery({ workspace: next });
				}
			}), (0, react.createElement)("div", { style: searchWrapStyle }, (0, react.createElement)(SearchInput, {
				value: state.query.keyword,
				placeholder: t("searchPlaceholder"),
				ariaLabel: t("searchPlaceholder"),
				onChange: (next) => {
					setQuery({ keyword: next });
				}
			}))), state.status === "loading" && board === null ? null : state.status === "error" && board === null ? (0, react.createElement)("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: "var(--dtl-space-2)"
			} }, (0, react.createElement)("span", { style: {
				color: "var(--dtl-danger)",
				fontSize: "var(--dtl-font-md)"
			} }, `${t("loadFailed")}：${state.error ?? ""}`), (0, react.createElement)(Button, {
				variant: "outline",
				size: "sm",
				onClick: () => {
					refresh();
				}
			}, t("retry"))) : board !== null && board.workspaces.length === 0 ? (0, react.createElement)(EmptyState, {
				tone: "guide",
				title: t("emptyNoWorkspace"),
				hint: t("emptyNoWorkspaceHint")
			}) : view.total === 0 ? (0, react.createElement)(EmptyState, {
				tone: isPristine(state.query) ? "guide" : "filtered",
				title: isPristine(state.query) ? t("emptyNoTask") : t("emptyFiltered"),
				hint: isPristine(state.query) ? t("emptyNoTaskHint") : void 0
			}) : (0, react.createElement)("div", null, view.mine.length === 0 ? null : (0, react.createElement)("div", null, (0, react.createElement)("div", { style: regionHeadStyle }, (0, react.createElement)("span", null, `${t("regionMine")} ${view.mine.length}`), (0, react.createElement)("span", { style: {
				fontSize: "var(--dtl-font-xs)",
				color: "var(--dtl-fg-3)",
				fontWeight: 400
			} }, t("regionMineHint"))), view.mine.map((row) => (0, react.createElement)(TaskRowView, {
				key: row.key,
				t,
				row,
				showWorkspace: true
			}))), view.groups.length === 0 ? null : (0, react.createElement)("div", null, (0, react.createElement)("div", { style: regionHeadStyle }, (0, react.createElement)("span", null, t("regionWorkspaces")), (0, react.createElement)("span", { style: {
				fontSize: "var(--dtl-font-xs)",
				color: "var(--dtl-fg-3)",
				fontWeight: 400
			} }, t("showingCount", { n: view.total - view.mine.length }))), view.groups.map((group) => (0, react.createElement)(WorkspaceGroupView, {
				key: group.workspaceId,
				t,
				group
			}))))))));
		}
		/** 一个工作区分组：标题行（可点折叠）+ 行列表。 */
		function WorkspaceGroupView(props) {
			const { t, group } = props;
			const [open, setOpen] = (0, react.useState)(group.rows.length <= GROUP_COLLAPSE_OVER);
			return (0, react.createElement)("div", { style: { marginBottom: "var(--dtl-space-3)" } }, (0, react.createElement)("button", {
				type: "button",
				className: "dtl-row-head",
				style: groupHeadStyle,
				"aria-expanded": open,
				title: open ? t("collapseAria") : t("expandAria"),
				onClick: () => {
					setOpen(!open);
				}
			}, (0, react.createElement)("span", {
				className: "dtl-ellipsis",
				style: {
					flex: "1 1 auto",
					fontSize: "var(--dtl-font-md)",
					fontWeight: 600
				}
			}, group.title), (0, react.createElement)("span", { style: groupCountStyle }, t("groupHint", {
				doing: group.doingCount,
				open: group.openCount
			}))), open ? (0, react.createElement)("div", { style: { marginTop: "var(--dtl-space-2)" } }, group.rows.map((row) => (0, react.createElement)(TaskRowView, {
				key: row.key,
				t,
				row
			}))) : null);
		}
		/** 卡片高亮：当前 query 是否正好落在该卡对应的视角上。 */
		function isActive(query, patch) {
			return Object.entries(patch).every(([key, value]) => query[key] === value);
		}
		/** 是否「什么都没筛」：真空才给引导卡，一有筛选就只能是「筛选空」。 */
		function isPristine(query) {
			return query.scope === "all" && query.status === "all" && query.workspace === "" && query.keyword.trim() === "";
		}
		//#endregion
		//#region src/client/locales.ts
		/** 中文（默认档）。 */
		const zh = {
			backToConversation: "返回会话",
			panelTitle: "任务台账",
			tabTasks: "任务",
			tabStats: "统计",
			refresh: "刷新",
			refreshing: "刷新中",
			loading: "读取中…",
			retry: "重试",
			loadFailed: "读取失败",
			statsPlaceholder: "统计报表尚未开建（另立任务）：这里以后放分类分布、按人完成数、时间线。",
			statMyActive: "我的待办",
			statMyActiveHint: "阻塞 {n} 条",
			statOpen: "待认领",
			statOpenHint: "最长未认领 {n}",
			statDoing: "进行中",
			statDoingHint: "其他成员负责 {n} 条",
			statBlockedStale: "阻塞 · 停滞",
			statStaleWord: "停滞",
			statStaleHint: "{n} 条",
			statStaleTitle: "停滞 = 进行中或阻塞超过 {n} 天未更新",
			statWeekDone: "本周完成",
			statLastWeekDone: "上周完成",
			statMonthDone: "本月完成",
			statLastMonthDone: "上月完成",
			statCreatedHint: "新增 {n} 条",
			daysNone: "—",
			daysValue: "{n} 天",
			chartTitle: "近 8 周",
			chartCaption: "完成（按结案时间）/ 新增（按创建时间），周一起桶；我的 = owner 是我",
			chartBucket: "{week} 当周：完成 {done} 条，新增 {created} 条",
			chartEmpty: "近 8 周没有记录",
			chartScopeAll: "所有",
			chartScopeMine: "我的",
			chartOnlyMine: "只看我的",
			chartLegendDone: "完成",
			chartLegendCreated: "新增",
			chartLegendRemaining: "未结",
			chartAvg: "周均 {n}",
			periodRange: "{from} ~ {to}",
			scopeLabel: "范围",
			scopeMine: "我的",
			scopeAll: "全部工作区",
			statusLabel: "状态",
			statusAll: "全部",
			statusActive: "进行中",
			statusOpen: "待认领",
			statusBlocked: "阻塞",
			statusStale: "停滞",
			workspaceLabel: "工作区",
			workspaceAll: "全部工作区",
			searchPlaceholder: "搜索标题 / 任务号 / 人 / 分类 / 标签",
			regionMine: "我的待办",
			regionMineHint: "跨工作区，按创建时间倒序",
			regionWorkspaces: "按工作区",
			groupHint: "进行中 {doing} ｜ 待认领 {open}",
			showingCount: "显示 {n} 条",
			expandAria: "展开过程文档",
			collapseAria: "收起",
			ownerUnclaimed: "待认领",
			fieldCreated: "创建",
			fieldStarted: "开始",
			fieldFinished: "结案",
			timeUnknown: "时间未知",
			worklogTitle: "过程文档",
			worklogPath: "路径",
			worklogMissing: "（缺失）",
			mdCopy: "复制",
			mdCopied: "已复制",
			mdFootnotes: "脚注",
			emptyNoWorkspace: "还没有台账工作区",
			emptyNoWorkspaceHint: "在某个项目里跑 task-ledger skill 的 init 建档（生成 ledger/progress.json），这里就会出现它。",
			emptyNoTask: "一条任务都没有",
			emptyNoTaskHint: "用 task-ledger skill 的 new 开一个任务，或让别人开在这里等你认领。",
			emptyFiltered: "没有符合当前筛选的任务",
			badgeTitle: "我名下待办",
			openBoard: "打开任务台账"
		};
		/** English（与 zh 键完全对齐）。 */
		const en = {
			backToConversation: "Back to chat",
			panelTitle: "Task ledger",
			tabTasks: "Tasks",
			tabStats: "Stats",
			refresh: "Refresh",
			refreshing: "Refreshing",
			loading: "Loading…",
			retry: "Retry",
			loadFailed: "Load failed",
			statsPlaceholder: "Stats reports are not built yet (separate task): category breakdown, completions by person, timeline.",
			statMyActive: "My todos",
			statMyActiveHint: "blocked {n}",
			statOpen: "Unclaimed",
			statOpenHint: "longest unclaimed {n}",
			statDoing: "In progress",
			statDoingHint: "owned by other members: {n}",
			statBlockedStale: "Blocked · Stale",
			statStaleWord: "Stale",
			statStaleHint: "{n}",
			statStaleTitle: "stale = active or blocked with no update for {n}+ days",
			statWeekDone: "Done this week",
			statLastWeekDone: "Done last week",
			statMonthDone: "Done this month",
			statLastMonthDone: "Done last month",
			statCreatedHint: "{n} created",
			daysNone: "—",
			daysValue: "{n}d",
			chartTitle: "Last 8 weeks",
			chartCaption: "done (by close time) / created (by create time), weeks start Monday; mine = owner is me",
			chartBucket: "week of {week}: {done} done, {created} created",
			chartEmpty: "Nothing in the last 8 weeks",
			chartScopeAll: "All",
			chartScopeMine: "Mine",
			chartOnlyMine: "Mine only",
			chartLegendDone: "Done",
			chartLegendCreated: "Created",
			chartLegendRemaining: "Outstanding",
			chartAvg: "avg {n}/wk",
			periodRange: "{from} ~ {to}",
			scopeLabel: "Scope",
			scopeMine: "Mine",
			scopeAll: "All workspaces",
			statusLabel: "Status",
			statusAll: "All",
			statusActive: "Active",
			statusOpen: "Unclaimed",
			statusBlocked: "Blocked",
			statusStale: "Stale",
			workspaceLabel: "Workspace",
			workspaceAll: "All workspaces",
			searchPlaceholder: "Search title / id / person / category / tag",
			regionMine: "My todos",
			regionMineHint: "across workspaces, newest first",
			regionWorkspaces: "By workspace",
			groupHint: "{doing} active ｜ {open} unclaimed",
			showingCount: "{n} shown",
			expandAria: "Expand worklog",
			collapseAria: "Collapse",
			ownerUnclaimed: "unclaimed",
			fieldCreated: "created",
			fieldStarted: "started",
			fieldFinished: "closed",
			timeUnknown: "unknown time",
			worklogTitle: "Worklog",
			worklogPath: "path",
			worklogMissing: "(missing)",
			mdCopy: "Copy",
			mdCopied: "Copied",
			mdFootnotes: "Footnotes",
			emptyNoWorkspace: "No ledger workspace yet",
			emptyNoWorkspaceHint: "Run the task-ledger skill init in a project (creates ledger/progress.json) and it shows up here.",
			emptyNoTask: "No tasks yet",
			emptyNoTaskHint: "Create one with the task-ledger skill new, or leave one here for others to claim.",
			emptyFiltered: "No tasks match the current filters",
			badgeTitle: "my todos",
			openBoard: "Open task ledger"
		};
		/** 把宿主给的无参 t 包成带占位符替换的 t（模板一律 `{name}`，不依赖宿主是否支持 params）。 */
		function interpolateTranslate(base) {
			return (key, params) => {
				const raw = base(key);
				if (params === void 0) return raw;
				return raw.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match);
			};
		}
		/** 键名兜底：宿主没给 t 席位时用（键名绝不上界面）。 */
		function fallbackTranslate(key, params) {
			return interpolateTranslate((name) => zh[name] ?? name)(key, params);
		}
		//#endregion
		//#region src/client/overlay-entry.ts
		/**
		* 右上浮标入口（`shell.overlay` list 条目，全帧浮层，条目并排添加不替换）。
		* 定位用宿主变量 `--dsh-frame-overlay-top`（标题栏净空 + 20px），**不写死 top 值**；
		* 浮层默认 `pointer-events:none`、子元素自动恢复 ⇒ 自绘条目不挡下方应用。
		*
		* 角标 = 我名下 `doing` + `blocked` 计数（host 统计真值，SSE 已否 ⇒ 取自同一份快照，>0 才画）；
		* 0→n 跳变时一次脉冲动画，不自动消失。宿主**无**通知 API ⇒ 「通知」就是这个角标。
		*/
		function OverlayEntry(props) {
			const { t, onOpen } = props;
			ensureUiBase();
			const count = (0, react.useSyncExternalStore)(boardSubscribe, boardSnapshot).board?.stats.myActive ?? 0;
			const previous = (0, react.useRef)(0);
			const [pulse, setPulse] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				if (count > previous.current) setPulse((value) => value + 1);
				previous.current = count;
			}, [count]);
			return (0, react.createElement)("div", { style: {
				position: "absolute",
				top: "var(--dsh-frame-overlay-top,20px)",
				right: "12px",
				zIndex: "var(--dtl-z-badge,20)",
				pointerEvents: "auto"
			} }, (0, react.createElement)("button", {
				type: "button",
				title: t("openBoard"),
				"aria-label": t("openBoard"),
				onClick: onOpen,
				style: {
					position: "relative",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					width: "32px",
					height: "32px",
					padding: 0,
					border: "1px solid var(--dtl-border)",
					borderRadius: "var(--dtl-radius-sm)",
					background: "var(--dtl-solid)",
					color: "var(--dtl-on-solid)",
					boxShadow: "var(--dtl-shadow-1)",
					cursor: "pointer"
				}
			}, (0, react.createElement)(LedgerIcon, { size: 18 }), count > 0 ? (0, react.createElement)("span", {
				key: pulse,
				className: "dtl-badge",
				"data-pulse": pulse > 0,
				title: t("badgeTitle")
			}, String(count)) : null));
		}
		//#endregion
		//#region src/client/index.ts
		/**
		* 浏览器半入口（client bundle，产物 dist/client.js）：装配层，不写业务逻辑。
		*
		* 三处注册各自挂进「服务就位才触发」的 slots 注入（参考插件真机教训：顶层 inject 声明
		* 组合满足不了的依赖会让 entry 一直 pending、卡死整个 dsh 启动）：
		*  · locale 字典（zh / en）——界面语言跟随宿主，插件不自备开关；
		*  · `main` keyed 槽整页（看板首页）；
		*  · `shell.overlay` list 槽浮标入口（点开 = `ctx.layout.selectPanel(<看板 id>)`）。
		*
		* 宿主能力一律**本地结构化声明**，不 import 官方包（rc 接口会无声变）；
		* `t` 席位由宿主渲染器按注册项的 `locale:` 声明合成进组件 props。
		*/
		/** 命名空间（settings / locale / 面板 id 同名，便于对应）。 */
		/** 模块级 t 席位（侧栏 label 渲染期求值用；绑不上就回落键名，绝不上界面）。 */
		let runtimeT = (key) => key;
		const NS = "dsh-task-ledger";
		/** `main` 槽的 key（非 `conversation` ⇒ 不绑 Session）。 */
		const PANEL_ID = NS;
		/** `shell.overlay` list 条目的 id（新 id = 并排添加，不替换宿主条目）。 */
		const OVERLAY_ID = `${NS}-badge`;
		/** 宿主没给 t 席位时的兜底（键名绝不上界面）。 */
		const t = interpolateTranslate((key, params) => fallbackTranslate(key, params));
		function apply(ctx) {
			ctx.inject(["locale"], (localeCtx) => {
				ctx.effect(() => localeCtx.locale?.register(NS, {
					zh,
					en
				}));
				try {
					runtimeT = localeCtx.locale?.bind(NS) ?? runtimeT;
				} catch {}
			});
			let selectPanel = () => {};
			ctx.inject(["layout"], (sub) => {
				const layout = sub.layout;
				if (layout !== void 0) selectPanel = (id) => {
					layout.selectPanel(id);
				};
			});
			ctx.inject(["slots"], (sub) => {
				sub.slots.inject("sidebar.panellist", () => sub.slots.register({
					name: "sidebar.panellist",
					id: PANEL_ID,
					order: 30,
					label: () => runtimeT("panelTitle"),
					locale: NS
				}, (props) => (0, react.createElement)(LedgerIcon, { size: props.size ?? 18 })));
				sub.slots.inject("main", () => sub.slots.register({
					name: "main",
					key: PANEL_ID,
					locale: NS
				}, (props) => (0, react.createElement)(BoardHome, {
					t: props.t ?? t,
					onBack: () => {
						selectPanel(null);
					}
				})));
				sub.slots.inject("shell.overlay", () => sub.slots.register({
					name: "shell.overlay",
					id: OVERLAY_ID,
					locale: NS
				}, (props) => (0, react.createElement)(OverlayEntry, {
					t: props.t ?? t,
					onOpen: () => {
						selectPanel(PANEL_ID);
					}
				})));
			});
		}
		//#endregion
		exports.apply = apply;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map