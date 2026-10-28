window.__ModuleLoader__.load({
	id: "dsh-task-ledger",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod, mod.exports), cb = null), mod.exports);
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		let react_jsx_runtime = require("react/jsx-runtime");
		let react_dom = require("react-dom");
		react_dom = __toESM(react_dom, 1);
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/design/tokens-css.generated.js
		const TOKENS_CSS_TEMPLATE = "\n/* ── 文字（宿主 label 四档 + 反色面用字）────────────────────────────── */\nbody{\n  --dshpc-fg:var(--dsw-alias-label-primary,#1f2328);\n  --dshpc-fg-2:var(--dsw-alias-label-secondary,#5c6370);\n  --dshpc-fg-3:var(--dsw-alias-label-tertiary,#767d87);\n  --dshpc-fg-4:var(--dsw-alias-label-caption,#9aa1ab);\n  --dshpc-fg-dim:var(--dsw-alias-label-dimmed,#b9bfc7);\n  /* 反色面上的字（实心钮 / 角标）：暗色下是 bluish-1000，故用 -foreground 而非 -inverted */\n  --dshpc-fg-inverse:var(--dsw-alias-label-primary-foreground,#fff);\n\n  /* ── 面（宿主 bg-layer 三档 + 下沉轨道底）──────────────────────────── */\n  --dshpc-surface-1:var(--dsw-alias-bg-layer-1,#fff);\n  --dshpc-surface-2:var(--dsw-alias-bg-layer-2,#fff);\n  --dshpc-surface-3:var(--dsw-alias-bg-layer-3,#fff);\n  /* 「选中亮片」的底盘色（配 --dshpc-shadow-raised 用） */\n  --dshpc-surface-raised:var(--dsw-alias-bg-layer-1,#fff);\n  /* 轨道 / 下沉底（官方分段控件轨道用的就是这条） */\n  --dshpc-surface-sunken:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));\n  /* 整页 / 编辑器底（bg-base） */\n  --dshpc-surface-base:var(--dsw-alias-bg-base,#fff);\n  /* 自绘浮层 / 菜单卡的不透明底（= base；不要用半透明的 specific-menu） */\n  --dshpc-surface-menu:var(--dshpc-surface-base);\n  /* markdown 代码块面 / 字体（会话镜像里用到） */\n  --dshpc-code-surface:var(--dsw-alias-markdown-code-block,rgba(128,128,128,.10));\n  --dshpc-code-font:var(--dsw-font-markdown-code-block-small,12px/18px var(--ds-font-family-code,monospace));\n  /* 警告文字色（宿主 state-warn-label） */\n  --dshpc-warning-label:var(--dsw-alias-state-warn-label,#f5a623);\n  /* 固定中性实面（自绘浮层、深色主题下必须自己变的那几个）——只有它需要暗色覆盖 */\n  --dshpc-solid:var(--dsw-static-neutral-00,#fff);\n  --dshpc-on-solid:var(--dsw-alias-label-primary,#1f2328);\n  /* 交付文件卡那种「浅底盘 + hover 加深」两拍 */\n  --dshpc-plate:var(--dsw-static-neutral-50,#fafafa);\n  --dshpc-plate-hover:var(--dsw-static-neutral-100,#f5f5f5);\n  /* ⚠️ 这些**固定中性面一律用 rgba 字面量**（2026-10-19 真机教训）：不要写成\n     「rgba 回退行 + 嵌 --dsw-static-* 的 color-mix 行」两条同名声明——自定义属性**后者恒胜**，\n     哪怕它的值在宿主里算不出来（static 变量 invalid）⇒ 整条 token 作废、rgba 兜底一起被废，\n     0.2.6 里 Segmented 轨道全透明就是这么来的。要跟宿主主题联动的面用 alias token（那些实测有效）。 */\n  --dshpc-icon-plate:rgba(255,255,255,.5);\n  /* 表头底：浅色主题**偏深**，且必须**比斑马纹（--dshpc-plate）再深一档**——\n     两者不能撞色（用户 2026-10-02：表头跟斑马纹一模一样）。 */\n  --dshpc-head-bg:var(--dsw-static-neutral-100,#f5f5f5);\n  /* 图标小底板（产出物）：浅色下要**看得见**（原先取 plate ⇒ 在白底上等于没有）；hover 加倍。 */\n  --dshpc-chip-bg:rgba(15,15,15,.07);\n  --dshpc-chip-bg-hover:rgba(15,15,15,.14);\n  /* 展开行：**带透明度的蓝**——不是灰、也不是纯色，透出卡片底色，一眼看出「这是展开的」\n     （用户 2026-10-02：灰色跟斑马纹分不出来）。内容区再淡一档，形成「行深 / 内容浅」的区隔。 */\n  --dshpc-open-bg:rgba(37,99,235,.10);\n  --dshpc-open-bg-soft:rgba(37,99,235,.05);\n  --dshpc-card-hover:rgba(37,99,235,.07);\n\n  /* ── 描边四档（宿主真值：l1 4% / l2 10% / l3 12% / l4 16%）────────── */\n  --dshpc-border-faint:var(--dsw-alias-border-l1,#0000000a);\n  --dshpc-border:var(--dsw-alias-border-l2,#0000001a);\n  --dshpc-border-strong:var(--dsw-alias-border-l3,#0000001f);\n  --dshpc-border-heavy:var(--dsw-alias-border-l4,#00000029);\n\n  /* ── 品牌 / 语义色 ────────────────────────────────────────────────── */\n  /* 品牌「面」色：明色近黑、暗色近白（官方 Switch 选中态即此），**不是蓝色** */\n  --dshpc-accent:var(--dsw-alias-brand-primary,#0f1115);\n  /* 蓝色：强调 / 选中 / 焦点，一律走这条 */\n  --dshpc-business:var(--dsw-alias-state-business-primary,#3b5bdb);\n  --dshpc-success:var(--dsw-alias-state-success-primary,#22c55e);\n  /* ⚠️ 是 state-warn（不是 state-warning，后者宿主无此定义） */\n  --dshpc-warning:var(--dsw-alias-state-warn-primary,#f59e0b);\n  --dshpc-danger:var(--dsw-alias-state-error-primary,#ec1313);\n  --dshpc-link:var(--dsw-alias-link,#3b5bdb);\n  /* 语义色**实面**上的字（角标 / 实心提示）：宿主红绿黄三色都是中调 ⇒ 白字两个主题都可读，\n     故这是一条与主题无关的常量；不要拿 --dshpc-fg-inverse 顶——它在暗色下是近黑，压在红底上看不清。 */\n  --dshpc-on-signal:#fff;\n  /* 黄底上的字：黄色是中高明度，白字看不清 ⇒ 固定深色（与主题无关）。 */\n  --dshpc-on-warning:#1f2328;\n\n  /* ── 实心按钮的 hover / active 派生态（2026-10-19 用户点名）─────────────────\n     原实现是 :hover 直接压 opacity .9：黑底压 10% 几乎看不出来，用户原话「完全感觉不到颜色变了」。\n     ⇒ 改成对底色做**明确的混色**（压 22% / 34%），不用 opacity：\n       · 亮色主题：黑底（--dshpc-accent）掺白提亮；红 / 绿 / 黄 / 蓝底掺黑压深；\n       · 暗色主题：反过来（暗底掺白、亮底掺黑）。\n     混色对象是**固定中性色字面量**（#fff / #000），不依赖宿主 static-neutral 是否存在；\n     旧内核不认 color-mix 时整条声明作废 ⇒ 回落各档原色（可接受：仍可点，只是没有 hover 反馈）。 */\n  --dshpc-accent-hover:color-mix(in srgb,var(--dshpc-accent) 78%,#ffffff);\n  --dshpc-accent-active:color-mix(in srgb,var(--dshpc-accent) 64%,#ffffff);\n  --dshpc-danger-hover:color-mix(in srgb,var(--dshpc-danger) 78%,#000000);\n  --dshpc-danger-active:color-mix(in srgb,var(--dshpc-danger) 64%,#000000);\n  --dshpc-success-hover:color-mix(in srgb,var(--dshpc-success) 78%,#000000);\n  --dshpc-success-active:color-mix(in srgb,var(--dshpc-success) 64%,#000000);\n  --dshpc-warning-hover:color-mix(in srgb,var(--dshpc-warning) 78%,#000000);\n  --dshpc-warning-active:color-mix(in srgb,var(--dshpc-warning) 64%,#000000);\n  --dshpc-business-hover:color-mix(in srgb,var(--dshpc-business) 78%,#000000);\n  --dshpc-business-active:color-mix(in srgb,var(--dshpc-business) 64%,#000000);\n  /* 语义色**浅底**：状态色系的「一块底色」——执行记录页每条流水账的块底就是它\n     （用户 2026-10-04：正常态给同色系很浅的透明底、失败用红底透出来）。\n     用 「color-mix」 现算而不写死 rgba：状态色本身跟随宿主 alias，主题一换自动成立。\n     ⚠️ **深色下要更淡**：用户 2026-10-04「深色风格的绿色和红色好像都有点深」⇒ dark 段\n     把这四条压到 5%（更贴近面板底、存在感更弱）；浅色段维持 8%。两端各自给值，不共用一条曲线。\n     命名收在 tokens.ts 单点（本仓硬规矩：业务文件不许自造 --dshpc-*）。 */\n  --dshpc-success-soft:color-mix(in srgb,var(--dshpc-success) 8%,transparent);\n  --dshpc-warning-soft:color-mix(in srgb,var(--dshpc-warning) 8%,transparent);\n  --dshpc-danger-soft:color-mix(in srgb,var(--dshpc-danger) 8%,transparent);\n  --dshpc-business-soft:color-mix(in srgb,var(--dshpc-business) 8%,transparent);\n\n  /* ⚠️ 2026-10-18 用户拍板：宿主 alias 的 hover（暗色白 8% / 亮色 6%）**太弱**，\n     「移上去要仔细看才看得出来」⇒ 不再委托宿主 hover 别名，改为自掺中性色并加重：\n     亮色掺黑 10%、暗色掺白 14%（active 再加一档）。按钮 / 分段轨道 / 各类 hover 底同时受益。\n     ⚠️ 必须保留 rgba 兜底行在前（本文件惯例，见 icon-plate 注释）：掺的是**固定中性色**\n     （neutral-900=#0f0f0f / neutral-00=#fff），预计算无损；旧内核不认 color-mix 时走兜底，\n     否则整条 background:var(--seg-track) 作废 ⇒ 分段轨道透明（真踩过：预览站轨道消失）。 */\n  --dshpc-hover:rgba(15,15,15,.10);\n  --dshpc-active:rgba(15,15,15,.18);\n  /* 分段控件轨道底：专用 token（rgba 字面量、不借 --dshpc-hover 中转）——\n     2026-10-19 教训：变量链中间任何一环 invalid ⇒ background 整条作废、轨道全透明。\n     亮色：黑 7%（比 hover 的 10% 淡一档，选中白片才跳得出）。 */\n  --dshpc-seg-track:rgba(15,15,15,.07);\n  --dshpc-mask:var(--dsw-alias-bg-mask-1,#0000003d);\n  /* 「选中面」（2026-10-06，任务日程页首创）= 当前底色**朝更深掺 12% 文字色**：\n     浅色主题下文字色是黑 ⇒ 选中面比常态底色**深一档**。深色分支见 body[data-ds-dark-theme]（朝背景色掺）。\n     语义：标记「正在看的东西」，比常态明显、又不许盖住内容（不许用半透明叠状态色）。 */\n  --dshpc-selected-bg:color-mix(in srgb,var(--dshpc-surface-1) 88%,var(--dshpc-fg));\n  /* 任务日程页本月格默认底（2026-10-06 → 续2）：浅色下给**淡蓝**（business 8% 透白底）——\n     参照用户参考稿里未选中日程块 / Tuesday 列的那种蓝、再浅一点点；\n     相邻月补位格仍走 --dshpc-surface-2（更灰），不受影响。\n     深色段维持 #23262e（用户：深色 UI 已差不多，不动）。 */\n  --dshpc-cal-cell-bg:color-mix(in srgb,var(--dshpc-business) 8%,var(--dshpc-surface-1));\n  /* 任务日程页「点开某天」展开的面板底（2026-10-06 续）：浅色下**无限接近白、只带一丁点灰**\n     （neutral-50 = #fafafa）——面板里装半透明执行记录列表，底再深整片就发糊发灰；\n     深色段沿用原 selected-bg 暗值，保持不动。 */\n  --dshpc-cal-panel-bg:var(--dsw-static-neutral-50,#fafafa);\n  /* 任务日程页本月格 hover 底（浅色段，2026-10-06 续3）：不再走灰色通用交互底——\n     鼠标移上去应是「更亮一点点的蓝」（与深色段同语义：hover = 提亮的蓝，不是灰下去）。\n     浓度**介于**表头蓝（14%）与未选中格蓝（8%）之间、略偏表头一侧：business 12% 透白底\n     （比表头浅一点、比未选中格深一点）。 */\n  --dshpc-cal-cell-hover:color-mix(in srgb,var(--dshpc-business) 12%,var(--dshpc-surface-1));\n\n  /* ── 投影 / 焦点 ──────────────────────────────────────────────────── */\n  --dshpc-shadow-1:var(--dsw-elevation-soft,0 4px 16px 0 #00000008);\n  /* 亮片自带的浮起感（选中态用；与 --dshpc-surface-raised 配对） */\n  --dshpc-shadow-raised:var(--dsw-elevation-soft,0 4px 16px 0 #00000008);\n  --dshpc-shadow-2:var(--dsw-shadow-lv3,0 12px 32px 0 #00000014);\n  /* 键盘焦点环。⚠️ 不用宿主 --dsw-focus-ring-color：它默认值是 transparent（兜底不生效、会隐身） */\n  --dshpc-focus:var(--dsw-alias-state-business-primary,#3b5bdb);\n\n  /* ── 圆角（宿主真值 4 / 8 / 12 / 16 / 20 / 28）─────────────────────── */\n  --dshpc-radius-xs:var(--dsw-radius-xs,4px);\n  --dshpc-radius-sm:var(--dsw-radius-sm,8px);\n  --dshpc-radius-md:var(--dsw-radius-md,12px);\n  --dshpc-radius-lg:var(--dsw-radius-lg,16px);\n  --dshpc-radius-xl:var(--dsw-radius-xl,20px);\n  --dshpc-radius-panel:var(--dsw-radius-panel,28px);\n  /* 全圆（胶囊标签）：宿主的 radius 档最大只有 28px，撑不满 24px 高的 chip */\n  --dshpc-radius-pill:999px;\n\n  /* ── 间距四拍（只许用这四档，不许出现 5 / 7 / 9px）────────────────── */\n  --dshpc-space-1:4px;\n  --dshpc-space-2:8px;\n  --dshpc-space-3:12px;\n  --dshpc-space-4:16px;\n\n  /* ── 控件高度：离散三档（控件用 size=\"sm|md|lg\" 选；调用点不许自定义高度，\n       真不够用才允许在调用点本地覆盖 --dshpc-control-h-*，属例外而非常态）── */\n  --dshpc-control-h-sm:24px;\n  --dshpc-control-h-md:28px;\n  --dshpc-control-h-lg:32px;\n\n  /* ── 字号 / 行高：直绑宿主字号族（宿主真值 11 / 12 / 13 / 14 / 16）───── */\n  --dshpc-font-xs:var(--dsw-font-xxxs-11-font-size,11px);\n  --dshpc-font-sm:var(--dsw-font-xxs-12-font-size,12px);\n  --dshpc-font-md:var(--dsw-font-xs-13-font-size,13px);\n  --dshpc-font-lg:var(--dsw-font-s-14-font-size,14px);\n  --dshpc-font-xl:var(--dsw-font-base-16-font-size,16px);\n  --dshpc-line-xs:var(--dsw-font-xxxs-11-line-height,14px);\n  --dshpc-line-sm:var(--dsw-font-xxs-12-line-height,18px);\n  --dshpc-line-md:var(--dsw-font-xs-13-line-height,20px);\n  --dshpc-line-lg:var(--dsw-font-s-14-line-height,22px);\n  --dshpc-line-xl:var(--dsw-font-base-16-line-height,24px);\n  --dshpc-font-mono:var(--ds-font-family-code,monospace);\n\n  /* ── 层级阶梯（业务文件不许再写裸 z-index）───────────────────────── */\n  /* 页面级预览分栏 → 抽屉（新建/编辑）→ 弹窗/确认框 → 浮层菜单 → 浮层提示 */\n  /* 内容层吸顶（天标签 / 表头这类「跟着滚但压住同层内容」的元素）：只压同层兄弟，\n     必须低于下面所有浮层档 —— 所以它不是「开新浮层档」，而是内容层内部的排序位。 */\n  --dshpc-z-sticky:10;\n  --dshpc-z-dock:1030;\n  --dshpc-z-drawer:1040;\n  --dshpc-z-modal:1070;\n  --dshpc-z-menu:1100;\n  --dshpc-z-tip:1200;\n\n  /* ── 动效 ─────────────────────────────────────────────────────────── */\n  --dshpc-dur:var(--ds-transition-duration,.2s);\n  --dshpc-dur-fast:var(--ds-transition-duration-fast,.12s);\n  --dshpc-ease:var(--ds-ease-in-out,cubic-bezier(.4,0,.2,1));\n  /* 运行中状态的脉动时长（2026-10-06 统一前后两端：任务配置里的绿呼吸 → 蓝、放慢；\n     执行记录里的蓝闪 → 放慢一点。两者用同一个值，动画形状本就一致）。 */\n  --dshpc-dur-run:500ms;\n}\n\n/* ── 明暗差异的**唯一**落点 ──────────────────────────────────────────────\n   判据 = body[data-ds-dark-theme]（宿主 0.2.0-rc.2 源码核实：启动脚本 toggleAttribute 写入，\n   唯一明暗判据；插件禁止用 prefers-color-scheme —— 它跟的是系统、不是用户在宿主里的选择）。\n   下面只放 alias 表达不了的「固定中性面」；颜色若能靠 alias 自动跟随，一律不要写在这里。 */\nbody[data-ds-dark-theme]{\n  --dshpc-solid:var(--dsw-static-neutral-900,#0f0f0f);\n  --dshpc-on-solid:var(--dsw-static-neutral-00,#fff);\n  /* 实心按钮 hover / active（暗色版）：黑底（浅色主题的近黑 → 暗色下的近白）掺黑压深；\n     红 / 绿 / 黄 / 蓝掺白提亮。与亮色段方向相反，保证两种主题下「一眼看出变了」。 */\n  --dshpc-accent-hover:color-mix(in srgb,var(--dshpc-accent) 80%,#000000);\n  --dshpc-accent-active:color-mix(in srgb,var(--dshpc-accent) 66%,#000000);\n  --dshpc-danger-hover:color-mix(in srgb,var(--dshpc-danger) 78%,#ffffff);\n  --dshpc-danger-active:color-mix(in srgb,var(--dshpc-danger) 64%,#ffffff);\n  --dshpc-success-hover:color-mix(in srgb,var(--dshpc-success) 78%,#ffffff);\n  --dshpc-success-active:color-mix(in srgb,var(--dshpc-success) 64%,#ffffff);\n  --dshpc-warning-hover:color-mix(in srgb,var(--dshpc-warning) 78%,#ffffff);\n  --dshpc-warning-active:color-mix(in srgb,var(--dshpc-warning) 64%,#ffffff);\n  --dshpc-business-hover:color-mix(in srgb,var(--dshpc-business) 78%,#ffffff);\n  --dshpc-business-active:color-mix(in srgb,var(--dshpc-business) 64%,#ffffff);\n  /* 暗色 hover 掺白 14% / active 24%（对齐上面 2026-10-18 的加重拍板）。rgba 兜底行同上。 */\n  --dshpc-hover:rgba(255,255,255,.14);\n  --dshpc-active:rgba(255,255,255,.24);\n  /* 分段轨道（暗色版）：白 10%——比 hover 淡一档，选中亮片才跳得出。 */\n  --dshpc-seg-track:rgba(255,255,255,.10);\n  --dshpc-plate:var(--dsw-static-neutral-850,#212123);\n  --dshpc-plate-hover:var(--dsw-static-neutral-800,#292929);\n  --dshpc-icon-plate:rgba(255,255,255,.05);\n  /* 暗色主题**反过来**：表头要比卡片面**亮**、比斑马纹再**浅一档**（用户：纯黑背景没法看）。 */\n  --dshpc-head-bg:var(--dshpc-surface-2);\n  /* 暗色底板**微亮**；hover **更亮**（原先 hover 取 plate-hover 反而更淡 ⇒ 鼠标移上去就没了）。 */\n  --dshpc-chip-bg:rgba(255,255,255,.08);\n  --dshpc-chip-bg-hover:rgba(255,255,255,.16);\n  /* 暗色下蓝色要更亮、透明度略高才压得住深底。 */\n  --dshpc-open-bg:rgba(96,165,250,.18);\n  --dshpc-open-bg-soft:rgba(96,165,250,.08);\n  --dshpc-card-hover:rgba(96,165,250,.13);\n  /* 语义色**浅底**（深色版）：用户嫌深色的绿 / 红「有点深」⇒ 压到 **5%**（浅色段是 8%），\n     更贴近面板底色、存在感更弱；块底与状态色竖条仍同源（竖条是实色，不受这条影响）。 */\n  --dshpc-success-soft:color-mix(in srgb,var(--dshpc-success) 5%,transparent);\n  --dshpc-warning-soft:color-mix(in srgb,var(--dshpc-warning) 5%,transparent);\n  --dshpc-danger-soft:color-mix(in srgb,var(--dshpc-danger) 5%,transparent);\n  --dshpc-business-soft:color-mix(in srgb,var(--dshpc-business) 5%,transparent);\n  /* 「选中面」（深色版，2026-10-06）：掺 **~40% 背景色**（--dshpc-surface-base）⇒ 无限接近页面背景的黑、\n     只比背景略深一点点（用户：深色下展开区压着任务透明绿会发灰，底色要尽量贴近背景才不显灰）。\n     ⚠️ 深色下不能掺文字色 —— 那是白，会变亮，选中反而比本月日期浅。 */\n  --dshpc-selected-bg:color-mix(in srgb,var(--dshpc-surface-1) 60%,var(--dshpc-surface-base));\n  /* 任务日程页本月格的默认底（深色版，2026-10-06）：深的、带点灰蓝的暗色（用户给的参考图 ≈ #23262e），\n     比原来的卡片面更沉、更偏蓝灰；选中格仍走 --dshpc-selected-bg（更暗一档），层级不变。 */\n  --dshpc-cal-cell-bg:#23262e;\n  /* 任务日程页本月格 hover 底（深色段，2026-10-06）：原先走 --dshpc-hover（宿主浅色叠加）在深底上显得\n     「灰发亮」，不好看 ⇒ 换成更贴底的蓝调微亮（与 open-bg-soft 同族），hover 时不刺眼、又有反馈。 */\n  --dshpc-cal-cell-hover:rgba(96,165,250,.12);\n  /* 任务日程页展开面板底（深色段，2026-10-06 续）：与原 selected-bg 暗值一致，深色 UI 不动 */\n  --dshpc-cal-panel-bg:color-mix(in srgb,var(--dshpc-surface-1) 60%,var(--dshpc-surface-base));\n}\n";
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/design/style-kit.js
		/** 全生态统一的 CSS 变量前缀。 */
		const CSS_PREFIX = "dshpc";
		/** token 域固定名：变量定义必须先于消费它的规则出现。 */
		const TOKENS_DOMAIN = "tokens";
		/**
		* 领一套本插件专属的样式设施。
		*
		* 为什么是工厂而不是模块级单例：单例只有一个固定 style id，
		* 多个插件同处一页时会抢同一个 `<style>` 标签、后挂载的覆盖先挂载的（见需求文档 §5.2）。
		*/
		function createStyleKit(options) {
			const { id } = options;
			if (id === "") throw new Error("dsh-plugin-core/design: id 不能为空");
			const tokensCss = TOKENS_CSS_TEMPLATE;
			const domains = /* @__PURE__ */ new Map();
			let tag = null;
			let dirty = true;
			const composeCss = () => {
				const entries = [...domains.entries()];
				entries.sort((a, b) => a[0] === TOKENS_DOMAIN ? -1 : b[0] === TOKENS_DOMAIN ? 1 : 0);
				return entries.map(([, css]) => css).join("\n");
			};
			const flush = () => {
				if (tag === null) return;
				tag.textContent = composeCss();
				dirty = false;
			};
			const ensureStyles = () => {
				if (typeof document === "undefined") return;
				if (tag === null || !tag.isConnected) {
					const head = document.head;
					if (head === null) return;
					const found = document.getElementById(id);
					if (found !== null) tag = found;
					else {
						const el = document.createElement("style");
						el.id = id;
						head.appendChild(el);
						tag = el;
					}
					dirty = true;
				}
				if (dirty) flush();
			};
			const registerStyle = (domain, css) => {
				if (domains.get(domain) === css) return;
				domains.set(domain, css);
				dirty = true;
				if (tag?.isConnected === true) flush();
			};
			const dispose = () => {
				if (tag?.isConnected === true) tag.remove();
				tag = null;
				domains.clear();
				dirty = true;
			};
			return {
				id,
				tokensCss,
				cssVar: (name) => `--${CSS_PREFIX}-${name}`,
				registerStyle,
				ensureStyles,
				dispose,
				applyStyle: (domain, css) => {
					registerStyle(domain, css);
					ensureStyles();
				}
			};
		}
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/controls/segmented-css.generated.js
		const SEGMENTED_CSS = "\n/* ── 分段控件 P2 ─────────────────────────────────────────────────────\n   结构照兄弟项目 dsh-task-dispatch-table 的 Segmented 皮肤（item 无边框、hover 只提亮文字），\n   前缀 / 变量名换成本仓口径。用户额外要的两处（兄弟没有）：weekday 方块间隔（现为 2px）；段内中性计数 __count。\n   ⚠️ 2026-10-19 两次误判均已澄清：① 「宿主只认单行 CSS」——假，多行一直正常；\n   ② 「宿主吃掉 token 块之后第一条规则」——也假，真因是 tokens 模板字符串结尾多了一个反斜杠，\n   注入文本里留下字面反引号，把紧随其后的那条规则的选择器污染掉了（见 dsh-host.md §9）。\n   样式照常多行书写，不必压行；也不需要任何「牺牲规则」。 */\n/* 外观只有一套（2026-10-26）：原 variant 的 default / inset 两档在 CSS 里只差 1px 内距，\n   且 default 比文档承诺矮 2px，却让下游以为「有得选」而反复对图 ⇒ 整轴删除。\n   padding 3px 是尺寸契约的一部分：item 高度 = 控制高 − 6px，加起来正好 24 / 28 / 32。 */\n.dshpc-seg{display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:var(--dshpc-radius-md);--seg-thumb:var(--dshpc-surface-raised);background:var(--dshpc-seg-track);}\n.dshpc-seg__item{appearance:none;display:inline-flex;align-items:center;gap:4px;box-sizing:border-box;height:calc(var(--dshpc-control-h-sm) - 6px);padding:0 12px;border:0;border-radius:var(--dshpc-radius-sm);background:transparent;color:var(--dshpc-fg-2);font-family:inherit;font-size:var(--dshpc-font-xs);font-weight:500;white-space:nowrap;cursor:pointer;flex:none;transition:color var(--dshpc-dur-fast) var(--dshpc-ease),background-color var(--dshpc-dur-fast) var(--dshpc-ease),box-shadow var(--dshpc-dur-fast) var(--dshpc-ease);}\n.dshpc-seg--md .dshpc-seg__item{height:calc(var(--dshpc-control-h-md) - 6px);}\n.dshpc-seg--lg .dshpc-seg__item{height:calc(var(--dshpc-control-h-lg) - 6px);}\n.dshpc-seg__item:hover:not([aria-pressed='true']):not(:disabled){color:var(--dshpc-fg);}\n.dshpc-seg__item[aria-pressed='true']{background:var(--seg-thumb);box-shadow:var(--dshpc-shadow-raised);color:var(--dshpc-fg);font-weight:600;}\n.dshpc-seg__item:focus-visible{outline:2px solid var(--dshpc-focus);outline-offset:-2px;}\n.dshpc-seg__item:disabled{cursor:default;opacity:.4;}\n/* 段内角标（如「异常」的数量）：语义色实面 + 反白字，0 由组件侧不渲染。必须是正圆（用户 2026-10-03）。 */\n.dshpc-seg__badge{display:inline-flex;align-items:center;justify-content:center;flex:none;width:16px;height:16px;padding:0;overflow:hidden;border-radius:50%;background:var(--dshpc-danger);color:var(--dshpc-on-signal);font-size:10px;line-height:16px;font-weight:500;font-variant-numeric:tabular-nums;}\n/* 段内中性计数（如筛选条「全部 11」）：纯文字、无底无边（对齐 task-ledger .dtl-seg__num 拍板口径）；0 由组件侧不渲染。 */\n.dshpc-seg__count{display:inline;flex:none;margin-left:3px;padding:0;border:0;border-radius:0;background:none;color:var(--dshpc-fg-3);font-size:10px;line-height:1;font-weight:400;font-variant-numeric:tabular-nums;}\n/* block：撑满父宽（表单行用），各段等分 */\n.dshpc-seg--block{display:flex;width:100%;}\n.dshpc-seg--block .dshpc-seg__item{flex:1 1 auto;justify-content:center;}\n/* weekday：星期多选方块。基础插件的特殊化定制（用户 2026-10-01：原 WeekdayPicker 即「蓝底 + 近似方形」）：\n   每格正方形（宽 = 段高）、选中品牌蓝反白字、**无外描边**（2026-10-18 重申）、\n   方块之间间距 gap:2px（2026-10-20 用户定稿：方块改小后 6px 显得太宽。10-18 曾从 2px 放宽到 6px，\n   两次都是用户拍板 —— 别自作主张改回去）。 */\n.dshpc-seg--weekday{--seg-track:var(--dshpc-seg-track);gap:2px;border:0;padding:3px;background:var(--seg-track);}\n.dshpc-seg--weekday .dshpc-seg__item{width:calc(var(--dshpc-control-h-lg) - 8px);padding:0;justify-content:center;}\n.dshpc-seg--weekday .dshpc-seg__item[aria-pressed='true']{background:var(--dshpc-business);color:var(--dshpc-fg-inverse);box-shadow:var(--dshpc-shadow-raised);}\n\n/* ── 单选滑动块（2026-10-26 用户：点选后选中底应「滑过去」，不是旧段消失、新段直接亮）。\n   结构 = 一块绝对定位的共用底 + 各段透明；位置/尺寸由组件量出后内联，这里只管外观与过渡。\n   --slide 只在单选挂上：多选（如星期）每段各自着色，没有唯一滑块可滑，保持原样。 */\n.dshpc-seg--slide{position:relative;}\n.dshpc-seg--slide .dshpc-seg__item{position:relative;z-index:1;}\n.dshpc-seg--slide .dshpc-seg__item[aria-pressed='true']{background:transparent;box-shadow:none;}\n.dshpc-seg__thumb{position:absolute;z-index:0;border-radius:var(--dshpc-radius-sm);background:var(--seg-thumb);box-shadow:var(--dshpc-shadow-raised);pointer-events:none;transition:left var(--dshpc-dur) var(--dshpc-ease),top var(--dshpc-dur) var(--dshpc-ease),width var(--dshpc-dur) var(--dshpc-ease),height var(--dshpc-dur) var(--dshpc-ease);}\n.dshpc-seg--weekday.dshpc-seg--slide .dshpc-seg__thumb{background:var(--dshpc-business);}\n\n/* ── bordered 外框（2026-10-20 用户要的第二种模式）：**只在最外面套一圈 1px 描边**，\n   里面一概不动 —— 选中片的填充色 / 阴影 / 文字色全部保持原样（weekday 的蓝面照旧），\n   这里不写任何针对 __item 的规则。\n   总高必须与无框版逐像素一致：border 1px×2 由 padding 各让 1px 抵消（3 → 2）；\n   weekday 自己声明的 3px 在文件更后面，靠双类选择器压回 2px。 */\n.dshpc-seg--bordered{border:1px solid var(--dshpc-border);padding:2px;}\n.dshpc-seg--bordered.dshpc-seg--weekday{padding:2px;}\n\n@media (prefers-reduced-motion: reduce){.dshpc-seg__item{transition:none;}.dshpc-seg__thumb{transition:none;}}\n";
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/controls/button-css.generated.js
		const BUTTON_CSS = "\n/* ── 按钮 / 图标钮 P2 ───────────────────────────────────────────────────\n   与 Segmented 同一条高度纪律：--dshpc-control-h-sm(24) / -md(28) / -lg(32)，\n   有边框的 variant 用 1px 真边框 + 内部 padding 补回，**有边 / 无边同高**。\n\n   三条受控轴（2026-10-19 重写，对齐主流 UI 框架的分类口径）：\n     · variant —— 外观档 = 形态 + 语义色，共 10 档：\n         primary / secondary / outline / ghost / danger / success / warning / info /\n         danger-outline（红字描边）/ link（行内链接）\n     · size —— sm / md / lg\n     · block —— 撑满父宽\n   每一档**只填 5 个局部变量**（--btn-bg / -fg / -border / -bg-hover / -bg-active），\n   结构与交互只有上面这一份；任何档位都不许再写一遍 display/height/padding。\n   自定义颜色（Button 的 color 参数）同样只覆盖这 5 个变量（token 覆盖，不是新皮肤）。\n\n   ⚠️ hover 不再用 opacity 压一层（用户 2026-10-19：「黑色和红色的按钮移上去变化太小，\n   完全感觉不到颜色变了」）⇒ 走 --dshpc-*-hover / -active 的明确混色，见 tokens-css.ts。 */\n.dshpc-btn{--btn-bg:transparent;--btn-fg:var(--dshpc-fg);--btn-border:transparent;--btn-pad:12px;\n  --btn-bg-hover:var(--dshpc-hover);--btn-bg-active:var(--dshpc-active);--btn-fg-hover:var(--btn-fg);\n  appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;\n  box-sizing:border-box;border:1px solid var(--btn-border);border-radius:var(--dshpc-radius-md);\n  background-color:var(--btn-bg);color:var(--btn-fg);font-family:inherit;font-weight:500;white-space:nowrap;cursor:pointer;\n  transition:background-color var(--dshpc-dur-fast) var(--dshpc-ease),border-color var(--dshpc-dur-fast) var(--dshpc-ease),color var(--dshpc-dur-fast) var(--dshpc-ease),box-shadow var(--dshpc-dur-fast) var(--dshpc-ease),transform var(--dshpc-dur-fast) var(--dshpc-ease);}\n.dshpc-btn--sm{--btn-pad:10px;height:var(--dshpc-control-h-sm);padding:0 var(--btn-pad);font-size:var(--dshpc-font-sm);line-height:1;}\n.dshpc-btn--md{--btn-pad:12px;height:var(--dshpc-control-h-md);padding:0 var(--btn-pad);font-size:var(--dshpc-font-md);line-height:1;}\n.dshpc-btn--lg{--btn-pad:14px;height:var(--dshpc-control-h-lg);padding:0 var(--btn-pad);font-size:var(--dshpc-font-md);line-height:1;}\n/* block：撑满父宽（表单底栏 / 抽屉底部的主操作） */\n.dshpc-btn--block{display:flex;width:100%;}\n/* block + 前置图标 ⇒ 文字视觉居中（2026-10-19 用户点名）：\n   内容组 [图标 + 间距 + 文字] 整体在盒内居中时，**文字**的中心会被图标推右半格。\n   把右内边距补上「图标宽 + 间距」，可用盒随之左移同量 ⇒ 文字落回视觉中心，图标贴左侧。\n   图标宽按 1.2em 估（官方图标 14/16px vs 字号 12/13px），em 随字号档自动缩放。 */\n.dshpc-btn--block.dshpc-btn--icon-start{padding-right:calc(var(--btn-pad) + 1.2em + 6px);}\n.dshpc-btn__icon,.dshpc-btn__icon-end{display:inline-flex;align-items:center;justify-content:center;flex:none;line-height:0;}\n.dshpc-btn__icon svg,.dshpc-btn__icon-end svg{display:block;margin:0;}\n/* loading：不换 DOM 结构，只在文案前插一个同色小圈。\n   ⚠️ 2026-10-20 改画法：原来是 border:1.5px 加 border-radius:999px 画的环 —— 真机实测 computed\n   radius 就是 999px、宽高都是 12px（没被任何样式覆盖），看着却\"像圆角方\"，原因是**次像素边框\n   （1.5px）在 12px 这么小的圆上被抗锯齿插值拉毛**。改用 SVG 矢量弧：任意 DPR 下都是真圆。 */\n.dshpc-btn__spinner{display:block;flex:none;width:12px;height:12px;\n  animation:dshpc-btn-spin .7s linear infinite;}\n/* shortcut: 12px 是固定值，不随按钮字号缩放；要更大就改这一处。 */\n@keyframes dshpc-btn-spin{to{transform:rotate(360deg)}}\n\n/* 交互态：颜色变化写在变量上 ⇒ 所有档位一次生效，且变化幅度由 token 决定（够明显） */\n.dshpc-btn:hover:not(:disabled){background-color:var(--btn-bg-hover);color:var(--btn-fg-hover);}\n.dshpc-btn:active:not(:disabled){background-color:var(--btn-bg-active);transform:translateY(1px);}\n.dshpc-btn:focus-visible{outline:2px solid var(--dshpc-focus);outline-offset:2px;}\n.dshpc-btn:disabled{cursor:default;opacity:.5;}\n\n.dshpc-btn--primary{--btn-bg:var(--dshpc-accent);--btn-fg:var(--dshpc-fg-inverse);\n  --btn-bg-hover:var(--dshpc-accent-hover);--btn-bg-active:var(--dshpc-accent-active);}\n/* secondary：中性实心（灰面），用于「取消 / 次要」这类与主操作并排的按钮 */\n.dshpc-btn--secondary{--btn-bg:var(--dshpc-hover);--btn-fg:var(--dshpc-fg);\n  --btn-bg-hover:var(--dshpc-active);--btn-bg-active:var(--dshpc-active);}\n.dshpc-btn--outline{--btn-bg:var(--dshpc-surface-1);--btn-border:var(--dshpc-border-strong);\n  --btn-bg-hover:var(--dshpc-hover);--btn-bg-active:var(--dshpc-active);}\n.dshpc-btn--ghost{--btn-fg:var(--dshpc-fg-2);--btn-fg-hover:var(--dshpc-fg);\n  --btn-bg-hover:var(--dshpc-hover);--btn-bg-active:var(--dshpc-active);}\n.dshpc-btn--danger{--btn-bg:var(--dshpc-danger);--btn-fg:var(--dshpc-on-signal);\n  --btn-bg-hover:var(--dshpc-danger-hover);--btn-bg-active:var(--dshpc-danger-active);}\n.dshpc-btn--success{--btn-bg:var(--dshpc-success);--btn-fg:var(--dshpc-on-signal);\n  --btn-bg-hover:var(--dshpc-success-hover);--btn-bg-active:var(--dshpc-success-active);}\n.dshpc-btn--warning{--btn-bg:var(--dshpc-warning);--btn-fg:var(--dshpc-on-warning);\n  --btn-bg-hover:var(--dshpc-warning-hover);--btn-bg-active:var(--dshpc-warning-active);}\n.dshpc-btn--info{--btn-bg:var(--dshpc-business);--btn-fg:var(--dshpc-on-signal);\n  --btn-bg-hover:var(--dshpc-business-hover);--btn-bg-active:var(--dshpc-business-active);}\n/* danger-outline：红字描边（破坏性次要操作，如卡片上的「删除」）。\n   ⚠️ 旧修饰类 danger-ink 保留为别名（消费方可能还在挂），两者同一套皮肤。 */\n.dshpc-btn--danger-outline,.dshpc-btn--danger-ink{--btn-border:var(--dshpc-danger);--btn-fg:var(--dshpc-danger);\n  --btn-fg-hover:var(--dshpc-danger);--btn-bg-hover:var(--dshpc-danger-soft);--btn-bg-active:var(--dshpc-danger-soft);}\n/* link：行内文字链接型（会话 / 产出文件名），无底无边、品牌蓝、hover 下划线 */\n.dshpc-btn--link{--btn-fg:var(--dshpc-link);--btn-fg-hover:var(--dshpc-link);\n  --btn-bg-hover:transparent;--btn-bg-active:transparent;\n  height:auto;padding:0;border:0;background:none;font-weight:400;text-align:left;}\n.dshpc-btn--link:hover:not(:disabled){text-decoration:underline;}\n\n/* 图标钮：纯图标，方形；尺寸档的宽高与同档文字按钮等高 */\n.dshpc-iconbtn{appearance:none;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;\n  border:1px solid transparent;border-radius:var(--dshpc-radius-sm);background:transparent;color:var(--dshpc-fg-2);\n  font-family:inherit;cursor:pointer;flex:none;\n  transition:background-color var(--dshpc-dur-fast) var(--dshpc-ease),border-color var(--dshpc-dur-fast) var(--dshpc-ease),color var(--dshpc-dur-fast) var(--dshpc-ease),opacity var(--dshpc-dur-fast) var(--dshpc-ease);}\n.dshpc-iconbtn--sm{width:var(--dshpc-control-h-sm);height:var(--dshpc-control-h-sm);font-size:var(--dshpc-font-sm);}\n.dshpc-iconbtn--md{width:var(--dshpc-control-h-md);height:var(--dshpc-control-h-md);font-size:var(--dshpc-font-md);}\n.dshpc-iconbtn--lg{width:var(--dshpc-control-h-lg);height:var(--dshpc-control-h-lg);font-size:var(--dshpc-font-md);}\n.dshpc-iconbtn--plain{color:var(--dshpc-fg-2);}\n.dshpc-iconbtn--outline{background:var(--dshpc-surface-1);border-color:var(--dshpc-border);color:var(--dshpc-fg-2);}\n.dshpc-iconbtn--danger{color:var(--dshpc-danger);}\n.dshpc-iconbtn:hover:not(:disabled){background:var(--dshpc-hover);color:var(--dshpc-fg);}\n.dshpc-iconbtn--danger:hover:not(:disabled){background:var(--dshpc-danger-soft);color:var(--dshpc-danger);}\n.dshpc-iconbtn:focus-visible{outline:2px solid var(--dshpc-focus);outline-offset:2px;}\n.dshpc-iconbtn:disabled{cursor:default;opacity:.4;}\n\n/* ── 行式文件按钮（图标 + 文件名）P2：**全站唯一实现**（2026-10-04 收编）──────────\n   用途：「产出物 / 附件」那种**一行一个文件**的清单项（基础信息右栏产出物清单、附件区、\n   执行记录页的展开区）。平时透明、**鼠标移上去才出浅底**（沿用用户 2026-10-03 定的观感）。\n   两个形态修饰类：\n     --block   撑满父宽（清单里一项一行）\n     --inline  内容宽（跟在文字后头，如附件行）\n   收编原因：这份皮肤此前只写在 task-list.tsx 的 TASK_LIST_CSS 里（旧名 .dshpc-info-out），\n   执行记录页展开区要用同一种观感 ⇒ 上提基础层，避免再出现「各写一份外观」（同名不同皮的坑刚踩过）。 */\n.dshpc-filechip{appearance:none;-webkit-appearance:none;border:0;border-radius:var(--dshpc-radius-xs);\n  background:transparent;color:var(--dshpc-fg);font:inherit;text-align:left;cursor:pointer;min-width:0;\n  transition:background-color var(--dshpc-dur) var(--dshpc-ease);}\n.dshpc-filechip:hover:not(:disabled){background:var(--dshpc-chip-bg);}\n.dshpc-filechip:focus-visible{outline:2px solid var(--dshpc-focus);outline-offset:1px;}\n.dshpc-filechip:disabled{cursor:default;background:transparent;color:var(--dshpc-fg-3);}\n.dshpc-filechip--block{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;\n  padding:4px 6px;font-size:var(--dshpc-font-xs);}\n.dshpc-filechip--inline{display:inline-flex;align-items:center;gap:4px;padding:2px 6px;font-size:var(--dshpc-font-sm);}\n\n@media (prefers-reduced-motion: reduce){.dshpc-btn,.dshpc-iconbtn,.dshpc-filechip{transition:none;}}\n";
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/controls/field-css.generated.js
		const FIELD_CSS = "\n/* ── 字段 + 问号提示（hint 参数内置） ──────────────────────────────────── */\n/* 控件 + FieldHint 同一行；hint 版由组件自己包，调用方只传 hint 字符串。\n   铺满型控件（input/textarea）进包后改吃 flex 弹性，让位给问号。 */\n.dshpc-fieldwrap{display:flex;align-items:center;gap:6px;min-width:0;max-width:100%;}\n.dshpc-fieldwrap--inline{display:inline-flex;}\n.dshpc-fieldwrap > .dshpc-input,.dshpc-fieldwrap > .dshpc-textarea{flex:1 1 auto;width:auto;min-width:0;}\n/* 多行输入：问号钉在**右下角**（2026-10-20 用户：不要垂直居中），文本区底部留出它的位置。\n   ⚠️ 这一档必须把 textarea 的宽度还回去（上面那条 flex 让位规则会把它缩窄）。 */\n.dshpc-fieldwrap--block{position:relative;display:block;}\n.dshpc-fieldwrap--block > .dshpc-textarea{width:100%;padding-bottom:24px;}\n.dshpc-fieldwrap--block > .dshpc-hint{position:absolute;right:8px;bottom:6px;}\n\n/* ── 输入类 P3 ────────────────────────────────────────────────────────── */\n/* 默认铺满容器（width:100%，与 .dshpc-textarea 同口径）：input 原生按 size 属性取内在宽，\n   不铺满 ⇒ 调用方套定宽壳时会「右边空一截、看着没贴右」（2026-10-20 用户抓的 bug）。\n   要定宽由调用方在外面套壳控制（如 192px 搜索槽）。 */\n.dshpc-input{display:block;width:100%;box-sizing:border-box;border:1px solid var(--dshpc-border);border-radius:var(--dshpc-radius-md);\n  background:var(--dshpc-surface-1);color:var(--dshpc-fg);font-family:inherit;outline:none;\n  transition:border-color var(--dshpc-dur-fast) var(--dshpc-ease),box-shadow var(--dshpc-dur-fast) var(--dshpc-ease);}\n.dshpc-input--sm{height:var(--dshpc-control-h-sm);padding:0 8px;font-size:var(--dshpc-font-sm);line-height:var(--dshpc-line-sm);}\n.dshpc-input--md{height:var(--dshpc-control-h-md);padding:0 10px;font-size:var(--dshpc-font-md);line-height:var(--dshpc-line-md);}\n.dshpc-input--lg{height:var(--dshpc-control-h-lg);padding:0 12px;font-size:var(--dshpc-font-md);line-height:var(--dshpc-line-md);}\n.dshpc-input::placeholder{color:var(--dshpc-fg-dim);}\n.dshpc-input:focus{border-color:var(--dshpc-focus);box-shadow:0 0 0 1px var(--dshpc-focus);}\n.dshpc-input--error{border-color:var(--dshpc-danger);}\n.dshpc-input:disabled{cursor:default;opacity:.5;}\n\n.dshpc-pfx{display:inline-flex;align-items:center;box-sizing:border-box;overflow:hidden;\n  border:1px solid var(--dshpc-border);border-radius:var(--dshpc-radius-md);background:var(--dshpc-surface-1);color:var(--dshpc-fg);}\n.dshpc-pfx--sm{height:var(--dshpc-control-h-sm);}\n.dshpc-pfx--md{height:var(--dshpc-control-h-md);}\n.dshpc-pfx--lg{height:var(--dshpc-control-h-lg);}\n/* md / lg 档字号跟档走（与同档下拉同字号）：此前写死 sm(12px)，同排下拉是 13px ⇒ 显得「input 字小」。 */\n.dshpc-pfx--md .dshpc-pfx__label,.dshpc-pfx--lg .dshpc-pfx__label{font-size:var(--dshpc-font-md);line-height:var(--dshpc-line-md);}\n.dshpc-pfx--md .dshpc-pfx__input,.dshpc-pfx--lg .dshpc-pfx__input{font-size:var(--dshpc-font-md);line-height:var(--dshpc-line-md);}\n.dshpc-pfx--error{border-color:var(--dshpc-danger);}\n.dshpc-pfx:focus-within{border-color:var(--dshpc-focus);box-shadow:0 0 0 1px var(--dshpc-focus);}\n.dshpc-pfx__label{padding:0 8px;color:var(--dshpc-fg-2);font-size:var(--dshpc-font-sm);line-height:var(--dshpc-line-sm);white-space:nowrap;border-right:1px solid var(--dshpc-border);}\n.dshpc-pfx__input{flex:1 1 auto;min-width:0;height:100%;padding:0 8px;border:0;background:transparent;color:var(--dshpc-fg);\n  font-family:inherit;font-size:var(--dshpc-font-sm);line-height:var(--dshpc-line-sm);outline:none;}\n.dshpc-pfx__input::placeholder{color:var(--dshpc-fg-dim);}\n\n.dshpc-num{display:inline-flex;align-items:center;justify-content:space-between;box-sizing:border-box;overflow:hidden;\n  border:1px solid var(--dshpc-border);border-radius:var(--dshpc-radius-md);background:var(--dshpc-surface-1);color:var(--dshpc-fg);}\n/* 中段：数字 + 后缀成组居中；容器被消费端拉宽时吃掉全部余量，两端 − / + 因此钉死在左右边缘。 */\n.dshpc-num__mid{display:flex;align-items:center;justify-content:center;flex:1 1 auto;min-width:0;}\n.dshpc-num--sm{height:var(--dshpc-control-h-sm);}\n.dshpc-num--md{height:var(--dshpc-control-h-md);}\n.dshpc-num--lg{height:var(--dshpc-control-h-lg);}\n.dshpc-num--md .dshpc-num__input,.dshpc-num--lg .dshpc-num__input{font-size:var(--dshpc-font-md);line-height:var(--dshpc-line-md);}\n.dshpc-num--md .dshpc-num__suffix,.dshpc-num--lg .dshpc-num__suffix{font-size:var(--dshpc-font-md);}\n.dshpc-num--disabled{opacity:.5;}\n/* 焦点态与 Input 同款（2026-10-20 用户：数字框里点进去没有蓝框）：内层 input 无边框，\n   焦点状态画在整个步进控件外框上。 */\n.dshpc-num:focus-within{border-color:var(--dshpc-focus);box-shadow:0 0 0 1px var(--dshpc-focus);}\n.dshpc-num__input{width:36px;height:100%;padding:0 2px;border:0;background:transparent;color:var(--dshpc-fg);\n  font-family:inherit;font-size:var(--dshpc-font-sm);line-height:var(--dshpc-line-sm);text-align:center;outline:none;}\n.dshpc-num__suffix{padding:0 6px;color:var(--dshpc-fg-2);font-size:var(--dshpc-font-sm);white-space:nowrap;}\n.dshpc-num .dshpc-iconbtn{border-radius:0;color:var(--dshpc-fg-2);flex:none;}\n\n/* 官方 Switch 包装统一：选中 = success 绿。\n   （合并原先 task-editor-css / task-list 两处就地覆盖；选择器带包装类 + role，特异性高于官方。） */\n.dshpc-switch button[role='switch'][aria-checked='true']{background:var(--dshpc-success);}\n\n/* 多行文本输入（提示词等，P3）：**边框 / 圆角 / 底 / 焦点态与 Input 同一套口径**（用户 2026-10-20：\n   「多行输入应该和 input 的边儿是一个道理，包括圆角在内，都是一个东西」）。\n   ⚠️ 旧意图「卡内无边框、视觉重心在整张卡上」已作废 —— 现在它就是一只带框的多行输入框。\n   （从 task-editor-css 的 .dshpc-ed-prompt 上提而来；业务文件不再自写 textarea 皮肤。） */\n.dshpc-textarea{display:block;width:100%;box-sizing:border-box;min-height:132px;padding:8px 12px;\n  border:1px solid var(--dshpc-border);border-radius:var(--dshpc-radius-md);outline:none;\n  background:var(--dshpc-surface-1);color:var(--dshpc-fg);font-family:inherit;font-size:var(--dshpc-font-lg);line-height:1.6;resize:vertical;\n  transition:border-color var(--dshpc-dur-fast) var(--dshpc-ease),box-shadow var(--dshpc-dur-fast) var(--dshpc-ease);}\n.dshpc-textarea::placeholder{color:var(--dshpc-fg-dim);}\n.dshpc-textarea:focus{border-color:var(--dshpc-focus);box-shadow:0 0 0 1px var(--dshpc-focus);}\n/* 校验不通过：与 Input 一致，走边框描红（旧版是 box-shadow 描红盒，与 Input 不同口径） */\n.dshpc-textarea--error{border-color:var(--dshpc-danger);}\n.dshpc-textarea:disabled{cursor:default;opacity:.5;}\n@media (prefers-reduced-motion: reduce){.dshpc-textarea{transition:none;}}\n\n/* 拖拽分隔条（编辑分栏 / 预览 dock 共用，U20 #3）：6px 命中区，col-resize，不画线，hover/按下浮出浅带。\n   具体 z-index 由 .dshpc-ed-resizer / .dshpc-sv-resizer 各自补。 */\n.dshpc-resizer{position:absolute;top:0;bottom:0;left:0;width:6px;cursor:col-resize;background:0 0;touch-action:none;user-select:none;}\n.dshpc-resizer:hover,.dshpc-resizer:active{background:var(--dshpc-hover,rgba(38,49,72,.06));}\n\n@media (prefers-reduced-motion: reduce){.dshpc-input,.dshpc-pfx{transition:none;}}\n";
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/controls/loading-css.generated.js
		const LOADING_CSS = "\n/* 运行中 / loading 的活动指示：三个小方块依次脉动。 */\n@keyframes dshpc-run-block { 0%, 80%, 100% { opacity: 0.25; transform: scale(0.8) } 40% { opacity: 1; transform: scale(1) } }\n.dshpc-run-blocks { display: inline-flex; align-items: center; gap: 3px; }\n.dshpc-run-blocks > i { width: 5px; height: 5px; border-radius: 1px; background: currentColor; animation: dshpc-run-block 1.2s ease-in-out infinite; }\n.dshpc-run-blocks > i:nth-child(2) { animation-delay: 0.15s; }\n.dshpc-run-blocks > i:nth-child(3) { animation-delay: 0.3s; }\n@media (prefers-reduced-motion: reduce) { .dshpc-run-blocks > i { animation: none; opacity: 1; } }\n";
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/controls/back-to-top-css.generated.js
		const BACK_TO_TOP_CSS = "\n/* 回到顶部悬浮钮：圆钮、实面、投影；默认隐身，滚过阈值加 .is-visible 才显形。\n   横向 left 由组件按主内容列右缘实时算出（贴在其右侧外侧），不写死。 */\n.dshpc-backtotop{\n  position:fixed;\n  bottom:var(--dshpc-space-4);\n  z-index:var(--dshpc-z-dock);\n  width:44px;height:44px;\n  display:inline-flex;align-items:center;justify-content:center;\n  padding:0;margin:0;\n  box-sizing:border-box;\n  border:1px solid var(--dshpc-border);\n  border-radius:50%;\n  background:var(--dshpc-solid);\n  color:var(--dshpc-on-solid);\n  box-shadow:var(--dshpc-shadow-2);\n  cursor:pointer;\n  opacity:0;\n  transform:translateY(8px) scale(.92);\n  transition:opacity var(--dshpc-dur) var(--dshpc-ease),\n             transform var(--dshpc-dur) var(--dshpc-ease),\n             background-color var(--dshpc-dur-fast) var(--dshpc-ease);\n  pointer-events:none;\n}\n.dshpc-backtotop.is-visible{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}\n.dshpc-backtotop:hover{background:var(--dshpc-hover);}\n.dshpc-backtotop:active{background:var(--dshpc-active);}\n.dshpc-backtotop:focus-visible{outline:2px solid var(--dshpc-focus);outline-offset:2px;}\n@media (prefers-reduced-motion: reduce){\n  .dshpc-backtotop{transition:opacity var(--dshpc-dur-fast) linear;transform:none;}\n}\n";
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/controls/hint-css.generated.js
		const HINT_CSS = "\n/* ── 问号提示 P4（用户 2026-10-18：对齐真实插件 HelpButton——**带圈的问号图标**）──\n   本体 14px 细圈 + 圈内 ?，颜色 fg-3、hover 只提亮不加底（与 dshpc-ed-help 同规矩）。\n   气泡不在本文件：2026-10-19 用户拍板「问号必须用官方 Tooltip 那一个」⇒ 气泡由注入的\n   官方组件渲染（src/ui/tooltip.ts），这里只管问号图标本身。 */\n.dshpc-hint{display:inline-flex;align-items:center;justify-content:center;flex:none;\n  box-sizing:border-box;width:14px;height:14px;padding:0;border:1px solid currentColor;border-radius:50%;background:transparent;\n  color:var(--dshpc-fg-3);font-family:inherit;font-size:8px;font-weight:600;line-height:12px;cursor:help;vertical-align:middle;\n  transition:color var(--dshpc-dur-fast) var(--dshpc-ease);}\n.dshpc-hint:hover,.dshpc-hint:focus-visible{color:var(--dshpc-fg);background:0 0;}\n.dshpc-hint:focus-visible{outline:2px solid var(--dshpc-focus);outline-offset:1px;}\n";
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/controls/datetime-css.generated.js
		const DATETIME_CSS = "/* 日期时间选择器（DateTimePicker）。类名 dshpc-dt-*；配色只吃 token，明暗随 token 切换。\n   结构：触发器（range = 一个整条：两个日期区 + 样式画的灰隔条；single = 单日期）→ 浮层\n   （两个独立端框 + 两块独立日历 + 底部动作）。\n   浮层行为与 Picker 一致：portal 到 body、贴边翻转、点外关闭、无遮罩。 */\n.dshpc-dt{position:relative;display:inline-block;font-size:13px;line-height:20px}\n.dshpc-dt__trigger{\n  display:inline-flex;align-items:center;justify-content:space-between;gap:6px;\n  max-width:100%;height:var(--dshpc-control-h-md);padding:0 8px;\n  color:var(--dshpc-fg);background:var(--dshpc-surface-1);\n  border:1px solid var(--dshpc-border);border-radius:var(--dshpc-radius-md);cursor:pointer;\n}\n.dshpc-dt__trigger--sm{height:var(--dshpc-control-h-sm);font-size:12px}\n.dshpc-dt__trigger--lg{height:var(--dshpc-control-h-lg)}\n.dshpc-dt__trigger:disabled{color:var(--dshpc-fg-dim);cursor:not-allowed;opacity:.7}\n/* 焦点与基础 Input 完全同款（点击即蓝描边 + 1px 光环）。 */\n.dshpc-dt__trigger:focus{border-color:var(--dshpc-focus);box-shadow:0 0 0 1px var(--dshpc-focus)}\n.dshpc-dt__trigger-label{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;font-variant-numeric:tabular-nums}\n.dshpc-dt__trigger-label--empty{color:var(--dshpc-fg-dim)}\n.dshpc-dt__cal{flex:none;color:var(--dshpc-fg-3)}\n/* range 触发器：一个整条里两个日期区 + 样式画出来的灰隔条（左右两条竖边），点整条都展开。 */\n/* 组撑满触发器内容高度，隔条才能上下顶到 border。 */\n.dshpc-dt__pair-group{flex:1 1 auto;min-width:0;align-self:stretch;display:flex;align-items:center;gap:8px}\n/* 两个日期区平分（flex:1 1 0）：开始 / 结束永远一样宽，不随内容偏袒。 */\n.dshpc-dt__pair-date{flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}\n.dshpc-dt__pair-date--empty{color:var(--dshpc-fg-dim)}\n/* 隔条：上下顶到触发器 border（与边框连起来），中间隔出一块；块里放「到」的符号（-，用户 2026-10-24 拍板）。 */\n.dshpc-dt__pair-sep{\n  flex:none;align-self:stretch;width:22px;margin:0;\n  display:inline-flex;align-items:center;justify-content:center;\n  background:var(--dshpc-surface-sunken);\n  border-left:1px solid var(--dshpc-border);border-right:1px solid var(--dshpc-border);\n  color:var(--dshpc-fg-3);font-size:12px;line-height:1;\n}\n/* 默认宽：**固定**（选中前后不变），数值对照参考图实测（2x 屏，换算 CSS px）后\n   统一 -6px（用户 2026-10-24：实测值留得偏多）：\n   单值 day 128 / 时·分 153.2 / 秒 174.8；区间 day 269 / 分 341.4 / 秒 377.6。\n   ch = 字体里 \"0\" 的宽（日期 tabular-nums 等宽）⇒ 写成 Nch + 常数；常数同时兜住\n   默认占位「请选择日期时间」（7 汉字）不省略。调用方要另给宽：className 传 width。 */\n.dshpc-dt__trigger--w-day{width:calc(10ch + 56px)}\n.dshpc-dt__trigger--w-minute{width:calc(16ch + 38px)}\n.dshpc-dt__trigger--w-second{width:calc(19ch + 38px)}\n.dshpc-dt__trigger--wr-day{width:calc(20ch + 125px)}\n.dshpc-dt__trigger--wr-minute{width:calc(32ch + 111px)}\n.dshpc-dt__trigger--wr-second{width:calc(38ch + 104px)}\n\n.dshpc-dt__pop{\n  z-index:60;padding:10px;user-select:none;\n  font-size:13px;line-height:20px;\n  background:var(--dshpc-surface-menu);border:1px solid var(--dshpc-border);\n  border-radius:var(--dshpc-radius-md);box-shadow:0 8px 24px rgba(15,23,42,.12);\n}\n/* 两个独立端框（range）：点哪个哪个成为当前编辑端，互不联动、只是排在一起。 */\n.dshpc-dt__ends{display:flex;gap:6px;margin-bottom:8px}\n.dshpc-dt__end{\n  flex:1 1 0;min-width:0;display:flex;align-items:center;gap:6px;padding:4px 8px;\n  text-align:left;background:var(--dshpc-surface-1);\n  border:1px solid var(--dshpc-border-faint);border-radius:var(--dshpc-radius-sm);cursor:pointer;\n}\n.dshpc-dt__end--active{border-color:var(--dshpc-business);background:var(--dshpc-open-bg)}\n.dshpc-dt__end:focus-visible{outline:2px solid var(--dshpc-focus);outline-offset:1px}\n.dshpc-dt__end-label{flex:none;font-size:11px;line-height:16px;color:var(--dshpc-fg-3);white-space:nowrap}\n.dshpc-dt__end-value{font-size:12px;line-height:18px;color:var(--dshpc-fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}\n.dshpc-dt__end-value--empty{color:var(--dshpc-fg-dim)}\n\n.dshpc-dt__nav{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}\n.dshpc-dt__nav-group{display:flex;gap:2px}\n.dshpc-dt__nav-btn{\n  display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;\n  color:var(--dshpc-fg-2);background:none;border:0;border-radius:var(--dshpc-radius-sm);cursor:pointer;\n}\n.dshpc-dt__nav-btn:hover{background:var(--dshpc-surface-sunken);color:var(--dshpc-fg)}\n.dshpc-dt__nav-btn:focus-visible{outline:2px solid var(--dshpc-focus);outline-offset:-1px}\n.dshpc-dt__caption{font-size:13px;font-weight:600;color:var(--dshpc-fg);white-space:nowrap}\n\n.dshpc-dt__grid{display:grid;grid-template-columns:repeat(7,30px);gap:2px}\n.dshpc-dt__wd{height:20px;font-size:11px;line-height:20px;color:var(--dshpc-fg-3);text-align:center}\n.dshpc-dt__cell{\n  height:26px;padding:0;font-size:12px;font-variant-numeric:tabular-nums;\n  color:var(--dshpc-fg);background:none;border:0;border-radius:var(--dshpc-radius-sm);cursor:pointer;\n}\n.dshpc-dt__cell:hover{background:var(--dshpc-surface-sunken)}\n.dshpc-dt__cell:focus-visible{outline:2px solid var(--dshpc-focus);outline-offset:-1px}\n.dshpc-dt__cell--out{color:var(--dshpc-fg-dim)}\n.dshpc-dt__cell--today{color:var(--dshpc-business);font-weight:600}\n/* 起 / 止端：品牌蓝实面反白（与 Segmented weekday 选中同口径）。 */\n.dshpc-dt__cell--sel{background:var(--dshpc-business);color:var(--dshpc-fg-inverse);font-weight:600}\n.dshpc-dt__cell--sel:hover{background:var(--dshpc-business-hover)}\n\n/* 两块日历面板（range：左开始、右结束，各选各的）。 */\n.dshpc-dt__panels{display:flex;gap:14px;align-items:flex-start}\n.dshpc-dt__panel{display:flex;flex-direction:column;gap:6px}\n\n.dshpc-dt__time{display:flex;align-items:flex-end;justify-content:center;gap:4px;margin-top:2px;padding-top:8px;border-top:1px solid var(--dshpc-border-faint)}\n.dshpc-dt__unit{display:flex;flex-direction:column;align-items:center;gap:2px}\n.dshpc-dt__unit-label{font-size:10px;line-height:14px;color:var(--dshpc-fg-3)}\n.dshpc-dt__step-btn{\n  display:inline-flex;align-items:center;justify-content:center;width:34px;height:14px;padding:0;\n  color:var(--dshpc-fg-2);background:none;border:0;border-radius:var(--dshpc-radius-sm);cursor:pointer;\n}\n.dshpc-dt__step-btn:hover{background:var(--dshpc-surface-sunken);color:var(--dshpc-fg)}\n.dshpc-dt__step-btn:focus-visible{outline:2px solid var(--dshpc-focus);outline-offset:-1px}\n.dshpc-dt__step-val{\n  width:34px;height:24px;padding:0;box-sizing:border-box;text-align:center;\n  font-size:13px;font-variant-numeric:tabular-nums;color:var(--dshpc-fg);\n  background:var(--dshpc-surface-sunken);border:1px solid var(--dshpc-border-faint);\n  border-radius:var(--dshpc-radius-sm);outline:none;\n}\n.dshpc-dt__step-val:focus{border-color:var(--dshpc-focus);box-shadow:0 0 0 1px var(--dshpc-focus)}\n.dshpc-dt__step-val:disabled{color:var(--dshpc-fg-dim);cursor:not-allowed}\n.dshpc-dt__sep{padding-bottom:5px;color:var(--dshpc-fg-3);font-size:12px}\n\n.dshpc-dt__foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--dshpc-border-faint)}\n.dshpc-dt__foot-side{display:flex;align-items:center;gap:6px}\n.dshpc-dt__warn{font-size:11px;color:var(--dshpc-warning-label);white-space:nowrap}\n";
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/marquee-css.generated.js
		const MARQUEE_CSS = "/* 跑马灯（MarqueeText）：双层——外层只裁剪，内层才 transform 滚动；非 hover 内层自带省略号。\n   2026-10-20：本文件原是杂烩「select.css」（下拉 / 日历 / 时分的皮肤都装过），随着那些控件\n   一个个删完，最后只剩跑马灯，故按本包「一个 css 服务一个对象」的格局改名归档。\n   同批清掉的还有零引用的省略号类 .dshpc-ellipsis —— 本包三个用到截断的地方都没采纳它。 */\n.dshpc-mq{display:block;overflow:hidden;white-space:nowrap;}\n.dshpc-mq .dshpc-mq-in{display:inline-block;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;vertical-align:top;}\n/* ⚠️ 跑法（用户 2026-10-03 拍板）：**跑一遍、停在尾字**（播放 1 次 + forwards），不来回弹、不无限跑。\n   滚距 = 精确溢出量 ⇒ 停下时最后一个字正好贴右缘，**不会跑进黑块**（黑块是旧手写版把\n   内层盒子裁了、按「半截文本」平移导致的）。鼠标移开 ⇒ :hover 失效 ⇒ 自动复位回省略号态。 */\n.dshpc-mq-run:hover .dshpc-mq-in{max-width:none;overflow:visible;animation:dshpc-mq-scroll var(--dshpc-mq-dur,6s) linear .4s 1 forwards;}\n@keyframes dshpc-mq-scroll{from{transform:translateX(0)}to{transform:translateX(var(--dshpc-mq-dist,-40px))}}\n/* 溢出渐影（用户 2026-10-24 拍板「左右稍微有点渐影」；官方口径 = dsh-client-ui-primitives@0.2.1-rc.2\n   PathLabel.module.css:13-15：mask-image 线性渐隐 + 28px 随官方）。⚠️ 只在 **hover 滚动态** 加：\n   静态态（三个点）不要渐影（用户 2026-10-24 二次拍板），hover 滚动时两端渐影——左缘柔化被裁的文字头。 */\n.dshpc-mq-run:hover{mask-image:linear-gradient(to right, transparent, #000 28px, #000 calc(100% - 28px), transparent);}\n";
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/picker-css.generated.js
		const PICKER_CSS = "\n.dshpc-picker{position:relative;display:inline-block;max-width:100%;font-size:13px;line-height:20px}\n.dshpc-picker__trigger{\n  display:inline-flex;align-items:center;justify-content:space-between;gap:6px;\n  min-width:120px;max-width:100%;height:28px;padding:0 8px;\n  color:var(--dshpc-fg);background:var(--dshpc-surface-1);\n  border:1px solid var(--dshpc-border);border-radius:var(--dshpc-radius-md);cursor:pointer;\n}\n.dshpc-picker__trigger:disabled{color:var(--dshpc-fg-dim);cursor:not-allowed;opacity:.7}\n/* 聚焦（键盘或点击选中）时与全站一致的蓝色描边；菜单打开后焦点会进去，触发器自然失去焦点。 */\n.dshpc-picker__trigger:focus-visible{outline:2px solid var(--dshpc-focus);outline-offset:1px}\n/* 文字默认靠左（吃掉剩余宽度），不给 space-between 把短文案推到中间的机会；\n   确实要居中就显式传 align=\"center\"。 */\n.dshpc-picker__label{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}\n.dshpc-picker__trigger--center .dshpc-picker__label{text-align:center}\n.dshpc-picker__caret{flex:none;color:var(--dshpc-fg-3)}\n.dshpc-picker__icon{display:inline-flex;flex:none;color:var(--dshpc-fg-2)}\n.dshpc-picker__option-icon{display:inline-flex;flex:none;color:var(--dshpc-fg-2)}\n.dshpc-picker__menu{\n  z-index:60;max-height:280px;overflow:auto;padding:4px;\n  /* 菜单经 FloatingPortal 挂到 body，脱离 .dshpc-picker，须显式字号，否则继承 body 的大字号 */\n  font-size:13px;line-height:20px;\n  background:var(--dshpc-surface-menu);border:1px solid var(--dshpc-border);\n  border-radius:var(--dshpc-radius-md);box-shadow:0 8px 24px rgba(15,23,42,.12);\n}\n/* 尺寸档（与 Field 的 sm/md/lg 对应）。 */\n.dshpc-picker__trigger--sm{height:24px;font-size:12px}\n.dshpc-picker__trigger--lg{height:32px}\n/* 键盘游标所在项（无 hover 也要看得见）。 */\n.dshpc-picker__option[data-active='true']{background:var(--dshpc-surface-sunken);outline:1px solid var(--dshpc-border)}\n.dshpc-picker__option--clear{color:var(--dshpc-fg-3)}\n.dshpc-picker__search{\n  width:100%;height:28px;margin-bottom:4px;padding:0 8px;box-sizing:border-box;\n  color:var(--dshpc-fg);background:var(--dshpc-surface-sunken);\n  border:1px solid var(--dshpc-border-faint);border-radius:var(--dshpc-radius-md);outline:none;\n}\n.dshpc-picker__group-label{\n  padding:6px 8px 2px;color:var(--dshpc-fg-3);font-size:11px;\n}\n.dshpc-picker__option{\n  display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:var(--dshpc-radius-sm);cursor:pointer;\n  color:var(--dshpc-fg);white-space:nowrap;\n}\n.dshpc-picker__option:hover{background:var(--dshpc-surface-sunken)}\n.dshpc-picker__option--active{background:var(--dshpc-open-bg);color:var(--dshpc-business)}\n.dshpc-picker__option--disabled{color:var(--dshpc-fg-dim);cursor:not-allowed}\n/* 选项文字吃掉剩余宽度：超长省略号（配合 MarqueeText hover 跑马灯），不撑宽菜单。 */\n.dshpc-picker__option-label{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.dshpc-picker__tick{width:12px;color:var(--dshpc-business)}\n.dshpc-picker__empty{padding:8px;color:var(--dshpc-fg-3);text-align:center}\n.dshpc-picker__degraded{\n  padding:6px 8px;margin-bottom:4px;border-radius:var(--dshpc-radius-sm);\n  color:var(--dshpc-warning-label);background:color-mix(in srgb,var(--dshpc-warning) 12%,transparent);\n  font-size:11px;\n}\n.dshpc-picker__row{display:flex;align-items:center;gap:8px}\n";
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/feedback-css.generated.js
		const FEEDBACK_CSS = "\n/* 遮罩 = 宿主遮罩变量 --dsw-alias-bg-mask-1（与官方 Modal / 兄弟项目 --tdt-mask 同一条真值，用户 2026-10-20）。 */\n/* 右边界让位页面级分栏（PanelDock 发布的 --dshpc-page-inset-right，用户 2026-10-22）：\n   分栏不被压暗、照常可点；弹窗在这块**剩下**的区域里居中，就像整页被推出去一样。 */\n.dshpc-modal-mask{\n  position:fixed;inset:0 var(--dshpc-page-inset-right,0px) 0 0;z-index:1070;\n  display:flex;align-items:center;justify-content:center;\n  background:var(--dshpc-mask);\n}\n/* 大弹窗家族（md/lg）：抄兄弟项目 archive-session-css 的 .dsh-tdt-sv-panel（surface-base + border-l2 + radius 12 + shadow-2）。 */\n.dshpc-modal{\n  display:flex;flex-direction:column;box-sizing:border-box;\n  background:var(--dshpc-surface-base);color:var(--dshpc-fg);\n  border:1px solid var(--dshpc-border);border-radius:var(--dshpc-radius-md);\n  box-shadow:var(--dshpc-shadow-2);overflow:hidden;\n}\n.dshpc-modal__head{\n  display:flex;align-items:center;gap:8px;padding:18px 31px 12px;\n  border-bottom:1px solid var(--dshpc-border);flex-wrap:wrap;\n}\n/* 标题组：第一行 = 标题 + 右侧小块（徽标紧跟标题），第二行 = 副标题。 */\n.dshpc-modal__titlegroup{display:flex;flex-direction:column;gap:2px;min-width:0;flex:0 1 auto}\n.dshpc-modal__titlerow{display:flex;align-items:center;gap:8px;min-width:0}\n.dshpc-modal__title{font-size:var(--dshpc-font-lg);font-weight:600;line-height:1.4;min-width:0}\n/* 标题下副标题行（兄弟项目 .dsh-tdt-sv-sid：等宽字体、caption 色、可换行）。 */\n.dshpc-modal__sid{font-family:var(--ds-font-family-code,monospace);font-size:var(--dshpc-font-xs);color:var(--dshpc-fg-3);word-break:break-all}\n/* 关闭按钮：24×24 方角图标位，不借用 Picker 的触发器皮肤（那份带 min-width:120px）。 */\n.dshpc-modal__close{\n  display:inline-flex;align-items:center;justify-content:center;flex:none;\n  width:20px;height:20px;padding:0;border:none;border-radius:var(--dshpc-radius-sm);\n  background:transparent;color:var(--dshpc-fg-3);font-family:inherit;font-size:13px;line-height:1;cursor:pointer;\n  transition:background-color var(--dshpc-dur-fast) var(--dshpc-ease),color var(--dshpc-dur-fast) var(--dshpc-ease);\n}\n.dshpc-modal__close:hover{background:var(--dshpc-hover);color:var(--dshpc-fg)}\n.dshpc-modal__close:focus-visible{outline:2px solid var(--dshpc-focus);outline-offset:1px}\n/* body = 唯一滚动容器：内距与滚动都归它（滚动条贴面板右缘，不被内距挤进来）；\n   内容按流排，不设 height:100%、不自己开滚动条。 */\n.dshpc-modal__body{flex:1 1 auto;min-height:0;overflow:auto;padding:17px 31px}\n.dshpc-modal__foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 31px 18px}\n.dshpc-toast-host{\n  position:fixed;z-index:1090;left:50%;bottom:32px;transform:translateX(-50%);\n  display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;\n}\n.dshpc-toast{\n  padding:8px 14px;border-radius:8px;font-size:13px;color:var(--dshpc-fg);\n  background:var(--dshpc-surface-menu);border:1px solid var(--dshpc-border);\n  box-shadow:0 8px 24px rgba(15,23,42,.16);\n}\n.dshpc-toast--success{color:var(--dshpc-success);border-color:color-mix(in srgb,var(--dshpc-success) 40%,transparent)}\n.dshpc-toast--error{color:var(--dshpc-danger);border-color:color-mix(in srgb,var(--dshpc-danger) 40%,transparent)}\n.dshpc-error__retry{\n  margin-top:8px;color:var(--dshpc-link);cursor:pointer;background:none;border:none;padding:0;\n}\n/* 原生弹窗演示：经宿主 Modal 的 contentClassName 注入，证明宿主内容区尺寸可经类名自定义。 */\n.dshpc-native-demo-content{max-width:520px}\n/* Modal 头部四槽：左图标 / 标题组 / 弹性间隔 / 右侧动作区 + 关闭钮。 */\n.dshpc-modal__heading{display:flex;align-items:center;gap:8px;min-width:0;flex:0 1 auto}\n.dshpc-modal__lead{flex:none;display:inline-flex;align-items:center;justify-content:center;font-size:16px;line-height:1}\n.dshpc-modal__extra{flex:none;display:inline-flex;align-items:center}\n.dshpc-modal__spacer{flex:1 1 auto;min-width:8px}\n.dshpc-modal__actions{flex:none;display:flex;align-items:center;gap:8px}\n/* 头部信号图标（AlertModal 按 severity 注入）：自含配色，不依赖宿主 token。 */\n.dshpc-alert-sev{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;font-size:12px;color:#fff;flex:none}\n.dshpc-alert-sev--info{background:#2563eb}\n.dshpc-alert-sev--success{background:#16a34a}\n.dshpc-alert-sev--warning{background:#d97706}\n.dshpc-alert-sev--error{background:#dc2626}\n/* 小确认框家族（sm）：严格抄兄弟项目 renderConfirm 的 dialogStyle（task-list.tsx:456）——\n   360px 宽 / 18px 内距 / 头部无分隔线 / 说明文字 fg-2 / 底部按钮右对齐。 */\n.dshpc-modal--sm{padding:18px}\n.dshpc-modal--sm .dshpc-modal__head{padding:0 0 8px;border-bottom:none}\n.dshpc-modal--sm .dshpc-modal__body{padding:0 0 14px;overflow:visible;font-size:var(--dshpc-font-sm);color:var(--dshpc-fg-2);line-height:var(--dshpc-line-sm)}\n.dshpc-modal--sm .dshpc-modal__foot{padding:0}\n";
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/card-css.generated.js
		const CARD_CSS = "\n.dshpc-card{\n  position:relative;box-sizing:border-box;color:var(--dshpc-fg);font:inherit;text-align:left;\n  --card-accent:var(--dshpc-business);\n  --card-accent-soft:var(--dshpc-business-soft);\n}\n/* 档位 → token（照 records-timeline 的 tone 模式：一个变量切档，不写 5 套规则；浅底与色条同源）。 */\n.dshpc-card--success{--card-accent:var(--dshpc-success);--card-accent-soft:var(--dshpc-success-soft)}\n.dshpc-card--warning{--card-accent:var(--dshpc-warning);--card-accent-soft:var(--dshpc-warning-soft)}\n.dshpc-card--danger{--card-accent:var(--dshpc-danger);--card-accent-soft:var(--dshpc-danger-soft)}\n/* neutral 浅底借 chip 底（兄弟项目 mute 档同款：明暗都成立）。 */\n.dshpc-card--neutral{--card-accent:var(--dshpc-fg-4);--card-accent-soft:var(--dshpc-chip-bg)}\n\n/* 头部一行 = 色条 + 主内容 + 右侧槽，**整体垂直居中**：调用方在 action 里裸放一个元素\n   （按钮 / 文字 / 图标）不用自己套容器居中；一行两行、右边怎么放由调用方在框内自定。 */\n.dshpc-card__head{display:flex;align-items:center;gap:8px;min-width:0}\n.dshpc-card__main{flex:1;min-width:0}\n.dshpc-card__side{display:flex;align-items:center;gap:6px;flex:none}\n\n/* ── 外观一 · StripCard：同色系浅底 + 1px 不可见占位边框 + 方角 + 4px 通高方角色条贴左缘 ── */\n.dshpc-card--strip{\n  padding:12px 12px 12px 20px;border:1px solid transparent;\n  background:var(--card-accent-soft,transparent);\n}\n/* 左内边距 20px = 16 留白 + 4 条宽 ⇒ 内容从色条右缘起算；色条绝对定位通高，跟着内容高度自适应。 */\n.dshpc-card--strip .dshpc-card__bar{position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--card-accent)}\n\n/* ── 外观二 · Card：surface 底 + 1px 实色边框 + 圆角 + 行内圆角短条 ── */\n.dshpc-card--bordered{\n  /* 左内边距 12（比上/右/下 14 少 2）：竖条贴近边框；头部内缩 2px ⇒ 主内容跟着左移 2px，\n     竖条↔内容的 12px 间距不变——比「条子 left:-2 而内容不动」更正规（不靠相对定位硬补）。 */\n  padding:14px 14px 14px 12px;border:1px solid var(--dshpc-border);border-radius:var(--dshpc-radius-sm);\n  background:var(--dshpc-surface-1);\n}\n.dshpc-card--bordered .dshpc-card__head{gap:12px}\n/* 短条：行内 flex 项，**高度跟着内容走**（stretch），最小一行文字（--dshpc-line-md）——\n   一行文字时条子与文字齐高，不会把卡撑高；竖条距左 12（= 左内边距），距上/右/下 14。 */\n.dshpc-card--bordered .dshpc-card__bar{width:6px;flex:none;align-self:stretch;min-height:var(--dshpc-line-md);border-radius:var(--dshpc-radius-xs);background:var(--card-accent)}\n.dshpc-card__toggle{\n  display:inline-flex;align-items:center;justify-content:center;\n  width:24px;height:24px;padding:0;background:none;border:none;border-radius:6px;\n  color:var(--dshpc-fg-3);cursor:pointer;\n}\n.dshpc-card__toggle:hover{background:var(--dshpc-surface-sunken);color:var(--dshpc-fg)}\n/* 箭头是 svg（Chevron），不是字形 ⇒ 不要 font-size；inline-flex 免掉 svg 的基线留白。 */\n.dshpc-card__caret{display:inline-flex;transition:transform .15s ease}\n.dshpc-card__caret.is-open{transform:rotate(180deg)}\n.dshpc-card__panel{margin-top:8px;padding-top:8px;border-top:1px solid var(--dshpc-border-faint)}\n";
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/chip-css.generated.js
		const CHIP_CSS = "\n/* 三条局部变量承载配色：neutral 走旧灰面；语义档换底字配对（2026-10-20 用户要多色多尺寸标签）。 */\n.dshpc-chip{--chip-bg:var(--dshpc-chip-bg);--chip-fg:var(--dshpc-fg);--chip-bg-hover:var(--dshpc-chip-bg-hover);\n  display:inline-flex;align-items:center;justify-content:center;gap:4px;padding:1px 8px;\n  box-sizing:border-box;border-radius:var(--dshpc-radius-pill,999px);border:none;\n  background:var(--chip-bg);color:var(--chip-fg);\n  font-family:inherit;font-size:11px;line-height:18px;margin:0;\n  /* 2026-10-18：chip 是 flex 行里的常用项，禁止被压缩换行（预览站出现过文字竖排、互相叠压的挤压）。 */\n  white-space:nowrap;flex:none;\n  appearance:none;-webkit-appearance:none;\n}\n/* md 档：卡片元信息行等稍大场景；sm 即旧版默认，逐像素不动。 */\n.dshpc-chip--md{padding:2px 10px;font-size:12px;line-height:20px;}\n/* xs 档：标题后缀等极紧凑场景（2026-10-20 用户要更小标签）；16px 高、font 10。 */\n.dshpc-chip--xs{padding:0 6px;font-size:10px;line-height:16px;}\n/* 语义色实心档：底 / 字 / hover 配对与 Button 同源（黄底中高明度 ⇒ 字用 --dshpc-on-warning）。 */\n.dshpc-chip--business{--chip-bg:var(--dshpc-business);--chip-fg:var(--dshpc-on-signal);--chip-bg-hover:var(--dshpc-business-hover);}\n.dshpc-chip--success{--chip-bg:var(--dshpc-success);--chip-fg:var(--dshpc-on-signal);--chip-bg-hover:var(--dshpc-success-hover);}\n.dshpc-chip--warning{--chip-bg:var(--dshpc-warning);--chip-fg:var(--dshpc-on-warning);--chip-bg-hover:var(--dshpc-warning-hover);}\n.dshpc-chip--danger{--chip-bg:var(--dshpc-danger);--chip-fg:var(--dshpc-on-signal);--chip-bg-hover:var(--dshpc-danger-hover);}\n/* 可点态：button 渲染（见 Chip.ts），光标 + hover 加深。 */\n.dshpc-chip--clickable{cursor:pointer;transition:background-color var(--dshpc-dur-fast) var(--dshpc-ease);}\n.dshpc-chip--clickable:hover:not(:disabled){background:var(--chip-bg-hover)}\n.dshpc-chip:focus-visible{outline:2px solid var(--dshpc-focus);outline-offset:1px}\n.dshpc-chip:disabled{cursor:default;color:var(--dshpc-fg-3)}\n@media (prefers-reduced-motion: reduce){.dshpc-chip{transition:none}}\n";
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/code-viewer-css.generated.js
		const CODE_VIEWER_CSS = "/* CodeViewer（只读 CodeMirror 查看器）样式。类名固定 dshpc-cv*；颜色吃 --dshpc-* token，\n   深色由 design 的 token 深色段自动生效（不写死颜色值）。 */\n.dshpc-cv{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;}\n.dshpc-cv__copy{position:absolute;top:6px;right:6px;z-index:5;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;appearance:none;border:1px solid var(--dshpc-border,rgba(128,128,128,.35));border-radius:var(--dshpc-radius-sm,6px);background:var(--dshpc-surface-1,#fff);color:var(--dshpc-fg-2,rgba(128,128,128,.95));cursor:pointer;opacity:0;transition:opacity .12s var(--dshpc-ease,ease),background .12s,color .12s;}\n.dshpc-cv:hover .dshpc-cv__copy,.dshpc-cv__copy:focus-visible{opacity:1;}\n.dshpc-cv__copy:hover{background:var(--dshpc-hover,rgba(38,49,72,.06));color:var(--dshpc-fg,#1f2328);}\n.dshpc-cv__copy svg{width:16px;height:16px;}\n.dshpc-cv__editor{flex:1 1 auto;min-height:0;overflow:hidden;}\n.dshpc-cv__editor .cm-editor{height:100%;}\n.dshpc-cv__editor .cm-scroller{overflow:auto;}\n";
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/panel-dock-css.generated.js
		const PANEL_DOCK_CSS = "\n/* 停靠栏 = **布局成员**，不是浮层：它占宽度、把主区真正挤窄（兄弟项目 2026-09-28：\n   「分栏压过来，不是盖上去」）。所以调用方必须把它放进自己的 flex 根里。 */\n.dshpc-dock{display:flex;flex:0 0 auto;align-self:stretch;min-width:0}\n/* 开着时给主区滚动条让出一条缝：滚动条贴死分隔线很难看（用户 2026-10-28，对齐\n   dsh-better-sidebar 的留白）。全关时整条 dock 退出，缝隙一起消失、不留白边。\n   缝宽可由调用方盖 --dshpc-dock-gap；TS 侧的让位量（DOCK_GAP）要与它一致。 */\n.dshpc-dock--open{margin-left:var(--dshpc-dock-gap,1px)}\n\n/* 自动加的宿主行（openFilePreview 加 / 关闭即摘）：消费方那行不必自己写 flex。\n   只让「第一个非预览子项」当主区伸展，其余直接子项不动（页脚条、工具条不误伤）；\n   display 不在这里写死 —— 本来就是 grid 等布局的元素保持原样，由 TS 侧按计算值补 flex。 */\n.dshpc-dock-host{min-width:0;min-height:0}\n.dshpc-dock-host>:not([data-dshpc-file-preview]){min-width:0}\n.dshpc-dock-host>:first-child:not([data-dshpc-file-preview]){flex:1 1 auto}\n\n/* 单栏：sticky + 100vh 让它在页面滚动时保持可见，同时仍然占宽度。\n   ⚠️ **本条刻意不设 z-index**：布局成员一旦带正 z-index，就会无条件压过宿主 portal 到 body 的\n   弹窗（兄弟项目 2026-10-05 真机事故「侧边栏盖住宿主设置弹窗」）。层序交给 DOM 顺序裁决。 */\n.dshpc-dock__panel{\n  box-sizing:border-box;position:sticky;top:0;align-self:stretch;\n  display:flex;flex-direction:column;flex:0 0 auto;\n  /* 高度默认视口高（整页场景）；嵌在定高容器里时由调用方给 --dshpc-dock-h（如 420px / 100%）。 */\n  height:var(--dshpc-dock-h,100vh);max-height:var(--dshpc-dock-h,100vh);min-width:0;\n  background:var(--dshpc-surface-base);color:var(--dshpc-fg);\n  border-left:1px solid var(--dshpc-border);\n  transition:border-color var(--dshpc-dur-fast) var(--dshpc-ease);\n  box-shadow:var(--dshpc-shadow-2);\n  /* 入场：从 0 宽滑出来（keyframes 只写 from，终点取内联 width），打开 / 耳朵展开都走这条。 */\n  animation:dshpc-dock-in .22s var(--dshpc-ease);\n}\n/* overflow:hidden 只在动画前段（离散属性在 50% 翻转）——平时不能裁，否则挂在左缘外的\n   收起钮会被切掉一半。 */\n@keyframes dshpc-dock-in{from{width:0;opacity:0;overflow:hidden}}\n/* 收起的出场：宽度收到 0、透明淡出；落定后组件才真正摘掉这一栏（JS 延时 220ms 配合）。 */\n.dshpc-dock__panel--closing{\n  width:0!important;min-width:0!important;opacity:0;border-left-width:0;\n  transition:width .2s var(--dshpc-ease),opacity .2s var(--dshpc-ease),border-left-width .2s var(--dshpc-ease);\n}\n\n.dshpc-dock__head{\n  flex:none;display:flex;align-items:center;gap:8px;\n  /* 右侧 34px = 8(边距) + 20(关钮) + 6(呼吸)：给绝对定位的关钮留位，标题/extra 不从它底下钻 */\n  padding:10px 34px 10px 14px;\n  border-bottom:1px solid var(--dshpc-border-faint);\n}\n/* 图标位 / 标题右侧的内容位：消费方传 ReactNode，可塞多个；库只负责排布，不抢宽度。 */\n.dshpc-dock__lead{display:inline-flex;align-items:center;gap:6px;flex:none;color:var(--dshpc-fg-2)}\n.dshpc-dock__extra{display:inline-flex;align-items:center;gap:6px;flex:none;margin-left:auto}\n/* 自定义头部：整行归调用方 —— 不加内边距/边框/背景，也不给关钮留内联空间（关钮是绝对定位的）。 */\n.dshpc-dock__head--custom{display:block;padding:0;border-bottom:none}\n.dshpc-dock__title{\n  flex:1 1 auto;min-width:0;\n  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\n  font-size:var(--dshpc-font-md);font-weight:600;\n}\n/* 关闭钮：20×20 方角图标位（与 Modal 的关闭钮同规格，不借 Picker 触发器皮肤）。 */\n.dshpc-dock__close{\n  display:inline-flex;align-items:center;justify-content:center;flex:none;\n  width:20px;height:20px;padding:0;border:none;border-radius:var(--dshpc-radius-sm);\n  background:transparent;color:var(--dshpc-fg-3);\n  font-family:inherit;font-size:13px;line-height:1;cursor:pointer;\n  transition:background-color var(--dshpc-dur-fast) var(--dshpc-ease),color var(--dshpc-dur-fast) var(--dshpc-ease);\n}\n.dshpc-dock__close:hover{background:var(--dshpc-hover);color:var(--dshpc-fg)}\n.dshpc-dock__close:focus-visible{outline:2px solid var(--dshpc-focus);outline-offset:1px}\n/* 头部关钮：绝对定位，位置与内置头完全一致（top 10 / right 8）；自定义头也用这一个位置。\n   锚点是面板本身（position:sticky 即定位上下文），不在滚动内容里，所以正文滚动它不跟滚。 */\n.dshpc-dock__close--abs{position:absolute;top:10px;right:8px;z-index:8}\n/* 浮动关钮：无头部面板用，略收一点边距。 */\n.dshpc-dock__close--floating{\n  position:absolute;top:6px;right:6px;z-index:8;\n  background:var(--dshpc-surface-menu);border:1px solid var(--dshpc-border-faint);\n}\n\n/* 内容区自己滚：面板高度锁 100vh，内容不设内部滚动就会把整页撑高。 */\n.dshpc-dock__body{flex:1 1 auto;min-height:0;overflow:auto}\n\n/* 拖拽条：左缘 6px 命中区，**自己不画任何线**。\n   hover / 拖动时把面板自己的 border-left 染成蓝（用户 2026-10-28 四轮：蓝线只准改原线，\n   不准在原线旁边加一条 —— 之前在 padding box 左缘画渐变，正好叠出双线）。\n   命中区在 padding box 上、border 在它左外侧，所以只能改面板的 border 色。\n   z-index 7 必须高于面板内容里的浮层（复制钮一类），否则命中区会被内容盖住。 */\n.dshpc-dock__resizer{\n  position:absolute;left:0;top:0;bottom:0;width:6px;\n  z-index:7;cursor:col-resize;background:transparent;\n}\n.dshpc-dock__panel:has(> .dshpc-dock__resizer:hover),\n.dshpc-dock__panel--resizing{\n  /* 原线保留「上下渐隐」工作区指示条质感：把面板自己的 border-left 换成同款渐变\n     （不是另加一条线）。面板只有这一条边框、无圆角，所以只作用在线上。 */\n  border-image:linear-gradient(180deg,transparent,var(--dshpc-business) 30% 70%,transparent) 1;\n}\n\n/* 拖动期：① <iframe>（PDF / HTML 预览）是独立文档，会吞掉父文档的 pointermove，\n   向右拖进 iframe 就卡死 —— 整片让出指针事件；② contain 把重排隔离在栏内，\n   否则每帧改宽度都会牵动整页重排（兄弟项目 2026-10-04 真机「挪很久才动一下」）。 */\n.dshpc-dock.dshpc-dock--resizing iframe{pointer-events:none}\n.dshpc-dock.dshpc-dock--resizing .dshpc-dock__panel{contain:layout paint;will-change:width}\n\n/* 收起钮：**待在面板自己的框里**（用户 2026-10-28 三轮：占面板内部空间，不伸到外面去）。\n   left:0 从内侧贴着分隔线 —— 贴线的一边不描边（线是面板自己的 border-left），页签与线不重合。\n   20×44（用户 2026-10-28 四轮定尺寸）；实色底（--dshpc-plate，明暗各有实值），hover 亮一档。\n   padding-right:2px 是**视觉居中**：右侧是圆角，箭头往直线那边挪 1px（用户 2026-10-28 四轮）。 */\n.dshpc-dock__collapse{\n  position:absolute;left:0;top:50%;transform:translateY(-50%);\n  z-index:8;display:inline-flex;align-items:center;justify-content:center;\n  width:20px;height:44px;padding:0 2px 0 0;\n  border-top:1px solid var(--dshpc-border);\n  border-bottom:1px solid var(--dshpc-border);\n  border-right:1px solid var(--dshpc-border);\n  border-left:none;\n  border-radius:0 var(--dshpc-radius-sm) var(--dshpc-radius-sm) 0;\n  background:var(--dshpc-plate);color:var(--dshpc-fg-3);\n  font-family:inherit;font-size:16px;line-height:1;cursor:pointer;\n  transition:background-color var(--dshpc-dur-fast) var(--dshpc-ease),color var(--dshpc-dur-fast) var(--dshpc-ease);\n}\n.dshpc-dock__collapse:hover{background:var(--dshpc-plate-hover);color:var(--dshpc-fg)}\n.dshpc-dock__collapse:focus-visible{outline:2px solid var(--dshpc-focus);outline-offset:1px}\n\n/* 收起后的浮动耳朵：**fixed 贴右缘、垂直居中、独立于分栏**（用户 2026-10-28 定稿：\n   小页签挂中间、里面放面板图标、不显示文字，箭头与收起钮反向）。多个按收起顺序纵向堆叠。\n   z 走 dock 档（低于宿主弹窗），避免盖住宿主 portal 层。 */\n.dshpc-dock__ears{\n  position:fixed;top:50%;right:0;transform:translateY(-50%);\n  z-index:var(--dshpc-z-dock,1030);\n  display:flex;flex-direction:column;gap:8px;align-items:flex-end;\n  pointer-events:none;\n}\n.dshpc-dock__ear{\n  pointer-events:auto;display:inline-flex;align-items:center;justify-content:center;\n  /* 与收起钮**同尺寸**（20×44，用户 2026-10-28 四轮）：上/下/左描边，贴右缘的一侧不描。\n     实色底（--dshpc-plate），不用透明色 —— 透明底下透出东西很难看。\n     padding-left:2px 是**视觉居中**：左侧是圆角，箭头往直线（右缘）那边挪 1px。 */\n  width:20px;height:44px;box-sizing:border-box;padding:0 0 0 2px;\n  border-top:1px solid var(--dshpc-border);\n  border-bottom:1px solid var(--dshpc-border);\n  border-left:1px solid var(--dshpc-border);\n  border-right:none;\n  border-radius:var(--dshpc-radius-sm) 0 0 var(--dshpc-radius-sm);\n  background:var(--dshpc-plate);color:var(--dshpc-fg-2);\n  cursor:pointer;font-family:inherit;line-height:1;\n  animation:dshpc-ear-in .2s var(--dshpc-ease);\n  transition:background-color var(--dshpc-dur-fast) var(--dshpc-ease),color var(--dshpc-dur-fast) var(--dshpc-ease);\n}\n/* 入场：从右缘外滑进来，别「突然出现」（用户 2026-10-28）。 */\n@keyframes dshpc-ear-in{from{opacity:0;transform:translateX(14px)}}\n.dshpc-dock__ear:hover{background:var(--dshpc-plate-hover);color:var(--dshpc-fg)}\n.dshpc-dock__ear:focus-visible{outline:2px solid var(--dshpc-focus);outline-offset:1px}\n/* 与收起钮的箭头同一字号（16px）：收进去前后箭头一模一样大（用户 2026-10-28）。 */\n.dshpc-dock__ear-arrow{font-size:16px;color:var(--dshpc-fg-3)}\n.dshpc-dock__ear:hover .dshpc-dock__ear-arrow{color:var(--dshpc-fg)}\n/* 动效礼貌：系统声明减少动效时全部关掉（与 Segmented 同一约定），收起退化为瞬时、功能不受影响。 */\n@media (prefers-reduced-motion:reduce){\n  .dshpc-dock__panel{animation:none}\n  .dshpc-dock__panel--closing{transition:none}\n  .dshpc-dock__ear{animation:none}\n}\n";
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/explorer/explorer-css.generated.js
		const EXPLORER_CSS = "/* 工作区文件浏览器（dshpc-fb-*）。\n *\n * 度量真源 = 兄弟项目 dsh-task-dispatch-table 的 src/client/archive-session-css.ts\n * （.dsh-tdt-sv-* 全族）。**逐条照抄，不许自己估**：padding / gap / 圆角 / 字号 / 行高 /\n * 边框色 / 悬停色 / 透明度动画 / 溢出策略，一一对应，改这里之前先去那边对原文。\n * 前缀与变量名换成本仓口径（--tdt-* → --dshpc-*），数值不换。\n *\n * 控件：能核心就核心（面包屑 = Button ghost、行尾 = Button outline、展开 / 图标 = IconButton、\n * 分段 = Segmented、文字 = MarqueeText）。核心控件自带的 padding / 高度 / 皮肤在本文件里\n * **按兄弟数值覆盖**（选择器带 .dshpc-fb 前缀提高特异性，确保盖得住控件默认值）。\n */\n.dshpc-fb{\n  position:relative;display:flex;flex-direction:column;height:100%;min-height:0;\n  background:var(--dshpc-surface-base);color:var(--dshpc-fg);\n}\n\n/* 第一排：▾ 选层 + 面包屑 + 动作（兄弟 .dsh-tdt-sv-crumbbar）\n   ⚠️ 不能 overflow:hidden —— 下拉浮层挂在它下面，裁了就看不见。 */\n.dshpc-fb__bar{\n  position:relative;flex:none;display:flex;align-items:center;gap:2px;\n  padding:4px 10px;border-bottom:1px solid var(--dshpc-border);white-space:nowrap;\n}\n.dshpc-fb__menu-wrap{position:relative;flex:none;display:inline-flex}\n.dshpc-fb__crumbs{position:relative;flex:1;min-width:0;display:flex;align-items:center;gap:2px;overflow:hidden}\n.dshpc-fb__crumbs-measure{\n  position:absolute;top:0;left:0;display:inline-flex;align-items:center;gap:2px;\n  visibility:hidden;pointer-events:none;white-space:nowrap;\n}\n\n/* 面包屑：核心 ghost 钮，但皮肤与尺寸取兄弟 .dsh-tdt-sv-crumb（高由内容决定，不锁控制高）。 */\n.dshpc-fb .dshpc-fb__crumb{\n  appearance:none;background:0 0;border:none;height:auto;\n  padding:2px 4px;border-radius:var(--dshpc-radius-sm);\n  font:inherit;font-size:var(--dshpc-font-sm);line-height:var(--dshpc-line-sm);\n  color:var(--dshpc-fg-2);cursor:pointer;\n  display:inline-flex;align-items:center;min-width:0;overflow:hidden;text-overflow:ellipsis;\n}\n.dshpc-fb .dshpc-fb__crumb:hover{background:var(--dshpc-hover);color:var(--dshpc-fg)}\n.dshpc-fb .dshpc-fb__crumb:disabled{color:var(--dshpc-fg-2);cursor:default}\n.dshpc-fb .dshpc-fb__crumb--current{cursor:default;color:var(--dshpc-fg);font-weight:600;min-width:0}\n.dshpc-fb .dshpc-fb__crumb--current:hover{background:0 0}\n.dshpc-fb__crumb-mq{flex:1 1 auto;min-width:0}\n.dshpc-fb__crumb-sep{flex:none;color:var(--dshpc-fg-3)}\n\n/* 越界（outside-workspace）第一排：只读完整路径（兄弟 .dsh-tdt-sv-crumbbar-plain-inner）。 */\n.dshpc-fb__bar-plain{\n  font-family:var(--dshpc-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);\n  font-size:var(--dshpc-font-sm);line-height:var(--dshpc-line-sm);color:var(--dshpc-fg-2);\n  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:default;user-select:none;\n}\n.dshpc-fb__actions{flex:none;display:flex;align-items:center;gap:4px}\n\n/* ▾ 选层浮层（兄弟 .dsh-tdt-sv-crumbs-*）。\n   层序：兄弟是 30/31；本仓 picker 面板是 1100，遮罩必须高于它，否则菜单开着点面板不算「点外部」。 */\n.dshpc-fb__crumbs-backdrop{position:fixed;inset:0;z-index:1200;background:transparent}\n.dshpc-fb__crumbs-menu{\n  position:absolute;top:calc(100% + 4px);left:0;z-index:1201;min-width:160px;max-height:240px;overflow:auto;\n  background:var(--dshpc-surface-menu);border:1px solid var(--dshpc-border);border-radius:var(--dshpc-radius-sm);\n  box-shadow:0 4px 16px rgba(0,0,0,.18);padding:4px;display:flex;flex-direction:column;\n}\n.dshpc-fb__menu-item{\n  appearance:none;background:0 0;border:none;text-align:left;font:inherit;\n  font-size:var(--dshpc-font-sm);line-height:var(--dshpc-line-md);\n  padding:4px 8px;border-radius:var(--dshpc-radius-sm);color:var(--dshpc-fg);cursor:pointer;\n  max-width:280px;display:flex;align-items:center;gap:2px;\n  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\n}\n.dshpc-fb__menu-item:hover{background:var(--dshpc-hover)}\n.dshpc-fb__menu-empty{\n  font-size:var(--dshpc-font-sm);line-height:var(--dshpc-line-md);padding:4px 8px;color:var(--dshpc-fg-3);\n}\n.dshpc-fb__menu-icon{flex:none;display:inline-flex}\n.dshpc-fb__menu-chev{flex:none;color:var(--dshpc-fg-3);margin-right:1px}\n.dshpc-fb__menu-chev-slot{flex:none;width:11px;height:11px;margin-right:1px}\n.dshpc-fb__menu-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n\n/* 第二排（仅预览态）：文件名 + 工具（兄弟 .dsh-tdt-sv-titlebar / -preview-title-inner）。 */\n.dshpc-fb__title{\n  flex:none;display:flex;align-items:center;gap:8px;\n  padding:8px 14px;border-bottom:1px solid var(--dshpc-border);\n}\n.dshpc-fb__title-inner{\n  font-family:var(--dshpc-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);\n  font-size:var(--dshpc-font-sm);line-height:var(--dshpc-line-sm);color:var(--dshpc-fg);\n  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:default;\n}\n\n/* 主体（兄弟 .dsh-tdt-sv-preview-body / -hint / -preview-err） */\n.dshpc-fb__body{flex:1;min-height:0;overflow-x:hidden;overflow-y:auto;padding:12px 14px}\n.dshpc-fb__note{font-size:var(--dshpc-font-sm);color:var(--dshpc-fg-2);text-align:center;padding:12px 0}\n.dshpc-fb__err{\n  display:flex;flex-direction:column;align-items:flex-start;gap:10px;\n  font-size:var(--dshpc-font-sm);line-height:1.6;color:var(--dshpc-fg-2);padding:8px 0;\n}\n\n/* 目录树（兄弟 .dsh-tdt-sv-tree*） */\n.dshpc-fb__tree{flex:1;min-height:0;overflow:auto;padding:6px 8px}\n.dshpc-fb__row{\n  display:flex;align-items:center;gap:8px;padding:6px 8px;\n  border-radius:var(--dshpc-radius-sm);cursor:pointer;user-select:none;\n}\n.dshpc-fb__row:hover{background:var(--dshpc-hover)}\n.dshpc-fb__row:focus-visible{outline:2px solid var(--dshpc-focus);outline-offset:-2px}\n.dshpc-fb__row-icon{flex:none;display:inline-flex;color:var(--dshpc-fg-2)}\n.dshpc-fb__row-name{\n  flex:1;min-width:0;font-size:var(--dshpc-font-md);line-height:var(--dshpc-line-md);color:var(--dshpc-fg);\n  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;\n}\n\n/* 展开开关：核心 IconButton，命中位 20×20 + 展开时转 90°（兄弟 .dsh-tdt-sv-tree-toggle{,-open}）。 */\n.dshpc-fb .dshpc-fb__row-toggle{\n  appearance:none;background:0 0;border:none;flex:none;\n  width:20px;height:20px;padding:0;margin:0;border-radius:var(--dshpc-radius-sm);\n  color:var(--dshpc-fg-2);cursor:pointer;\n  display:inline-flex;align-items:center;justify-content:center;\n  transition:transform var(--dshpc-dur-fast) var(--dshpc-ease),background var(--dshpc-dur-fast) var(--dshpc-ease);\n}\n.dshpc-fb .dshpc-fb__row-toggle--open{transform:rotate(90deg)}\n\n/* 行尾「进入 / 选择」：核心 outline 钮，皮肤取兄弟 .dsh-tdt-sv-tree-act（高由内容决定）。\n   平时隐身但占位（opacity 而非 display）⇒ 出现时不顶动行内布局。 */\n.dshpc-fb .dshpc-fb__row-act{\n  flex:none;margin-left:auto;appearance:none;background:0 0;\n  border:1px solid var(--dshpc-border);border-radius:var(--dshpc-radius-sm);\n  height:auto;padding:2px 8px;font-size:var(--dshpc-font-sm);line-height:1.4;\n  color:var(--dshpc-fg-2);cursor:pointer;\n  opacity:0;pointer-events:none;\n  transition:opacity var(--dshpc-dur-fast) var(--dshpc-ease);\n}\n.dshpc-fb__row:hover .dshpc-fb__row-act,.dshpc-fb .dshpc-fb__row-act:focus-visible{opacity:1;pointer-events:auto}\n.dshpc-fb .dshpc-fb__row-act:hover{background:var(--dshpc-hover);color:var(--dshpc-fg)}\n\n.dshpc-fb__row-children{\n  margin-left:9px;padding-left:7px;border-left:1px solid var(--dshpc-border);\n  display:flex;flex-direction:column;\n}\n.dshpc-fb__row-note{flex:none;padding:8px 10px;font-size:var(--dshpc-font-sm);color:var(--dshpc-fg-3)}\n.dshpc-fb__row-err{padding:4px 8px 4px 36px;font-size:var(--dshpc-font-sm);color:var(--dshpc-danger)}\n\n/* 预览体内部容器（仅本仓预览组件用；兄弟对应 preview-fill / preview-body-code 一类）。\n   必须 border-box：渲染态 inline 加了 padding:12px 14px，content-box 下 width:100%+padding\n   会溢出父层 28px（父 .dshpc-fb 无 overflow 裁切）→ 恒多一条横滚条；border-box 把 padding\n   算进 100%，从根消除该溢出。 */\n.dshpc-fb__text{flex:1;min-height:0;overflow:auto;width:100%;box-sizing:border-box}\n.dshpc-fb__banner{padding:6px 10px;background:var(--dshpc-open-bg);color:var(--dshpc-fg-2);font-size:var(--dshpc-font-sm)}\n.dshpc-fb__more{display:flex;justify-content:center;padding:10px}\n.dshpc-fb__image{max-width:100%;border-radius:var(--dshpc-radius-sm);border:1px solid var(--dshpc-border)}\n/* iframe 的外壳（兄弟 .dsh-tdt-sv-preview-fill）：iframe 必须包在这一层里才拿得到高度——\n   裸挂 iframe 时替换元素的自动最小尺寸会让高度算不出来（表现为预览区整片空白、像没反应）。 */\n.dshpc-fb__fill{flex:1;min-height:0;display:flex;overflow:hidden;padding:0}\n.dshpc-fb__frame{flex:1;min-height:0;width:100%;height:100%;border:none;background:var(--dshpc-surface-1)}\n";
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/session/session-css.generated.js
		const SESSION_CSS = "/* 会话预览（SessionViewModal）自绘样式：只装本包自己的组件（暂存输入区 / fork / 探针等）\n   + 两个稳定钩子类（dshpc-sv-frame / dshpc-sv-scroll）。\n   已删：ChangedFiles 卡与 FileDiff 的全部自绘规则（2026-10-24）——官方 ChangedFiles /\n   FileDiff 模块类由 officialClass() 运行时发现并挂在元素上，本包不再有一行兜底。\n   ⚠️ 2026-10-23 起不再有官方类兜底：镜像官方组件的元素一律挂官方 CSS-module 类名\n   （officialClass() 运行时发现，取不到 = 空类、裸结构不白屏）——本包只跑 DSH 宿主、官方样式必在场，\n   自绘一一对应是死代码。要改官方观感走 token 覆盖 / 双类名钩子（见 ChatView.ts 头注），别在这加兜底。\n   类名固定 dshpc-sv-*；颜色一律走 --dshpc-* token（明暗自适应）。\n   外壳（遮罩 / 面板 / 头部 / 关闭钮）= 核心 Modal（size lg）。 */\n/* 会话区 = 普通纵向流：不设高度、不自己滚（滚动与内距归核心 Modal body，用户 2026-10-22 口径）。 */\n.dshpc-sv{display:flex;flex-direction:column;min-width:0;gap:10px}\n\n/* 官方样式未命中时的可见探针（挂在头部副标题行，不占正文）。 */\n.dshpc-sv-probe{font-size:var(--dshpc-font-xs);color:var(--dshpc-warning,#b7791f)}\n\n/* 头部归档标识（官方归档图标 + 「已归档」）。 */\n.dshpc-sv-archived{display:inline-flex;align-items:center;gap:4px;font-size:var(--dshpc-font-xs);font-weight:400;color:var(--dshpc-fg-3)}\n\n/* 内距与滚动全部让给核心 Modal body ⇒ 这里把官方 ChatView.frame / scroll 的内距、\n   overflow、高度一律归零（双类名 0,2,0 压过 CSS module，不靠注入顺序）。\n   ⚠️ 必须同时把 flex 收掉：官方 scroll 是 flex:1（basis=0），在**自动高**的容器里会把\n   会话区压成 0 高 —— 这正是「内容自管高度」的老毛病，别再放回来。 */\n.dshpc-sv-frame.dshpc-sv-frame{padding-top:0;padding-bottom:0;}\n\n.dshpc-sv-scroll.dshpc-sv-scroll{padding:0;overflow:visible;height:auto;max-height:none;flex:none;}\n\n/* 会话区保底：高度由内容决定（撑开由 Modal body 滚）。 */\n.dshpc-sv-chat{flex:none;min-height:0;}\n\n\n.dshpc-sv-assistant{align-self:stretch;font-size:var(--dshpc-font-lg);line-height:1.7;word-break:break-word;}\n\n.dshpc-sv-image{align-self:flex-start;font-size:var(--dshpc-font-sm);color:var(--dshpc-fg-3,rgba(128,128,128,.8));border:1px dashed var(--dshpc-border,rgba(128,128,128,.35));border-radius:var(--dshpc-radius-sm);padding:4px 10px;}\n\n/* 工具卡根（SessionViewModal legacy 兜底渲染直接用；正常 keyed 路径一律挂官方 ToolRow 类）。 */\n.dshpc-sv-tool{flex-direction:column;display:flex;}\n\n.dshpc-sv-notice{align-self:center;font-size:var(--dshpc-font-sm);color:var(--dshpc-fg-3,rgba(128,128,128,.8));padding:2px 8px;}\n\n\n.dshpc-sv-forkerr{margin:0;font-size:var(--dshpc-font-lg);line-height:var(--dshpc-line-lg);color:var(--dshpc-danger,#e5484d);word-break:break-word;}\n\n.dshpc-sv-forktext{margin:0;font-size:var(--dshpc-font-sm);line-height:var(--dshpc-line-sm);color:var(--dshpc-fg-2);}\n\n/* ── 暂存输入区（期4：打字 → 确定 → fork 带话跳官方视图）── */\n.dshpc-sv-composer{flex:1;display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap;}\n\n.dshpc-sv-composer textarea{flex:1;min-width:0;resize:none;font:inherit;font-size:var(--dshpc-font-lg);line-height:var(--dshpc-line-lg);color:var(--dshpc-fg,#1f2328);background:var(--dshpc-surface-2,rgba(128,128,128,.10));border:1px solid var(--dshpc-border,rgba(128,128,128,.28));border-radius:var(--dshpc-radius-md);padding:8px 12px;min-height:40px;max-height:120px;}\n\n.dshpc-sv-composer textarea:focus-visible{outline:2px solid var(--dshpc-focus,#3b5bdb);outline-offset:-1px;}\n\n.dshpc-sv-composer-hint{flex:none;font-size:var(--dshpc-font-xs);color:var(--dshpc-fg-3,rgba(128,128,128,.8));padding-bottom:10px;white-space:nowrap;}";
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/css.js
		const CONTROLS_DOMAIN = "controls";
		/**
		* 全部控件样式（数组顺序不可调换：同特异性规则后注入者胜出）。
		* 导出仅供 `test/css-contract.test.mjs` 做文本自检，不作为对外 API。
		*/
		const CONTROLS_CSS = [
			SEGMENTED_CSS,
			BUTTON_CSS,
			FIELD_CSS,
			LOADING_CSS,
			BACK_TO_TOP_CSS,
			HINT_CSS,
			PICKER_CSS,
			DATETIME_CSS,
			FEEDBACK_CSS,
			EXPLORER_CSS,
			SESSION_CSS,
			CARD_CSS,
			CHIP_CSS,
			MARQUEE_CSS,
			PANEL_DOCK_CSS,
			CODE_VIEWER_CSS
		].join("\n");
		/**
		* 当前插件的样式设施。
		*
		* 为什么是模块级而不是 React Context：core 会被**内联进每个插件各自的 bundle**，
		* 模块级变量天然按插件隔离（不像共享运行时那样会互相踩）。
		* 插件启动时 `setStyleKit(createStyleKit({ id }))` 一次即可；不设就走默认 kit。
		*/
		let current$1 = createStyleKit({ id: "dsh-plugin-core-ui" });
		function setStyleKit(kit) {
			current$1 = kit;
		}
		/** 登记 token + 控件样式并确保挂载（幂等）。 */
		function ensureControls(kit = current$1) {
			kit.registerStyle("tokens", kit.tokensCss);
			kit.applyStyle(CONTROLS_DOMAIN, CONTROLS_CSS);
		}
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/picker-logic.js
		/** 两种输入归一成 groups：给了 `options` 就当成一个无标题的组。 */
		function toGroups(groups, options) {
			if (groups !== void 0 && groups.length > 0) return groups;
			const flat = options ?? [];
			return flat.length === 0 ? [] : [{
				value: "",
				label: "",
				options: flat
			}];
		}
		function flattenOptions(groups) {
			const out = [];
			for (const g of groups) out.push(...g.options);
			return out;
		}
		/** 按关键词过滤（大小写不敏感，匹配 label；整组无命中则整组去掉）。 */
		function filterGroups(groups, query) {
			const q = query.trim().toLowerCase();
			if (q === "") return groups;
			const out = [];
			for (const g of groups) {
				const hit = g.options.filter((o) => o.label.toLowerCase().includes(q));
				if (hit.length > 0) out.push({
					...g,
					options: hit
				});
			}
			return out;
		}
		/** 多选切换；`max` 达到上限时不再添加（返回原数组，不静默截断）。 */
		function toggleValue(current, value, max) {
			if (current.indexOf(value) >= 0) return current.filter((v) => v !== value);
			if (max !== void 0 && current.length >= max) return [...current];
			return [...current, value];
		}
		function labelsOf(groups, values) {
			const all = flattenOptions(groups);
			const out = [];
			for (const v of values) {
				const hit = all.find((o) => o.value === v);
				if (hit !== void 0) out.push(hit.label);
			}
			return out;
		}
		/** 触发器宽度解析：把 width / minWidth / maxWidth 译成内联样式。
		* 定宽（width）忽略 min/max 并锁定三值；否则各自生效，缺省沿用 CSS 默认（min 120px、max 100%）。
		* 数值按 px 处理，字符串原样透传。 */
		function resolveTriggerSizing(opts) {
			const px = (v) => typeof v === "number" ? `${v}px` : v;
			if (opts.width !== void 0) {
				const w = px(opts.width);
				return {
					width: w,
					minWidth: w,
					maxWidth: w
				};
			}
			const style = {};
			if (opts.minWidth !== void 0) style.minWidth = px(opts.minWidth);
			if (opts.maxWidth !== void 0) style.maxWidth = px(opts.maxWidth);
			return style;
		}
		//#endregion
		//#region ../../node_modules/.pnpm/@floating-ui+utils@0.2.12/node_modules/@floating-ui/utils/dist/floating-ui.utils.dom.mjs
		function hasWindow() {
			return typeof window !== "undefined";
		}
		function getNodeName(node) {
			if (isNode(node)) return (node.nodeName || "").toLowerCase();
			return "#document";
		}
		function getWindow(node) {
			var _node$ownerDocument;
			return (node == null || (_node$ownerDocument = node.ownerDocument) == null ? void 0 : _node$ownerDocument.defaultView) || window;
		}
		function getDocumentElement(node) {
			var _ref;
			return (_ref = (isNode(node) ? node.ownerDocument : node.document) || window.document) == null ? void 0 : _ref.documentElement;
		}
		function isNode(value) {
			if (!hasWindow()) return false;
			return value instanceof Node || value instanceof getWindow(value).Node;
		}
		function isElement(value) {
			if (!hasWindow()) return false;
			return value instanceof Element || value instanceof getWindow(value).Element;
		}
		function isHTMLElement(value) {
			if (!hasWindow()) return false;
			return value instanceof HTMLElement || value instanceof getWindow(value).HTMLElement;
		}
		function isShadowRoot(value) {
			if (!hasWindow() || typeof ShadowRoot === "undefined") return false;
			return value instanceof ShadowRoot || value instanceof getWindow(value).ShadowRoot;
		}
		function isOverflowElement(element) {
			const { overflow, overflowX, overflowY, display } = getComputedStyle$1(element);
			return /auto|scroll|overlay|hidden|clip/.test(overflow + overflowY + overflowX) && display !== "inline" && display !== "contents";
		}
		function isTableElement(element) {
			return /^(table|td|th)$/.test(getNodeName(element));
		}
		function isTopLayer(element) {
			try {
				if (element.matches(":popover-open")) return true;
			} catch (_e) {}
			try {
				return element.matches(":modal");
			} catch (_e) {
				return false;
			}
		}
		const willChangeRe = /transform|translate|scale|rotate|perspective|filter/;
		const containRe = /paint|layout|strict|content/;
		const isNotNone = (value) => !!value && value !== "none";
		let isWebKitValue;
		function isContainingBlock(elementOrCss) {
			const css = isElement(elementOrCss) ? getComputedStyle$1(elementOrCss) : elementOrCss;
			return isNotNone(css.transform) || isNotNone(css.translate) || isNotNone(css.scale) || isNotNone(css.rotate) || isNotNone(css.perspective) || !isWebKit() && (isNotNone(css.backdropFilter) || isNotNone(css.filter)) || willChangeRe.test(css.willChange || "") || containRe.test(css.contain || "");
		}
		function getContainingBlock(element) {
			let currentNode = getParentNode(element);
			while (isHTMLElement(currentNode) && !isLastTraversableNode(currentNode)) {
				if (isContainingBlock(currentNode)) return currentNode;
				else if (isTopLayer(currentNode)) return null;
				currentNode = getParentNode(currentNode);
			}
			return null;
		}
		function isWebKit() {
			if (isWebKitValue == null) isWebKitValue = typeof CSS !== "undefined" && CSS.supports && CSS.supports("-webkit-backdrop-filter", "none");
			return isWebKitValue;
		}
		function isLastTraversableNode(node) {
			return /^(html|body|#document)$/.test(getNodeName(node));
		}
		function getComputedStyle$1(element) {
			return getWindow(element).getComputedStyle(element);
		}
		function getNodeScroll(element) {
			if (isElement(element)) return {
				scrollLeft: element.scrollLeft,
				scrollTop: element.scrollTop
			};
			return {
				scrollLeft: element.scrollX,
				scrollTop: element.scrollY
			};
		}
		function getParentNode(node) {
			if (getNodeName(node) === "html") return node;
			const result = node.assignedSlot || node.parentNode || isShadowRoot(node) && node.host || getDocumentElement(node);
			return isShadowRoot(result) ? result.host : result;
		}
		function getNearestOverflowAncestor(node) {
			const parentNode = getParentNode(node);
			if (isLastTraversableNode(parentNode)) return (node.ownerDocument || node).body;
			if (isHTMLElement(parentNode) && isOverflowElement(parentNode)) return parentNode;
			return getNearestOverflowAncestor(parentNode);
		}
		function getOverflowAncestors(node, list, traverseIframes) {
			var _node$ownerDocument2;
			if (list === void 0) list = [];
			if (traverseIframes === void 0) traverseIframes = true;
			const scrollableAncestor = getNearestOverflowAncestor(node);
			const isBody = scrollableAncestor === ((_node$ownerDocument2 = node.ownerDocument) == null ? void 0 : _node$ownerDocument2.body);
			const win = getWindow(scrollableAncestor);
			if (isBody) {
				const frameElement = getFrameElement(win);
				return list.concat(win, win.visualViewport || [], isOverflowElement(scrollableAncestor) ? scrollableAncestor : [], frameElement && traverseIframes ? getOverflowAncestors(frameElement) : []);
			} else return list.concat(scrollableAncestor, getOverflowAncestors(scrollableAncestor, [], traverseIframes));
		}
		function getFrameElement(win) {
			return win.parent && Object.getPrototypeOf(win.parent) ? win.frameElement : null;
		}
		//#endregion
		//#region ../../node_modules/.pnpm/@floating-ui+utils@0.2.12/node_modules/@floating-ui/utils/dist/floating-ui.utils.mjs
		const min = Math.min;
		const max = Math.max;
		const round = Math.round;
		const floor = Math.floor;
		const createCoords = (v) => ({
			x: v,
			y: v
		});
		const oppositeSideMap = {
			left: "right",
			right: "left",
			bottom: "top",
			top: "bottom"
		};
		function clamp(start, value, end) {
			return max(start, min(value, end));
		}
		function evaluate(value, param) {
			return typeof value === "function" ? value(param) : value;
		}
		function getSide(placement) {
			return placement.split("-")[0];
		}
		function getAlignment(placement) {
			return placement.split("-")[1];
		}
		function getOppositeAxis(axis) {
			return axis === "x" ? "y" : "x";
		}
		function getAxisLength(axis) {
			return axis === "y" ? "height" : "width";
		}
		function getSideAxis(placement) {
			const firstChar = placement[0];
			return firstChar === "t" || firstChar === "b" ? "y" : "x";
		}
		function getAlignmentAxis(placement) {
			return getOppositeAxis(getSideAxis(placement));
		}
		function getAlignmentSides(placement, rects, rtl) {
			if (rtl === void 0) rtl = false;
			const alignment = getAlignment(placement);
			const alignmentAxis = getAlignmentAxis(placement);
			const length = getAxisLength(alignmentAxis);
			let mainAlignmentSide = alignmentAxis === "x" ? alignment === (rtl ? "end" : "start") ? "right" : "left" : alignment === "start" ? "bottom" : "top";
			if (rects.reference[length] > rects.floating[length]) mainAlignmentSide = getOppositePlacement(mainAlignmentSide);
			return [mainAlignmentSide, getOppositePlacement(mainAlignmentSide)];
		}
		function getExpandedPlacements(placement) {
			const oppositePlacement = getOppositePlacement(placement);
			return [
				getOppositeAlignmentPlacement(placement),
				oppositePlacement,
				getOppositeAlignmentPlacement(oppositePlacement)
			];
		}
		function getOppositeAlignmentPlacement(placement) {
			return placement.includes("start") ? placement.replace("start", "end") : placement.replace("end", "start");
		}
		const lrPlacement = ["left", "right"];
		const rlPlacement = ["right", "left"];
		const tbPlacement = ["top", "bottom"];
		const btPlacement = ["bottom", "top"];
		function getSideList(side, isStart, rtl) {
			switch (side) {
				case "top":
				case "bottom":
					if (rtl) return isStart ? rlPlacement : lrPlacement;
					return isStart ? lrPlacement : rlPlacement;
				case "left":
				case "right": return isStart ? tbPlacement : btPlacement;
				default: return [];
			}
		}
		function getOppositeAxisPlacements(placement, flipAlignment, direction, rtl) {
			const alignment = getAlignment(placement);
			let list = getSideList(getSide(placement), direction === "start", rtl);
			if (alignment) {
				list = list.map((side) => side + "-" + alignment);
				if (flipAlignment) list = list.concat(list.map(getOppositeAlignmentPlacement));
			}
			return list;
		}
		function getOppositePlacement(placement) {
			const side = getSide(placement);
			return oppositeSideMap[side] + placement.slice(side.length);
		}
		function expandPaddingObject(padding) {
			var _padding$top, _padding$right, _padding$bottom, _padding$left;
			return {
				top: (_padding$top = padding.top) != null ? _padding$top : 0,
				right: (_padding$right = padding.right) != null ? _padding$right : 0,
				bottom: (_padding$bottom = padding.bottom) != null ? _padding$bottom : 0,
				left: (_padding$left = padding.left) != null ? _padding$left : 0
			};
		}
		function getPaddingObject(padding) {
			return typeof padding !== "number" ? expandPaddingObject(padding) : {
				top: padding,
				right: padding,
				bottom: padding,
				left: padding
			};
		}
		function rectToClientRect(rect) {
			const { x, y, width, height } = rect;
			return {
				width,
				height,
				top: y,
				left: x,
				right: x + width,
				bottom: y + height,
				x,
				y
			};
		}
		/*!
		* tabbable 6.5.1
		* @license MIT, https://github.com/focus-trap/tabbable/blob/master/LICENSE
		*/
		//#endregion
		//#region ../../node_modules/.pnpm/@floating-ui+react@0.27.20_react-dom@19.3.1_react@19.3.1__react@19.3.1/node_modules/@floating-ui/react/dist/floating-ui.react.utils.mjs
		var import_dist = (/* @__PURE__ */ __commonJSMin(((exports) => {
			var candidateSelector = /* #__PURE__ */ [
				"input:not([inert]):not([inert] *)",
				"select:not([inert]):not([inert] *)",
				"textarea:not([inert]):not([inert] *)",
				"a[href]:not([inert]):not([inert] *)",
				"area[href]:not([inert]):not([inert] *)",
				"button:not([inert]):not([inert] *)",
				"[tabindex]:not(slot):not([inert]):not([inert] *)",
				"audio[controls]:not([inert]):not([inert] *)",
				"video[controls]:not([inert]):not([inert] *)",
				"[contenteditable]:not([contenteditable=\"false\"]):not([inert]):not([inert] *)",
				"details>summary:first-of-type:not([inert]):not([inert] *)",
				"details:not([inert]):not([inert] *)"
			].join(",");
			var NoElement = typeof Element === "undefined";
			var matches = NoElement ? function() {} : Element.prototype.matches || Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
			var getRootNode = !NoElement && Element.prototype.getRootNode ? function(element) {
				return element == null || element.getRootNode == null ? void 0 : element.getRootNode();
			} : function(element) {
				return element == null ? void 0 : element.ownerDocument;
			};
			/**
			* Determines if a node is inert or in an inert ancestor.
			* @param {Node} [node]
			* @param {boolean} [lookUp] If true and `node` is not inert, looks up at ancestors to
			*  see if any of them are inert. If false, only `node` itself is considered.
			* @returns {boolean} True if inert itself or by way of being in an inert ancestor.
			*  False if `node` is falsy.
			*/
			var _isInert = function isInert(node, lookUp) {
				if (lookUp === void 0) lookUp = true;
				var inertAtt = node == null || node.getAttribute == null ? void 0 : node.getAttribute("inert");
				return inertAtt === "" || inertAtt === "true" || lookUp && node && (typeof node.closest === "function" ? node.closest("[inert]") : _isInert(node.parentNode));
			};
			/**
			* Determines if a node's content is editable.
			* @param {Element} [node]
			* @returns True if it's content-editable; false if it's not or `node` is falsy.
			*/
			var isContentEditable = function isContentEditable(node) {
				var _node$getAttribute;
				var attValue = node == null || node.getAttribute == null || (_node$getAttribute = node.getAttribute("contenteditable")) == null ? void 0 : _node$getAttribute.toLowerCase();
				return attValue === "" || attValue === "true" || attValue === "plaintext-only";
			};
			/**
			* @param {Element} el container to check in
			* @param {boolean} includeContainer add container to check
			* @param {(node: Element) => boolean} filter filter candidates
			* @returns {Element[]}
			*/
			var getCandidates = function getCandidates(el, includeContainer, filter) {
				if (_isInert(el)) return [];
				var candidates = Array.prototype.slice.apply(el.querySelectorAll(candidateSelector));
				if (includeContainer && matches.call(el, candidateSelector)) candidates.unshift(el);
				candidates = candidates.filter(filter);
				return candidates;
			};
			/**
			* @callback GetShadowRoot
			* @param {Element} element to check for shadow root
			* @returns {ShadowRoot|boolean} ShadowRoot if available or boolean indicating if a shadowRoot is attached but not available.
			*/
			/**
			* @callback ShadowRootFilter
			* @param {Element} shadowHostNode the element which contains shadow content
			* @returns {boolean} true if a shadow root could potentially contain valid candidates.
			*/
			/**
			* @typedef {Object} CandidateScope
			* @property {Element} scopeParent contains inner candidates
			* @property {Element[]} candidates list of candidates found in the scope parent
			*/
			/**
			* @typedef {Object} IterativeOptions
			* @property {GetShadowRoot|boolean} getShadowRoot true if shadow support is enabled; falsy if not;
			*  if a function, implies shadow support is enabled and either returns the shadow root of an element
			*  or a boolean stating if it has an undisclosed shadow root
			* @property {(node: Element) => boolean} filter filter candidates
			* @property {boolean} flatten if true then result will flatten any CandidateScope into the returned list
			* @property {ShadowRootFilter} shadowRootFilter filter shadow roots;
			*/
			/**
			* @param {Element[]} elements list of element containers to match candidates from
			* @param {boolean} includeContainer add container list to check
			* @param {IterativeOptions} options
			* @returns {Array.<Element|CandidateScope>}
			*/
			var _getCandidatesIteratively = function getCandidatesIteratively(elements, includeContainer, options) {
				var candidates = [];
				var elementsToCheck = Array.from(elements);
				while (elementsToCheck.length) {
					var element = elementsToCheck.shift();
					if (_isInert(element, false)) continue;
					if (element.tagName === "SLOT") {
						var assigned = element.assignedElements();
						var nestedCandidates = _getCandidatesIteratively(assigned.length ? assigned : element.children, true, options);
						if (options.flatten) candidates.push.apply(candidates, nestedCandidates);
						else candidates.push({
							scopeParent: element,
							candidates: nestedCandidates
						});
					} else {
						if (matches.call(element, candidateSelector) && options.filter(element) && (includeContainer || !elements.includes(element))) candidates.push(element);
						var shadowRoot = element.shadowRoot || typeof options.getShadowRoot === "function" && options.getShadowRoot(element);
						var validShadowRoot = !_isInert(shadowRoot, false) && (!options.shadowRootFilter || options.shadowRootFilter(element));
						if (shadowRoot && validShadowRoot) {
							var _nestedCandidates = _getCandidatesIteratively(shadowRoot === true ? element.children : shadowRoot.children, true, options);
							if (options.flatten) candidates.push.apply(candidates, _nestedCandidates);
							else candidates.push({
								scopeParent: element,
								candidates: _nestedCandidates
							});
						} else elementsToCheck.unshift.apply(elementsToCheck, element.children);
					}
				}
				return candidates;
			};
			/**
			* @private
			* Determines if the node has an explicitly specified `tabindex` attribute.
			* @param {HTMLElement} node
			* @returns {boolean} True if so; false if not.
			*/
			var hasTabIndex = function hasTabIndex(node) {
				return !isNaN(parseInt(node.getAttribute("tabindex"), 10));
			};
			/**
			* Determine the tab index of a given node.
			* @param {HTMLElement} node
			* @returns {number} Tab order (negative, 0, or positive number).
			* @throws {Error} If `node` is falsy.
			*/
			var getTabIndex = function getTabIndex(node) {
				if (!node) throw new Error("No node provided");
				if (node.tabIndex < 0) {
					if ((/^(AUDIO|VIDEO|DETAILS)$/.test(node.tagName) || isContentEditable(node)) && !hasTabIndex(node)) return 0;
				}
				return node.tabIndex;
			};
			/**
			* Determine the tab index of a given node __for sort order purposes__.
			* @param {HTMLElement} node
			* @param {boolean} [isScope] True for a custom element with shadow root or slot that, by default,
			*  has tabIndex -1, but needs to be sorted by document order in order for its content to be
			*  inserted into the correct sort position.
			* @returns {number} Tab order (negative, 0, or positive number).
			*/
			var getSortOrderTabIndex = function getSortOrderTabIndex(node, isScope) {
				var tabIndex = getTabIndex(node);
				if (tabIndex < 0 && isScope && !hasTabIndex(node)) return 0;
				return tabIndex;
			};
			var sortOrderedTabbables = function sortOrderedTabbables(a, b) {
				return a.tabIndex === b.tabIndex ? a.documentOrder - b.documentOrder : a.tabIndex - b.tabIndex;
			};
			var isInput = function isInput(node) {
				return node.tagName === "INPUT";
			};
			var isHiddenInput = function isHiddenInput(node) {
				return isInput(node) && node.type === "hidden";
			};
			var isDetailsWithSummary = function isDetailsWithSummary(node) {
				return node.tagName === "DETAILS" && Array.prototype.slice.apply(node.children).some(function(child) {
					return child.tagName === "SUMMARY";
				});
			};
			var getCheckedRadio = function getCheckedRadio(nodes, form) {
				for (var i = 0; i < nodes.length; i++) if (nodes[i].checked && nodes[i].form === form) return nodes[i];
			};
			var isTabbableRadio = function isTabbableRadio(node) {
				if (!node.name) return true;
				var radioScope = node.form || getRootNode(node);
				var queryRadios = function queryRadios(name) {
					return radioScope.querySelectorAll("input[type=\"radio\"][name=\"" + name + "\"]");
				};
				var radioSet;
				if (typeof window !== "undefined" && typeof window.CSS !== "undefined" && typeof window.CSS.escape === "function") radioSet = queryRadios(window.CSS.escape(node.name));
				else try {
					radioSet = queryRadios(node.name);
				} catch (err) {
					console.error("Looks like you have a radio button with a name attribute containing invalid CSS selector characters and need the CSS.escape polyfill: %s", err.message);
					return false;
				}
				var checked = getCheckedRadio(radioSet, node.form);
				return !checked || checked === node;
			};
			var isRadio = function isRadio(node) {
				return isInput(node) && node.type === "radio";
			};
			var isNonTabbableRadio = function isNonTabbableRadio(node) {
				return isRadio(node) && !isTabbableRadio(node);
			};
			var isNodeAttached = function isNodeAttached(node) {
				var _nodeRoot;
				var nodeRoot = node && getRootNode(node);
				var nodeRootHost = (_nodeRoot = nodeRoot) == null ? void 0 : _nodeRoot.host;
				var attached = false;
				if (nodeRoot && nodeRoot !== node) {
					var _nodeRootHost, _node$ownerDocument;
					attached = !!((_nodeRootHost = nodeRootHost) != null && (_nodeRootHost = _nodeRootHost.ownerDocument) != null && _nodeRootHost.contains(nodeRootHost) || node != null && (_node$ownerDocument = node.ownerDocument) != null && _node$ownerDocument.contains(node));
					while (!attached && nodeRootHost) {
						var _nodeRoot2, _nodeRootHost2;
						nodeRoot = getRootNode(nodeRootHost);
						nodeRootHost = (_nodeRoot2 = nodeRoot) == null ? void 0 : _nodeRoot2.host;
						attached = !!((_nodeRootHost2 = nodeRootHost) != null && (_nodeRootHost2 = _nodeRootHost2.ownerDocument) != null && _nodeRootHost2.contains(nodeRootHost));
					}
				}
				return attached;
			};
			var isZeroArea = function isZeroArea(node) {
				var _node$getBoundingClie = node.getBoundingClientRect(), width = _node$getBoundingClie.width, height = _node$getBoundingClie.height;
				return width === 0 && height === 0;
			};
			var isHidden = function isHidden(node, _ref) {
				var displayCheck = _ref.displayCheck, getShadowRoot = _ref.getShadowRoot;
				if (displayCheck === "full-native") {
					if ("checkVisibility" in node) return !node.checkVisibility({
						checkOpacity: false,
						opacityProperty: false,
						contentVisibilityAuto: true,
						visibilityProperty: true,
						checkVisibilityCSS: true
					});
				}
				var visibility = getComputedStyle(node).visibility;
				if (visibility === "hidden" || visibility === "collapse") return true;
				var nodeUnderDetails = matches.call(node, "details>summary:first-of-type") ? node.parentElement : node;
				if (matches.call(nodeUnderDetails, "details:not([open]) *")) return true;
				if (!displayCheck || displayCheck === "full" || displayCheck === "full-native" || displayCheck === "legacy-full") {
					if (typeof getShadowRoot === "function") {
						var originalNode = node;
						while (node) {
							var parentElement = node.parentElement;
							var rootNode = getRootNode(node);
							if (parentElement && !parentElement.shadowRoot && getShadowRoot(parentElement) === true) return isZeroArea(node);
							else if (node.assignedSlot) node = node.assignedSlot;
							else if (!parentElement && rootNode !== node.ownerDocument) node = rootNode.host;
							else node = parentElement;
						}
						node = originalNode;
					}
					if (isNodeAttached(node)) return !node.getClientRects().length;
					if (displayCheck !== "legacy-full") return true;
				} else if (displayCheck === "non-zero-area") return isZeroArea(node);
				return false;
			};
			var isDisabledFromFieldset = function isDisabledFromFieldset(node) {
				if (/^(INPUT|BUTTON|SELECT|TEXTAREA)$/.test(node.tagName)) {
					var parentNode = node.parentElement;
					while (parentNode) {
						if (parentNode.tagName === "FIELDSET" && parentNode.disabled) {
							for (var i = 0; i < parentNode.children.length; i++) {
								var child = parentNode.children.item(i);
								if (child.tagName === "LEGEND") return matches.call(parentNode, "fieldset[disabled] *") ? true : !child.contains(node);
							}
							return true;
						}
						parentNode = parentNode.parentElement;
					}
				}
				return false;
			};
			var isNodeMatchingSelectorFocusable = function isNodeMatchingSelectorFocusable(options, node) {
				if (node.disabled || isHiddenInput(node) || isHidden(node, options) || isDetailsWithSummary(node) || isDisabledFromFieldset(node)) return false;
				return true;
			};
			var isNodeMatchingSelectorTabbable = function isNodeMatchingSelectorTabbable(options, node) {
				if (isNonTabbableRadio(node) || getTabIndex(node) < 0 || !isNodeMatchingSelectorFocusable(options, node)) return false;
				return true;
			};
			var isShadowRootTabbable = function isShadowRootTabbable(shadowHostNode) {
				var tabIndex = parseInt(shadowHostNode.getAttribute("tabindex"), 10);
				if (isNaN(tabIndex) || tabIndex >= 0) return true;
				return false;
			};
			/**
			* @param {Array.<Element|CandidateScope>} candidates
			* @returns Element[]
			*/
			var _sortByOrder = function sortByOrder(candidates) {
				var regularTabbables = [];
				var orderedTabbables = [];
				candidates.forEach(function(item, i) {
					var isScope = !!item.scopeParent;
					var element = isScope ? item.scopeParent : item;
					var candidateTabindex = getSortOrderTabIndex(element, isScope);
					var elements = isScope ? _sortByOrder(item.candidates) : element;
					if (candidateTabindex === 0) isScope ? regularTabbables.push.apply(regularTabbables, elements) : regularTabbables.push(element);
					else orderedTabbables.push({
						documentOrder: i,
						tabIndex: candidateTabindex,
						item,
						isScope,
						content: elements
					});
				});
				return orderedTabbables.sort(sortOrderedTabbables).reduce(function(acc, sortable) {
					sortable.isScope ? acc.push.apply(acc, sortable.content) : acc.push(sortable.content);
					return acc;
				}, []).concat(regularTabbables);
			};
			exports.tabbable = function tabbable(container, options) {
				options = options || {};
				var candidates;
				if (options.getShadowRoot) candidates = _getCandidatesIteratively([container], options.includeContainer, {
					filter: isNodeMatchingSelectorTabbable.bind(null, options),
					flatten: false,
					getShadowRoot: options.getShadowRoot,
					shadowRootFilter: isShadowRootTabbable
				});
				else candidates = getCandidates(container, options.includeContainer, isNodeMatchingSelectorTabbable.bind(null, options));
				return _sortByOrder(candidates);
			};
		})))();
		function isSafari() {
			return /apple/i.test(navigator.vendor);
		}
		function activeElement(doc) {
			let activeElement = doc.activeElement;
			while (((_activeElement = activeElement) == null || (_activeElement = _activeElement.shadowRoot) == null ? void 0 : _activeElement.activeElement) != null) {
				var _activeElement;
				activeElement = activeElement.shadowRoot.activeElement;
			}
			return activeElement;
		}
		function contains(parent, child) {
			if (!parent || !child) return false;
			const rootNode = child.getRootNode == null ? void 0 : child.getRootNode();
			if (parent.contains(child)) return true;
			if (rootNode && isShadowRoot(rootNode)) {
				let next = child;
				while (next) {
					if (parent === next) return true;
					next = next.parentNode || next.host;
				}
			}
			return false;
		}
		function getDocument(node) {
			return (node == null ? void 0 : node.ownerDocument) || document;
		}
		var index$1 = typeof document !== "undefined" ? react.useLayoutEffect : function noop() {};
		const useSafeInsertionEffect = { ...react }.useInsertionEffect || ((fn) => fn());
		function useEffectEvent(callback) {
			const ref = react.useRef(() => {});
			useSafeInsertionEffect(() => {
				ref.current = callback;
			});
			return react.useCallback(function() {
				for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) args[_key] = arguments[_key];
				return ref.current == null ? void 0 : ref.current(...args);
			}, []);
		}
		const getTabbableOptions = () => ({
			getShadowRoot: true,
			displayCheck: typeof ResizeObserver === "function" && ResizeObserver.toString().includes("[native code]") ? "full" : "none"
		});
		function getTabbableIn(container, dir) {
			const list = (0, import_dist.tabbable)(container, getTabbableOptions());
			const len = list.length;
			if (len === 0) return;
			const active = activeElement(getDocument(container));
			const index = list.indexOf(active);
			return list[index === -1 ? dir === 1 ? 0 : len - 1 : index + dir];
		}
		function getNextTabbable(referenceElement) {
			return getTabbableIn(getDocument(referenceElement).body, 1) || referenceElement;
		}
		function getPreviousTabbable(referenceElement) {
			return getTabbableIn(getDocument(referenceElement).body, -1) || referenceElement;
		}
		function isOutsideEvent(event, container) {
			const containerElement = container || event.currentTarget;
			const relatedTarget = event.relatedTarget;
			return !relatedTarget || !contains(containerElement, relatedTarget);
		}
		function disableFocusInside(container) {
			(0, import_dist.tabbable)(container, getTabbableOptions()).forEach((element) => {
				element.dataset.tabindex = element.getAttribute("tabindex") || "";
				element.setAttribute("tabindex", "-1");
			});
		}
		function enableFocusInside(container) {
			container.querySelectorAll("[data-tabindex]").forEach((element) => {
				const tabindex = element.dataset.tabindex;
				delete element.dataset.tabindex;
				if (tabindex) element.setAttribute("tabindex", tabindex);
				else element.removeAttribute("tabindex");
			});
		}
		//#endregion
		//#region ../../node_modules/.pnpm/@floating-ui+core@1.8.0/node_modules/@floating-ui/core/dist/floating-ui.core.mjs
		function computeCoordsFromPlacement(_ref, placement, rtl) {
			let { reference, floating } = _ref;
			const sideAxis = getSideAxis(placement);
			const alignmentAxis = getAlignmentAxis(placement);
			const alignLength = getAxisLength(alignmentAxis);
			const side = getSide(placement);
			const isVertical = sideAxis === "y";
			const commonX = reference.x + reference.width / 2 - floating.width / 2;
			const commonY = reference.y + reference.height / 2 - floating.height / 2;
			const commonAlign = reference[alignLength] / 2 - floating[alignLength] / 2;
			let coords;
			switch (side) {
				case "top":
					coords = {
						x: commonX,
						y: reference.y - floating.height
					};
					break;
				case "bottom":
					coords = {
						x: commonX,
						y: reference.y + reference.height
					};
					break;
				case "right":
					coords = {
						x: reference.x + reference.width,
						y: commonY
					};
					break;
				case "left":
					coords = {
						x: reference.x - floating.width,
						y: commonY
					};
					break;
				default: coords = {
					x: reference.x,
					y: reference.y
				};
			}
			const alignment = getAlignment(placement);
			if (alignment) coords[alignmentAxis] += commonAlign * (alignment === "end" ? 1 : -1) * (rtl && isVertical ? -1 : 1);
			return coords;
		}
		/**
		* Resolves with an object of overflow side offsets that determine how much the
		* element is overflowing a given clipping boundary on each side.
		* - positive = overflowing the boundary by that number of pixels
		* - negative = how many pixels left before it will overflow
		* - 0 = lies flush with the boundary
		* @see https://floating-ui.com/docs/detectOverflow
		*/
		async function detectOverflow(state, options) {
			var _await$platform$isEle;
			if (options === void 0) options = {};
			const { x, y, platform, rects, elements, strategy } = state;
			const { boundary = "clippingAncestors", rootBoundary = "viewport", elementContext = "floating", altBoundary = false, padding = 0 } = evaluate(options, state);
			const paddingObject = getPaddingObject(padding);
			const element = elements[altBoundary ? elementContext === "floating" ? "reference" : "floating" : elementContext];
			const clippingClientRect = rectToClientRect(await platform.getClippingRect({
				element: ((_await$platform$isEle = await (platform.isElement == null ? void 0 : platform.isElement(element))) != null ? _await$platform$isEle : true) ? element : element.contextElement || await (platform.getDocumentElement == null ? void 0 : platform.getDocumentElement(elements.floating)),
				boundary,
				rootBoundary,
				strategy
			}));
			const rect = elementContext === "floating" ? {
				x,
				y,
				width: rects.floating.width,
				height: rects.floating.height
			} : rects.reference;
			const offsetParent = await (platform.getOffsetParent == null ? void 0 : platform.getOffsetParent(elements.floating));
			const offsetScale = await (platform.isElement == null ? void 0 : platform.isElement(offsetParent)) && await (platform.getScale == null ? void 0 : platform.getScale(offsetParent)) || {
				x: 1,
				y: 1
			};
			const elementClientRect = rectToClientRect(platform.convertOffsetParentRelativeRectToViewportRelativeRect ? await platform.convertOffsetParentRelativeRectToViewportRelativeRect({
				elements,
				rect,
				offsetParent,
				strategy
			}) : rect);
			return {
				top: (clippingClientRect.top - elementClientRect.top + paddingObject.top) / offsetScale.y,
				bottom: (elementClientRect.bottom - clippingClientRect.bottom + paddingObject.bottom) / offsetScale.y,
				left: (clippingClientRect.left - elementClientRect.left + paddingObject.left) / offsetScale.x,
				right: (elementClientRect.right - clippingClientRect.right + paddingObject.right) / offsetScale.x
			};
		}
		const MAX_RESET_COUNT = 50;
		/**
		* Computes the `x` and `y` coordinates that will place the floating element
		* next to a given reference element.
		*
		* This export does not have any `platform` interface logic. You will need to
		* write one for the platform you are using Floating UI with.
		*/
		const computePosition$1 = async (reference, floating, config) => {
			const { placement = "bottom", strategy = "absolute", middleware = [], platform } = config;
			const platformWithDetectOverflow = platform.detectOverflow ? platform : {
				...platform,
				detectOverflow
			};
			const rtl = await (platform.isRTL == null ? void 0 : platform.isRTL(floating));
			let rects = await platform.getElementRects({
				reference,
				floating,
				strategy
			});
			let { x, y } = computeCoordsFromPlacement(rects, placement, rtl);
			let statefulPlacement = placement;
			let resetCount = 0;
			const middlewareData = {};
			for (let i = 0; i < middleware.length; i++) {
				const currentMiddleware = middleware[i];
				if (!currentMiddleware) continue;
				const { name, fn } = currentMiddleware;
				const { x: nextX, y: nextY, data, reset } = await fn({
					x,
					y,
					initialPlacement: placement,
					placement: statefulPlacement,
					strategy,
					middlewareData,
					rects,
					platform: platformWithDetectOverflow,
					elements: {
						reference,
						floating
					}
				});
				x = nextX != null ? nextX : x;
				y = nextY != null ? nextY : y;
				middlewareData[name] = {
					...middlewareData[name],
					...data
				};
				if (reset && resetCount < MAX_RESET_COUNT) {
					resetCount++;
					if (typeof reset === "object") {
						if (reset.placement) statefulPlacement = reset.placement;
						if (reset.rects) rects = reset.rects === true ? await platform.getElementRects({
							reference,
							floating,
							strategy
						}) : reset.rects;
						({x, y} = computeCoordsFromPlacement(rects, statefulPlacement, rtl));
					}
					i = -1;
				}
			}
			return {
				x,
				y,
				placement: statefulPlacement,
				strategy,
				middlewareData
			};
		};
		/**
		* Optimizes the visibility of the floating element by flipping the `placement`
		* in order to keep it in view when the preferred placement(s) will overflow the
		* clipping boundary. Alternative to `autoPlacement`.
		* @see https://floating-ui.com/docs/flip
		*/
		const flip$1 = function(options) {
			if (options === void 0) options = {};
			return {
				name: "flip",
				options,
				async fn(state) {
					var _middlewareData$arrow, _middlewareData$flip;
					const { placement, middlewareData, rects, initialPlacement, platform, elements } = state;
					const { mainAxis: checkMainAxis = true, crossAxis: checkCrossAxis = true, fallbackPlacements: specifiedFallbackPlacements, fallbackStrategy = "bestFit", fallbackAxisSideDirection = "none", flipAlignment = true, ...detectOverflowOptions } = evaluate(options, state);
					if ((_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) return {};
					const side = getSide(placement);
					const initialSideAxis = getSideAxis(initialPlacement);
					const isBasePlacement = getSide(initialPlacement) === initialPlacement;
					const rtl = await (platform.isRTL == null ? void 0 : platform.isRTL(elements.floating));
					const fallbackPlacements = specifiedFallbackPlacements || (isBasePlacement || !flipAlignment ? [getOppositePlacement(initialPlacement)] : getExpandedPlacements(initialPlacement));
					const hasFallbackAxisSideDirection = fallbackAxisSideDirection !== "none";
					if (!specifiedFallbackPlacements && hasFallbackAxisSideDirection) fallbackPlacements.push(...getOppositeAxisPlacements(initialPlacement, flipAlignment, fallbackAxisSideDirection, rtl));
					const placements = [initialPlacement, ...fallbackPlacements];
					const overflow = await platform.detectOverflow(state, detectOverflowOptions);
					const overflows = [];
					let overflowsData = ((_middlewareData$flip = middlewareData.flip) == null ? void 0 : _middlewareData$flip.overflows) || [];
					if (checkMainAxis) overflows.push(overflow[side]);
					if (checkCrossAxis) {
						const sides = getAlignmentSides(placement, rects, rtl);
						overflows.push(overflow[sides[0]], overflow[sides[1]]);
					}
					overflowsData = [...overflowsData, {
						placement,
						overflows
					}];
					if (!overflows.every((side) => side <= 0)) {
						var _middlewareData$flip2, _overflowsData$filter;
						const nextIndex = (((_middlewareData$flip2 = middlewareData.flip) == null ? void 0 : _middlewareData$flip2.index) || 0) + 1;
						const nextPlacement = placements[nextIndex];
						if (nextPlacement) {
							if (!(checkCrossAxis === "alignment" ? initialSideAxis !== getSideAxis(nextPlacement) : false) || overflowsData.every((d) => getSideAxis(d.placement) === initialSideAxis ? d.overflows[0] > 0 : true)) return {
								data: {
									index: nextIndex,
									overflows: overflowsData
								},
								reset: { placement: nextPlacement }
							};
						}
						let resetPlacement = (_overflowsData$filter = overflowsData.filter((d) => d.overflows[0] <= 0).sort((a, b) => a.overflows[1] - b.overflows[1])[0]) == null ? void 0 : _overflowsData$filter.placement;
						if (!resetPlacement) switch (fallbackStrategy) {
							case "bestFit": {
								var _overflowsData$filter2;
								const placement = (_overflowsData$filter2 = overflowsData.filter((d) => {
									if (hasFallbackAxisSideDirection) {
										const currentSideAxis = getSideAxis(d.placement);
										return currentSideAxis === initialSideAxis || currentSideAxis === "y";
									}
									return true;
								}).map((d) => [d.placement, d.overflows.filter((overflow) => overflow > 0).reduce((acc, overflow) => acc + overflow, 0)]).sort((a, b) => a[1] - b[1])[0]) == null ? void 0 : _overflowsData$filter2[0];
								if (placement) resetPlacement = placement;
								break;
							}
							case "initialPlacement": resetPlacement = initialPlacement;
						}
						if (placement !== resetPlacement) return { reset: { placement: resetPlacement } };
					}
					return {};
				}
			};
		};
		const originSides = /*#__PURE__*/ new Set(["left", "top"]);
		async function convertValueToCoords(state, options) {
			const { placement, platform, elements } = state;
			const rtl = await (platform.isRTL == null ? void 0 : platform.isRTL(elements.floating));
			const side = getSide(placement);
			const alignment = getAlignment(placement);
			const isVertical = getSideAxis(placement) === "y";
			const mainAxisMulti = originSides.has(side) ? -1 : 1;
			const crossAxisMulti = rtl && isVertical ? -1 : 1;
			const rawValue = evaluate(options, state);
			let { mainAxis, crossAxis, alignmentAxis } = typeof rawValue === "number" ? {
				mainAxis: rawValue,
				crossAxis: 0,
				alignmentAxis: null
			} : {
				mainAxis: rawValue.mainAxis || 0,
				crossAxis: rawValue.crossAxis || 0,
				alignmentAxis: rawValue.alignmentAxis
			};
			if (alignment && typeof alignmentAxis === "number") crossAxis = alignment === "end" ? alignmentAxis * -1 : alignmentAxis;
			return isVertical ? {
				x: crossAxis * crossAxisMulti,
				y: mainAxis * mainAxisMulti
			} : {
				x: mainAxis * mainAxisMulti,
				y: crossAxis * crossAxisMulti
			};
		}
		/**
		* Modifies the placement by translating the floating element along the
		* specified axes.
		* A number (shorthand for `mainAxis` or distance), or an axes configuration
		* object may be passed.
		* @see https://floating-ui.com/docs/offset
		*/
		const offset$1 = function(options) {
			if (options === void 0) options = 0;
			return {
				name: "offset",
				options,
				async fn(state) {
					var _middlewareData$offse, _middlewareData$arrow;
					const { x, y, placement, middlewareData } = state;
					const diffCoords = await convertValueToCoords(state, options);
					if (placement === ((_middlewareData$offse = middlewareData.offset) == null ? void 0 : _middlewareData$offse.placement) && (_middlewareData$arrow = middlewareData.arrow) != null && _middlewareData$arrow.alignmentOffset) return {};
					return {
						x: x + diffCoords.x,
						y: y + diffCoords.y,
						data: {
							...diffCoords,
							placement
						}
					};
				}
			};
		};
		/**
		* Optimizes the visibility of the floating element by shifting it in order to
		* keep it in view when it will overflow the clipping boundary.
		* @see https://floating-ui.com/docs/shift
		*/
		const shift$1 = function(options) {
			if (options === void 0) options = {};
			return {
				name: "shift",
				options,
				async fn(state) {
					const { x, y, placement, platform } = state;
					const { mainAxis: checkMainAxis = true, crossAxis: checkCrossAxis = false, limiter = { fn: (_ref) => {
						let { x, y } = _ref;
						return {
							x,
							y
						};
					} }, ...detectOverflowOptions } = evaluate(options, state);
					const coords = {
						x,
						y
					};
					const overflow = await platform.detectOverflow(state, detectOverflowOptions);
					const crossAxis = getSideAxis(placement);
					const mainAxis = getOppositeAxis(crossAxis);
					let mainAxisCoord = coords[mainAxis];
					let crossAxisCoord = coords[crossAxis];
					const clampCoord = (axis, coord) => clamp(coord + overflow[axis === "y" ? "top" : "left"], coord, coord - overflow[axis === "y" ? "bottom" : "right"]);
					if (checkMainAxis) mainAxisCoord = clampCoord(mainAxis, mainAxisCoord);
					if (checkCrossAxis) crossAxisCoord = clampCoord(crossAxis, crossAxisCoord);
					const limitedCoords = limiter.fn({
						...state,
						[mainAxis]: mainAxisCoord,
						[crossAxis]: crossAxisCoord
					});
					return {
						...limitedCoords,
						data: {
							x: limitedCoords.x - x,
							y: limitedCoords.y - y,
							enabled: {
								[mainAxis]: checkMainAxis,
								[crossAxis]: checkCrossAxis
							}
						}
					};
				}
			};
		};
		/**
		* Provides data that allows you to change the size of the floating element —
		* for instance, prevent it from overflowing the clipping boundary or match the
		* width of the reference element.
		* @see https://floating-ui.com/docs/size
		*/
		const size$1 = function(options) {
			if (options === void 0) options = {};
			return {
				name: "size",
				options,
				async fn(state) {
					const { placement, rects, platform, elements } = state;
					const { apply = () => {}, ...detectOverflowOptions } = evaluate(options, state);
					const overflow = await platform.detectOverflow(state, detectOverflowOptions);
					const side = getSide(placement);
					const alignment = getAlignment(placement);
					const isYAxis = getSideAxis(placement) === "y";
					const { width, height } = rects.floating;
					let heightSide;
					let widthSide;
					if (side === "top" || side === "bottom") {
						heightSide = side;
						widthSide = alignment === (await (platform.isRTL == null ? void 0 : platform.isRTL(elements.floating)) ? "start" : "end") ? "left" : "right";
					} else {
						widthSide = side;
						heightSide = alignment === "end" ? "top" : "bottom";
					}
					const maximumClippingHeight = height - overflow.top - overflow.bottom;
					const maximumClippingWidth = width - overflow.left - overflow.right;
					const overflowAvailableHeight = min(height - overflow[heightSide], maximumClippingHeight);
					const overflowAvailableWidth = min(width - overflow[widthSide], maximumClippingWidth);
					const shiftData = state.middlewareData.shift;
					const noShift = !shiftData;
					let availableHeight = overflowAvailableHeight;
					let availableWidth = overflowAvailableWidth;
					if (shiftData != null && shiftData.enabled.x) availableWidth = maximumClippingWidth;
					if (shiftData != null && shiftData.enabled.y) availableHeight = maximumClippingHeight;
					if (noShift && !alignment) {
						if (isYAxis) availableWidth = width - 2 * max(overflow.left, overflow.right);
						else availableHeight = height - 2 * max(overflow.top, overflow.bottom);
					}
					await apply({
						...state,
						availableWidth,
						availableHeight
					});
					const nextDimensions = await platform.getDimensions(elements.floating);
					if (width !== nextDimensions.width || height !== nextDimensions.height) return { reset: { rects: true } };
					return {};
				}
			};
		};
		//#endregion
		//#region ../../node_modules/.pnpm/@floating-ui+dom@1.8.0/node_modules/@floating-ui/dom/dist/floating-ui.dom.mjs
		function getCssDimensions(element) {
			const css = getComputedStyle$1(element);
			let width = parseFloat(css.width) || 0;
			let height = parseFloat(css.height) || 0;
			const hasOffset = isHTMLElement(element);
			const offsetWidth = hasOffset ? element.offsetWidth : width;
			const offsetHeight = hasOffset ? element.offsetHeight : height;
			const shouldFallback = round(width) !== offsetWidth || round(height) !== offsetHeight;
			if (shouldFallback) {
				width = offsetWidth;
				height = offsetHeight;
			}
			return {
				width,
				height,
				$: shouldFallback
			};
		}
		function unwrapElement(element) {
			return !isElement(element) ? element.contextElement : element;
		}
		function getScale(element) {
			const domElement = unwrapElement(element);
			if (!isHTMLElement(domElement)) return createCoords(1);
			const rect = domElement.getBoundingClientRect();
			const { width, height, $ } = getCssDimensions(domElement);
			let x = ($ ? round(rect.width) : rect.width) / width;
			let y = ($ ? round(rect.height) : rect.height) / height;
			if (!x || !Number.isFinite(x)) x = 1;
			if (!y || !Number.isFinite(y)) y = 1;
			return {
				x,
				y
			};
		}
		const noOffsets = /*#__PURE__*/ createCoords(0);
		function getVisualOffsets(element) {
			const win = getWindow(element);
			if (!isWebKit() || !win.visualViewport) return noOffsets;
			return {
				x: win.visualViewport.offsetLeft,
				y: win.visualViewport.offsetTop
			};
		}
		function shouldAddVisualOffsets(element, isFixed, floatingOffsetParent) {
			if (isFixed === void 0) isFixed = false;
			return !!floatingOffsetParent && isFixed && floatingOffsetParent === getWindow(element);
		}
		function getBoundingClientRect(element, includeScale, isFixedStrategy, offsetParent) {
			if (includeScale === void 0) includeScale = false;
			if (isFixedStrategy === void 0) isFixedStrategy = false;
			const clientRect = element.getBoundingClientRect();
			const domElement = unwrapElement(element);
			let scale = createCoords(1);
			if (includeScale) {
				if (offsetParent) {
					if (isElement(offsetParent)) scale = getScale(offsetParent);
				} else scale = getScale(element);
			}
			const visualOffsets = shouldAddVisualOffsets(domElement, isFixedStrategy, offsetParent) ? getVisualOffsets(domElement) : createCoords(0);
			let x = (clientRect.left + visualOffsets.x) / scale.x;
			let y = (clientRect.top + visualOffsets.y) / scale.y;
			let width = clientRect.width / scale.x;
			let height = clientRect.height / scale.y;
			if (domElement && offsetParent) {
				const win = getWindow(domElement);
				const offsetWin = isElement(offsetParent) ? getWindow(offsetParent) : offsetParent;
				let currentWin = win;
				let currentIFrame = getFrameElement(currentWin);
				while (currentIFrame && offsetWin !== currentWin) {
					const iframeScale = getScale(currentIFrame);
					const iframeRect = currentIFrame.getBoundingClientRect();
					const css = getComputedStyle$1(currentIFrame);
					const left = iframeRect.left + (currentIFrame.clientLeft + parseFloat(css.paddingLeft)) * iframeScale.x;
					const top = iframeRect.top + (currentIFrame.clientTop + parseFloat(css.paddingTop)) * iframeScale.y;
					x *= iframeScale.x;
					y *= iframeScale.y;
					width *= iframeScale.x;
					height *= iframeScale.y;
					x += left;
					y += top;
					currentWin = getWindow(currentIFrame);
					currentIFrame = getFrameElement(currentWin);
				}
			}
			return rectToClientRect({
				width,
				height,
				x,
				y
			});
		}
		function getWindowScrollBarX(element, rect) {
			const leftScroll = getNodeScroll(element).scrollLeft;
			if (!rect) return getBoundingClientRect(getDocumentElement(element)).left + leftScroll;
			return rect.left + leftScroll;
		}
		function getHTMLOffset(documentElement, scroll) {
			const htmlRect = documentElement.getBoundingClientRect();
			return {
				x: htmlRect.left + scroll.scrollLeft - getWindowScrollBarX(documentElement, htmlRect),
				y: htmlRect.top + scroll.scrollTop
			};
		}
		function convertOffsetParentRelativeRectToViewportRelativeRect(_ref) {
			let { elements, rect, offsetParent, strategy } = _ref;
			const isFixed = strategy === "fixed";
			const documentElement = getDocumentElement(offsetParent);
			const topLayer = elements ? isTopLayer(elements.floating) : false;
			if (offsetParent === documentElement || topLayer && isFixed) return rect;
			let scroll = {
				scrollLeft: 0,
				scrollTop: 0
			};
			let scale = createCoords(1);
			const offsets = createCoords(0);
			const isOffsetParentAnElement = isHTMLElement(offsetParent);
			if (isOffsetParentAnElement || !isFixed) {
				if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) scroll = getNodeScroll(offsetParent);
				if (isOffsetParentAnElement) {
					const offsetRect = getBoundingClientRect(offsetParent);
					scale = getScale(offsetParent);
					offsets.x = offsetRect.x + offsetParent.clientLeft;
					offsets.y = offsetRect.y + offsetParent.clientTop;
				}
			}
			const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
			return {
				width: rect.width * scale.x,
				height: rect.height * scale.y,
				x: rect.x * scale.x - scroll.scrollLeft * scale.x + offsets.x + htmlOffset.x,
				y: rect.y * scale.y - scroll.scrollTop * scale.y + offsets.y + htmlOffset.y
			};
		}
		function getClientRects(element) {
			return element.getClientRects ? Array.from(element.getClientRects()) : [];
		}
		function getDocumentRect(html) {
			const scroll = getNodeScroll(html);
			const body = html.ownerDocument.body;
			const width = max(html.scrollWidth, html.clientWidth, body.scrollWidth, body.clientWidth);
			const height = max(html.scrollHeight, html.clientHeight, body.scrollHeight, body.clientHeight);
			let x = -scroll.scrollLeft + getWindowScrollBarX(html);
			const y = -scroll.scrollTop;
			if (getComputedStyle$1(body).direction === "rtl") x += max(html.clientWidth, body.clientWidth) - width;
			return {
				width,
				height,
				x,
				y
			};
		}
		const SCROLLBAR_MAX = 25;
		function getViewportRect(element, strategy, rootBoundary) {
			if (rootBoundary === void 0) rootBoundary = "viewport";
			const isLayoutViewport = rootBoundary === "layoutViewport";
			const win = getWindow(element);
			const html = getDocumentElement(element);
			const visualViewport = win.visualViewport;
			let width = html.clientWidth;
			let height = html.clientHeight;
			let x = 0;
			let y = 0;
			if (visualViewport) {
				const layoutRelativeClientCoords = !isWebKit() || strategy === "fixed";
				if (isLayoutViewport) {
					if (!layoutRelativeClientCoords) {
						x = -visualViewport.offsetLeft;
						y = -visualViewport.offsetTop;
					}
				} else {
					width = visualViewport.width;
					height = visualViewport.height;
					if (layoutRelativeClientCoords) {
						x = visualViewport.offsetLeft;
						y = visualViewport.offsetTop;
					}
				}
			}
			if (getWindowScrollBarX(html) <= 0) {
				const doc = html.ownerDocument;
				const body = doc.body;
				const bodyStyles = getComputedStyle(body);
				const bodyMarginInline = doc.compatMode === "CSS1Compat" ? parseFloat(bodyStyles.marginLeft) + parseFloat(bodyStyles.marginRight) || 0 : 0;
				const reservedWidth = Math.abs(html.clientWidth - body.clientWidth - bodyMarginInline);
				const gutter = getComputedStyle(html).scrollbarGutter === "stable both-edges" ? reservedWidth / 2 : reservedWidth;
				if (gutter <= SCROLLBAR_MAX) width -= gutter;
			}
			return {
				width,
				height,
				x,
				y
			};
		}
		function getInnerBoundingClientRect(element, strategy) {
			const clientRect = getBoundingClientRect(element, true, strategy === "fixed");
			const top = clientRect.top + element.clientTop;
			const left = clientRect.left + element.clientLeft;
			const scale = getScale(element);
			return {
				width: element.clientWidth * scale.x,
				height: element.clientHeight * scale.y,
				x: left * scale.x,
				y: top * scale.y
			};
		}
		function getClientRectFromClippingAncestor(element, clippingAncestor, strategy) {
			let rect;
			if (clippingAncestor === "viewport" || clippingAncestor === "layoutViewport") rect = getViewportRect(element, strategy, clippingAncestor);
			else if (clippingAncestor === "document") rect = getDocumentRect(getDocumentElement(element));
			else if (isElement(clippingAncestor)) rect = getInnerBoundingClientRect(clippingAncestor, strategy);
			else {
				const visualOffsets = getVisualOffsets(element);
				rect = {
					x: clippingAncestor.x - visualOffsets.x,
					y: clippingAncestor.y - visualOffsets.y,
					width: clippingAncestor.width,
					height: clippingAncestor.height
				};
			}
			return rectToClientRect(rect);
		}
		function getClippingElementAncestors(element, cache) {
			const cachedResult = cache.get(element);
			if (cachedResult) return cachedResult;
			let result = getOverflowAncestors(element, [], false).filter((el) => isElement(el) && getNodeName(el) !== "body");
			let lastKeptComputedStyle = null;
			const elementIsFixed = getComputedStyle$1(element).position === "fixed";
			let currentNode = elementIsFixed ? getParentNode(element) : element;
			while (isElement(currentNode) && !isLastTraversableNode(currentNode)) {
				const computedStyle = getComputedStyle$1(currentNode);
				const currentNodeIsContaining = isContainingBlock(currentNode);
				const lastPosition = lastKeptComputedStyle ? lastKeptComputedStyle.position : elementIsFixed ? "fixed" : "";
				if (!currentNodeIsContaining && (lastPosition === "fixed" || lastPosition === "absolute" && computedStyle.position === "static")) result = result.filter((ancestor) => ancestor !== currentNode);
				else lastKeptComputedStyle = computedStyle;
				currentNode = getParentNode(currentNode);
			}
			cache.set(element, result);
			return result;
		}
		function getClippingRect(_ref) {
			let { element, boundary, rootBoundary, strategy } = _ref;
			const clippingAncestors = [...boundary === "clippingAncestors" ? isTopLayer(element) ? [] : getClippingElementAncestors(element, this._c) : [].concat(boundary), rootBoundary];
			const firstRect = getClientRectFromClippingAncestor(element, clippingAncestors[0], strategy);
			let top = firstRect.top;
			let right = firstRect.right;
			let bottom = firstRect.bottom;
			let left = firstRect.left;
			for (let i = 1; i < clippingAncestors.length; i++) {
				const rect = getClientRectFromClippingAncestor(element, clippingAncestors[i], strategy);
				top = max(rect.top, top);
				right = min(rect.right, right);
				bottom = min(rect.bottom, bottom);
				left = max(rect.left, left);
			}
			return {
				width: right - left,
				height: bottom - top,
				x: left,
				y: top
			};
		}
		function getDimensions(element) {
			const { width, height } = getCssDimensions(element);
			return {
				width,
				height
			};
		}
		function getRectRelativeToOffsetParent(element, offsetParent, strategy) {
			const isOffsetParentAnElement = isHTMLElement(offsetParent);
			const documentElement = getDocumentElement(offsetParent);
			const isFixed = strategy === "fixed";
			const rect = getBoundingClientRect(element, true, isFixed, offsetParent);
			let scroll = {
				scrollLeft: 0,
				scrollTop: 0
			};
			const offsets = createCoords(0);
			if (isOffsetParentAnElement || !isFixed) {
				if (getNodeName(offsetParent) !== "body" || isOverflowElement(documentElement)) scroll = getNodeScroll(offsetParent);
				if (isOffsetParentAnElement) {
					const offsetRect = getBoundingClientRect(offsetParent, true, isFixed, offsetParent);
					offsets.x = offsetRect.x + offsetParent.clientLeft;
					offsets.y = offsetRect.y + offsetParent.clientTop;
				}
			}
			if (!isOffsetParentAnElement && documentElement) offsets.x = getWindowScrollBarX(documentElement);
			const htmlOffset = documentElement && !isOffsetParentAnElement && !isFixed ? getHTMLOffset(documentElement, scroll) : createCoords(0);
			return {
				x: rect.left + scroll.scrollLeft - offsets.x - htmlOffset.x,
				y: rect.top + scroll.scrollTop - offsets.y - htmlOffset.y,
				width: rect.width,
				height: rect.height
			};
		}
		function isStaticPositioned(element) {
			return getComputedStyle$1(element).position === "static";
		}
		function getTrueOffsetParent(element, polyfill) {
			if (!isHTMLElement(element) || getComputedStyle$1(element).position === "fixed") return null;
			if (polyfill) return polyfill(element);
			let rawOffsetParent = element.offsetParent;
			if (getDocumentElement(element) === rawOffsetParent) rawOffsetParent = rawOffsetParent.ownerDocument.body;
			return rawOffsetParent;
		}
		function getOffsetParent(element, polyfill) {
			const win = getWindow(element);
			if (isTopLayer(element)) return win;
			if (!isHTMLElement(element)) {
				let svgOffsetParent = getParentNode(element);
				while (svgOffsetParent && !isLastTraversableNode(svgOffsetParent)) {
					if (isElement(svgOffsetParent) && !isStaticPositioned(svgOffsetParent)) return svgOffsetParent;
					svgOffsetParent = getParentNode(svgOffsetParent);
				}
				return win;
			}
			let offsetParent = getTrueOffsetParent(element, polyfill);
			while (offsetParent && isTableElement(offsetParent) && isStaticPositioned(offsetParent)) offsetParent = getTrueOffsetParent(offsetParent, polyfill);
			if (offsetParent && isLastTraversableNode(offsetParent) && isStaticPositioned(offsetParent) && !isContainingBlock(offsetParent)) return win;
			return offsetParent || getContainingBlock(element) || win;
		}
		const getElementRects = async function(data) {
			const getOffsetParentFn = this.getOffsetParent || getOffsetParent;
			const getDimensionsFn = this.getDimensions;
			const floatingDimensions = await getDimensionsFn(data.floating);
			return {
				reference: getRectRelativeToOffsetParent(data.reference, await getOffsetParentFn(data.floating), data.strategy),
				floating: {
					x: 0,
					y: 0,
					width: floatingDimensions.width,
					height: floatingDimensions.height
				}
			};
		};
		function isRTL(element) {
			return getComputedStyle$1(element).direction === "rtl";
		}
		const platform = {
			convertOffsetParentRelativeRectToViewportRelativeRect,
			getDocumentElement,
			getClippingRect,
			getOffsetParent,
			getElementRects,
			getClientRects,
			getDimensions,
			getScale,
			isElement,
			isRTL
		};
		function rectsAreEqual(a, b) {
			return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
		}
		function observeMove(element, onMove, ancestorResize) {
			let io = null;
			let timeoutId;
			const root = getDocumentElement(element);
			function cleanup() {
				var _io;
				clearTimeout(timeoutId);
				(_io = io) == null || _io.disconnect();
				io = null;
			}
			function refresh(skip, threshold) {
				if (skip === void 0) skip = false;
				if (threshold === void 0) threshold = 1;
				cleanup();
				const elementRectForRootMargin = element.getBoundingClientRect();
				const { left, top, width, height } = elementRectForRootMargin;
				if (!skip) onMove();
				if (!width || !height) return;
				const insetTop = floor(top);
				const insetRight = floor(root.clientWidth - (left + width));
				const insetBottom = floor(root.clientHeight - (top + height));
				const insetLeft = floor(left);
				const options = {
					rootMargin: -insetTop + "px " + -insetRight + "px " + -insetBottom + "px " + -insetLeft + "px",
					threshold: max(0, min(1, threshold)) || 1
				};
				let isFirstUpdate = true;
				function handleObserve(entries) {
					const ratio = entries[0].intersectionRatio;
					if (!rectsAreEqual(elementRectForRootMargin, element.getBoundingClientRect())) return refresh();
					if (ratio !== threshold) {
						if (!isFirstUpdate) return refresh();
						if (!ratio) timeoutId = setTimeout(() => {
							refresh(false, 1e-7);
						}, 1e3);
						else refresh(false, ratio);
					}
					isFirstUpdate = false;
				}
				try {
					io = new IntersectionObserver(handleObserve, {
						...options,
						root: root.ownerDocument
					});
				} catch (_e) {
					io = new IntersectionObserver(handleObserve, options);
				}
				io.observe(element);
			}
			const win = getWindow(element);
			const handleResize = () => refresh(ancestorResize);
			win.addEventListener("resize", handleResize);
			refresh(true);
			return () => {
				win.removeEventListener("resize", handleResize);
				cleanup();
			};
		}
		/**
		* Automatically updates the position of the floating element when necessary.
		* Should only be called when the floating element is mounted on the DOM or
		* visible on the screen.
		* @returns cleanup function that should be invoked when the floating element is
		* removed from the DOM or hidden from the screen.
		* @see https://floating-ui.com/docs/autoUpdate
		*/
		function autoUpdate(reference, floating, update, options) {
			if (options === void 0) options = {};
			const { ancestorScroll = true, ancestorResize = true, elementResize = typeof ResizeObserver === "function", layoutShift = typeof IntersectionObserver === "function", animationFrame = false } = options;
			const referenceEl = unwrapElement(reference);
			const ancestors = ancestorScroll || ancestorResize ? [...referenceEl ? getOverflowAncestors(referenceEl) : [], ...floating ? getOverflowAncestors(floating) : []] : [];
			ancestors.forEach((ancestor) => {
				ancestorScroll && ancestor.addEventListener("scroll", update);
				ancestorResize && ancestor.addEventListener("resize", update);
			});
			const cleanupIo = referenceEl && layoutShift ? observeMove(referenceEl, update, ancestorResize) : null;
			let reobserveFrame = -1;
			let resizeObserver = null;
			if (elementResize) {
				resizeObserver = new ResizeObserver((_ref) => {
					let [firstEntry] = _ref;
					if (firstEntry && firstEntry.target === referenceEl && resizeObserver && floating) {
						resizeObserver.unobserve(floating);
						cancelAnimationFrame(reobserveFrame);
						reobserveFrame = requestAnimationFrame(() => {
							var _resizeObserver;
							(_resizeObserver = resizeObserver) == null || _resizeObserver.observe(floating);
						});
					}
					update();
				});
				if (referenceEl && !animationFrame) resizeObserver.observe(referenceEl);
				if (floating) resizeObserver.observe(floating);
			}
			let frameId;
			let prevRefRect = animationFrame ? getBoundingClientRect(reference) : null;
			if (animationFrame) frameLoop();
			function frameLoop() {
				const nextRefRect = getBoundingClientRect(reference);
				if (prevRefRect && !rectsAreEqual(prevRefRect, nextRefRect)) update();
				prevRefRect = nextRefRect;
				frameId = requestAnimationFrame(frameLoop);
			}
			update();
			return () => {
				var _resizeObserver2;
				ancestors.forEach((ancestor) => {
					ancestorScroll && ancestor.removeEventListener("scroll", update);
					ancestorResize && ancestor.removeEventListener("resize", update);
				});
				cleanupIo?.();
				(_resizeObserver2 = resizeObserver) == null || _resizeObserver2.disconnect();
				resizeObserver = null;
				if (animationFrame) cancelAnimationFrame(frameId);
			};
		}
		/**
		* Modifies the placement by translating the floating element along the
		* specified axes.
		* A number (shorthand for `mainAxis` or distance), or an axes configuration
		* object may be passed.
		* @see https://floating-ui.com/docs/offset
		*/
		const offset$2 = offset$1;
		/**
		* Optimizes the visibility of the floating element by shifting it in order to
		* keep it in view when it will overflow the clipping boundary.
		* @see https://floating-ui.com/docs/shift
		*/
		const shift$2 = shift$1;
		/**
		* Optimizes the visibility of the floating element by flipping the `placement`
		* in order to keep it in view when the preferred placement(s) will overflow the
		* clipping boundary. Alternative to `autoPlacement`.
		* @see https://floating-ui.com/docs/flip
		*/
		const flip$2 = flip$1;
		/**
		* Provides data that allows you to change the size of the floating element —
		* for instance, prevent it from overflowing the clipping boundary or match the
		* width of the reference element.
		* @see https://floating-ui.com/docs/size
		*/
		const size$2 = size$1;
		/**
		* Computes the `x` and `y` coordinates that will place the floating element
		* next to a given reference element.
		*/
		const computePosition = (reference, floating, options) => {
			const cache = /* @__PURE__ */ new Map();
			const mergedOptions = options != null ? options : {};
			const platformWithCache = {
				...platform,
				...mergedOptions.platform,
				_c: cache
			};
			return computePosition$1(reference, floating, {
				...mergedOptions,
				platform: platformWithCache
			});
		};
		//#endregion
		//#region ../../node_modules/.pnpm/@floating-ui+react-dom@2.1.9_react-dom@19.3.1_react@19.3.1__react@19.3.1/node_modules/@floating-ui/react-dom/dist/floating-ui.react-dom.mjs
		var index = typeof document !== "undefined" ? react.useLayoutEffect : function noop() {};
		function deepEqual(a, b) {
			if (a === b) return true;
			if (typeof a !== typeof b) return false;
			if (typeof a === "function" && a.toString() === b.toString()) return true;
			let length;
			let i;
			let keys;
			if (a && b && typeof a === "object") {
				if (Array.isArray(a)) {
					length = a.length;
					if (length !== b.length) return false;
					for (i = length; i-- !== 0;) if (!deepEqual(a[i], b[i])) return false;
					return true;
				}
				keys = Object.keys(a);
				length = keys.length;
				if (length !== Object.keys(b).length) return false;
				for (i = length; i-- !== 0;) if (!{}.hasOwnProperty.call(b, keys[i])) return false;
				for (i = length; i-- !== 0;) {
					const key = keys[i];
					if (key === "_owner" && a.$$typeof) continue;
					if (!deepEqual(a[key], b[key])) return false;
				}
				return true;
			}
			return a !== a && b !== b;
		}
		function getDPR(element) {
			if (typeof window === "undefined") return 1;
			return (element.ownerDocument.defaultView || window).devicePixelRatio || 1;
		}
		function roundByDPR(element, value) {
			const dpr = getDPR(element);
			return Math.round(value * dpr) / dpr;
		}
		function useLatestRef(value) {
			const ref = react.useRef(value);
			index(() => {
				ref.current = value;
			});
			return ref;
		}
		/**
		* Provides data to position a floating element.
		* @see https://floating-ui.com/docs/useFloating
		*/
		function useFloating$1(options) {
			if (options === void 0) options = {};
			const { placement = "bottom", strategy = "absolute", middleware = [], platform, elements: { reference: externalReference, floating: externalFloating } = {}, transform = true, whileElementsMounted, open } = options;
			const [data, setData] = react.useState({
				x: 0,
				y: 0,
				strategy,
				placement,
				middlewareData: {},
				isPositioned: false
			});
			const [latestMiddleware, setLatestMiddleware] = react.useState(middleware);
			if (!deepEqual(latestMiddleware, middleware)) setLatestMiddleware(middleware);
			const [_reference, _setReference] = react.useState(null);
			const [_floating, _setFloating] = react.useState(null);
			const setReference = react.useCallback((node) => {
				if (node !== referenceRef.current) {
					referenceRef.current = node;
					_setReference(node);
				}
			}, []);
			const setFloating = react.useCallback((node) => {
				if (node !== floatingRef.current) {
					floatingRef.current = node;
					_setFloating(node);
				}
			}, []);
			const referenceEl = externalReference || _reference;
			const floatingEl = externalFloating || _floating;
			const referenceRef = react.useRef(null);
			const floatingRef = react.useRef(null);
			const dataRef = react.useRef(data);
			const hasWhileElementsMounted = whileElementsMounted != null;
			const whileElementsMountedRef = useLatestRef(whileElementsMounted);
			const platformRef = useLatestRef(platform);
			const openRef = useLatestRef(open);
			const update = react.useCallback(() => {
				if (!referenceRef.current || !floatingRef.current) return;
				const config = {
					placement,
					strategy,
					middleware: latestMiddleware
				};
				if (platformRef.current) config.platform = platformRef.current;
				computePosition(referenceRef.current, floatingRef.current, config).then((data) => {
					const fullData = {
						...data,
						isPositioned: openRef.current !== false
					};
					if (isMountedRef.current && !deepEqual(dataRef.current, fullData)) {
						dataRef.current = fullData;
						react_dom.flushSync(() => {
							setData(fullData);
						});
					}
				});
			}, [
				latestMiddleware,
				placement,
				strategy,
				platformRef,
				openRef
			]);
			index(() => {
				if (open === false && dataRef.current.isPositioned) {
					dataRef.current.isPositioned = false;
					setData((data) => ({
						...data,
						isPositioned: false
					}));
				}
			}, [open]);
			const isMountedRef = react.useRef(false);
			index(() => {
				isMountedRef.current = true;
				return () => {
					isMountedRef.current = false;
				};
			}, []);
			index(() => {
				if (referenceEl) referenceRef.current = referenceEl;
				if (floatingEl) floatingRef.current = floatingEl;
				if (referenceEl && floatingEl) {
					if (whileElementsMountedRef.current) return whileElementsMountedRef.current(referenceEl, floatingEl, update);
					update();
				}
			}, [
				referenceEl,
				floatingEl,
				update,
				whileElementsMountedRef,
				hasWhileElementsMounted
			]);
			const refs = react.useMemo(() => ({
				reference: referenceRef,
				floating: floatingRef,
				setReference,
				setFloating
			}), [setReference, setFloating]);
			const elements = react.useMemo(() => ({
				reference: referenceEl,
				floating: floatingEl
			}), [referenceEl, floatingEl]);
			const floatingStyles = react.useMemo(() => {
				const initialStyles = {
					position: strategy,
					left: 0,
					top: 0
				};
				if (!elements.floating) return initialStyles;
				const x = roundByDPR(elements.floating, data.x);
				const y = roundByDPR(elements.floating, data.y);
				if (transform) return {
					...initialStyles,
					transform: "translate(" + x + "px, " + y + "px)",
					...getDPR(elements.floating) >= 1.5 && { willChange: "transform" }
				};
				return {
					position: strategy,
					left: x,
					top: y
				};
			}, [
				strategy,
				transform,
				elements.floating,
				data.x,
				data.y
			]);
			return react.useMemo(() => ({
				...data,
				update,
				refs,
				elements,
				floatingStyles
			}), [
				data,
				update,
				refs,
				elements,
				floatingStyles
			]);
		}
		/**
		* Modifies the placement by translating the floating element along the
		* specified axes.
		* A number (shorthand for `mainAxis` or distance), or an axes configuration
		* object may be passed.
		* @see https://floating-ui.com/docs/offset
		*/
		const offset = (options, deps) => {
			const result = offset$2(options);
			return {
				name: result.name,
				fn: result.fn,
				options: [options, deps]
			};
		};
		/**
		* Optimizes the visibility of the floating element by shifting it in order to
		* keep it in view when it will overflow the clipping boundary.
		* @see https://floating-ui.com/docs/shift
		*/
		const shift = (options, deps) => {
			const result = shift$2(options);
			return {
				name: result.name,
				fn: result.fn,
				options: [options, deps]
			};
		};
		/**
		* Optimizes the visibility of the floating element by flipping the `placement`
		* in order to keep it in view when the preferred placement(s) will overflow the
		* clipping boundary. Alternative to `autoPlacement`.
		* @see https://floating-ui.com/docs/flip
		*/
		const flip = (options, deps) => {
			const result = flip$2(options);
			return {
				name: result.name,
				fn: result.fn,
				options: [options, deps]
			};
		};
		/**
		* Provides data that allows you to change the size of the floating element —
		* for instance, prevent it from overflowing the clipping boundary or match the
		* width of the reference element.
		* @see https://floating-ui.com/docs/size
		*/
		const size = (options, deps) => {
			const result = size$2(options);
			return {
				name: result.name,
				fn: result.fn,
				options: [options, deps]
			};
		};
		//#endregion
		//#region ../../node_modules/.pnpm/@floating-ui+react@0.27.20_react-dom@19.3.1_react@19.3.1__react@19.3.1/node_modules/@floating-ui/react/dist/floating-ui.react.mjs
		const ARROW_LEFT = "ArrowLeft";
		const ARROW_RIGHT = "ArrowRight";
		const ARROW_UP = "ArrowUp";
		const ARROW_DOWN = "ArrowDown";
		const horizontalKeys = [ARROW_LEFT, ARROW_RIGHT];
		const verticalKeys = [ARROW_UP, ARROW_DOWN];
		[...horizontalKeys, ...verticalKeys];
		const SafeReact = { ...react };
		let serverHandoffComplete = false;
		let count = 0;
		const genId = () => "floating-ui-" + Math.random().toString(36).slice(2, 6) + count++;
		function useFloatingId() {
			const [id, setId] = react.useState(() => serverHandoffComplete ? genId() : void 0);
			index$1(() => {
				if (id == null) setId(genId());
			}, []);
			react.useEffect(() => {
				serverHandoffComplete = true;
			}, []);
			return id;
		}
		/**
		* Uses React 18's built-in `useId()` when available, or falls back to a
		* slightly less performant (requiring a double render) implementation for
		* earlier React versions.
		* @see https://floating-ui.com/docs/react-utils#useid
		*/
		const useId = SafeReact.useId || useFloatingId;
		function createEventEmitter() {
			const map = /* @__PURE__ */ new Map();
			return {
				emit(event, data) {
					var _map$get;
					(_map$get = map.get(event)) == null || _map$get.forEach((listener) => listener(data));
				},
				on(event, listener) {
					if (!map.has(event)) map.set(event, /* @__PURE__ */ new Set());
					map.get(event).add(listener);
				},
				off(event, listener) {
					var _map$get2;
					(_map$get2 = map.get(event)) == null || _map$get2.delete(listener);
				}
			};
		}
		const FloatingNodeContext = /*#__PURE__*/ react.createContext(null);
		const FloatingTreeContext = /*#__PURE__*/ react.createContext(null);
		/**
		* Returns the parent node id for nested floating elements, if available.
		* Returns `null` for top-level floating elements.
		*/
		const useFloatingParentNodeId = () => {
			var _React$useContext;
			return ((_React$useContext = react.useContext(FloatingNodeContext)) == null ? void 0 : _React$useContext.id) || null;
		};
		/**
		* Returns the nearest floating tree context, if available.
		*/
		const useFloatingTree = () => react.useContext(FloatingTreeContext);
		function createAttribute(name) {
			return "data-floating-ui-" + name;
		}
		const HIDDEN_STYLES = {
			border: 0,
			clip: "rect(0 0 0 0)",
			height: "1px",
			margin: "-1px",
			overflow: "hidden",
			padding: 0,
			position: "fixed",
			whiteSpace: "nowrap",
			width: "1px",
			top: 0,
			left: 0
		};
		const FocusGuard = /*#__PURE__*/ react.forwardRef(function FocusGuard(props, ref) {
			const [role, setRole] = react.useState();
			index$1(() => {
				if (isSafari()) setRole("button");
			}, []);
			const restProps = {
				ref,
				tabIndex: 0,
				role,
				"aria-hidden": role ? void 0 : true,
				[createAttribute("focus-guard")]: "",
				style: HIDDEN_STYLES
			};
			return /*#__PURE__*/ (0, react_jsx_runtime.jsx)("span", {
				...props,
				...restProps
			});
		});
		const HIDDEN_OWNER_STYLES = {
			clipPath: "inset(50%)",
			position: "fixed",
			top: 0,
			left: 0
		};
		const PortalContext = /*#__PURE__*/ react.createContext(null);
		const attr = /*#__PURE__*/ createAttribute("portal");
		/**
		* @see https://floating-ui.com/docs/FloatingPortal#usefloatingportalnode
		*/
		function useFloatingPortalNode(props) {
			if (props === void 0) props = {};
			const { id, root } = props;
			const uniqueId = useId();
			const portalContext = usePortalContext();
			const [portalNode, setPortalNode] = react.useState(null);
			const portalNodeRef = react.useRef(null);
			index$1(() => {
				return () => {
					portalNode?.remove();
					queueMicrotask(() => {
						portalNodeRef.current = null;
					});
				};
			}, [portalNode]);
			index$1(() => {
				if (!uniqueId) return;
				if (portalNodeRef.current) return;
				const existingIdRoot = id ? document.getElementById(id) : null;
				if (!existingIdRoot) return;
				const subRoot = document.createElement("div");
				subRoot.id = uniqueId;
				subRoot.setAttribute(attr, "");
				existingIdRoot.appendChild(subRoot);
				portalNodeRef.current = subRoot;
				setPortalNode(subRoot);
			}, [id, uniqueId]);
			index$1(() => {
				if (root === null) return;
				if (!uniqueId) return;
				if (portalNodeRef.current) return;
				let container = root || (portalContext == null ? void 0 : portalContext.portalNode);
				if (container && !isNode(container)) container = container.current;
				container = container || document.body;
				let idWrapper = null;
				if (id) {
					idWrapper = document.createElement("div");
					idWrapper.id = id;
					container.appendChild(idWrapper);
				}
				const subRoot = document.createElement("div");
				subRoot.id = uniqueId;
				subRoot.setAttribute(attr, "");
				container = idWrapper || container;
				container.appendChild(subRoot);
				portalNodeRef.current = subRoot;
				setPortalNode(subRoot);
			}, [
				id,
				root,
				uniqueId,
				portalContext
			]);
			return portalNode;
		}
		/**
		* Portals the floating element into a given container element — by default,
		* outside of the app root and into the body.
		* This is necessary to ensure the floating element can appear outside any
		* potential parent containers that cause clipping (such as `overflow: hidden`),
		* while retaining its location in the React tree.
		* @see https://floating-ui.com/docs/FloatingPortal
		*/
		function FloatingPortal(props) {
			const { children, id, root, preserveTabOrder = true } = props;
			const portalNode = useFloatingPortalNode({
				id,
				root
			});
			const [focusManagerState, setFocusManagerState] = react.useState(null);
			const beforeOutsideRef = react.useRef(null);
			const afterOutsideRef = react.useRef(null);
			const beforeInsideRef = react.useRef(null);
			const afterInsideRef = react.useRef(null);
			const modal = focusManagerState == null ? void 0 : focusManagerState.modal;
			const open = focusManagerState == null ? void 0 : focusManagerState.open;
			const shouldRenderGuards = !!focusManagerState && !focusManagerState.modal && focusManagerState.open && preserveTabOrder && !!(root || portalNode);
			react.useEffect(() => {
				if (!portalNode || !preserveTabOrder || modal) return;
				function onFocus(event) {
					if (portalNode && isOutsideEvent(event)) (event.type === "focusin" ? enableFocusInside : disableFocusInside)(portalNode);
				}
				portalNode.addEventListener("focusin", onFocus, true);
				portalNode.addEventListener("focusout", onFocus, true);
				return () => {
					portalNode.removeEventListener("focusin", onFocus, true);
					portalNode.removeEventListener("focusout", onFocus, true);
				};
			}, [
				portalNode,
				preserveTabOrder,
				modal
			]);
			react.useEffect(() => {
				if (!portalNode) return;
				if (open) return;
				enableFocusInside(portalNode);
			}, [open, portalNode]);
			return /*#__PURE__*/ (0, react_jsx_runtime.jsxs)(PortalContext.Provider, {
				value: react.useMemo(() => ({
					preserveTabOrder,
					beforeOutsideRef,
					afterOutsideRef,
					beforeInsideRef,
					afterInsideRef,
					portalNode,
					setFocusManagerState
				}), [preserveTabOrder, portalNode]),
				children: [
					shouldRenderGuards && portalNode && /*#__PURE__*/ (0, react_jsx_runtime.jsx)(FocusGuard, {
						"data-type": "outside",
						ref: beforeOutsideRef,
						onFocus: (event) => {
							if (isOutsideEvent(event, portalNode)) {
								var _beforeInsideRef$curr;
								(_beforeInsideRef$curr = beforeInsideRef.current) == null || _beforeInsideRef$curr.focus();
							} else getPreviousTabbable(focusManagerState ? focusManagerState.domReference : null)?.focus();
						}
					}),
					shouldRenderGuards && portalNode && /*#__PURE__*/ (0, react_jsx_runtime.jsx)("span", {
						"aria-owns": portalNode.id,
						style: HIDDEN_OWNER_STYLES
					}),
					portalNode && /*#__PURE__*/ react_dom.createPortal(children, portalNode),
					shouldRenderGuards && portalNode && /*#__PURE__*/ (0, react_jsx_runtime.jsx)(FocusGuard, {
						"data-type": "outside",
						ref: afterOutsideRef,
						onFocus: (event) => {
							if (isOutsideEvent(event, portalNode)) {
								var _afterInsideRef$curre;
								(_afterInsideRef$curre = afterInsideRef.current) == null || _afterInsideRef$curre.focus();
							} else {
								getNextTabbable(focusManagerState ? focusManagerState.domReference : null)?.focus();
								focusManagerState != null && focusManagerState.closeOnFocusOut && focusManagerState?.onOpenChange(false, event.nativeEvent, "focus-out");
							}
						}
					})
				]
			});
		}
		const usePortalContext = () => react.useContext(PortalContext);
		function useFloatingRootContext(options) {
			const { open = false, onOpenChange: onOpenChangeProp, elements: elementsProp } = options;
			const floatingId = useId();
			const dataRef = react.useRef({});
			const [events] = react.useState(() => createEventEmitter());
			const nested = useFloatingParentNodeId() != null;
			const [positionReference, setPositionReference] = react.useState(elementsProp.reference);
			const onOpenChange = useEffectEvent((open, event, reason) => {
				dataRef.current.openEvent = open ? event : void 0;
				events.emit("openchange", {
					open,
					event,
					reason,
					nested
				});
				onOpenChangeProp?.(open, event, reason);
			});
			const refs = react.useMemo(() => ({ setPositionReference }), []);
			const elements = react.useMemo(() => ({
				reference: positionReference || elementsProp.reference || null,
				floating: elementsProp.floating || null,
				domReference: elementsProp.reference
			}), [
				positionReference,
				elementsProp.reference,
				elementsProp.floating
			]);
			return react.useMemo(() => ({
				dataRef,
				open,
				onOpenChange,
				elements,
				events,
				floatingId,
				refs
			}), [
				open,
				onOpenChange,
				elements,
				events,
				floatingId,
				refs
			]);
		}
		/**
		* Provides data to position a floating element and context to add interactions.
		* @see https://floating-ui.com/docs/useFloating
		*/
		function useFloating(_temp) {
			var _elementsOption$refer, _elementsOption$float;
			let { elements: elementsOption, ...options } = _temp === void 0 ? {} : _temp;
			const { nodeId } = options;
			const internalRootContext = useFloatingRootContext({
				...options,
				elements: {
					reference: (_elementsOption$refer = elementsOption == null ? void 0 : elementsOption.reference) != null ? _elementsOption$refer : null,
					floating: (_elementsOption$float = elementsOption == null ? void 0 : elementsOption.floating) != null ? _elementsOption$float : null
				}
			});
			const rootContext = options.rootContext || internalRootContext;
			const computedElements = rootContext.elements;
			const [_domReference, setDomReference] = react.useState(null);
			const [positionReference, _setPositionReference] = react.useState(null);
			const domReference = (computedElements == null ? void 0 : computedElements.domReference) || _domReference;
			const domReferenceRef = react.useRef(null);
			const tree = useFloatingTree();
			index$1(() => {
				if (domReference) domReferenceRef.current = domReference;
			}, [domReference]);
			const position = useFloating$1({
				...options,
				elements: {
					...computedElements,
					...positionReference && { reference: positionReference }
				}
			});
			const setPositionReference = react.useCallback((node) => {
				const computedPositionReference = isElement(node) ? {
					getBoundingClientRect: () => node.getBoundingClientRect(),
					getClientRects: () => node.getClientRects(),
					contextElement: node
				} : node;
				_setPositionReference(computedPositionReference);
				position.refs.setReference(computedPositionReference);
			}, [position.refs]);
			const setReference = react.useCallback((node) => {
				if (isElement(node) || node === null) {
					domReferenceRef.current = node;
					setDomReference(node);
				}
				if (isElement(position.refs.reference.current) || position.refs.reference.current === null || node !== null && !isElement(node)) position.refs.setReference(node);
			}, [position.refs]);
			const refs = react.useMemo(() => ({
				...position.refs,
				setReference,
				setPositionReference,
				domReference: domReferenceRef
			}), [
				position.refs,
				setReference,
				setPositionReference
			]);
			const elements = react.useMemo(() => ({
				...position.elements,
				domReference
			}), [position.elements, domReference]);
			const context = react.useMemo(() => ({
				...position,
				...rootContext,
				refs,
				elements,
				nodeId
			}), [
				position,
				refs,
				elements,
				nodeId,
				rootContext
			]);
			index$1(() => {
				rootContext.dataRef.current.floatingContext = context;
				const node = tree == null ? void 0 : tree.nodesRef.current.find((node) => node.id === nodeId);
				if (node) node.context = context;
			});
			return react.useMemo(() => ({
				...position,
				context,
				refs,
				elements
			}), [
				position,
				refs,
				elements,
				context
			]);
		}
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/chevron.js
		/**
		* 全站唯一的箭头：**自绘 chevron**（就是下拉框右侧那颗）。
		*
		* 为什么自绘：`ui` 层零官方依赖（官方图标只在宿主内可解析），官方件在这个包里 import 不到。
		* 为什么不再写字形：'▾' / '↑' 这类字符在各系统字体下粗细、角度、基线都不一样，
		* 同一套界面里会出现两种箭头 —— 2026-10-26 用户点名 ▾ 太丑 ⇒ 一律换成这颗 chevron。
		*
		* 用法：`h(Chevron, { dir: 'up', size: 18 })`；要动画就在外层套一个带 transform 的类
		* （如卡片折叠的 `.dshpc-card__caret.is-open`），不要给每个方向另画一条路径。
		*/
		const ROTATE = {
			down: 0,
			up: 180,
			left: 90,
			right: 270
		};
		function Chevron(props) {
			const size = props.size ?? 12;
			const deg = ROTATE[props.dir ?? "down"];
			const style = deg === 0 ? void 0 : { transform: `rotate(${String(deg)}deg)` };
			return (0, react.createElement)("svg", {
				className: props.className,
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": true,
				style
			}, (0, react.createElement)("path", {
				d: "M4 6l4 4 4-4",
				stroke: "currentColor",
				"stroke-width": 1.5,
				"stroke-linecap": "round",
				"stroke-linejoin": "round"
			}));
		}
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/utils/i18n.js
		/**
		* utils 自带的最小多语言。
		*
		* 原则（需求文档 §5.4）：**核心提供什么，核心就负责它的多语言** —— utils 里要吐文案的函数
		* （如相对时间）自带中英字典；插件**自己界面**的文案仍由插件自己管，这里不提供插件级 i18n 框架。
		* 需要覆盖时传自己的 `t` 进来即可。
		*/
		const DICT = {
			zh: {
				sessionLoading: "加载会话…",
				sessionFailed: "会话加载失败",
				sessionEmpty: "该会话暂无内容",
				explorerLoading: "加载中…",
				explorerFailed: "加载失败",
				explorerRoot: "工作区",
				explorerTruncated: "条目过多，已截断",
				explorerEmptyDir: "空目录",
				explorerLevels: "选择层级",
				explorerExpand: "展开",
				explorerCollapse: "收起",
				explorerEnter: "进入",
				explorerRootName: "（工作区根目录）",
				explorerCrumbsAria: "目录路径",
				explorerPickFile: "选择此文件",
				explorerPickDir: "选择",
				explorerPickDirAria: "选择此目录（连带其下所有文件）",
				previewClose: "关闭",
				previewCopyPath: "复制路径",
				previewRefresh: "刷新",
				previewRender: "预览",
				previewSource: "源码",
				previewMdSwitchAria: "切换渲染或源码",
				previewHtmlSwitchAria: "切换渲染或源码",
				previewLoadMore: "加载更多",
				previewTruncated: "内容过大，仅显示前 {n}",
				previewOfficeUnavailable: "Office 预览不可用",
				previewRenderFailed: "预览渲染失败",
				previewBadPayload: "返回数据不符合预期",
				previewOutside: "路径在工作区之外",
				previewNotFound: "文件不存在",
				previewNotDirectory: "不是文件夹",
				previewTooLarge: "文件过大，无法预览",
				previewNotText: "不是文本文件",
				previewFailedCode: "加载失败（{code}）",
				mdCopy: "复制",
				mdCopied: "已复制",
				mdCode: "代码",
				mdWrap: "换行",
				mdUnwrap: "取消换行",
				mdFootnotes: "脚注",
				cardToggle: "展开/收起",
				modalClose: "关闭",
				dockClose: "关闭面板",
				dockResize: "拖动调整宽度",
				dockCollapse: "收起面板",
				dockExpand: "展开面板",
				errorRetry: "重试",
				confirm: "确定",
				cancel: "取消",
				dialogOk: "知道了",
				pickerPlaceholder: "请选择",
				pickerClear: "不选",
				pickerEmpty: "暂无可选",
				pickerNoMatch: "无匹配项",
				pickerSearch: "搜索…",
				pickerSelected: "已选 {n} 项",
				pickerMaxReached: "最多选 {n} 项",
				pickerDegraded: "候选可能不完整",
				modelProvider: "供应商",
				modelModel: "模型",
				modelDefault: "默认模型",
				workspaceAll: "所有工作区",
				relNow: "刚刚",
				relInJustNow: "即将",
				relInMinutes: "{n} 分钟后",
				relInHours: "{n} 小时后",
				relInDays: "{n} 天后",
				relInMonths: "{n} 个月后",
				relInYears: "{n} 年后",
				relJustNow: "刚刚",
				relMinutesAgo: "{n} 分钟前",
				relHoursAgo: "{n} 小时前",
				relDaysAgo: "{n} 天前",
				relWeeksAgo: "{n} 周前",
				relMonthsAgo: "{n} 个月前",
				relYearsAgo: "{n} 年前",
				codeCopy: "复制",
				codeCopied: "已复制",
				sessionUnknownKind: "未支持的节点类型：",
				sessionLoadOlder: "加载更早记录",
				sessionProcess: "过程",
				triggerRequest: "收到执行请求",
				triggerGoal: "继续执行目标",
				triggerAgent: "收到任务消息",
				triggerTeam: "收到团队消息",
				triggerSubagent: "子任务状态更新",
				triggerGithub: "收到 GitHub 事件",
				triggerWebhook: "收到外部事件",
				triggerSchedule: "定时任务",
				triggerJob: "后台任务状态更新",
				triggerPlugin: "插件状态更新",
				triggerExplanation: "这条通知触发了本轮回复。",
				turnProcessTook: "用时 {duration}",
				turnProcessDeepDiving: "深度求索中，用时{duration}",
				turnProcessWorked: "已完成工作",
				turnProcessFailed: "处理失败",
				turnStopped: "已停止",
				chatDeepDiving: "深度求索中",
				thinkLabel: "思考",
				durationSeconds: "{seconds}秒",
				durationMinutes: "{minutes}分{seconds}秒",
				durationHours: "{hours}小时{minutes}分{seconds}秒",
				durationMilliseconds: "{milliseconds}毫秒",
				retryActive: "正在重试模型请求",
				retryCancelled: "模型请求重试已取消",
				retryStarted: "已重试模型请求",
				retryScheduled: "等待重试模型请求",
				retryStatus: "{label}（{retry}/{maximum}） · {seconds}s",
				retryDelay: "重试延迟：",
				retryFailure: "失败原因：",
				turnErrorTitle: "本轮运行失败",
				accountStopped: "任务已停止",
				maxTokensTitle: "已达到输出 token 上限",
				maxTokensHint: "回答被截断，已有输出保留在对话中。发送“继续”可让模型接着输出。",
				failureAuth: "API 密钥无效",
				failureQuota: "当前请求的额度已用尽",
				failureAccountSignedOut: "任务已因退出 DeepSeek 登录而停止。",
				failureAccountSignInRequired: "请先登录 DeepSeek，并确认请求地址支持账号认证。",
				clockDate: "{m}月{d}日",
				clockDateYear: "{y}年{m}月{d}日",
				copyLabel: "复制",
				copiedLabel: "已复制",
				branchLabel: "在新对话中分支",
				branchUnavailableLabel: "只读会话记录不可分支",
				turnUsageTitle: "本轮用量",
				turnUsageModel: "提供方 / 模型",
				turnUsageCacheHit: "缓存命中",
				turnUsageInput: "未缓存输入",
				turnUsageCacheRead: "缓存读取",
				turnUsageCacheWrite: "缓存写入",
				turnUsageOutput: "输出",
				turnUsageReasoning: "（其中推理 {tokens}）",
				turnUsageConsumed: "用量 {total}",
				turnUsageCount: "{count} tok",
				numberThousand: "{value}K",
				numberMillion: "{value}M",
				numberGroupSeparator: ",",
				stepProcessDoneThinking: "已完成分析",
				stepProcessDoneRead: "已读取文件",
				stepProcessDoneReadImage: "已读取图片",
				stepProcessDoneWrite: "已写入文件",
				stepProcessDoneSearch: "已搜索代码",
				stepProcessDoneEdit: "修改了文件",
				stepProcessDoneCommands: "执行了命令",
				stepProcessDoneCode: "运行了代码",
				stepProcessDoneWebSearch: "已搜索网页",
				stepProcessDoneWebFetch: "已访问网页",
				stepProcessDoneSubagents: "已协调子智能体",
				stepProcessDonePlan: "更新了计划",
				stepProcessDoneQuestions: "向用户提出了问题",
				stepProcessDoneTools: "已调用工具",
				stepProcessJoinTwo: "{first}并{second}",
				stepProcessComma: "，",
				stepProcessSharedPrefix: "已",
				stepProcessMore: "{title}等",
				toolTitleRead: "读取",
				toolTitleReadImage: "读取图片",
				toolTitleGrep: "搜索文件内容",
				toolTitleGlob: "查找文件",
				toolTitleBash: "运行命令",
				toolTitleWrite: "写入",
				toolTitleEdit: "编辑",
				toolTitleCode: "代码",
				toolTitleWebSearch: "网页搜索",
				toolTitleWebFetch: "网页获取",
				toolTitleGeneric: "工具调用",
				toolTitleSearch: "搜索",
				toolInputLabel: "输入",
				toolOutputLabel: "输出",
				rowPreparing: "正在准备调用",
				rowRunning: "运行中",
				rowFailed: "失败",
				rowStopped: "已停止",
				commandRunning: "执行中…",
				commandFailed: "指令失败",
				commandDone: "已完成",
				commandTitle: "指令",
				collapseLabel: "收起",
				readWindow: "显示 {shown} / {total} 行",
				readCollapseAria: "收起内容",
				readExpandAria: "展开其余 {count} 行",
				readExpandRest: "… 其余 {count} 行",
				terminalSignal: "信号 {signal}",
				terminalExitCode: "退出码 {code}",
				terminalNoExitCode: "未正常退出",
				terminalRunning: "运行中",
				terminalFailed: "失败",
				terminalDone: "已完成",
				terminalNoOutput: "无输出",
				terminalCollapseAria: "收起输出",
				terminalExpandAria: "展开其余 {n} 行输出",
				terminalExpandRest: "… 其余 {n} 行",
				terminalCommandLine: "第 {n} 行",
				terminalSendInput: "（发送输入）",
				terminalSession: "终端 {sessionId}",
				codeBlockLabel: "代码块",
				diffWrapLabel: "自动换行",
				diffUnwrapLabel: "取消换行",
				diffCollapseAria: "收起差异",
				diffExpandAria: "展开其余 {count} 行差异",
				diffExpandRest: "… 其余 {count} 行",
				sessionArchived: "已归档",
				sessionHeading: "会话预览",
				changesSingle: "已编辑 {name}",
				changesMulti: "已编辑 {count} 个文件",
				changesBinary: "二进制文件",
				changesAll: "全部 {count} 个文件",
				changesCollapse: "收起",
				changesOversized: "文件过大",
				diffLoading: "正在读取改动…",
				diffMissing: "这轮改动的内容已不可用",
				diffError: "无法读取改动",
				diffBinary: "二进制文件，无法显示改动",
				diffOversized: "文件过大，无法显示改动",
				diffCreated: "本轮新建的文件",
				diffDeleted: "本轮删除的文件",
				diffUnchanged: "两侧内容相同",
				diffCoarse: "逐行对比超时，按整个文件替换显示",
				diffTruncated: "只显示前 {count} 行",
				continueBranch: "继续对话",
				forkConfirmTitle: "开分支继续对话",
				forkConfirmText: "是否需要基于此会话开一个新分支继续对话？原会话保持只读留档，新分支复制本会话内容并可继续对话。",
				forkConfirmAccept: "开分支并跳转",
				forkWorking: "正在开分支…",
				forkFailed: "开分支失败：{error}",
				deliverRowTitle: "交付文件",
				deliverRowPreparing: "准备交付",
				deliverRowRunning: "正在交付",
				deliverRowOk: "已交付",
				deliverRowError: "交付失败",
				deliverRowStopped: "已中断",
				deliverFileLabel: "文件",
				deliverPreviewHint: "预览",
				deliverPreviewCard: "预览 {name}",
				deliverAll: "全部 {count} 个文件",
				deliverCollapse: "收起",
				deliverExpandAria: "展开全部 {count} 个交付文件",
				deliverCollapseAria: "收起交付文件列表",
				composerPlaceholder: "继续说点什么…",
				composerHint: "点「确定」后基于本会话开分支，并在官方会话中开始这轮对话",
				dtPlaceholder: "请选择日期时间",
				dtStart: "开始",
				dtEnd: "结束",
				dtToday: "今天",
				dtNow: "现在",
				dtClear: "清除",
				dtHour: "时",
				dtMinute: "分",
				dtSecond: "秒",
				dtPrevYear: "上一年",
				dtPrevMonth: "上一月",
				dtNextMonth: "下一月",
				dtNextYear: "下一年",
				dtInvalidRange: "结束时间早于开始时间"
			},
			en: {
				sessionLoading: "Loading session…",
				sessionFailed: "Failed to load session",
				sessionEmpty: "No content in this session",
				explorerLoading: "Loading…",
				explorerFailed: "Failed to load",
				explorerRoot: "Workspace",
				explorerTruncated: "Too many entries, truncated",
				explorerEmptyDir: "Empty folder",
				explorerLevels: "Jump to level",
				explorerExpand: "Expand",
				explorerCollapse: "Collapse",
				explorerEnter: "Open",
				explorerRootName: "(workspace root)",
				explorerCrumbsAria: "Breadcrumb",
				explorerPickFile: "Pick this file",
				explorerPickDir: "Select",
				explorerPickDirAria: "Pick this folder (with everything under it)",
				previewClose: "Close",
				previewCopyPath: "Copy path",
				previewRefresh: "Refresh",
				previewRender: "Preview",
				previewSource: "Source",
				previewMdSwitchAria: "Toggle render or source",
				previewHtmlSwitchAria: "Toggle render or source",
				previewLoadMore: "Load more",
				previewTruncated: "Content too large, showing first {n}",
				previewOfficeUnavailable: "Office preview unavailable",
				previewRenderFailed: "Failed to render preview",
				previewBadPayload: "Unexpected response payload",
				previewOutside: "Path is outside the workspace",
				previewNotFound: "File not found",
				previewNotDirectory: "Not a folder",
				previewTooLarge: "File too large to preview",
				previewNotText: "Not a text file",
				previewFailedCode: "Failed to load ({code})",
				mdCopy: "Copy",
				mdCopied: "Copied",
				mdCode: "Code",
				mdWrap: "Wrap",
				mdUnwrap: "Unwrap",
				mdFootnotes: "Footnotes",
				cardToggle: "Expand/Collapse",
				modalClose: "Close",
				dockClose: "Close panel",
				dockResize: "Drag to resize",
				dockCollapse: "Collapse panel",
				dockExpand: "Expand panel",
				errorRetry: "Retry",
				confirm: "Confirm",
				cancel: "Cancel",
				dialogOk: "OK",
				pickerPlaceholder: "Select…",
				pickerClear: "None",
				pickerEmpty: "No options",
				pickerNoMatch: "No match",
				pickerSearch: "Search…",
				pickerSelected: "{n} selected",
				pickerMaxReached: "Up to {n}",
				pickerDegraded: "List may be incomplete",
				modelProvider: "Provider",
				modelModel: "Model",
				modelDefault: "Default model",
				workspaceAll: "All workspaces",
				relNow: "just now",
				relInJustNow: "soon",
				relInMinutes: "in {n}m",
				relInHours: "in {n}h",
				relInDays: "in {n}d",
				relInMonths: "in {n}mo",
				relInYears: "in {n}y",
				relJustNow: "just now",
				relMinutesAgo: "{n}m ago",
				relHoursAgo: "{n}h ago",
				relDaysAgo: "{n}d ago",
				relWeeksAgo: "{n}w ago",
				relMonthsAgo: "{n}mo ago",
				relYearsAgo: "{n}y ago",
				codeCopy: "Copy",
				codeCopied: "Copied",
				sessionUnknownKind: "Unsupported node kind: ",
				sessionLoadOlder: "Load earlier messages",
				sessionProcess: "Process",
				triggerRequest: "Execution request received",
				triggerGoal: "Continuing the goal",
				triggerAgent: "Task message received",
				triggerTeam: "Team message received",
				triggerSubagent: "Subagent status update",
				triggerGithub: "GitHub event received",
				triggerWebhook: "External event received",
				triggerSchedule: "Scheduled task",
				triggerJob: "Background task status update",
				triggerPlugin: "Plugin status update",
				triggerExplanation: "This notification triggered the reply below.",
				turnProcessTook: "Took {duration}",
				turnProcessDeepDiving: "Thinking, {duration}",
				turnProcessWorked: "Work completed",
				turnProcessFailed: "Failed",
				turnStopped: "Stopped",
				chatDeepDiving: "Thinking",
				thinkLabel: "Think",
				durationSeconds: "{seconds}s",
				durationMinutes: "{minutes}m {seconds}s",
				durationHours: "{hours}h {minutes}m {seconds}s",
				durationMilliseconds: "{milliseconds}ms",
				retryActive: "Retrying model request",
				retryCancelled: "Model request retry cancelled",
				retryStarted: "Retried model request",
				retryScheduled: "Waiting to retry model request",
				retryStatus: "{label} ({retry}/{maximum}) · {seconds}s",
				retryDelay: "Retry delay: ",
				retryFailure: "Failure reason: ",
				turnErrorTitle: "This turn failed",
				accountStopped: "Task stopped",
				maxTokensTitle: "Output token limit reached",
				maxTokensHint: "The reply was cut off; earlier output is preserved in the conversation. Send \"continue\" to let the model resume.",
				failureAuth: "API key is invalid",
				failureQuota: "Request quota exhausted.",
				failureAccountSignedOut: "Stopped because you signed out of DeepSeek.",
				failureAccountSignInRequired: "Sign in to DeepSeek and ensure the request destination supports account authentication.",
				clockDate: "{m}/{d}",
				clockDateYear: "{y}/{m}/{d}",
				copyLabel: "Copy",
				copiedLabel: "Copied",
				branchLabel: "Branch into a new conversation",
				branchUnavailableLabel: "A read-only transcript cannot be branched",
				turnUsageTitle: "Turn usage",
				turnUsageModel: "Provider / model",
				turnUsageCacheHit: "Cache hit",
				turnUsageInput: "Uncached input",
				turnUsageCacheRead: "Cached input",
				turnUsageCacheWrite: "Cache write",
				turnUsageOutput: "Output",
				turnUsageReasoning: " ({tokens} reasoning)",
				turnUsageConsumed: "Usage {total}",
				turnUsageCount: "{count} tok",
				numberThousand: "{value}K",
				numberMillion: "{value}M",
				numberGroupSeparator: ",",
				stepProcessDoneThinking: "Analysis completed",
				stepProcessDoneRead: "Read files",
				stepProcessDoneReadImage: "Read images",
				stepProcessDoneWrite: "Wrote files",
				stepProcessDoneSearch: "Searched code",
				stepProcessDoneEdit: "Edited files",
				stepProcessDoneCommands: "Ran commands",
				stepProcessDoneCode: "Ran code",
				stepProcessDoneWebSearch: "Searched the web",
				stepProcessDoneWebFetch: "Fetched web pages",
				stepProcessDoneSubagents: "Coordinated subagents",
				stepProcessDonePlan: "Updated the plan",
				stepProcessDoneQuestions: "Asked you questions",
				stepProcessDoneTools: "Called tools",
				stepProcessJoinTwo: "{first} and {second}",
				stepProcessComma: ", ",
				stepProcessSharedPrefix: "",
				stepProcessMore: "{title}, etc.",
				toolTitleRead: "Read",
				toolTitleReadImage: "Read image",
				toolTitleGrep: "Grep",
				toolTitleGlob: "Glob",
				toolTitleBash: "Bash",
				toolTitleWrite: "Write",
				toolTitleEdit: "Edit",
				toolTitleCode: "Code",
				toolTitleWebSearch: "Search",
				toolTitleWebFetch: "Fetch",
				toolTitleGeneric: "Tool call",
				toolTitleSearch: "Search",
				toolInputLabel: "IN",
				toolOutputLabel: "OUT",
				rowPreparing: "Preparing tool call",
				rowRunning: "Running",
				rowFailed: "Failed",
				rowStopped: "Stopped",
				commandRunning: "Running…",
				commandFailed: "Command failed",
				commandDone: "Completed",
				commandTitle: "Command",
				collapseLabel: "Collapse",
				readWindow: "Showing {shown} of {total} lines",
				readCollapseAria: "Collapse content",
				readExpandAria: "Expand {count} more lines",
				readExpandRest: "… {count} more lines",
				terminalSignal: "signal {signal}",
				terminalExitCode: "exit code {code}",
				terminalNoExitCode: "no exit code",
				terminalRunning: "Running",
				terminalFailed: "Failed",
				terminalDone: "Done",
				terminalNoOutput: "No output",
				terminalCollapseAria: "Collapse output",
				terminalExpandAria: "Expand the remaining {n} output lines",
				terminalExpandRest: "… {n} more lines",
				terminalCommandLine: "line {n}",
				terminalSendInput: "(send input)",
				terminalSession: "Terminal {sessionId}",
				codeBlockLabel: "Code",
				diffWrapLabel: "Wrap lines",
				diffUnwrapLabel: "Unwrap lines",
				diffCollapseAria: "Collapse diff",
				diffExpandAria: "Expand {count} more diff lines",
				diffExpandRest: "… {count} more lines",
				sessionArchived: "Archived",
				sessionHeading: "Session preview",
				changesSingle: "Edited {name}",
				changesMulti: "Edited {count} files",
				changesBinary: "Binary file",
				changesAll: "All {count} files",
				changesCollapse: "Collapse",
				changesOversized: "File too large",
				diffLoading: "Reading changes…",
				diffMissing: "The contents of this turn’s changes are no longer available",
				diffError: "Could not read the changes",
				diffBinary: "Binary file; changes cannot be shown",
				diffOversized: "File too large; changes cannot be shown",
				diffCreated: "Created in this turn",
				diffDeleted: "Deleted in this turn",
				diffUnchanged: "Both sides hold the same lines",
				diffCoarse: "Line comparison timed out; shown as a whole-file replacement",
				diffTruncated: "Showing the first {count} lines",
				continueBranch: "Continue conversation",
				forkConfirmTitle: "Fork to continue",
				forkConfirmText: "Start a new branch from this session to continue the conversation? The original stays read-only; the branch copies this conversation and can continue.",
				forkConfirmAccept: "Fork & open",
				forkWorking: "Forking…",
				forkFailed: "Fork failed: {error}",
				deliverRowTitle: "Deliver files",
				deliverRowPreparing: "Preparing delivery",
				deliverRowRunning: "Delivering",
				deliverRowOk: "Delivered",
				deliverRowError: "Delivery failed",
				deliverRowStopped: "Interrupted",
				deliverFileLabel: "File",
				deliverPreviewHint: "Preview",
				deliverPreviewCard: "Preview {name}",
				deliverAll: "All {count} files",
				deliverCollapse: "Collapse",
				deliverExpandAria: "Expand all {count} delivered files",
				deliverCollapseAria: "Collapse the delivered-files list",
				composerPlaceholder: "Say something to continue…",
				composerHint: "Confirm forks a branch from this session and starts this turn in the official chat",
				dtPlaceholder: "Select date & time",
				dtStart: "Start",
				dtEnd: "End",
				dtToday: "Today",
				dtNow: "Now",
				dtClear: "Clear",
				dtHour: "h",
				dtMinute: "m",
				dtSecond: "s",
				dtPrevYear: "Previous year",
				dtPrevMonth: "Previous month",
				dtNextMonth: "Next month",
				dtNextYear: "Next year",
				dtInvalidRange: "End is before start"
			}
		};
		let current = "zh";
		/** 用内置字典翻译一个 key；未知 key 直接回退 key 本身（不抛、不空白）。 */
		function t$1(key, vars) {
			const template = DICT[current][key] ?? DICT.zh[key] ?? key;
			if (vars === void 0) return template;
			return template.replace(/\{(\w+)\}/g, (whole, name) => {
				const value = vars[name];
				return value === void 0 ? whole : String(value);
			});
		}
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/FieldHint.js
		/**
		* 问号提示 —— **全站唯一实现、独立组件**（L2，P4）
		*
		* ⚠️ 它**不属于 Input 家族**：任何地方都能挂——表单行尾、标题后面、卡片角落……
		* 调用点自己把它排进自己的 flex / label 里即可（组件只是 14px 的内联图标 + 气泡）。
		*
		* 气泡渲染 = **官方 Tooltip 本体**（2026-10-19 用户拍板「必须和悬停提示用同一个」）：
		* 插件启动时 `setTooltipRenderer` 把官方 Tooltip 交给 core，本组件直接走它。
		* ⚠️ **不做降级兜底**（用户同日明确：宿主内官方包恒在；官方改版 = 我们重新适配，不另造一套）。
		* 未注入 renderer 的环境（node 自检）只出问号图标、没有气泡——那是非宿主环境，不是产品形态。
		*/
		/** 问号提示图标：hover / focus 浮出说明气泡（官方 Tooltip 渲染）。 */
		function FieldHint(props) {
			ensureControls();
			const { text, side, align, maxWidth, className, style } = props;
			return (0, react.createElement)("span", {
				className: `dshpc-hint${className !== void 0 && className !== "" ? ` ${className}` : ""}`,
				style,
				tabIndex: 0,
				role: "note",
				"aria-label": text
			}, "?");
		}
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/MarqueeText.js
		/**
		* 跑马灯文本 —— **全站唯一实现**（L2，P6 从 editor-fields 迁入 ui）
		*
		* 默认超长省略号；hover 且确实放不下时，来回滚动展示全名。自实现原因：官方 primitives 无跑马灯组件。
		* 测宽用 ResizeObserver + 文本变化重测；滚动距离 0 时不启用 hover 动画（`.dshpc-mq-run` 才有动画）。
		*
		* **双层结构**：外层 `.dshpc-mq` 只负责裁剪（overflow:hidden），内层 `.dshpc-mq-in` 才做
		* transform 滚动——文字永远在自己那一块里跑，不会压到相邻文字。皮肤在 `controls-css.ts`。
		*/
		/** 跑马灯文本。 */
		function MarqueeText(props) {
			const outerRef = (0, react.useRef)(null);
			const innerRef = (0, react.useRef)(null);
			const [dist, setDist] = (0, react.useState)(0);
			const measure = (0, react.useCallback)(() => {
				const outer = outerRef.current;
				const inner = innerRef.current;
				if (outer === null || inner === null) return;
				setDist(Math.max(0, Math.ceil(inner.scrollWidth - outer.clientWidth)));
			}, []);
			(0, react.useLayoutEffect)(() => {
				const outer = outerRef.current;
				const inner = innerRef.current;
				if (outer === null || inner === null) return;
				measure();
				const ro = new ResizeObserver(measure);
				ro.observe(outer);
				ro.observe(inner);
				return () => {
					ro.disconnect();
				};
			}, [measure]);
			(0, react.useEffect)(() => {
				measure();
			}, [props.text, measure]);
			const run = dist > 0;
			return (0, react.createElement)("span", {
				ref: outerRef,
				className: (run ? "dshpc-mq dshpc-mq-run" : "dshpc-mq") + (props.className === void 0 ? "" : ` ${props.className}`),
				title: props.title,
				style: props.style
			}, (0, react.createElement)("span", {
				ref: innerRef,
				className: "dshpc-mq-in",
				style: { ...run ? {
					"--dshpc-mq-dist": `${-dist}px`,
					"--dshpc-mq-dur": `${Math.max(3, Math.round(dist / 30))}s`
				} : null }
			}, props.text));
		}
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/Picker.js
		/**
		* 通用选择器：单选 / 多选 / 上限 / 搜索 / 分组 / 空态 / 降级。
		*
		* **纯零件，不自己取数** —— 选项由调用方传入（工作区列表、模型列表这类数据要跨 host↔client
		* 边界，通道是插件私有的，组件取不到，见需求文档 §6）。
		*/
		function Picker(props) {
			ensureControls();
			const tt = props.translate ?? t$1;
			const mode = props.mode ?? "single";
			const size$3 = props.size ?? "md";
			const placement = props.placement ?? "down";
			const clearable = props.clearable === true;
			const showLabels = props.showLabels !== false;
			const triggerStyle = resolveTriggerSizing(props);
			const groups = (0, react.useMemo)(() => toGroups(props.groups, props.options), [props.groups, props.options]);
			const controlled = props.value !== void 0;
			const [inner, setInner] = (0, react.useState)(() => toArray(props.defaultValue));
			const selected = controlled ? toArray(props.value) : inner;
			const emit = (next) => {
				if (!controlled) setInner(next);
				props.onChange?.(mode === "single" ? next[0] ?? "" : next);
			};
			const [open, setOpen] = (0, react.useState)(false);
			const [query, setQuery] = (0, react.useState)("");
			const [active, setActive] = (0, react.useState)(-1);
			const rootRef = (0, react.useRef)(null);
			const searchRef = (0, react.useRef)(null);
			const { refs, floatingStyles } = useFloating({
				open,
				onOpenChange: setOpen,
				placement: placement === "up" ? "top-start" : "bottom-start",
				middleware: [
					offset(4),
					flip(),
					shift({ padding: 8 }),
					size({ apply({ elements, rects, availableWidth, availableHeight }) {
						Object.assign(elements.floating.style, {
							minWidth: `${rects.reference.width}px`,
							maxWidth: `${Math.min(480, availableWidth ?? 480)}px`,
							maxHeight: `${Math.max(80, Math.min(280, (availableHeight ?? 320) - 8))}px`
						});
					} })
				],
				whileElementsMounted: autoUpdate,
				strategy: "fixed"
			});
			const setSearchRef = (0, react.useCallback)((el) => {
				searchRef.current = el;
				if (el !== null && open) el.focus();
			}, [open]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const onDown = (e) => {
					const root = rootRef.current;
					const floatingEl = refs.floating.current;
					if (root !== null && root.contains(e.target)) return;
					if (floatingEl !== null && floatingEl.contains(e.target)) return;
					setOpen(false);
				};
				document.addEventListener("mousedown", onDown);
				return () => document.removeEventListener("mousedown", onDown);
			}, [open]);
			(0, react.useEffect)(() => {
				if (open) return;
				setQuery("");
				setActive(-1);
			}, [open]);
			const shown = filterGroups(groups, query);
			const flat = flattenOptions(shown);
			const atMax = mode === "multiple" && props.max !== void 0 && selected.length >= props.max;
			const summary = selected.length === 0 ? props.placeholder ?? tt("pickerPlaceholder") : mode === "multiple" && !showLabels ? tt("pickerSelected", { n: selected.length }) : labelsOf(groups, selected).join("、") || (props.placeholder ?? tt("pickerPlaceholder"));
			const pick = (value) => {
				if (mode === "single") {
					emit([value]);
					setOpen(false);
					return;
				}
				emit(toggleValue(selected, value, props.max));
				if (props.closeOnSelect === true) setOpen(false);
			};
			const clear = () => {
				emit([]);
				setOpen(false);
			};
			const onKeyDown = (e) => {
				if (!open) return;
				if (e.key === "Escape") {
					setOpen(false);
					return;
				}
				if (flat.length === 0) return;
				if (e.key === "ArrowDown" || e.key === "ArrowUp") {
					e.preventDefault();
					const dir = e.key === "ArrowDown" ? 1 : -1;
					setActive((cur) => (cur + dir + flat.length) % flat.length);
					return;
				}
				if (e.key === "Enter" && active >= 0) {
					e.preventDefault();
					const hit = flat[active];
					if (hit !== void 0) pick(hit.value);
				}
			};
			const trigger = (0, react.createElement)("button", {
				type: "button",
				"aria-label": props.ariaLabel,
				"aria-expanded": open,
				ref: refs.setReference,
				className: `dshpc-picker__trigger dshpc-picker__trigger--${size$3}${props.align === "center" ? " dshpc-picker__trigger--center" : ""}`,
				style: triggerStyle,
				disabled: props.disabled === true,
				onClick: () => {
					if (props.disabled !== true) setOpen(!open);
				}
			}, props.icon !== void 0 && props.icon !== null ? (0, react.createElement)("span", { className: "dshpc-picker__icon" }, props.icon) : null, (0, react.createElement)(MarqueeText, {
				text: summary,
				className: "dshpc-picker__label"
			}), (0, react.createElement)(Chevron, {
				size: 12,
				className: "dshpc-picker__caret"
			}));
			const triggerRow = props.hint === void 0 ? trigger : (0, react.createElement)("span", { className: "dshpc-fieldwrap dshpc-fieldwrap--inline" }, trigger, (0, react.createElement)(FieldHint, { text: props.hint }));
			return (0, react.createElement)("div", {
				className: `dshpc-picker${props.className === void 0 ? "" : ` ${props.className}`}`,
				ref: rootRef,
				onKeyDown
			}, triggerRow, open ? (0, react.createElement)(FloatingPortal, null, (0, react.createElement)("div", {
				className: "dshpc-picker__menu",
				ref: refs.setFloating,
				style: floatingStyles
			}, props.degraded === true ? (0, react.createElement)("div", { className: "dshpc-picker__degraded" }, tt("pickerDegraded")) : null, atMax ? (0, react.createElement)("div", { className: "dshpc-picker__degraded" }, tt("pickerMaxReached", { n: props.max ?? 0 })) : null, props.searchable === true ? (0, react.createElement)("input", {
				ref: setSearchRef,
				className: "dshpc-picker__search",
				placeholder: tt("pickerSearch"),
				value: query,
				onChange: (e) => setQuery(e.target.value)
			}) : null, flat.length === 0 && groups.length === 0 ? (0, react.createElement)("div", { className: "dshpc-picker__empty" }, tt("pickerEmpty")) : flat.length === 0 ? (0, react.createElement)("div", { className: "dshpc-picker__empty" }, tt("pickerNoMatch")) : [clearable && mode === "single" && selected.length > 0 ? (0, react.createElement)("div", {
				key: "__clear__",
				className: "dshpc-picker__option dshpc-picker__option--clear",
				onClick: clear
			}, tt("pickerClear")) : null, ...shown.map((g) => (0, react.createElement)("div", { key: g.value || "_" }, g.label === "" ? null : (0, react.createElement)("div", { className: "dshpc-picker__group-label" }, g.label), g.options.map((o) => {
				const blocked = o.disabled === true || atMax && !selected.includes(o.value);
				const activeCls = [
					"dshpc-picker__option",
					selected.includes(o.value) ? "dshpc-picker__option--active" : "",
					blocked ? "dshpc-picker__option--disabled" : ""
				].filter((s) => s !== "").join(" ");
				const idx = flat.indexOf(o);
				return (0, react.createElement)("div", {
					key: o.value,
					className: activeCls,
					"data-active": idx === active ? "true" : void 0,
					onClick: () => {
						if (!blocked) pick(o.value);
					}
				}, mode === "multiple" ? (0, react.createElement)("span", { className: "dshpc-picker__tick" }, selected.includes(o.value) ? "✓" : "") : null, o.icon !== void 0 && o.icon !== null ? (0, react.createElement)("span", { className: "dshpc-picker__option-icon" }, o.icon) : null, (0, react.createElement)(MarqueeText, {
					text: o.label,
					className: "dshpc-picker__option-label"
				}));
			})))])) : null);
		}
		function toArray(v) {
			if (v === void 0) return [];
			return Array.isArray(v) ? [...v] : [v];
		}
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/Button.js
		/**
		* 按钮 / 图标钮 —— **全站唯一实现**（L2 组件皮肤，P2）
		*
		* 三轴模型：
		*  - `variant`：外观档（形态 + 语义色），共 10 档
		*      primary（黑实心）/ secondary（灰实心）/ outline（描边）/ ghost（无底无边）
		*      danger（红实心）/ success（绿实心）/ warning（黄实心）/ info（蓝实心）
		*      danger-outline（红字描边）/ link（行内链接）
		*  - `size`：`sm`(24) / `md`(28) / `lg`(32) —— 高度一律吃 `--dshpc-control-h-*`，
		*    **有边 / 无边同高**（边框在内部补回）
		*  - `block`：撑满父宽
		*
		* 内容轴：`icon`（前置）/ `iconRight`（后置）/ `loading`（前置小圈并自动禁用）。
		* 颜色轴：任一档都可以再用 `color` 传任意 CSS 色值 —— 只覆盖 `--btn-*` 几个变量，
		* 不新增皮肤（皮肤仍只在 `controls-css.ts` 里）。
		*
		* `IconButton` 是纯图标钮：`plain`（默认无底无边，hover 起灰底）/ `outline`（描边）/ `danger`（红）。
		* 兼容别名：`danger-ink` 仍是 `danger-outline` 的旧类名，可直接挂 className。
		*
		* ⚠️ 不许在任何使用点就地写按钮样式；要多一档外观 ⇒ 改基础层（一处改全站生效）。
		*/
		/** 实心档（color 参数按「底色」处理；其余档按「字色 + 描边色」处理）。 */
		const SOLID_VARIANTS = [
			"primary",
			"secondary",
			"danger",
			"success",
			"warning",
			"info"
		];
		/** 把自定义颜色翻译成 5 个局部变量（只覆盖 token，不新增皮肤）。 */
		function colorVars(variant, color) {
			if (color === void 0 || color === "") return void 0;
			if (SOLID_VARIANTS.includes(variant)) return {
				"--btn-bg": color,
				"--btn-bg-hover": `color-mix(in srgb, ${color} 82%, var(--dshpc-fg))`,
				"--btn-bg-active": `color-mix(in srgb, ${color} 70%, var(--dshpc-fg))`
			};
			return {
				"--btn-fg": color,
				"--btn-fg-hover": color,
				"--btn-border": color,
				"--btn-bg-hover": `color-mix(in srgb, ${color} 12%, transparent)`,
				"--btn-bg-active": `color-mix(in srgb, ${color} 18%, transparent)`
			};
		}
		/** 组装按钮 class（结构一套 + 轴类）。 */
		function buttonClass(variant, size, block, hasIcon, extra) {
			return `dshpc-btn dshpc-btn--${variant} dshpc-btn--${size}${block ? " dshpc-btn--block" : ""}${hasIcon ? " dshpc-btn--icon-start" : ""}${extra !== void 0 && extra !== "" ? ` ${extra}` : ""}`;
		}
		/**
		* 渲染一个「图标 + 文案」按钮。
		*
		* @param props 见 {@link ButtonProps}。
		* @returns 按钮元素。
		*/
		function Button$1(props) {
			ensureControls();
			const { variant = "outline", size = "lg", icon, iconRight, color, loading = false, block = false, className, style, children, ...rest } = props;
			const attrs = {
				...rest,
				type: rest.type ?? "button",
				disabled: rest.disabled === true || loading,
				className: buttonClass(variant, size, block, icon !== void 0 && icon !== null && !loading, className),
				style: {
					...colorVars(variant, color),
					...style
				}
			};
			return (0, react.createElement)("button", attrs, loading ? (0, react.createElement)("svg", {
				className: "dshpc-btn__spinner",
				viewBox: "0 0 12 12",
				width: 12,
				height: 12,
				"aria-hidden": true
			}, (0, react.createElement)("circle", {
				cx: 6,
				cy: 6,
				r: 4.75,
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.5,
				strokeLinecap: "round",
				strokeDasharray: "22 30"
			})) : icon !== void 0 && icon !== null ? (0, react.createElement)("span", { className: "dshpc-btn__icon" }, icon) : null, children, iconRight !== void 0 && iconRight !== null ? (0, react.createElement)("span", { className: "dshpc-btn__icon-end" }, iconRight) : null);
		}
		/**
		* 渲染一个纯图标按钮。
		*
		* @param props 见 {@link IconButtonProps}。
		* @returns 图标按钮元素。
		*/
		function IconButton$1(props) {
			ensureControls();
			const { variant = "plain", size = "lg", icon, label, className, style, ...rest } = props;
			const attrs = {
				...rest,
				type: rest.type ?? "button",
				title: rest.title ?? label,
				"aria-label": rest["aria-label"] ?? label,
				className: `dshpc-iconbtn dshpc-iconbtn--${variant} dshpc-iconbtn--${size}${className !== void 0 && className !== "" ? ` ${className}` : ""}`,
				style
			};
			return (0, react.createElement)("button", attrs, icon);
		}
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/Chip.js
		/** 小标签（neutral 用现成的 `--dshpc-chip-bg`；传 `onClick` 才是可点的）。 */
		function Chip(props) {
			ensureControls();
			const clickable = props.onClick !== void 0;
			const tone = props.tone ?? "neutral";
			const size = props.size ?? "sm";
			return (0, react.createElement)(clickable ? "button" : "span", {
				type: clickable ? "button" : void 0,
				className: `dshpc-chip${tone !== "neutral" ? ` dshpc-chip--${tone}` : ""}${size !== "sm" ? ` dshpc-chip--${size}` : ""}${clickable ? " dshpc-chip--clickable" : ""}${props.className === void 0 ? "" : ` ${props.className}`}`,
				onClick: props.onClick
			}, props.children ?? null);
		}
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/Segmented.js
		/**
		* 分段控件（滑动块）—— **全站唯一实现**（L2 组件皮肤，P1）
		*
		* 它是「同一份结构 + 两个受控轴」的样板：
		*  - `size`：`sm`(24) / `md`(28) / `lg`(32) —— **离散三档**，调用点**不许**自己写高度
		*    （真不够用才允许在调用点本地覆盖 `--dshpc-control-h-*`，属例外而非常态）；
		*  - `bordered`（默认 false）：最外再包一圈 1px 描边；总高与无框版逐像素一致
		*    （border 由 padding 抵消），两种模式整行混排不跳高。
		*
		* 外观只有一套（灰底轨道 + 白色选中片，阴影来自宿主 elevation token）。
		* 2026-10-26 删掉 `variant` 轴（原 default / inset 两档在 CSS 里只差 1px 内距，
		* 且 default 比 `size` 承诺矮 2px，下游照 demo 对图时反复查不出原因 —— 见 docs/design/style.md）。
		*
		* 用法：
		*   // 单选
		*   h(Segmented<'a' | 'b'>, { value: v, size: 'md', items: [{ value: 'a', label: '甲' }], onChange: setV })
		*   // 多选（如星期）
		*   h(Segmented<'1' | '2'>, { multiple: true, value: vs, items: [...], onChange: setVs })
		*
		* ⚠️ 不许在任何使用点就地写分段样式；要多一档高度 / 多一个外观 ⇒ 走
		* docs/design/ui-style-guide.md §五 的流程（改基础层，一处改全站生效）。
		*/
		/**
		* 渲染一个分段控件（单选 / 多选同体）。
		*
		* @param props 见 {@link SegmentedProps}。
		* @returns 分段控件元素。
		*/
		function Segmented$1(props) {
			ensureControls();
			ensureControls();
			const size = props.size ?? "lg";
			const multiple = props.multiple === true;
			const value = props.value;
			const onChange = props.onChange;
			const sliding = !multiple && props.items.length > 1;
			const rootRef = (0, react.useRef)(null);
			const [thumb, setThumb] = (0, react.useState)(null);
			const measure = (0, react.useCallback)(() => {
				const sel = rootRef.current?.querySelector(".dshpc-seg__item[aria-pressed=\"true\"]");
				if (sel === void 0 || sel === null) {
					setThumb(null);
					return;
				}
				const next = {
					left: sel.offsetLeft,
					top: sel.offsetTop,
					width: sel.offsetWidth,
					height: sel.offsetHeight
				};
				setThumb((cur) => cur !== null && cur.left === next.left && cur.top === next.top && cur.width === next.width && cur.height === next.height ? cur : next);
			}, []);
			(0, react.useLayoutEffect)(() => {
				if (!sliding) {
					setThumb(null);
					return;
				}
				measure();
				const root = rootRef.current;
				if (root === null || typeof ResizeObserver === "undefined") return;
				const ro = new ResizeObserver(measure);
				ro.observe(root);
				return () => ro.disconnect();
			}, [
				sliding,
				measure,
				value,
				size,
				props.items,
				props.bordered,
				props.block
			]);
			return (0, react.createElement)("div", {
				role: "group",
				"aria-label": props.label,
				id: props.id,
				ref: rootRef,
				className: `dshpc-seg dshpc-seg--${size}${sliding ? " dshpc-seg--slide" : ""}${props.block === true ? " dshpc-seg--block" : ""}${props.bordered === true ? " dshpc-seg--bordered" : ""}${props.className !== void 0 ? ` ${props.className}` : ""}`,
				style: props.style
			}, [sliding && thumb !== null ? (0, react.createElement)("span", {
				key: "__thumb__",
				className: "dshpc-seg__thumb",
				"aria-hidden": true,
				style: {
					left: `${String(thumb.left)}px`,
					top: `${String(thumb.top)}px`,
					width: `${String(thumb.width)}px`,
					height: `${String(thumb.height)}px`
				}
			}) : null, ...props.items.map((item) => {
				const on = multiple ? value.includes(item.value) : value === item.value;
				const disabled = item.disabled === true || props.disabled === true;
				const handle = () => {
					if (disabled) return;
					if (multiple) {
						const arr = value;
						const next = arr.includes(item.value) ? arr.filter((v) => v !== item.value) : [...arr, item.value];
						onChange(next);
					} else onChange(item.value);
				};
				const itemButton = (0, react.createElement)("button", {
					key: item.value,
					type: "button",
					className: "dshpc-seg__item",
					"aria-pressed": on,
					disabled,
					onClick: handle
				}, item.label, item.count !== void 0 && item.count > 0 ? (0, react.createElement)("span", { className: "dshpc-seg__count" }, String(item.count)) : null, item.badge !== void 0 && item.badge > 0 ? (0, react.createElement)("span", { className: "dshpc-seg__badge" }, String(item.badge)) : null);
				if (item.tooltip !== void 0 && false);
				return itemButton;
			})]);
		}
		//#endregion
		//#region ../../node_modules/.pnpm/dsh-plugin-core@file+..+dsh-plugin-core_@babel+runtime@8.0.8_@codemirror+autocomplete@6_fb25d1a558b879a821d1d2cb50b44735/node_modules/dsh-plugin-core/dist/ui/Field.js
		/**
		* 输入类控件 —— **全站唯一实现**（L2 组件皮肤，P3）
		*
		* - `Input`：文本输入（size sm 24 / md 28 / lg 32，error 描红）；
		* - `PrefixedInput`：前缀 + 文本输入（如路径 / 接口前缀）；
		* - `NumberInput`：数字步进（显式 `− / +`，替换原生 `<input type="number">` 的浏览器 spinner，
		*   支持 step / min / max、clamp、Enter 提交、失焦回弹）。
		*
		* 高度一律吃 `--dshpc-control-h-*`；有边 / 无边同高（边框在内部补回）。
		*/
		/**
		* 字段 hint 的统一包法：控件 + 问号提示同一行（间距/对齐收进组件，调用方传个
		* `hint` 字符串就行，不再手动拼排版 —— 用户 2026-10-20 拍板）。
		*/
		function withHint(control, hint) {
			if (hint === void 0) return control;
			return (0, react.createElement)("span", { className: "dshpc-fieldwrap" }, control, (0, react.createElement)(FieldHint, { text: hint }));
		}
		function sizeClass(size) {
			return size === "lg" ? "--lg" : size === "md" ? "--md" : "--sm";
		}
		/** 文本输入。默认铺满容器（width:100%，与 Textarea 同口径）；要定宽由调用方在外面包壳（如 192px 搜索槽）。 */
		function Input(props) {
			ensureControls();
			const { value, onChange, placeholder, size = "lg", error, disabled, type, className, style } = props;
			return withHint((0, react.createElement)("input", {
				ref: props.inputRef,
				type: type ?? "text",
				value,
				placeholder,
				disabled,
				"aria-label": props["aria-label"],
				title: props.title,
				className: `dshpc-input dshpc-input${sizeClass(size)}${error === true ? " dshpc-input--error" : ""}${className !== void 0 && className !== "" ? ` ${className}` : ""}`,
				style,
				onChange: (event) => {
					onChange(event.target.value);
				},
				onKeyDown: props.onKeyDown,
				onBlur: props.onBlur
			}), props.hint);
		}
		//#endregion
		//#region src/client/rows.ts
		/**
		* 界面上显示人名的**唯一**口径：显示名（`owner_name` / `creator_name`）优先，
		* 旧数据 / 名册里没名字才退回 uuid。**只用于显示与搜索** —— 归属判定看 skill 给的 `mine`。
		*/
		function displayName(name, uuid) {
			const label = (name ?? "").trim();
			return label !== "" ? label : (uuid ?? "").trim();
		}
		/**
		* 「我的」判定：**直接读 skill 算好的 `mine`**（`list --json` 每行带，脚本比 uuid）。
		* 前端不再拿 identities 自己比一遍——两套真源迟早对不上。
		*/
		function isMine(task) {
			return task.mine === true;
		}
		function resolveActions(task) {
			const mine = isMine(task);
			return {
				view: true,
				claim: !mine && task.status === "open",
				resume: mine,
				finish: mine,
				release: mine
			};
		}
		/**
		* 六档菜单命中。标记（`stale` / `overdue` / `backlog`）都由 skill 判定，前端只读布尔。
		*
		* ⚠️ 后三档（积压 / 逾期 / 停滞）**本轮不接**：用户要求程序后置 ⇒ 这里一律不命中，
		* 界面另给一句说明。
		*/
		function tabHit(task, tab) {
			switch (tab) {
				case "mine": return task.mine === true;
				case "open": return task.status === "open";
				case "doing": return task.status === "doing" || task.status === "blocked";
				default: return false;
			}
		}
		/** 当前档位 + 工作区下的平铺列表，按创建 / 开始时间倒序（沿用「我的待办」的排序口径）。 */
		function selectView(current) {
			const board = current.board;
			const empty = {
				rows: [],
				counts: {
					mine: 0,
					open: 0,
					doing: 0,
					backlog: 0,
					overdue: 0,
					stale: 0
				}
			};
			if (board === null) return empty;
			const { tasks } = board;
			return {
				rows: tasks.filter((task) => tabHit(task, current.query.tab)).filter((task) => current.query.workspace === "" || task.workspace.id === current.query.workspace).sort((a, b) => String(b.created ?? b.started ?? "").localeCompare(String(a.created ?? a.started ?? ""))).map((task) => ({
					kind: "task",
					key: `${task.workspace.id}:${task.id}`,
					task,
					mine: task.mine === true
				})),
				counts: {
					mine: tasks.filter((task) => task.mine === true).length,
					open: tasks.filter((task) => task.status === "open").length,
					doing: tasks.filter((task) => task.status === "doing" || task.status === "blocked").length,
					backlog: tasks.filter((task) => task.backlog === true).length,
					overdue: tasks.filter((task) => task.overdue === true).length,
					stale: tasks.filter((task) => task.stale === true).length
				}
			};
		}
		/**
		* 执行人下拉的分组（核心 Picker 原生支持 groups）。
		* 跨工作区合并去重：同一 uuid 出现在 ≥2 个工作区 ⇒ 归「通用人员」组（置顶）；
		* 只出现在一个工作区 ⇒ 归该工作区分组。空工作区（名册读挂）自然不出现。
		* 顶部一段**空标题**（`全部执行人` + 跨工作区的通用人员，都不设标题），
		* 只有「只在一个工作区出现」的人，才各自带工作区小标题分组。
		* 「全部执行人」`value=""` 是当前选中的回显位；筛选逻辑后置。
		*/
		function ownerGroups(board, workspaceOptions, t) {
			if (board === null) return [];
			const byUuid = /* @__PURE__ */ new Map();
			for (const ws of board.workspaceOwners) for (const owner of ws.owners) {
				let entry = byUuid.get(owner.uuid);
				if (entry === void 0) {
					entry = {
						name: owner.name,
						ws: /* @__PURE__ */ new Set()
					};
					byUuid.set(owner.uuid, entry);
				}
				entry.ws.add(ws.workspaceId);
			}
			const allOption = {
				value: "",
				label: t("ownerAll")
			};
			const shared = [];
			const exclusive = /* @__PURE__ */ new Map();
			for (const [uuid, entry] of byUuid) {
				const option = {
					value: uuid,
					label: `@${entry.name}`
				};
				if (entry.ws.size > 1) shared.push(option);
				else for (const wsId of entry.ws) {
					const list = exclusive.get(wsId);
					if (list === void 0) exclusive.set(wsId, [option]);
					else list.push(option);
				}
			}
			const groups = [];
			groups.push({
				value: "_top",
				label: "",
				options: [allOption, ...shared]
			});
			for (const option of workspaceOptions) {
				if (option.value === "") continue;
				const list = exclusive.get(option.value);
				if (list !== void 0 && list.length > 0) groups.push({
					value: option.value,
					label: option.label,
					options: list
				});
			}
			return groups;
		}
		//#endregion
		//#region src/client/api.ts
		/** host 路由前缀（全仓唯一；与 host/routes.ts 的 API_PREFIX 对应）。 */
		const API_PREFIX = "api/task-ledger";
		const DEFAULT_TIMEOUT_MS = 8e3;
		/**
		* 错误响应榨人话：host 路由（routes.ts）发的是 `{ error: "..." }`，那里的话是**能直接上界面的**
		* （带工作区名、台账程序起不来之类的原文）。不带它界面上只剩「HTTP 500」，等于没报错。
		*/
		function httpErrorMessage(status, body) {
			try {
				const parsed = JSON.parse(body);
				if (typeof parsed.error === "string" && parsed.error !== "") return `HTTP ${status}：${parsed.error}`;
			} catch {}
			const text = body.trim().slice(0, 200);
			return text === "" ? `HTTP ${String(status)}` : `HTTP ${status}：${text}`;
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
		/**
		* 首屏快照：8 卡 + 在办列表（host 侧每工作区跑 skill `stats` / 两次 `history --count-only` / `list`）。
		* `fresh` = 让 host 先清 1.5s 读缓存再算（手动刷新 / 首读都要最新，不吃上一屏的缓存）。
		*/
		function fetchBoardSnapshot(opts = {}) {
			return fetchJson(`/board/snapshot${opts.fresh === true ? "?fresh=1" : ""}`);
		}
		//#endregion
		//#region src/client/store.ts
		/**
		* 看板数据仓（client 侧**唯一**取数入口）：首屏一次拉 `/board/snapshot`（8 卡 + 在办列表），
		* 打开面板首读 + 手动刷新按钮，**不轮询**（2026-10-17 拍板）。
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
				tab: "mine",
				workspace: "",
				keyword: "",
				owner: ""
			},
			refreshing: false
		};
		const listeners = /* @__PURE__ */ new Set();
		/** 首读只触发一次（谁先订阅谁触发），之后一律靠 `refresh()`。 */
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
		/** 重读首屏。带 `fresh=1`：本函数只由首读与手动刷新触发，都要最新值。 */
		async function refresh() {
			const token = ++runToken;
			set({ refreshing: true });
			try {
				const board = await fetchBoardSnapshot({ fresh: true });
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
  /* 斑马纹：几乎贴着原色的一层（用户 2026-10-18：3% 还是太明显） */
  --dtl-zebra:color-mix(in srgb,var(--dtl-fg) 2%,transparent);
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
  /* 逾期橙：在「积压黄」与「停滞红」之间再取一档（语义阶梯 灰→黄→橙→红），
     宿主没有现成的橙 token ⇒ 用 warn + error 两色现算，主题一换自动跟随 */
  --dtl-overdue:color-mix(in srgb,var(--dtl-warning) 55%,var(--dtl-danger));
  --dtl-link:var(--dsw-alias-link,#3b5bdb);
  /* 语义色实面上的字（角标 / 实心提示）：红绿黄都是中调 ⇒ 白字两个主题都可读 */
  --dtl-on-signal:#fff;
  /* 语义色浅底：color-mix 现算 ⇒ 跟随宿主 alias，主题一换自动成立 */
  --dtl-business-soft:color-mix(in srgb,var(--dtl-business) 14%,transparent);
  /* 他人任务的 doing 色：比「我的」蓝灰一档（用户 2026-10-17：要和我的蓝区分） */
  --dtl-business-dim:color-mix(in srgb,var(--dtl-business) 55%,var(--dtl-fg-3));
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
  --dtl-zebra:color-mix(in srgb,var(--dtl-fg) 2.5%,transparent);
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
  --dtl-business-soft:color-mix(in srgb,var(--dtl-business) 12%,transparent);
  --dtl-business-dim:color-mix(in srgb,var(--dtl-business) 55%,var(--dtl-fg-3));
  --dtl-success-soft:color-mix(in srgb,var(--dtl-success) 5%,transparent);
  --dtl-warning-soft:color-mix(in srgb,var(--dtl-warning) 5%,transparent);
  --dtl-danger-soft:color-mix(in srgb,var(--dtl-danger) 5%,transparent);
}
`;
		/**
		* 业务壳样式（L2）：核心控件（Button / IconButton / Input / Picker / Segmented / Chip /
		* StripCard）自己的皮肤全在 core，本文件**不再重写任何控件外观**——只留本插件独有的
		* 容器类。颜色 / 圆角 / 字号一律只消费 `var(--dtl-*)`。
		*/
		const UI_CONTROLS_CSS = `
.dtl-card{background:var(--dtl-surface-1);border:1px solid var(--dtl-border);border-radius:var(--dtl-radius-md);
  transition:background-color var(--dtl-dur-fast) var(--dtl-ease);}
.dtl-card--clickable{cursor:pointer;text-align:left;font:inherit;color:inherit;width:100%;}
.dtl-card--clickable:hover{background:var(--dtl-card-hover);}
.dtl-card--clickable[data-active='true']{border-color:var(--dtl-business);}
.dtl-card--clickable:focus-visible{outline:2px solid var(--dtl-business);outline-offset:1px;}
.dtl-ellipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

@media (prefers-reduced-motion: reduce){
  .dtl-card{transition:none;}
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
/* 统计卡：8 块（2×4）+ 右图表卡位 */
.dtl-stat{display:flex;flex-direction:column;gap:var(--dtl-space-1);
  padding:var(--dtl-space-3) var(--dtl-space-4);text-align:left;}
.dtl-stat__value{font-size:var(--dtl-font-stat);font-weight:600;line-height:1.15;font-variant-numeric:tabular-nums;}
.dtl-stat__hint{font-size:var(--dtl-font-xs);line-height:var(--dtl-line-xs);color:var(--dtl-fg-3);}

/* 统计区整体：左 8 块（2 行 × 4 列）+ 右图表卡，参考图同款分栏。
   ⚠️ 列数写死 4 → 2，绝不给 3：3 列会排出 3+1 的非对称（用户 2026-10-17）。
   两栏**完全等高**：cards 两行 minmax(0,1fr) 均分 + 卡 height:100% ⇒ 图表卡与左边一样高。 */
.dtl-stats{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:var(--dtl-space-3);align-items:stretch;}
.dtl-stats__cards{display:grid;grid-auto-flow:column;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));
  gap:var(--dtl-space-3);}
.dtl-stats__cards > .dtl-stat{height:100%;box-sizing:border-box;}
@media (max-width:960px){.dtl-stats{grid-template-columns:minmax(0,1fr);}}
@media (max-width:640px){.dtl-stats__cards{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr));}}

