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
		/** 已结案列表（服务端按窗口 / 标签 / 分页过滤）。 */
		function fetchHistory(params) {
			const query = new URLSearchParams();
			if (params.since !== void 0) query.set("since", params.since);
			if (params.until !== void 0) query.set("until", params.until);
			if (params.tag !== void 0 && params.tag !== "") query.set("tag", params.tag);
			if (params.limit !== void 0) query.set("limit", String(params.limit));
			const suffix = query.toString();
			return fetchJson(`/history${suffix === "" ? "" : `?${suffix}`}`).then((body) => body.records ?? []);
		}
		/** 单条在办 + 过程文档正文（展开行用）。 */
		function fetchTaskDetail(workspaceId, taskId) {
			return fetchJson(`/task?${new URLSearchParams({
				ws: workspaceId,
				id: taskId
			}).toString()}`);
		}
		/** 筛选项候选（在办全量 + 近 13 个月历史的去重 owner / category / tag）。 */
		function fetchFilters() {
			return fetchJson("/filters");
		}
		//#endregion
		//#region src/client/format.ts
		/**
		* 客户端时间口径**单源**：补零 / 时刻串 / 时间范围 → `--since` / `--until`。
		* 走**本机时区**；解析失败按调用方给的兜底返回（不编造时间）。
		*
		* ⚠️ 与 skill 脚本的边界一致：`--since` 取当天 00:00、`--until` 只给日期时含当天整天
		* （脚本 `normalize_time` 的 `date_only_ref="23:59:59"`），故这里只拼 `YYYY-MM-DD`。
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
		/** 周一 00:00 所在日期（与 host `board.ts` 的 `mondayDateString` 同口径：周一为一周之始）。 */
		function mondayOf(now) {
			const date = new Date(now);
			date.setDate(date.getDate() - (date.getDay() + 6) % 7);
			return date;
		}
		/**
		* 时间范围 → `{ since, until }`（`YYYY-MM-DD`，含边界）。`all` 返回空对象 = 不拼参数。
		* 近一年 = 今天往前推 365 天（与统计卡「近 13 个月文件」不同口径：那是文件窗口，这是创建时间过滤）。
		*/
		function rangeToDates(range, now = /* @__PURE__ */ new Date()) {
			const ymd = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
			if (range === "week") return {
				since: ymd(mondayOf(now)),
				until: ymd(now)
			};
			if (range === "month") return {
				since: ymd(new Date(now.getFullYear(), now.getMonth(), 1)),
				until: ymd(now)
			};
			if (range === "year") {
				const start = new Date(now);
				start.setDate(start.getDate() - 365);
				return {
					since: ymd(start),
					until: ymd(now)
				};
			}
			return {};
		}
		/** 任务行是否落在时间范围内（在办侧在浏览器里筛；无创建时间的行按「不带时间过滤」处理）。 */
		function withinRange(created, since, until) {
			if (since === void 0 && until === void 0) return true;
			if (created === null || created === void 0 || created === "") return false;
			const day = created.slice(0, 10);
			if (since !== void 0 && day < since) return false;
			if (until !== void 0 && day > until) return false;
			return true;
		}
		let state = {
			status: "loading",
			board: null,
			error: null,
			history: [],
			historyStatus: "idle",
			historyError: null,
			filters: null,
			query: {
				bucket: "all",
				range: "all",
				tag: "",
				keyword: "",
				limit: 500
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
		/** 重读：在办快照 + 筛选项 +（已结案档时）历史列表。 */
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
				loadFilters(token);
				if (state.query.bucket === "closed") await loadHistory(token);
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
		async function loadFilters(token) {
			try {
				const filters = await fetchFilters();
				if (token === runToken) set({ filters });
			} catch {}
		}
		async function loadHistory(token) {
			const { range, tag, limit } = state.query;
			const dates = rangeToDates(range);
			set({
				historyStatus: "loading",
				historyError: null
			});
			try {
				const records = await fetchHistory({
					...dates,
					tag,
					limit
				});
				if (token !== runToken) return;
				set({
					history: records,
					historyStatus: "ready"
				});
			} catch (error) {
				if (token !== runToken) return;
				set({
					historyStatus: "error",
					historyError: error instanceof Error ? error.message : String(error)
				});
			}
		}
		/** 改筛选：已结案档要重取历史（服务端过滤）；在办档只在浏览器里重筛（数据已全）。 */
		function setQuery(patch) {
			const query = {
				...state.query,
				...patch
			};
			set({ query });
			if (query.bucket === "closed") loadHistory(++runToken);
		}
		/** 「加载更多」：加大 limit 重取（skill 脚本无 offset，笨办法；500 条一页无感）。 */
		function loadMoreHistory() {
			setQuery({ limit: state.query.limit + 500 });
		}
		//#endregion
		//#region src/client/rows.ts
		/**
		* 列表行的筛选 / 排序（**唯一**实现，纯函数、不碰网络）：页面只渲染，不各写一份过滤。
		*
		* 单独成文件是为了能被冒烟直测（store.ts 引 api.ts，Node 剥类型解析不了无扩展名相对导入）。
		*/
		/** 关键字命中（标题 / 任务号 / 人 / 分类 / 标签；已结案另含「完成了什么」）。 */
		function hitKeyword(keyword, parts) {
			const needle = keyword.trim().toLowerCase();
			if (needle === "") return true;
			return parts.some((part) => part?.toLowerCase().includes(needle) === true);
		}
		/**
		* 当前筛选下的列表行：
		*  - 已结案档：history 由服务端按窗口 / 标签 / 分页过滤，浏览器只补关键字；
		*  - 在办三档：快照已含全部在办 ⇒ 全在浏览器里筛（档位 / 时间 / 标签 / 关键字）。
		*/
		function selectRows(current) {
			const { board, history, query } = current;
			if (query.bucket === "closed") return history.filter((record) => hitKeyword(query.keyword, [
				record.summary,
				record.workpackage,
				record.owner,
				record.category,
				...record.tags ?? []
			])).map((record, index) => ({
				kind: "closed",
				key: `${record.src ?? ""}:${record.time ?? ""}:${index}`,
				record
			}));
			const dates = rangeToDates(query.range);
			return (board?.tasks ?? []).filter((task) => {
				if (query.bucket === "open" && task.status !== "open") return false;
				if (query.bucket === "mine" && !isMine(task, board)) return false;
				if (!withinRange(task.created, dates.since, dates.until)) return false;
				if (query.tag !== "" && !(task.tags ?? []).includes(query.tag)) return false;
				return hitKeyword(query.keyword, [
					task.title,
					task.id,
					task.owner,
					task.creator,
					task.category,
					...task.tags ?? []
				]);
			}).sort((a, b) => String(b.created ?? b.started ?? "").localeCompare(String(a.created ?? a.started ?? ""))).map((task) => ({
				kind: "task",
				key: `${task.workspace.id}:${task.id}`,
				task,
				mine: isMine(task, board)
			}));
		}
		/** 「我的」判定：owner = 该工作区的当前 git 身份，且状态是 doing / blocked（与 host 统计同口径）。 */
		function isMine(task, board) {
			if (board === null) return false;
			const identity = board.identities[task.workspace.id] ?? null;
			if (identity === null || identity === "") return false;
			return task.owner === identity && (task.status === "doing" || task.status === "blocked");
		}
		//#endregion
		//#region src/client/tokens.ts
		/**
		* 语义 token 层：`--dtl-*`（dtl = dsh-task-ledger）。
		*
		* 规矩（与 docs/design/ui-style.md 两条硬约束一致）：
		*  - **只有本文件定义 `--dtl-*`**；其它文件一律 `var(--dtl-*)` 消费，不许直接写 `var(--dsw-*)`；
		*  - 每个 token 都带兜底值 ⇒ 宿主升级换名时不炸（最坏退到兜底色，不会白屏）；
		*  - 明暗差异只写在本文件末尾的 `body[data-ds-dark-theme]` 段：能靠宿主 alias 表达的
		*    一律不写覆盖（alias 自己随主题变），只有「固定中性面 / 半透明底」这类 alias 表达不了的才进该段。
		*
		* 明暗判据 = `body[data-ds-dark-theme]`（宿主 0.2.0-rc.2 源码核实：启动脚本 toggleAttribute 写入）。
		* 插件**禁用** `prefers-color-scheme`（它跟系统、不跟用户在宿主里的选择）。
		* 因为判据是纯 CSS 选择器 ⇒ 宿主切主题即生效，**不需要 MutationObserver**。
		*
		* 挂载点 = `body`：插件界面（含将来 portal 到 body 的弹层）全在 body 内，零调用点成本。
		*/
		const UI_TOKENS_CSS = `
body{
  /* ── 文字四档 ─────────────────────────────────────────────────── */
  --dtl-fg:var(--dsw-alias-label-primary,#1f2328);
  --dtl-fg-2:var(--dsw-alias-label-secondary,#5c6370);
  --dtl-fg-3:var(--dsw-alias-label-tertiary,#767d87);
  --dtl-fg-4:var(--dsw-alias-label-caption,#9aa1ab);
  /* 反色面上的字（角标 / 实心钮）：暗色下是 bluish-1000 ⇒ 用 -foreground 而非 -inverted */
  --dtl-fg-inverse:var(--dsw-alias-label-primary-foreground,#fff);

  /* ── 面 ──────────────────────────────────────────────────────── */
  --dtl-surface-1:var(--dsw-alias-bg-layer-1,#fff);
  --dtl-surface-2:var(--dsw-alias-bg-layer-2,#fff);
  --dtl-surface-base:var(--dsw-alias-bg-base,#fff);
  /* 固定中性实面（自绘浮标 / 角标这类必须自己变的东西） */
  --dtl-solid:var(--dsw-static-neutral-00,#fff);
  --dtl-on-solid:var(--dsw-alias-label-primary,#1f2328);

  /* ── 描边 ────────────────────────────────────────────────────── */
  --dtl-border:var(--dsw-alias-border-l2,#0000001a);
  --dtl-border-strong:var(--dsw-alias-border-l3,#0000001f);

  /* ── 语义色 ──────────────────────────────────────────────────── */
  /* 蓝色强调 / 选中一律走这条（不是 --dsw-alias-brand-primary：它明色近黑、暗色近白） */
  --dtl-business:var(--dsw-alias-state-business-primary,#3b5bdb);
  --dtl-success:var(--dsw-alias-state-success-primary,#22c55e);
  /* ⚠️ 宿主是 state-warn（不是 state-warning，后者无此定义） */
  --dtl-warning:var(--dsw-alias-state-warn-primary,#f59e0b);
  --dtl-danger:var(--dsw-alias-state-error-primary,#ec1313);
  /* 语义色实面上的字（角标）：红绿黄都是中调 ⇒ 白字两个主题都可读 */
  --dtl-on-signal:#fff;
  /* 语义色浅底：用 color-mix 现算 ⇒ 状态色跟随宿主 alias，主题一换自动成立 */
  --dtl-business-soft:color-mix(in srgb,var(--dtl-business) 8%,transparent);
  --dtl-success-soft:color-mix(in srgb,var(--dtl-success) 8%,transparent);
  --dtl-warning-soft:color-mix(in srgb,var(--dtl-warning) 8%,transparent);
  --dtl-danger-soft:color-mix(in srgb,var(--dtl-danger) 8%,transparent);

  /* ── 交互底 ──────────────────────────────────────────────────── */
  --dtl-hover:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));
  /* 展开行底：带透明度的蓝，透出卡片底色（灰底跟斑马纹分不出来） */
  --dtl-open-bg:rgba(37,99,235,.10);
  --dtl-open-bg-soft:rgba(37,99,235,.05);
  /* chip / 标签小底板：浅色下要看得见 ⇒ 掺 7% 近黑；hover 加倍 */
  --dtl-chip-bg:rgba(15,15,15,.07);
  --dtl-chip-bg-hover:rgba(15,15,15,.14);

  /* ── 圆角 / 间距 / 控件高度 / 字号 ────────────────────────────── */
  --dtl-radius-sm:var(--dsw-radius-sm,8px);
  --dtl-radius-md:var(--dsw-radius-md,12px);
  --dtl-radius-lg:var(--dsw-radius-lg,16px);
  --dtl-space-1:4px;
  --dtl-space-2:8px;
  --dtl-space-3:12px;
  --dtl-space-4:16px;
  --dtl-control-h-sm:24px;
  --dtl-control-h-md:28px;
  --dtl-control-h-lg:32px;
  --dtl-font-xs:var(--dsw-font-xxxs-11-font-size,11px);
  --dtl-font-sm:var(--dsw-font-xxs-12-font-size,12px);
  --dtl-font-md:var(--dsw-font-xs-13-font-size,13px);
  --dtl-font-lg:var(--dsw-font-s-14-font-size,14px);
  --dtl-font-xl:var(--dsw-font-base-16-font-size,16px);
  --dtl-font-mono:var(--ds-font-family-code,monospace);

  /* ── 投影 / 动效 / 层级 ──────────────────────────────────────── */
  --dtl-shadow-1:var(--dsw-elevation-soft,0 4px 16px 0 #00000008);
  --dtl-shadow-2:var(--dsw-shadow-lv3,0 12px 32px 0 #00000014);
  --dtl-dur:var(--ds-transition-duration,.2s);
  --dtl-ease:var(--ds-ease-in-out,cubic-bezier(.4,0,.2,1));
  --dtl-z-badge:20;
}

/* ── 明暗差异的唯一落点 ─────────────────────────────────────────
   只放 alias 表达不了的固定面 / 半透明底；颜色若能靠 alias 自动跟随，一律不写在这里。 */
body[data-ds-dark-theme]{
  --dtl-solid:var(--dsw-static-neutral-900,#0f0f0f);
  --dtl-on-solid:var(--dsw-static-neutral-00,#fff);
  /* 暗色下蓝要更亮、透明度更高才压得住深底 */
  --dtl-open-bg:rgba(96,165,250,.18);
  --dtl-open-bg-soft:rgba(96,165,250,.08);
  /* 暗色 chip 底板反过来掺白 */
  --dtl-chip-bg:rgba(255,255,255,.08);
  --dtl-chip-bg-hover:rgba(255,255,255,.16);
  /* 语义色浅底在深色下压到 5%（8% 在深底上偏重） */
  --dtl-business-soft:color-mix(in srgb,var(--dtl-business) 5%,transparent);
  --dtl-success-soft:color-mix(in srgb,var(--dtl-success) 5%,transparent);
  --dtl-warning-soft:color-mix(in srgb,var(--dtl-warning) 5%,transparent);
  --dtl-danger-soft:color-mix(in srgb,var(--dtl-danger) 5%,transparent);
}
`;
		//#endregion
		//#region src/client/ui.ts
		/**
		* UI 基础层：样式单源 + 共用元件。
		*
		* 两条纪律（用户 2026-10-17 要求「该抽象的必须抽象」）：
		*  1. **样式**：所有颜色 / 圆角 / 字号一律 `var(--dtl-*)`（定义只在 tokens.ts），
		*     任何文件不许再写第二份 `var(--dsw-*)`、也不许自造 `--dtl-*`；
		*     需要 hover / focus / 动画的（内联样式表达不了）才有资格进这里的 `UI_BASE_CSS`。
		*  2. **元件**：卡 / chip / 下拉 / 空态 / 搜索框各只有一份实现，页面与浮标共用。
		*/
		/** 基础层样式（幂等注入；只装 hover / focus / 动画这些内联样式写不了的部分）。 */
		const UI_BASE_CSS = `
/* 统计卡：可点、hover 抬底、选中走蓝描边 + 浅蓝底 */
.dtl-card{
  display:flex;flex-direction:column;gap:var(--dtl-space-1);
  padding:var(--dtl-space-3) var(--dtl-space-4);
  border:1px solid var(--dtl-border);border-radius:var(--dtl-radius-md);
  background:var(--dtl-surface-1);color:var(--dtl-fg);
  cursor:pointer;text-align:left;font:inherit;
  transition:background var(--dtl-dur) var(--dtl-ease),border-color var(--dtl-dur) var(--dtl-ease);
}
.dtl-card:hover{background:var(--dtl-hover)}
.dtl-card[aria-pressed="true"]{border-color:var(--dtl-business);background:var(--dtl-business-soft)}
.dtl-card:focus-visible{outline:2px solid var(--dtl-business);outline-offset:2px}

/* 列表行：头部可点，hover 抬底；展开行走 --dtl-open-bg */
.dtl-row{border:1px solid var(--dtl-border);border-radius:var(--dtl-radius-md);overflow:hidden}
.dtl-row + .dtl-row{margin-top:var(--dtl-space-2)}
.dtl-row-head{
  display:flex;align-items:center;gap:var(--dtl-space-2);
  width:100%;padding:var(--dtl-space-3);border:0;background:transparent;
  color:inherit;font:inherit;text-align:left;cursor:pointer;
  transition:background var(--dtl-dur) var(--dtl-ease);
}
.dtl-row-head:hover{background:var(--dtl-hover)}
.dtl-row-head:focus-visible{outline:2px solid var(--dtl-business);outline-offset:-2px}
.dtl-row[data-open="true"]{background:var(--dtl-open-bg)}
.dtl-row-body{padding:0 var(--dtl-space-3) var(--dtl-space-3);border-top:1px solid var(--dtl-border)}

/* chip（分类 / 标签）：小底板走 --dtl-chip-bg，hover 加深 */
.dtl-chip{
  display:inline-flex;align-items:center;gap:var(--dtl-space-1);
  padding:0 var(--dtl-space-2);height:20px;border-radius:var(--dtl-radius-sm);
  background:var(--dtl-chip-bg);color:var(--dtl-fg-2);
  font-size:var(--dtl-font-xs);white-space:nowrap;max-width:20ch;overflow:hidden;text-overflow:ellipsis;
}

/* 原生下拉 / 输入框：宿主没有廉价的选择器，用原生控件 + token 配色（不用自绘菜单） */
.dtl-select,.dtl-input{
  height:var(--dtl-control-h-md);box-sizing:border-box;
  padding:0 var(--dtl-space-2);border:1px solid var(--dtl-border);border-radius:var(--dtl-radius-sm);
  background:var(--dtl-surface-1);color:var(--dtl-fg);
  font-family:inherit;font-size:var(--dtl-font-md);
}
.dtl-input{padding-left:var(--dtl-space-3);min-width:220px}
.dtl-select:focus-visible,.dtl-input:focus-visible{outline:2px solid var(--dtl-business);outline-offset:1px}

/* 空态：真空 = 虚线引导卡；筛选空 = 小字 */
.dtl-empty-guide{
  padding:var(--dtl-space-4);border:1px dashed var(--dtl-border-strong);border-radius:var(--dtl-radius-md);
  background:transparent;
}
.dtl-empty-filtered{padding:var(--dtl-space-4) 0;color:var(--dtl-fg-3);font-size:var(--dtl-font-md)}

/* 浮标角标：0→n 跳变时一次脉冲，不自动消失 */
.dtl-badge{
  position:absolute;top:-2px;right:-2px;min-width:16px;height:16px;padding:0 4px;
  border-radius:8px;background:var(--dtl-danger);color:var(--dtl-on-signal);
  font-size:10px;line-height:16px;text-align:center;font-weight:600;
}
.dtl-badge[data-pulse="true"]{animation:dtl-pulse 900ms var(--dtl-ease) 1}
@keyframes dtl-pulse{0%{transform:scale(.6);opacity:.4}60%{transform:scale(1.15)}100%{transform:scale(1)}}

/* 过程正文：宽度受限、长行折行 */
.dtl-worklog{max-width:72ch;font-size:var(--dtl-font-md);line-height:1.6}
`;
		const STYLE_ID = "dtl-ui-base";
		/** 幂等注入 token 层 + 基础层（面板与浮标谁先挂载都只注入一次）。 */
		function ensureUiBase() {
			if (typeof document === "undefined") return;
			if (document.getElementById(STYLE_ID) !== null) return;
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = `${UI_TOKENS_CSS}\n${UI_BASE_CSS}`;
			document.head.appendChild(style);
		}
		/** 统计卡：点一下联动下方列表筛选（aria-pressed = 选中态）。 */
		function StatCard(props) {
			return (0, react.createElement)("button", {
				type: "button",
				className: "dtl-card",
				"aria-pressed": props.active,
				title: props.title,
				onClick: props.onClick
			}, (0, react.createElement)("span", { style: {
				fontSize: "var(--dtl-font-sm)",
				color: "var(--dtl-fg-2)"
			} }, props.label), (0, react.createElement)("span", { style: {
				fontSize: "24px",
				fontWeight: 600,
				lineHeight: 1.2
			} }, props.value));
		}
		/** chip（分类 / 标签 / 工作区名）。 */
		function Chip(props) {
			const style = {};
			if (props.tone === "signal" && props.color !== void 0) {
				style.background = props.color;
				style.color = "var(--dtl-on-signal)";
			}
			return (0, react.createElement)("span", {
				className: "dtl-chip",
				style,
				title: props.text
			}, props.text);
		}
		/** 原生下拉（时间 / 标签筛选共用一份）。 */
		function Select(props) {
			return (0, react.createElement)("select", {
				className: "dtl-select",
				"aria-label": props.ariaLabel,
				value: props.value,
				onChange: (event) => {
					props.onChange(event.target.value);
				}
			}, props.options.map((option) => (0, react.createElement)("option", {
				key: option.value,
				value: option.value
			}, option.label)));
		}
		/** 搜索框（关键字过滤）。 */
		function SearchInput(props) {
			return (0, react.createElement)("input", {
				className: "dtl-input",
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
		/** 空态：`guide` = 真空引导卡（虚线），`filtered` = 筛选空小字。 */
		function EmptyState(props) {
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
		//#endregion
		//#region src/client/task-row.ts
		/**
		* 任务列表行（宿主**无表格件** ⇒ 自绘，几何参照官方 `DisclosureRow`，状态走官方 `StateDot`）。
		* 定稿见 docs/design/features/board-home.md §二 与 docs/design/ui-style.md：
		* 状态语义 open=idle / doing=ongoing / blocked=warning / 已结案=done。
		*
		* 行展开 = 过程文档路径 + 过程正文（在办走 `GET /task` 取正文；已结案只有路径——
		* host 没有按历史行取正文的路由，不编造内容）。
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
			}, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: dotOf(row) }), (0, react.createElement)("span", {
				style: {
					flex: "1 1 auto",
					minWidth: 0,
					overflow: "hidden",
					textOverflow: "ellipsis",
					whiteSpace: "nowrap",
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
				color: "var(--dtl-fg-3)",
				fontSize: "var(--dtl-font-xs)",
				whiteSpace: "nowrap"
			} }, workspace === void 0 ? null : (0, react.createElement)("span", null, workspace.title), (0, react.createElement)("span", { title: stamp.value ?? void 0 }, `${stamp.label} ${when}`), (0, react.createElement)("span", null, who === null || who === "" ? t("ownerUnclaimed") : `@${who}`)), (0, react.createElement)(open ? _deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular : _deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutlineRegular, { size: 16 })), open ? (0, react.createElement)("div", { className: "dtl-row-body" }, (0, react.createElement)("div", { style: {
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
		* 看板首页（`main` 槽整页内容）：4 统计卡（可点联动筛选）+ 筛选行 + 统一任务列表。
		* 定稿见 docs/design/features/board-home.md §二；按钮矩阵归「任务按钮与会话交接」任务（写入路径 A/B 未拍板），
		* 本页**不画**任务动作按钮——不先斩后奏。
		*
		* 刷新纪律（2026-10-17 拍板）：挂载首读 + 手动刷新按钮，**不轮询**；空态三分（未就绪不渲染 / 真空引导卡 / 筛选空小字）。
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
		const statsGridStyle = {
			display: "grid",
			gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
			gap: "var(--dtl-space-3)",
			marginBottom: "var(--dtl-space-4)"
		};
		const filterRowStyle = {
			display: "flex",
			alignItems: "center",
			gap: "var(--dtl-space-2)",
			flexWrap: "wrap",
			marginBottom: "var(--dtl-space-3)"
		};
		const hintStyle = {
			fontSize: "var(--dtl-font-sm)",
			color: "var(--dtl-fg-2)"
		};
		function BoardHome(props) {
			const { t, onBack } = props;
			ensureUiBase();
			const state = (0, react.useSyncExternalStore)(boardSubscribe, boardSnapshot);
			const [tab, setTab] = (0, react.useState)("tasks");
			(0, react.useEffect)(() => {
				refresh();
			}, []);
			const board = state.board;
			const rows = (0, react.useMemo)(() => selectRows(state), [state]);
			const tagOptions = (0, react.useMemo)(() => [{
				value: "",
				label: t("tagAll")
			}, ...(state.filters?.tags ?? []).map((tag) => ({
				value: tag,
				label: `#${tag}`
			}))], [state.filters, t]);
			/** 统计卡 → 筛选联动（点第二下不反选：档位语义是「切到这一档」，不是开关）。 */
			const card = (label, value, bucket, range) => (0, react.createElement)(StatCard, {
				label: t(label),
				value,
				active: state.query.bucket === bucket && (bucket !== "closed" || state.query.range === range),
				onClick: () => {
					setQuery({
						bucket,
						range,
						limit: 500
					});
				}
			});
			return (0, react.createElement)("div", { style: pageStyle }, (0, react.createElement)("div", { style: {
				display: "flex",
				justifyContent: "center"
			} }, (0, react.createElement)("div", { style: {
				width: "100%",
				maxWidth: "1120px",
				minWidth: 0,
				boxSizing: "border-box"
			} }, (0, react.createElement)("div", { style: headerStyle }, (0, react.createElement)("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: "var(--dtl-space-3)",
				minWidth: 0
			} }, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				variant: "outline",
				size: "md",
				onClick: onBack
			}, `← ${t("backToConversation")}`), (0, react.createElement)("div", { style: titleStyle }, t("panelTitle"))), (0, react.createElement)("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: "var(--dtl-space-2)"
			} }, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.SegmentedControl, {
				id: "dtl-tab",
				value: tab,
				label: t("panelTitle"),
				options: [{
					value: "tasks",
					label: t("tabTasks")
				}, {
					value: "stats",
					label: t("tabStats")
				}],
				onChange: setTab
			}), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				variant: "outline",
				size: "md",
				icon: (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutlineRegular, { size: 16 }),
				title: t("refresh"),
				disabled: state.refreshing,
				onClick: () => {
					refresh();
				}
			}, state.refreshing ? t("refreshing") : t("refresh")))), tab === "stats" ? (0, react.createElement)("div", { style: hintStyle }, t("statsPlaceholder")) : (0, react.createElement)("div", null, board === null ? null : (0, react.createElement)("div", { style: statsGridStyle }, card("statMyActive", String(board.stats.myActive), "mine", "all"), card("statOpen", String(board.stats.open), "open", "all"), card("statWeekDone", String(board.closed.weekDone), "closed", "week"), card("statYearDone", board.closed.yearCapped ? t("countCapped") : String(board.closed.yearDone), "closed", "year")), (0, react.createElement)("div", { style: filterRowStyle }, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.SegmentedControl, {
				id: "dtl-bucket",
				value: state.query.bucket,
				label: t("bucketLabel"),
				options: [
					{
						value: "all",
						label: t("bucketAll")
					},
					{
						value: "mine",
						label: t("bucketMine")
					},
					{
						value: "open",
						label: t("bucketOpen")
					},
					{
						value: "closed",
						label: t("bucketClosed")
					}
				],
				onChange: (next) => {
					setQuery({
						bucket: next,
						limit: 500
					});
				}
			}), (0, react.createElement)(Select, {
				value: state.query.range,
				ariaLabel: t("rangeLabel"),
				options: [
					{
						value: "all",
						label: t("rangeAll")
					},
					{
						value: "week",
						label: t("rangeWeek")
					},
					{
						value: "month",
						label: t("rangeMonth")
					},
					{
						value: "year",
						label: t("rangeYear")
					}
				],
				onChange: (next) => {
					setQuery({
						range: next,
						limit: 500
					});
				}
			}), (0, react.createElement)(Select, {
				value: state.query.tag,
				ariaLabel: t("tagAll"),
				options: tagOptions,
				onChange: (next) => {
					setQuery({
						tag: next,
						limit: 500
					});
				}
			}), (0, react.createElement)(SearchInput, {
				value: state.query.keyword,
				placeholder: t("searchPlaceholder"),
				ariaLabel: t("searchPlaceholder"),
				onChange: (next) => {
					setQuery({ keyword: next });
				}
			})), state.status === "loading" && board === null ? null : state.status === "error" && board === null ? (0, react.createElement)("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: "var(--dtl-space-2)"
			} }, (0, react.createElement)("span", { style: {
				color: "var(--dtl-danger)",
				fontSize: "var(--dtl-font-md)"
			} }, `${t("loadFailed")}：${state.error ?? ""}`), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				variant: "outline",
				size: "sm",
				onClick: () => {
					refresh();
				}
			}, t("retry"))) : board !== null && board.workspaces.length === 0 ? (0, react.createElement)(EmptyState, {
				tone: "guide",
				title: t("emptyNoWorkspace"),
				hint: t("emptyNoWorkspaceHint")
			}) : state.query.bucket === "closed" && state.historyStatus === "loading" && state.history.length === 0 ? (0, react.createElement)("div", { style: hintStyle }, t("loading")) : state.query.bucket === "closed" && state.historyStatus === "error" ? (0, react.createElement)("div", { style: {
				display: "flex",
				alignItems: "center",
				gap: "var(--dtl-space-2)"
			} }, (0, react.createElement)("span", { style: {
				color: "var(--dtl-danger)",
				fontSize: "var(--dtl-font-md)"
			} }, `${t("loadFailed")}：${state.historyError ?? ""}`), (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				variant: "outline",
				size: "sm",
				onClick: () => {
					setQuery({});
				}
			}, t("retry"))) : rows.length === 0 ? (0, react.createElement)(EmptyState, {
				tone: isPristine(state) ? "guide" : "filtered",
				title: isPristine(state) ? t("emptyNoTask") : t("emptyFiltered"),
				hint: isPristine(state) ? t("emptyNoTaskHint") : void 0
			}) : (0, react.createElement)("div", null, rows.map((row) => (0, react.createElement)(TaskRowView, {
				key: row.key,
				t,
				row
			})), (0, react.createElement)("div", { style: {
				...filterRowStyle,
				marginTop: "var(--dtl-space-3)",
				color: "var(--dtl-fg-3)",
				fontSize: "var(--dtl-font-xs)"
			} }, (0, react.createElement)("span", null, t("showingCount", { n: rows.length })), state.query.bucket === "closed" && state.history.length >= state.query.limit ? (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				variant: "outline",
				size: "sm",
				disabled: state.historyStatus === "loading",
				onClick: () => {
					loadMoreHistory();
				}
			}, state.historyStatus === "loading" ? t("loading") : t("loadMore")) : null))))));
		}
		/** 是否「什么都没筛」：真空才给引导卡，一有筛选就只能是「筛选空」。 */
		function isPristine(state) {
			const { query } = state;
			return query.bucket === "all" && query.range === "all" && query.tag === "" && query.keyword.trim() === "";
		}
		//#endregion
		//#region src/client/locales.ts
		/** 把宿主给的无参 t 包成带占位符替换的 t（官方模板一律 `{name}`）。 */
		function interpolateTranslate(base) {
			return (key, params) => {
				const raw = base(key);
				if (params === void 0) return raw;
				return raw.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match);
			};
		}
		const zh = {
			panelTitle: "任务台账",
			backToConversation: "返回会话",
			tabTasks: "任务",
			tabStats: "统计",
			statsPlaceholder: "统计报表尚未开建（本版只有任务首页）",
			statMyActive: "我的待办",
			statOpen: "待认领",
			statWeekDone: "本周已完成",
			statYearDone: "近一年完成",
			countCapped: "1万+",
			bucketLabel: "状态档",
			bucketAll: "全部",
			bucketMine: "我的待办",
			bucketOpen: "待认领",
			bucketClosed: "已结案",
			rangeLabel: "时间",
			rangeAll: "全部时间",
			rangeWeek: "本周",
			rangeMonth: "本月",
			rangeYear: "近一年",
			tagAll: "全部标签",
			searchPlaceholder: "搜索标题 / 负责人 / 任务号",
			refresh: "刷新",
			refreshing: "读取中…",
			loading: "加载中…",
			retry: "重试",
			loadFailed: "读取失败",
			emptyNoWorkspace: "没有检测到台账工作区",
			emptyNoWorkspaceHint: "宿主已添加的工作区里，还没有含 ledger/progress.json 的目录。",
			emptyNoTask: "还没有任务",
			emptyNoTaskHint: "在任一工作区里用 task-ledger skill 建任务（/ledger），这里就会看到它。",
			emptyFiltered: "当前筛选下没有任务",
			showingCount: "显示 {n} 条",
			loadMore: "加载更多",
			noMore: "没有更多了",
			expandAria: "展开详情",
			collapseAria: "收起详情",
			fieldOwner: "负责人",
			fieldCreator: "创建人",
			fieldCreated: "创建",
			fieldStarted: "开始",
			fieldFinished: "结案",
			fieldWorkspace: "工作区",
			fieldCategory: "分类",
			ownerUnclaimed: "未认领",
			timeUnknown: "时间未知",
			statusOpen: "待认领",
			statusDoing: "进行中",
			statusBlocked: "受阻",
			statusClosed: "已结案",
			worklogTitle: "过程文档",
			worklogMissing: "过程文档缺失（文件已不在盘上）",
			worklogPath: "路径",
			badgeTitle: "我名下进行中 + 受阻的任务数",
			openBoard: "打开任务台账",
			mdCopy: "复制",
			mdCopied: "已复制",
			mdFootnotes: "脚注"
		};
		const en = {
			panelTitle: "Task ledger",
			backToConversation: "Back to conversation",
			tabTasks: "Tasks",
			tabStats: "Stats",
			statsPlaceholder: "The stats report is not built yet (this release ships the task home only)",
			statMyActive: "My active",
			statOpen: "Unclaimed",
			statWeekDone: "Closed this week",
			statYearDone: "Closed in the last year",
			countCapped: "10k+",
			bucketLabel: "Status",
			bucketAll: "All",
			bucketMine: "My active",
			bucketOpen: "Unclaimed",
			bucketClosed: "Closed",
			rangeLabel: "Time",
			rangeAll: "Any time",
			rangeWeek: "This week",
			rangeMonth: "This month",
			rangeYear: "Last year",
			tagAll: "All tags",
			searchPlaceholder: "Search title / owner / task id",
			refresh: "Refresh",
			refreshing: "Loading…",
			loading: "Loading…",
			retry: "Retry",
			loadFailed: "Failed to load",
			emptyNoWorkspace: "No ledger workspace detected",
			emptyNoWorkspaceHint: "None of the workspaces added to the host contains ledger/progress.json.",
			emptyNoTask: "No tasks yet",
			emptyNoTaskHint: "Create one with the task-ledger skill (/ledger) in any workspace and it shows up here.",
			emptyFiltered: "No task matches the current filters",
			showingCount: "Showing {n}",
			loadMore: "Load more",
			noMore: "No more",
			expandAria: "Expand details",
			collapseAria: "Collapse details",
			fieldOwner: "Owner",
			fieldCreator: "Creator",
			fieldCreated: "Created",
			fieldStarted: "Started",
			fieldFinished: "Closed",
			fieldWorkspace: "Workspace",
			fieldCategory: "Category",
			ownerUnclaimed: "unclaimed",
			timeUnknown: "unknown time",
			statusOpen: "Unclaimed",
			statusDoing: "In progress",
			statusBlocked: "Blocked",
			statusClosed: "Closed",
			worklogTitle: "Process log",
			worklogMissing: "Process log is missing (the file is no longer on disk)",
			worklogPath: "Path",
			badgeTitle: "Tasks I own that are in progress or blocked",
			openBoard: "Open the task ledger",
			mdCopy: "Copy",
			mdCopied: "Copied",
			mdFootnotes: "Footnotes"
		};
		/** 宿主未提供 t 时的兜底（保持中文：宿主语言服务缺席不该让界面变键名）。 */
		const fallbackTranslate = (key, params) => {
			const raw = zh[key];
			if (params === void 0) return raw;
			return raw.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match);
		};
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
		/** 台账图标（黑白线条，描边走 currentColor ⇒ 随主题反色）。 */
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
			});
			let selectPanel = () => {};
			ctx.inject(["layout"], (sub) => {
				const layout = sub.layout;
				if (layout !== void 0) selectPanel = (id) => {
					layout.selectPanel(id);
				};
			});
			ctx.inject(["slots"], (sub) => {
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