/* 表格行（.dtl-orow）：**零重用**「我的待办」卡片基类——无框、无圆角、无外边距，
   一行 = 一条底部分隔线 + 极浅斑马纹（用户 2026-10-18：一行一格，不是一块一块的框） */
.dtl-orow{padding:13px var(--dtl-space-3);border-bottom:1px solid var(--dtl-border-faint);}
/* 斑马纹落在 2、4、6 行（用户 2026-10-18：原来 1、3、5 看着像从第一行就开始断层） */
.dtl-orow:nth-of-type(even){background:var(--dtl-zebra);}
.dtl-orow:hover{background:var(--dtl-card-hover);}
.dtl-orow__row{display:flex;align-items:center;gap:12px;}
.dtl-orow__title{display:flex;align-items:baseline;gap:6px;min-width:0;}
.dtl-orow__name{font-size:var(--dtl-font-md);font-weight:500;line-height:var(--dtl-line-md);min-width:0;}
/* 第二行：状态标签 + #标签（与标题行间距拉开，用户 2026-10-18；状态位与执行人**互换**后，
   状态搬到这里、且永远有 ⇒ 这一行不再有「空一排」的情况） */
.dtl-orow__tags{display:flex;align-items:center;gap:var(--dtl-space-2);margin-top:7px;min-width:0;}
/* 列：任务（弹性）/ 执行人 / 右侧槽（创建信息 ⇄ 操作钮） */
.dtl-tcell{min-width:0;}
.dtl-tcell--title{flex:1 1 auto;}
/* 执行人列（原状态列，用户 2026-10-18 互换）：稍放宽一档（用户 2026-10-19：原来有点挤），
   20 字的名字能基本摆全；再长由标签自己的省略号兜住，不许溢出压到右边的槽 */
.dtl-tcell--status{flex:none;width:136px;}
/* 悬停：**创建信息整条让位给操作钮**（用户 2026-10-18：不要「掉掉时分秒」那种半吊子，
   要整条换掉）。两个都**常驻布局**（visibility 切换、不用 display），格子宽度 = 两者较宽的
   那个 ⇒ hover 时行宽不变、**页面不跳**（跳了执行人的悬停提示就跟着飘） */
.dtl-orow__slot{display:grid;align-items:center;justify-items:end;flex:none;
  font-size:var(--dtl-font-xs);color:var(--dtl-fg-3);white-space:nowrap;font-variant-numeric:tabular-nums;}
.dtl-orow__slot>*{grid-area:1/1;}
.dtl-orow__created{visibility:visible;}
.dtl-orow__actions{visibility:hidden;display:flex;align-items:center;gap:6px;}
.dtl-orow:hover .dtl-orow__created{visibility:hidden;}
.dtl-orow:hover .dtl-orow__actions{visibility:visible;}
/* 行首状态圆点：灰=待认领 / 浅蓝=进行中（比「我的」蓝灰一档）/ 黄=积压 / 橙=逾期 / 红=停滞；
   6px（用户 2026-10-18：8px 太大） */
.dtl-dot{display:inline-block;width:6px;height:6px;flex:none;border-radius:50%;}
.dtl-dot--doing{background:var(--dtl-business-dim);}
.dtl-dot--backlog{background:var(--dtl-warning);}
.dtl-dot--overdue{background:var(--dtl-overdue);}
.dtl-dot--stale{background:var(--dtl-danger);}
.dtl-dot--open{background:var(--dtl-fg-3);}

/* 任务行 = 一张卡（样式照抄 dispatch-table TaskCard：surface-1 底 + 1px 边框 + 左缘状态条；
   hover 只亮主行；右侧 时间⇄按钮排 互换） */
.dtl-taskrow{background:var(--dtl-surface-1);border:1px solid var(--dtl-border);
  border-radius:var(--dtl-radius-sm);margin-bottom:10px;}
.dtl-taskrow__row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:inherit;
  transition:background-color var(--dtl-dur-fast) var(--dtl-ease);}
.dtl-taskrow__row:hover{background:var(--dtl-card-hover);}

/* 状态条：贴卡片左缘、与正文两行等高的竖向色条（dispatch StatusRail 同款 6×36） */
.dtl-rail{display:inline-block;width:6px;height:36px;flex:none;border-radius:var(--dtl-radius-xs);}
.dtl-rail--doing{background:var(--dtl-business);}
.dtl-rail--backlog{background:var(--dtl-warning);}
.dtl-rail--overdue{background:var(--dtl-overdue);}
.dtl-rail--stale{background:var(--dtl-danger);}
.dtl-rail--open{background:var(--dtl-fg-3);}

/* 第一行：标题（上来就是标题）+ [YYYY-MM-DD 创建] 灰徽 + 异常 pill（baseline 对齐，dispatch 同款） */
.dtl-taskrow__l1{display:flex;align-items:baseline;gap:6px;min-width:0;}
.dtl-taskrow__title{font-size:var(--dtl-font-lg);font-weight:600;line-height:var(--dtl-line-md);min-width:0;flex:0 1 auto;}
.dtl-taskrow__stamp{flex:none;font-size:var(--dtl-font-xs);color:var(--dtl-fg-3);white-space:nowrap;
  font-variant-numeric:tabular-nums;}
/* 第二行小字：工作区 · #标签（行距拉开，用户 2026-10-17：第一二行别贴着） */
.dtl-taskrow__l2{display:flex;align-items:center;gap:var(--dtl-space-2);margin-top:6px;
  font-size:var(--dtl-font-sm);color:var(--dtl-fg-2);min-width:0;}
/* 右侧灰字：2026-10-17 开始丨已进行 12 天（用户 2026-10-17：不要蓝，一行灰字） */
.dtl-taskrow__when{flex:none;font-size:var(--dtl-font-xs);color:var(--dtl-fg-3);white-space:nowrap;
  font-variant-numeric:tabular-nums;}
.dtl-taskrow__actions{display:none;flex:none;gap:6px;}
.dtl-taskrow__row:hover .dtl-taskrow__when{display:none;}
.dtl-taskrow__row:hover .dtl-taskrow__actions{display:inline-flex;}

/* 用核心 Chip 承担标签时的截断（core Chip 无 max-width/省略号 ⇒ 这里只补布局，不改皮肤） */
.dshpc-chip.dtl-tagchip{display:inline-block;flex:none;max-width:20ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle;}

/* 工作区徽标：只铺蓝底（用户 2026-10-17：描边框太抢 ⇒ 去掉；底色已提亮一档见 tokens.ts
   business-soft 8%→14% / 5%→12%），字色回正文。 */
.dtl-wstag{flex:none;max-width:220px;padding:1px 8px;border-radius:var(--dtl-radius-sm);
  background:var(--dtl-business-soft);color:var(--dtl-fg);
  font-size:var(--dtl-font-xs);line-height:16px;white-space:nowrap;}

/* 空态：真空 = 虚线引导卡（用户 2026-10-18：**加高到 180px + 内容居中**；
   它贴在滚动条最底下，太窄用户根本看不见） */
.dtl-empty-guide{display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:var(--dtl-space-2);min-height:270px;padding:var(--dtl-space-4);text-align:center;
  border:1px dashed var(--dtl-border-strong);border-radius:var(--dtl-radius-md);background:transparent;}
`;
		const STYLE_ID = "dtl-ui-base";
		/** 幂等注入 token 层 + 控件皮肤 + 基础层（面板与浮标谁先挂载都只注入一次）。
		*  已挂载时**就地比对刷新**：插件升级后宿主若复用旧面板 DOM，旧样式表会一直挂着，
		*  导致新版本样式不生效（用户 2026-10-18：0.0.31 装上了圆圈还在）—— 内容变了就原位替换，不必重启。 */
		function ensureUiBase() {
			if (typeof document === "undefined") return;
			const css = `${UI_TOKENS_CSS}\n${UI_CONTROLS_CSS}\n${UI_BASE_CSS}`;
			const existing = document.getElementById(STYLE_ID);
			if (existing !== null) {
				if (existing.textContent !== css) existing.textContent = css;
				return;
			}
			const style = document.createElement("style");
			style.id = STYLE_ID;
			style.textContent = css;
			document.head.appendChild(style);
		}
		/** 分段控件（单选）：改由核心 `Segmented` 承担（size/滑块动画全在 core，外观只有一套、无需指定变体，
		*  见 core/src/ui/Segmented.ts 头注：2026-10-26 起已删除 variant 轴）。
		*  本地 `badge` 是「灰字计数」语义 ⇒ 映射到 core 的 `count`（core 的 `badge` 是红色危险圆标）。 */
		function Segmented(props) {
			return (0, react.createElement)(Segmented$1, {
				items: props.items.map((item) => ({
					value: item.value,
					label: item.label,
					count: item.badge
				})),
				value: props.value,
				onChange: props.onChange,
				size: props.size,
				label: props.label,
				id: props.id,
				style: props.style
			});
		}
		/** 按钮：改由核心 `Button` 承担（10 档 variant 里本地用 3 档）。本地默认高度 md（core 默认 lg）。 */
		function Button(props) {
			return (0, react.createElement)(Button$1, {
				variant: props.variant,
				size: props.size ?? "md",
				icon: props.icon,
				disabled: props.disabled,
				title: props.title,
				onClick: props.onClick
			}, props.children);
		}
		/** 图标钮：改由核心 `IconButton` 承担。 */
		function IconButton(props) {
			return (0, react.createElement)(IconButton$1, {
				icon: props.icon,
				label: props.label,
				onClick: props.onClick,
				variant: props.variant ?? "plain",
				size: props.size ?? "md",
				disabled: props.disabled,
				title: props.title
			});
		}
		/** 下拉：改由核心 `Picker`（单选、受控、portal 菜单）承担。
		*  宽度由核心 `Picker` 原生支持（`width`/`minWidth`/`maxWidth` 落到位触发器内联样式，
		* 超长省略号 + hover 跑马灯）；给了 `width` 即锁定定宽，否则在 min/max 间自适应。 */
		function Select(props) {
			return (0, react.createElement)(Picker, {
				groups: props.groups,
				options: props.options.map((option) => ({
					value: option.value,
					label: option.label
				})),
				value: props.value,
				onChange: (next) => {
					props.onChange(next);
				},
				size: props.size ?? "md",
				searchable: props.searchable === true,
				ariaLabel: props.ariaLabel,
				mode: "single",
				width: props.width,
				minWidth: props.minWidth,
				maxWidth: props.maxWidth,
				icon: props.icon
			});
		}
		/** 搜索框：改由核心 `Input`（type=search）承担；默认铺满容器。 */
		function SearchInput(props) {
			return (0, react.createElement)(Input, {
				type: "search",
				value: props.value,
				onChange: props.onChange,
				placeholder: props.placeholder,
				size: props.size ?? "md",
				"aria-label": props.ariaLabel
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
		/** 标签上限宽度（字符数）：1 个中文按 2 计 ⇒ 10 个中文 = 20 个字符（与 CSS 的 20ch 对齐）。 */
		const TAG_MAX_WIDTH = 20;
		/** 显示宽度：全角（中 / 日 / 韩 / 全角符号）一个顶两个英文字符。 */
		function displayWidth(text) {
			let width = 0;
			for (const char of text) width += (char.codePointAt(0) ?? 0) > 11904 ? 2 : 1;
			return width;
		}
		/** 本地 7 档语义色 → 核心 `Chip` 5 档。core 缺 doing / backlog / overdue / stale / person 的独立色：
		*  overdue 与 stale 都落到 danger、doing 与 person 落到 business（需 core 补 tone 才能精确）。 */
		const CHIP_TONE = {
			neutral: "neutral",
			open: "neutral",
			backlog: "warning",
			doing: "business",
			overdue: "danger",
			stale: "danger",
			person: "business"
		};
		/**
		* 标签：状态 / 执行人 / #标签 都走它，只换 tone（改由核心 `Chip` 承担）。
		* 超过 20 个字符宽 ⇒ 省略号（`.dtl-tagchip` 补），**且只在被截时**挂悬停提示补出全文。
		*/
		function Tag(props) {
			ensureUiBase();
			const { text, tone = "neutral", title, tip } = props;
			const long = displayWidth(text) > TAG_MAX_WIDTH;
			const label = tip ?? (long ? title ?? text : void 0);
			const chip = (0, react.createElement)(Chip, {
				tone: CHIP_TONE[tone],
				className: "dtl-tagchip"
			}, text);
			if (label === void 0) return chip;
			return (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label,
				side: "bottom",
				portal: true,
				maxWidth: 240,
				children: chip
			});
		}
		/** 空态：真空引导卡（虚线）。 */
		function EmptyState(props) {
			ensureUiBase();
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
		//#endregion
		//#region src/client/task-row.ts
		/**
		* 任务行（宿主**无表格件** ⇒ 自绘），**两种形态**（用户 2026-10-17 定稿：两区视觉必须不同，
		* 且**互不重用**）：
		*
		* A. `mine`（我的待办）= 整行一张卡，样式照抄 dispatch-table 任务配置卡：
		*    左缘 6×36 状态条 + 标题行 + 第二行工作区/标签；右侧灰字时长；悬停出
		*    「继续 / 结束 / 释放」；最右常驻「查看」放大镜钮。
		*
		* B. `others`（全部待办）= 连体长表里的一行（用户 2026-10-18 定稿）：**无卡片、无外框**，
		*    行 = 一条淡分隔线格：上下居中的状态圆点 + 任务（标题行 + 标签行；**标签行最前是状态标签**）
		*    + **执行人列**（原状态位，有执行人才摆 `@名字` 标签）+ 最右「@创建人 创建于 年-月-日 时:分:秒」
		*    （悬停掉时分秒并让位给操作钮）+ 查看。
		*    状态一律**标签型、五色**（用户 2026-10-18：原来是一排素字 / pill，现在与人员**位置互换**）：
		*    灰=待认领 / 蓝=进行中 / 黄=积压 / 橙=逾期 / 红=停滞；三个异常标签悬停给 skill 算好的
		*    天数解释（ageDays / idleDays / waitingDays 随 list 下发）。圆点颜色同色系。
		*
		* 按钮（含查看）**不各判各的**：权限一律问 `resolveActions()`（rows.ts），本文件只按返回值画。
		*
		* 按钮点击行为（含查看）归「任务按钮与会话交接」任务，本文件只做样子与提示。
		*/
		/** 行标题：任务名（缺则任务号）。 */
		function titleOf(row) {
			return row.task.title || row.task.id;
		}
		/** 状态语义（异常优先：停滞 > 逾期 > 积压；三者都是 skill 按时间算出来的，不是状态）。
		*  只决定圆点 / 左缘色条这类**单色位**——标签可以多枚，见 MARKS。 */
		function toneOf(row) {
			if (row.task.stale === true) return "stale";
			if (row.task.overdue === true) return "overdue";
			if (row.task.backlog === true) return "backlog";
			if (row.task.status === "open") return "open";
			return "doing";
		}
		/** 三个异常标记**可叠加**（用户 2026-10-19）：一条任务能同时逾期 + 停滞，两枚标签都要摆。
		*  积压与逾期 / 停滞不会共存（前者是待认领，后两者是进行中），故最多 2 枚。 */
		const MARKS = [
			"backlog",
			"overdue",
			"stale"
		];
		/** 状态文案。 */
		function statusLabel(tone, t) {
			if (tone === "stale") return t("statusStale");
			if (tone === "overdue") return t("statusOverdue");
			if (tone === "backlog") return t("statusBacklog");
			if (tone === "open") return t("statusOpen");
			return t("statusActive");
		}
		function TaskRowView(props) {
			const { t, row, variant } = props;
			const tone = toneOf(row);
			const tags = row.task.tags ?? [];
			const created = row.task.created ?? null;
			const createdDay = created !== null && created !== void 0 && Date.parse(created) >= 0 ? formatDateTime(created).slice(0, 10) : null;
			const stamp = (value) => value === null || value === void 0 ? t("timeUnknown") : formatDateTime(value, {
				seconds: true,
				fallback: t("timeUnknown")
			});
			const dayText = (n) => n === null || n === void 0 ? t("daysNone") : t("daysValue", { n });
			const detailTip = (which) => {
				const { task } = row;
				const owner = displayName(task.owner_name, task.owner);
				const who = owner === "" ? t("ownerUnclaimed") : `@${owner}`;
				const started = stamp(task.started ?? task.created);
				const updated = stamp(task.updated ?? task.started ?? task.created);
				if (which === "open") return t("tipOpen", { created: stamp(task.created) });
				if (which === "backlog") return t("tipBacklog", {
					created: stamp(task.created),
					d: dayText(task.waitingDays)
				});
				if (which === "doing") return t("tipDoing", {
					who,
					started,
					updated
				});
				if (which === "overdue") return t("tipOverdue", {
					who,
					started,
					updated,
					d: dayText(task.ageDays)
				});
				return t("tipStale", {
					who,
					started,
					updated,
					d: dayText(task.idleDays)
				});
			};
			const actions = resolveActions(row.task);
			const viewButton = (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label: t("viewDetail"),
				side: "bottom",
				portal: true,
				maxWidth: 240,
				children: (0, react.createElement)(IconButton, {
					variant: "plain",
					size: "sm",
					label: t("viewDetail"),
					icon: (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutlineRegular, { size: 14 })
				})
			});
			const tipBtn = (icon, actionKey, tipKey) => (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label: t(tipKey),
				side: "bottom",
				portal: true,
				maxWidth: 240,
				children: (0, react.createElement)(Button, {
					variant: "ghost",
					size: "sm",
					icon: icon ?? void 0
				}, t(actionKey))
			});
			const claimButton = tipBtn((0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconDownloadOutlineRegular, { size: 14 }), "actionClaim", "tipClaim");
			const resumeButton = tipBtn((0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutlineRegular, { size: 14 }), "actionResume", "tipResume");
			const finishButton = tipBtn((0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutlineRegular, { size: 14 }), "actionFinish", "tipFinish");
			const releaseButton = tipBtn(null, "actionRelease", "tipRelease");
			const tagOf = (which, tip) => {
				const text = statusLabel(which, t);
				return (0, react.createElement)(Tag, {
					key: which,
					text,
					tone: which,
					tip: tip ?? detailTip(which)
				});
			};
			const markTones = MARKS.filter((which) => row.task[which] === true);
			const statusTags = (markTones.length > 0 ? markTones : [tone]).map((which) => tagOf(which));
			const alarmTags = markTones.map((which) => tagOf(which));
			const titleLine = (0, react.createElement)("div", { className: "dtl-taskrow__l1" }, (0, react.createElement)("span", {
				className: "dtl-taskrow__title dtl-ellipsis",
				title: titleOf(row)
			}, titleOf(row)), createdDay === null ? null : (0, react.createElement)("span", { className: "dtl-taskrow__stamp" }, `[${t("fieldCreatedStamp", { day: createdDay })}]`), ...alarmTags);
			const orowTitleLine = (0, react.createElement)("div", { className: "dtl-orow__title" }, (0, react.createElement)("span", {
				className: "dtl-orow__name dtl-ellipsis",
				title: titleOf(row)
			}, titleOf(row)));
			if (variant === "others") {
				const owner = row.task.owner;
				const creatorLabel = displayName(row.task.creator_name, row.task.creator);
				const hasOwner = !(owner === null || owner === void 0 || owner === "");
				const who = creatorLabel === "" ? "—" : `@${creatorLabel}`;
				const createdOk = created !== null && created !== void 0 && Date.parse(created) >= 0;
				const startedOk = row.task.started !== null && row.task.started !== void 0 && Date.parse(row.task.started) >= 0;
				const ownerName = displayName(row.task.owner_name, owner);
				const ownerTip = t("startedAt", {
					who: ownerName === "" ? "" : `@${ownerName}`,
					when: startedOk ? formatDateTime(String(row.task.started)) : t("timeUnknown")
				});
				const tagLine = (0, react.createElement)("div", { className: "dtl-orow__tags" }, ...statusTags, tags.map((tag) => (0, react.createElement)(Tag, {
					key: tag,
					text: `#${tag}`
				})));
				return (0, react.createElement)("div", { className: "dtl-orow" }, (0, react.createElement)("div", { className: "dtl-orow__row" }, (0, react.createElement)("span", { className: `dtl-dot dtl-dot--${tone}` }), (0, react.createElement)("div", { className: "dtl-tcell dtl-tcell--title" }, orowTitleLine, tagLine), (0, react.createElement)("span", { className: "dtl-tcell dtl-tcell--status" }, hasOwner ? (0, react.createElement)(Tag, {
					text: `@${displayName(row.task.owner_name, owner)}`,
					tone: "person",
					title: ownerTip
				}) : null), (0, react.createElement)("span", { className: "dtl-orow__slot" }, (0, react.createElement)("span", { className: "dtl-orow__created" }, t("createdAt", {
					who,
					when: createdOk ? formatDateTime(String(created)) : t("timeUnknown")
				})), (0, react.createElement)("span", { className: "dtl-orow__actions" }, actions.claim ? claimButton : null, actions.resume ? resumeButton : null, actions.finish ? finishButton : null, actions.release ? releaseButton : null, actions.view ? viewButton : null))));
			}
			const parts = [];
			const startRaw = row.task.started ?? row.task.created;
			if (startRaw !== void 0 && startRaw !== null && startRaw !== "" && Date.parse(startRaw) >= 0) parts.push(`${formatDateTime(startRaw).slice(0, 10)} ${t("fieldStarted")}`);
			if (row.task.ageDays !== null && row.task.ageDays !== void 0) parts.push(row.task.ageDays === 0 ? t("ageToday") : t("ageDaysText", { n: row.task.ageDays }));
			return (0, react.createElement)("div", { className: "dtl-taskrow" }, (0, react.createElement)("div", { className: "dtl-taskrow__row" }, (0, react.createElement)("span", { className: `dtl-rail dtl-rail--${tone}` }), (0, react.createElement)("div", { style: {
				flex: "1 1 auto",
				minWidth: 0
			} }, titleLine, (0, react.createElement)("div", { className: "dtl-taskrow__l2" }, (0, react.createElement)("span", {
				className: "dtl-wstag dtl-ellipsis",
				title: row.task.workspace.title
			}, row.task.workspace.title), tags.map((tag) => (0, react.createElement)(Tag, {
				key: tag,
				text: `#${tag}`
			})))), (0, react.createElement)("span", { className: "dtl-taskrow__when" }, parts.length === 0 ? t("timeUnknown") : parts.join("丨")), (0, react.createElement)("span", { className: "dtl-taskrow__actions" }, actions.resume ? resumeButton : null, actions.finish ? finishButton : null, actions.release ? releaseButton : null, actions.view ? viewButton : null)));
		}
		//#endregion
		//#region src/client/board-home.ts
		/**
		* 看板首页（`main` 槽整页内容）：上 = 8 统计卡 + 趋势图位（**留空**）；下 = 单区任务列表。
		*
		* 2026-10-28：列表沿用原「我的待办」卡片样式，改成**左侧六档菜单 + 右侧三个过滤**的平铺列表。
		*  - 菜单：我的待办 / 待认领 / 进行中 **真筛**；积压 / 逾期 / 停滞 **只铺样式**（`list` 还没有
		*    对应筛选参数，点了给一句说明，不假装是空结果）。
		*  - 工作区过滤 **真筛**；负责人下拉与搜索框 **只铺样式**（用户要求程序后置）。
		*
		* 数据纪律：行上的 `mine` / `stale` / `overdue` / `backlog` 与阈值都来自 skill，
		* 前端只做布尔判断与渲染。刷新 = 挂载首读 + 手动刷新按钮，**不轮询**。
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
		/** 标题后的版本 + 构建编码：特别小的字（用户 2026-10-26 要求，一眼确认看到的是不是刚 build 的）。 */
		const buildTagStyle = {
			marginLeft: "var(--dtl-space-2)",
			fontSize: "10px",
			lineHeight: "1",
			fontWeight: 400,
			color: "var(--dtl-fg-dim)",
			fontVariantNumeric: "tabular-nums",
			whiteSpace: "nowrap"
		};
		/** 统计区：左 8 块（2 行 × 4 列）+ 右趋势图位，参考图同款分栏。
		*  列数写死 4 → 2（媒体查询在 ui.ts 的 .dtl-stats / .dtl-stats__cards 里），
		*  绝不给 3 列——3 列会排出 3+1 的非对称（用户 2026-10-17：必须上下对称）。 */
		const statsRowStyle = { marginBottom: "var(--dtl-space-4)" };
		const chartCardStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			padding: "var(--dtl-space-4)"
		};
		const hintStyle = {
			fontSize: "var(--dtl-font-sm)",
			color: "var(--dtl-fg-2)"
		};
		/** 列表段头：滑块居左、过滤三件居右（用户 2026-10-28 去掉左侧标题）。 */
		const regionHeadRowStyle = {
			display: "flex",
			alignItems: "center",
			gap: "6px",
			flexWrap: "wrap",
			margin: "calc(var(--dtl-space-4) * 2) 0 calc(var(--dtl-space-2) * 2)"
		};
		/** 工作区 / 执行人下拉宽度：核心 Picker 现已支持 min/max（超长省略号）。
		*  下限略大于旧 131 口径，上限兜底长名不被撑开压住后一个下拉。 */
		const SELECT_MIN_WIDTH = 140;
		const SELECT_MAX_WIDTH = 240;
		/** 搜索框宽度（用户 2026-10-17：两区同款，96×2 = 192）。 */
		const SEARCH_WIDTH = 192;
		/** 左侧六档菜单（前三档 skill 有筛选口径，后三档只铺样式）。 */
		const TABS = [
			{
				value: "mine",
				label: "regionMine"
			},
			{
				value: "open",
				label: "statOpen"
			},
			{
				value: "doing",
				label: "statDoing"
			},
			{
				value: "backlog",
				label: "statBacklog"
			},
			{
				value: "overdue",
				label: "statOverdue"
			},
			{
				value: "stale",
				label: "statStale"
			}
		];
		/** 后三档还接不了：`list` 没有对应筛选参数（skill 只在每行给标记）。 */
		const PENDING_TABS = [
			"backlog",
			"overdue",
			"stale"
		];
		/** 角标：>0 才给数字，0 = undefined（不标）。 */
		function orZero(n) {
			return n > 0 ? n : void 0;
		}
		function BoardHome(props) {
			const { t, onBack } = props;
			ensureUiBase();
			const state = (0, react.useSyncExternalStore)(boardSubscribe, boardSnapshot);
			(0, react.useEffect)(() => {
				refresh();
			}, []);
			const board = state.board;
			const stats = board?.stats;
			const view = (0, react.useMemo)(() => selectView(state), [state]);
			const degraded = board?.degraded ?? [];
			const pending = PENDING_TABS.includes(state.query.tab);
			/** 工作区下拉候选：宿主里所有含台账的工作区（不是从任务里反推，空工作区也要能选）。 */
			const workspaceOptions = (0, react.useMemo)(() => [{
				value: "",
				label: t("workspaceAll")
			}, ...(board?.workspaces ?? []).map((workspace) => ({
				value: workspace.id,
				label: workspace.title
			}))], [board, t]);
			/** 统计卡：纯展示（用户 2026-10-17：先全去掉点击，界面定稿后再议滚动 / 筛选联动）。 */
			const card = (label, value, hint, title) => (0, react.createElement)(StatCard, {
				label: t(label),
				value,
				hint,
				title,
				interactive: false
			});
			/** 子集卡占比小字：分母为 0 或自己没有 ⇒ 不显示（不拿 0% 充数）。 */
			const share = (part, whole, key) => part > 0 && whole > 0 ? t(key, { n: Math.round(part / whole * 100) }) : "";
			/** 统计台卡：不可点，hover 给具体日期区间；数字 null（历史读不到）留 '—'，不拿 0 充数。 */
			const weekCard = (label, done, from, to) => (0, react.createElement)(StatCard, {
				label: t(label),
				value: done ?? 0,
				interactive: false,
				title: t("periodRange", {
					from,
					to
				})
			});
			/** 左 8 块（2×4）+ 右趋势图位。 */
			const statsGrid = (view) => (0, react.createElement)("div", {
				className: "dtl-stats",
				style: statsRowStyle
			}, (0, react.createElement)("div", { className: "dtl-stats__cards" }, card("statMyActive", view.myActive, [view.myOverdue > 0 ? t("statMyOverdueHint", { n: view.myOverdue }) : null, view.myStale > 0 ? t("statMyStaleHint", { n: view.myStale }) : null].filter((part) => part !== null).join(" ｜ ")), card("statDoing", view.doing, view.doing - view.myActive > 0 ? t("statDoingHint", { n: view.doing - view.myActive }) : t("statDoingAllMine")), card("statOpen", view.open, view.oldestOpenDays === null ? "" : t("statOpenHint", { n: view.oldestOpenDays })), card("statBacklog", view.backlog, share(view.backlog, view.open, "statBacklogHint"), t("statBacklogTitle", { n: view.backlogDays })), card("statOverdue", view.overdue, share(view.overdue, view.doing, "statOverdueHint"), t("statOverdueTitle", { n: view.overdueDays })), card("statStale", view.stale, share(view.stale, view.doing, "statStaleHint"), t("statStaleTitle", { n: view.staleDays })), weekCard("statWeekDone", view.weekDone, view.weekFrom, view.weekTo), weekCard("statLastWeekDone", view.lastWeekDone, view.lastWeekFrom, view.lastWeekTo)), (0, react.createElement)("div", {
				className: "dtl-card",
				style: chartCardStyle
			}, (0, react.createElement)("div", { style: hintStyle }, t("chartNotReady"))));
			/** 段头：六档菜单居左，工作区 / 执行人 / 搜索居右（用户 2026-10-28：不要左侧标题）。 */
			const regionHead = (0, react.createElement)("div", { style: regionHeadRowStyle }, (0, react.createElement)(Segmented, {
				id: "dtl-list-tab",
				value: state.query.tab,
				label: t("statusLabel"),
				items: TABS.map((tab) => ({
					value: tab.value,
					label: t(tab.label),
					badge: orZero(view.counts[tab.value])
				})),
				size: "lg",
				onChange: (next) => {
					setQuery({ tab: next });
				}
			}), (0, react.createElement)("span", { style: { flex: "1 1 auto" } }), (0, react.createElement)("div", { style: { flex: "none" } }, (0, react.createElement)(Select, {
				searchable: true,
				size: "lg",
				minWidth: SELECT_MIN_WIDTH,
				maxWidth: SELECT_MAX_WIDTH,
				icon: (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconFolderCloseRegular, { size: 16 }),
				value: workspaceOptions.some((option) => option.value === state.query.workspace) ? state.query.workspace : "",
				options: workspaceOptions,
				ariaLabel: t("workspaceLabel"),
				onChange: (next) => {
					setQuery({ workspace: next });
				}
			})), (0, react.createElement)("div", { style: { flex: "none" } }, (0, react.createElement)(Select, {
				searchable: true,
				size: "lg",
				minWidth: SELECT_MIN_WIDTH,
				maxWidth: SELECT_MAX_WIDTH,
				icon: (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconUsersOutlineRegular, { size: 16 }),
				value: state.query.owner,
				options: [{
					value: "",
					label: t("ownerAll")
				}],
				groups: ownerGroups(board, workspaceOptions, t),
				ariaLabel: t("ownerLabel"),
				onChange: (next) => {
					setQuery({ owner: next });
				}
			})), (0, react.createElement)("div", { style: {
				width: `${SEARCH_WIDTH}px`,
				flex: "none"
			} }, (0, react.createElement)(SearchInput, {
				size: "lg",
				value: state.query.keyword,
				placeholder: t("searchPlaceholder"),
				ariaLabel: t("searchPlaceholder"),
				onChange: (next) => {
					setQuery({ keyword: next });
				}
			})));
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
			}, `← ${t("backToConversation")}`), (0, react.createElement)("div", { style: titleStyle }, t("panelTitle"), (0, react.createElement)("span", {
				style: buildTagStyle,
				title: `v0.0.113 · 261028-154151-603`
			}, `v0.0.113 261028-154151-603`))), (0, react.createElement)(Button, {
				variant: "outline",
				size: "lg",
				icon: (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutlineRegular, { size: 16 }),
				disabled: state.refreshing,
				title: t("refresh"),
				onClick: () => {
					refresh();
				}
			}, state.refreshing ? t("refreshing") : t("refresh"))), state.status === "error" && board === null ? (0, react.createElement)("div", { style: {
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
			}, t("retry"))) : null, stats === void 0 ? null : statsGrid(stats), degraded.length === 0 ? null : (0, react.createElement)("div", { style: {
				display: "flex",
				alignItems: "flex-start",
				gap: "var(--dtl-space-2)",
				padding: "var(--dtl-space-2) var(--dtl-space-3)",
				marginTop: "var(--dtl-space-3)",
				border: "1px solid var(--dtl-danger)",
				borderRadius: "var(--dtl-radius-md)",
				background: "var(--dtl-danger-soft)",
				color: "var(--dtl-fg)",
				fontSize: "var(--dtl-font-sm)",
				lineHeight: "var(--dtl-line-sm)"
			} }, (0, react.createElement)("span", { style: {
				color: "var(--dtl-danger)",
				flex: "none",
				fontWeight: 600
			} }, t("degradedTitle")), (0, react.createElement)("span", null, degraded.map((item) => t("degradedItem", {
				title: item.workspaceTitle,
				message: item.message
			})).join("；"))), regionHead, pending ? (0, react.createElement)("div", { style: hintStyle }, t("filterPending")) : view.rows.length === 0 ? (0, react.createElement)(EmptyState, {
				title: t("listEmpty"),
				hint: t("listEmptyHint")
			}) : (0, react.createElement)("div", null, view.rows.map((row) => (0, react.createElement)(TaskRowView, {
				key: row.key,
				t,
				row,
				variant: "mine"
			}))))));
		}
		//#endregion
		//#region src/client/locales.ts
		/** 中文（默认档）。 */
		const zh = {
			backToConversation: "返回会话",
			panelTitle: "任务台账",
			refresh: "刷新",
			refreshing: "刷新中",
			loading: "读取中…",
			retry: "重试",
			loadFailed: "读取失败",
			degradedTitle: "部分工作区读取失败",
			degradedItem: "{title}：{message}",
			statMyActive: "我的待办",
			statMyOverdueHint: "逾期 {n}",
			statMyStaleHint: "停滞 {n}",
			statOpen: "待认领",
			statOpenHint: "最长等待 {n} 天",
			statDoing: "进行中",
			statDoingHint: "他人在办 {n}",
			statDoingAllMine: "均为我负责",
			statBacklog: "积压",
			statOverdue: "逾期",
			statStale: "停滞",
			statBacklogHint: "占待认领 {n}%",
			statOverdueHint: "占进行中 {n}%",
			statStaleHint: "占进行中 {n}%",
			statStaleTitle: "停滞 = 进行中满 {n} 天没更新",
			statOverdueTitle: "逾期 = 认领后满 {n} 天还没结案",
			statBacklogTitle: "积压 = 待认领满 {n} 天没人接",
			statWeekDone: "本周完成",
			statLastWeekDone: "上周完成",
			daysNone: "—",
			daysValue: "{n} 天",
			chartNotReady: "趋势图待接：skill 还没有按周汇总的方法",
			periodRange: "{from} ~ {to}",
			statusLabel: "状态",
			statusActive: "进行中",
			statusOpen: "待认领",
			statusBacklog: "积压",
			statusOverdue: "逾期",
			statusStale: "停滞",
			tipOpen: "任务创建于 {created}\n尚未有人认领",
			tipBacklog: "任务创建于 {created}\n无人认领已满 {d}",
			tipDoing: "{who}\n开始执行：{started}\n最后更新：{updated}",
			tipOverdue: "{who}\n开始执行：{started}\n最后更新：{updated}\n已逾期 {d}",
			tipStale: "{who}\n开始执行：{started}\n最后更新：{updated}\n已停滞 {d}",
			workspaceLabel: "工作区",
			workspaceAll: "全部工作区",
			searchPlaceholder: "搜索",
			regionMine: "我的待办",
			ownerLabel: "执行人",
			ownerAll: "全部执行人",
			filterPending: "这一档的筛选方法还没接：skill 的 list 还没有按积压 / 逾期 / 停滞筛行的参数",
			listEmpty: "这一档没有任务",
			listEmptyHint: "换个档位或工作区看看。",
			ownerUnclaimed: "待认领",
			fieldStarted: "开始",
			timeUnknown: "时间未知",
			ageDaysText: "已进行 {n} 天",
			ageToday: "今天",
			actionResume: "继续",
			actionFinish: "结束",
			actionRelease: "释放",
			tipResume: "继续推进这个任务",
			tipFinish: "结案并写入历史",
			tipRelease: "释放认领，让别人接手",
			actionClaim: "认领",
			tipClaim: "认领这个任务，变成我在做",
			createdAt: "{who} 创建于 {when}",
			startedAt: "{who} 开始于 {when}",
			viewDetail: "查看详情",
			fieldCreatedStamp: "{day} 创建"
		};
		/** English（与 zh 键完全对齐）。 */
		const en = {
			backToConversation: "Back to chat",
			panelTitle: "Task ledger",
			refresh: "Refresh",
			refreshing: "Refreshing",
			loading: "Loading…",
			retry: "Retry",
			loadFailed: "Load failed",
			degradedTitle: "Some workspaces failed to load",
			degradedItem: "{title}: {message}",
			statMyActive: "My todos",
			statMyOverdueHint: "overdue {n}",
			statMyStaleHint: "stale {n}",
			statOpen: "Unclaimed",
			statOpenHint: "longest waiting {n} days",
			statDoing: "In progress",
			statDoingHint: "others: {n}",
			statDoingAllMine: "all mine",
			statBacklog: "Backlog",
			statOverdue: "Overdue",
			statStale: "Stale",
			statBacklogHint: "{n}% of unclaimed",
			statOverdueHint: "{n}% of active",
			statStaleHint: "{n}% of active",
			statStaleTitle: "stale = active with no update for {n}+ days",
			statOverdueTitle: "overdue = claimed {n}+ days ago and still open",
			statBacklogTitle: "backlog = unclaimed for {n}+ days",
			statWeekDone: "Done this week",
			statLastWeekDone: "Done last week",
			daysNone: "—",
			daysValue: "{n}d",
			chartNotReady: "Trend chart pending: the skill has no weekly roll-up method yet",
			periodRange: "{from} ~ {to}",
			statusLabel: "Status",
			statusActive: "Active",
			statusOpen: "Unclaimed",
			statusBacklog: "Backlog",
			statusOverdue: "Overdue",
			statusStale: "Stale",
			tipOpen: "Created on {created}\nNot claimed yet",
			tipBacklog: "Created on {created}\nUnclaimed for {d}",
			tipDoing: "{who}\nStarted: {started}\nLast updated: {updated}",
			tipOverdue: "{who}\nStarted: {started}\nLast updated: {updated}\nOverdue by {d}",
			tipStale: "{who}\nStarted: {started}\nLast updated: {updated}\nStalled for {d}",
			workspaceLabel: "Workspace",
			workspaceAll: "All workspaces",
			searchPlaceholder: "Search",
			regionMine: "My todos",
			ownerLabel: "Owner",
			ownerAll: "Anyone",
			filterPending: "This tab has no filtering method yet: skill `list` cannot filter by backlog / overdue / stale",
			listEmpty: "Nothing in this tab",
			listEmptyHint: "Try another tab or workspace.",
			ownerUnclaimed: "unclaimed",
			fieldStarted: "started",
			timeUnknown: "unknown time",
			ageDaysText: "active {n}d",
			ageToday: "today",
			actionResume: "Resume",
			actionFinish: "Close",
			actionRelease: "Release",
			tipResume: "keep working on this task",
			tipFinish: "close and archive it",
			tipRelease: "release the claim for others",
			actionClaim: "Claim",
			tipClaim: "claim this task for yourself",
			createdAt: "created by {who} on {when}",
			startedAt: "{who} started on {when}",
			viewDetail: "View details",
			fieldCreatedStamp: "created {day}"
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
		//#region src/client/index.ts
		/**
		* 浏览器半入口（client bundle，产物 dist/client.js）：装配层，不写业务逻辑。
		*
		* 三处注册各自挂进「服务就位才触发」的 slots 注入（参考插件真机教训：顶层 inject 声明
		* 组合满足不了的依赖会让 entry 一直 pending、卡死整个 dsh 启动）：
		*  · locale 字典（zh / en）——界面语言跟随宿主，插件不自备开关；
		*  · `main` keyed 槽整页（看板首页）。
		*
		* 宿主能力一律**本地结构化声明**，不 import 官方包（rc 接口会无声变）；
		* `t` 席位由宿主渲染器按注册项的 `locale:` 声明合成进组件 props。
		*/
		setStyleKit(createStyleKit({ id: "dsh-task-ledger" }));
		/** 命名空间（settings / locale / 面板 id 同名，便于对应）。 */
		/** 模块级 t 席位（侧栏 label 渲染期求值用；绑不上就回落键名，绝不上界面）。 */
		let runtimeT = (key) => key;
		const NS = "dsh-task-ledger";
		/** `main` 槽的 key（非 `conversation` ⇒ 不绑 Session）。 */
		const PANEL_ID = NS;
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
			});
		}
		//#endregion
		exports.apply = apply;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map