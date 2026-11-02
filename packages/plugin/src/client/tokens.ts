/**
 * 语义 token 层：`--dtl-*`（dtl = dsh-task-ledger）。
 *
 * 规矩（docs/design/ui-style.md §三）：
 *  - **只有本文件定义 `--dtl-*`**；其它文件一律 `var(--dtl-*)` 消费，不许直接写 `var(--dsw-*)`；
 *  - 每个 token 都带兜底值 ⇒ 宿主升级换名时不炸（最坏退到兜底色，不会白屏）；
 *  - 明暗差异只写在本文件末尾的 `body[data-ds-dark-theme]` 段：能靠宿主 alias 表达的
 *    一律不写覆盖（alias 自己随主题变），只有「固定中性面 / 半透明底」这类 alias 表达不了的才进该段。
 *  - **离散刻度**：圆角 4/8/12、间距 4/8/12/16、字号 11/12/13/14/16/26
 *    ——业务文件不许出现 5/7/9px、不许自造档位（要加档位改本文件）。
 *
 * 2026-10-28 清理：控件皮肤全部交回 `dsh-plugin-core`（Button / IconButton / Input / Picker /
 * Segmented / Chip / StripCard），随之无引用的 token（控件高度三档、旧 chip 底、图表三色、
 * 旧阴影 / 圆角大档等 39 个）一并删除——**本文件只保留本插件业务壳真正消费的变量**。
 *
 * 明暗判据 = `body[data-ds-dark-theme]`（宿主 0.2.0-rc.2 源码核实：启动脚本 toggleAttribute 写入）。
 * 插件**禁用** `prefers-color-scheme`（它跟系统、不跟用户在宿主里的选择）。
 * 因为判据是纯 CSS 选择器 ⇒ 宿主切主题即生效，**不需要 MutationObserver**。
 *
 * 挂载点 = `body`：插件界面（含将来 portal 到 body 的弹层）全在 body 内，零调用点成本。
 */
export const UI_TOKENS_CSS = `
body{
  /* ── 文字三档 + 暗一档 ───────────────────────────────────────── */
  --dtl-fg:var(--dsw-alias-label-primary,#1f2328);
  --dtl-fg-2:var(--dsw-alias-label-secondary,#5c6370);
  --dtl-fg-3:var(--dsw-alias-label-tertiary,#767d87);
  --dtl-fg-dim:var(--dsw-alias-label-dimmed,#b9bfc7);

  /* ── 面 ──────────────────────────────────────────────────────── */
  --dtl-surface-1:var(--dsw-alias-bg-layer-1,#fff);

  /* ── 描边（宿主真值 l1 4% / l2 10% / l3 12%）─────────────────── */
  --dtl-border:var(--dsw-alias-border-l2,#0000001a);
  --dtl-border-strong:var(--dsw-alias-border-l3,#0000001f);
  /* 行间极淡底线（表格分行用，比 --dtl-border 还淡一档） */
  --dtl-border-faint:var(--dshpc-border-faint,var(--dsw-alias-border-l1,#0000000a));
  /* 表格表头底 / 行悬浮底：**取核心 token**，明暗与宿主主题一起走，不在这里另写一套色值 */
  --dtl-table-head-bg:var(--dshpc-table-head-bg,var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06)));
  --dtl-table-row-hover:var(--dshpc-table-row-hover,rgba(15,15,15,.015));

  /* ── 语义色 ──────────────────────────────────────────────────── */
  /* 蓝色强调 / 选中 / 焦点一律走这条 */
  --dtl-business:var(--dsw-alias-state-business-primary,#3b5bdb);
  /* 绿：进行中（用户 2026-10-28：进行中不要蓝，用绿） */
  --dtl-success:var(--dsw-alias-state-success-primary,#22c55e);
  /* ⚠️ 宿主是 state-warn（不是 state-warning，后者无此定义） */
  --dtl-warning:var(--dsw-alias-state-warn-primary,#f59e0b);
  --dtl-danger:var(--dsw-alias-state-error-primary,#ec1313);
  /* 逾期橙：在「积压黄」与「停滞红」之间再取一档（语义阶梯 灰→黄→橙→红），
     宿主没有现成的橙 token ⇒ 用 warn + error 两色现算，主题一换自动跟随 */
  --dtl-overdue:color-mix(in srgb,var(--dtl-warning) 55%,var(--dtl-danger));
  /* 语义色浅底：color-mix 现算 ⇒ 跟随宿主 alias，主题一换自动成立 */
  --dtl-business-soft:color-mix(in srgb,var(--dtl-business) 14%,transparent);
  /* 待认领标签底：中性灰，比 #标签 那层（chip-bg 7% 黑）深一档、又不到深灰块（用户 2026-11-01）；
     由 --dtl-fg 现算 ⇒ 暗色下自动变成 13% 白，不用另开明暗分支 */
  --dtl-chip-strong:color-mix(in srgb,var(--dtl-fg) 13%,transparent);
  --dtl-danger-soft:color-mix(in srgb,var(--dtl-danger) 8%,transparent);
  /* 橙浅底：三步说明第 2 格的图标底（三格必须是三种不同颜色，用户 2026-11-02） */
  --dtl-warning-soft:color-mix(in srgb,var(--dtl-warning) 16%,transparent);
  /* 绿浅底：头像圆的底（白卡上必须有底色，否则圆看不见） */
  --dtl-success-soft:color-mix(in srgb,var(--dtl-success) 16%,transparent);

  /* ── 图表色（2026-10-30 用户改版）───────────────────────────────
     首页趋势图：完成 = **蓝**（business，用户 2026-10-30「绿色那个柱子不好看，用 business 蓝」）、
     取消 = 红；未结那根拆两段（用户 2026-10-30）—— 进行中 = 绿、待认领 = 琥珀；
     新增曲线另走一档**中性灰**——柱子已经占了蓝，曲线也用蓝就分不清了。
     色值仍直接取核心 alias（state-business / state-success / state-warn / state-error），不手写。
     历史页柱色仍是「完成绿 / 取消红」，曲线沿用 --dtl-chart-added（蓝）。 */
  --dtl-chart-done:var(--dtl-business);
  --dtl-chart-doing:var(--dtl-success);
  --dtl-chart-open:var(--dtl-warning);
  --dtl-chart-added:var(--dtl-business);
  --dtl-chart-line:var(--dtl-fg-3);
  /* 柱面斜纹用的半透明条：取卡底色 ⇒ 明暗主题自动跟着走，看着像柱子上开了几道细缝
     （2026-10-30 三改：32% → 18% → 8%，要很淡） */
  --dtl-chart-stripe:color-mix(in srgb,var(--dtl-surface-1) 8%,transparent);

  /* ── 交互底 ──────────────────────────────────────────────────── */
  /* 卡 / 行 hover 高亮：淡蓝（灰高亮在卡底上几乎看不出来） */
  --dtl-card-hover:rgba(37,99,235,.07);
  /* 「有底无边」控件底（图表右上角翻页箭头，用户 2026-10-30）：
     在卡片底色上掺一档前景色 ⇒ 不透明（压得住下面的刻度线）又比卡面略深，
     明暗两主题都跟着 fg / surface 自动走 */
  --dtl-btn-soft:color-mix(in srgb,var(--dtl-fg) 8%,var(--dtl-surface-1));
  /* 图表浮卡：**明暗两主题用同一支深灰底 + 浅字**（用户 2026-10-30 定稿）——
     掺色的浅灰在浅色主题下仍然像白底、跟页面糊在一起；干脆做成固定深色小片，
     两套主题都不用再猜对比度。色值写死在这里，别处不许再手写。 */
  --dtl-tip-bg:#23262c;
  --dtl-tip-border:rgba(255,255,255,.14);
  --dtl-tip-fg:#f2f4f7;
  --dtl-tip-fg-dim:#a8b0ba;

  /* ── 圆角（宿主真值 4/8/12）───────────────────────────────────── */
  --dtl-radius-xs:var(--dsw-radius-xs,4px);
  --dtl-radius-sm:var(--dsw-radius-sm,8px);
  --dtl-radius-md:var(--dsw-radius-md,12px);

  /* ── 间距四拍（只许这四档）────────────────────────────────────── */
  --dtl-space-1:4px;
  --dtl-space-2:8px;
  --dtl-space-3:12px;
  --dtl-space-4:16px;

  /* ── 字号 / 行高（直绑宿主字号族 11/12/13/14/16）──────────────── */
  --dtl-font-xs:var(--dsw-font-xxxs-11-font-size,11px);
  --dtl-font-sm:var(--dsw-font-xxs-12-font-size,12px);
  --dtl-font-md:var(--dsw-font-xs-13-font-size,13px);
  --dtl-font-lg:var(--dsw-font-s-14-font-size,14px);
  --dtl-font-xl:var(--dsw-font-base-16-font-size,16px);
  --dtl-line-xs:var(--dsw-font-xxxs-11-line-height,14px);
  --dtl-line-sm:var(--dsw-font-xxs-12-line-height,18px);
  --dtl-line-md:var(--dsw-font-xs-13-line-height,20px);
  /* 统计卡主数字：宿主字号族最大 16px，看板主数字要更大 ⇒ 单开一档（别处不许直接写 px） */
  --dtl-font-stat:26px;

  /* ── 统计卡固定高度（用户 2026-10-29 定）────────────────────────
     卡高**只由这一条决定**，不跟内容走：小字缺行 / 小字凑巧换行都不改卡高。
     算式 = 三行正文（标签 18 + 数字 26×1.15 + 小字 14）+ 上下 padding 24 + 两处 gap 8，
     也就是三行都满时的自然高度 ⇒ 视觉与旧版一致，但不再被文字挤动。 */
  --dtl-stat-h:calc(var(--dtl-space-3) * 2 + var(--dtl-line-sm) + var(--dtl-line-xs) + 1.15 * var(--dtl-font-stat) + var(--dtl-space-1) * 2);

  /* ── 身份卡「名字」那一行的高度（用户 2026-11-02）──────────────────
     名字文字与改名输入框**必须同高**：点开不许把下面的 ID / 按钮顶下去。
     取核心控件 md 档（28px），正好等于核心 Input 的 md 档。 */
  --dtl-name-h:var(--dshpc-control-h-md,28px);

  /* ── 动效 ────────────────────────────────────────────────────── */
  --dtl-dur-fast:var(--ds-transition-duration-fast,.12s);
  --dtl-ease:var(--ds-ease-in-out,cubic-bezier(.4,0,.2,1));
}

/* ── 明暗差异的唯一落点 ─────────────────────────────────────────
   只放 alias 表达不了的固定面 / 半透明底；颜色若能靠 alias 自动跟随，一律不写在这里。 */
body[data-ds-dark-theme]{
  /* 暗色下蓝要更亮、透明度更高才压得住深底 */
  --dtl-card-hover:rgba(96,165,250,.13);
  /* 暗底上掺白 8% 太浅 ⇒ 提到 12%，仍与卡面同族（不是另一套皮肤） */
  --dtl-btn-soft:color-mix(in srgb,var(--dtl-fg) 12%,var(--dtl-surface-1));
  /* 语义色浅底在深色下压到 12% / 5%（8% 在深底上偏重） */
  --dtl-business-soft:color-mix(in srgb,var(--dtl-business) 12%,transparent);
  --dtl-danger-soft:color-mix(in srgb,var(--dtl-danger) 5%,transparent);
  --dtl-success-soft:color-mix(in srgb,var(--dtl-success) 14%,transparent);
}
`;

/**
 * 业务壳样式（L2）：核心控件（Button / IconButton / Input / Picker / Segmented / Chip /
 * StripCard）自己的皮肤全在 core，本文件**不再重写任何控件外观**——只留本插件独有的
 * 容器类。颜色 / 圆角 / 字号一律只消费 `var(--dtl-*)`。
 */
export const UI_CONTROLS_CSS = `
/* 容器外框（底 / 边框 / 圆角 / 内距）**一律交核心 Surface**（2026-11-01）：
   旧的 .dtl-card / .dtl-card--pad 已删除，页面里不再有任何自绘外框。 */
.dtl-ellipsis{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

/* ── 设置页（2026-11-01 改版：上半左「人」右「流程小图」，下半台账表格）──
   上半是一张 2 列 hero 卡；窄面板（<760px）自动落成一列，不做横向滚动。 */
.dtl-set{display:flex;flex-direction:column;gap:var(--dtl-space-3);min-width:0;}
.dtl-set__title{font-size:var(--dtl-font-md);line-height:var(--dtl-line-md);font-weight:600;}
.dtl-set__hint{font-size:var(--dtl-font-sm);line-height:var(--dtl-line-sm);color:var(--dtl-fg-3);
  margin-top:var(--dtl-space-1);}
.dtl-set__error{font-size:var(--dtl-font-sm);line-height:var(--dtl-line-sm);color:var(--dtl-danger);
  margin-top:var(--dtl-space-2);}
.dtl-set__body{margin-top:var(--dtl-space-3);}
.dtl-set__head{display:flex;align-items:flex-start;justify-content:space-between;
  gap:var(--dtl-space-3);flex-wrap:wrap;}

/* hero：左栏**定宽 320px**（用户 2026-11-01：别跟着窗口伸缩），右栏吃掉剩下的宽度。
   两侧**等高**（用户 2026-11-01：右边流程要跟左边身份卡一样高）：
   行高取两侧较高者，左右子项都 flex:1 撑满 ⇒ 左卡跟着右边长、右边也跟着卡片长，永远齐平。 */
.dtl-hero{display:grid;grid-template-columns:320px minmax(0,1fr);
  gap:var(--dtl-space-3);align-items:stretch;}
.dtl-hero__col{display:flex;flex-direction:column;gap:var(--dtl-space-3);min-width:0;}
.dtl-hero__col > *{flex:1 1 auto;}
.dtl-hero__flow{display:flex;min-width:0;}
.dtl-hero__flow > *{flex:1 1 auto;}
/* 身份卡通高：Card 本体与它的 body 都要跟着长，左缘色条（align-self:stretch）才会 100% 高。
   只给卡设 flex 不够 —— body 是块的，色条只会跟内容一样高（用户 2026-11-02 抓到的就是这条）。 */
.dtl-hero__col .dshpc-card{display:flex;flex-direction:column;}
.dtl-hero__col .dshpc-card__body{flex:1 1 auto;}
@media (max-width:760px){
  .dtl-hero{grid-template-columns:minmax(0,1fr);}
}

/* 身份块：**立式**（用户 2026-11-01）—— 头像在上，下面依次是名字 / ID / 按钮，整体居中 */
.dtl-profile{display:flex;flex-direction:column;align-items:center;text-align:center;
  gap:var(--dtl-space-2);min-width:0;padding:var(--dtl-space-2) 0;}
/* 头像圆：**要有底色**（白卡上再填白就看不见圆了，用户 2026-11-01）；
   底色与字色跟状态走：有身份 = 绿，没身份 = 红。
   字号取 26 档（token 里的最大档）：中文首字 / 单个字母在圆里都压得住。 */
.dtl-avatar{flex:none;width:64px;height:64px;border-radius:50%;display:flex;
  align-items:center;justify-content:center;font-size:var(--dtl-font-stat);font-weight:600;
  line-height:1;color:var(--dtl-success);background:var(--dtl-success-soft);text-transform:uppercase;}
.dtl-avatar--empty{color:var(--dtl-danger);background:var(--dtl-danger-soft);}
.dtl-profile__main{display:flex;flex-direction:column;align-items:center;gap:var(--dtl-space-1);
  min-width:0;width:100%;}
.dtl-profile__name{font-size:var(--dtl-font-xl);line-height:var(--dtl-line-md);font-weight:600;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
/* 名字行与改名输入框**同高**（用户 2026-11-02：点开时那一行不许位移，别的东西也不许被顶动）。
   两态共用 --dtl-name-h，谁出现都不改变行高；Input 走 md 档正好填满。 */
.dtl-profile__nameline,.dtl-profile__editor{display:flex;align-items:center;justify-content:center;
  height:var(--dtl-name-h);max-width:100%;min-width:0;}
.dtl-profile__nameline{font-size:var(--dtl-font-xl);line-height:var(--dtl-line-md);font-weight:600;}
.dtl-profile__nametext{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
/* 编辑态：输入框吃掉整行宽度 */
.dtl-profile__editor{width:100%;}
.dtl-profile__editor > *{flex:1 1 auto;min-width:0;}
.dtl-profile__uuid{font-size:var(--dtl-font-sm);line-height:var(--dtl-line-sm);
  color:var(--dtl-fg-3);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  word-break:break-all;}
.dtl-profile__hint{font-size:var(--dtl-font-sm);line-height:var(--dtl-line-sm);color:var(--dtl-fg-2);}
.dtl-acts{display:flex;align-items:center;gap:var(--dtl-space-2);flex:0 0 auto;flex-wrap:wrap;}
/* 身份卡的按钮排与上面文字拉开（用户 2026-11-01：要 1.5~2 倍）——
   原间距 = 外层 flex gap 4 + 这里 4 = 8px，现在 4 + 12 = 16px（2 倍，间距只许用四拍档位）。 */
.dtl-profile__main .dtl-acts{margin-top:var(--dtl-space-3);justify-content:center;}

/* 三步说明（用户 2026-11-02）：一个大框（核心 Surface）里三格并排，中间用**虚线 + 圆箭头节点**分隔。
   每块：图标徽标（左，三格三种颜色）+ 圈数字（右）→ 小标题 → 一条条要点（行间极淡细线，不画小框）。
   分隔线是**真实元素**（.dtl-flow__sep），不靠伪元素 —— 用户那边伪元素没出来过。
   圆用 SVG <circle>，箭头用官方 chevron 图标（用户 2026-11-02：手画箭头太丑）。
   整块撑满右栏高度 ⇒ 与左边身份卡等高。 */
.dtl-flow__frame{--dtl-flow-pad:calc(var(--dtl-space-3) * 2.5);}
.dshpc-surface.dtl-flow__frame{flex:1 1 auto;min-height:0;min-width:0;display:flex;}
.dtl-flow__grid{display:grid;align-items:stretch;
  grid-template-columns:minmax(0,1fr) 1px minmax(0,1fr) 1px minmax(0,1fr);
  flex:1 1 auto;min-height:0;min-width:0;}
/* 左右内距（用户 2026-11-02：至少 2~2.5 倍，比上一版的 12px 拉大） */
.dtl-flow__cell{display:flex;flex-direction:column;align-items:flex-start;
  gap:var(--dtl-space-3);padding:var(--dtl-space-4) var(--dtl-flow-pad);
  box-sizing:border-box;min-width:0;}
/* 分隔：1px 宽的列，线由自己的 border-left 画（上下各留 20px），圆箭头节点绝对定位骑在线上。 */
.dtl-flow__sep{position:relative;align-self:stretch;justify-self:center;width:0;
  margin:20px 0;border-left:1px dashed var(--dtl-border);}
.dtl-flow__sep .dtl-flow__node{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  width:32px;height:32px;display:flex;align-items:center;justify-content:center;}
.dtl-flow__sep .dtl-flow__node .dtl-flow__ring{position:absolute;inset:0;}
/* 底色必须是**不透明**的：--dtl-chip-strong 带透明，骑在虚线上会透出线来。
   这里把「13% fg 叠在面板底上」的结果直接算成实色（color-mix 出不透明结果），
   与 1/2/3 徽标同观感，又能压过虚线。 */
.dtl-flow__sep .dtl-flow__node .dtl-flow__ring circle{
  fill:color-mix(in srgb,var(--dtl-fg) 13%,var(--dtl-surface-1));stroke:none;}
/* 箭头 = 一根横杆 + 一个右向尖头（单个 path 描边，不填充）；坐标已几何居中 */
.dtl-flow__sep .dtl-flow__node .dtl-flow__arrow{fill:none;stroke:var(--dtl-fg);
  stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
/* 顶行：图标徽标在左、圈数字在右 */
.dtl-flow__top{display:flex;align-items:center;justify-content:space-between;
  gap:var(--dtl-space-2);width:100%;}
.dtl-flow__icon{flex:none;display:inline-flex;align-items:center;justify-content:center;
  width:32px;height:32px;border-radius:var(--dtl-radius-sm);}
.dtl-flow__icon--business{background:var(--dtl-business-soft);color:var(--dtl-business);}
.dtl-flow__icon--warning{background:var(--dtl-warning-soft);color:var(--dtl-warning);}
.dtl-flow__icon--success{background:var(--dtl-success-soft);color:var(--dtl-success);}
.dtl-flow__num{flex:none;display:inline-flex;align-items:center;justify-content:center;
  width:26px;height:26px;box-sizing:border-box;border-radius:9999px;
  background:var(--dtl-chip-strong);font-size:var(--dtl-font-sm);font-weight:600;
  line-height:1;color:var(--dtl-fg-2);}
.dtl-flow__name{font-size:var(--dtl-font-md);line-height:var(--dtl-line-md);font-weight:600;color:var(--dtl-fg);}
/* 要点列表：一条一条，行间极淡细线，没有边框和底色 */
.dtl-flow__list{width:100%;margin:0;padding:0;list-style:none;display:flex;flex-direction:column;}
/* min-width:0 是跑马灯省略号的必要条件：flex/grid 子项默认按内容撑宽，不压就截不掉。 */
.dtl-flow__item{padding:var(--dtl-space-2) 0;font-size:var(--dtl-font-sm);min-width:0;
  line-height:var(--dtl-line-sm);color:var(--dtl-fg-2);}
.dtl-flow__item + .dtl-flow__item{border-top:1px solid var(--dtl-border-faint);}
/* 三格等高（用户 2026-11-02）：内容块吃掉格子剩余高度、内部两端分布 ⇒ 三格底部对齐。
   内容块宽度 100% 覆盖 cell 的 align-items:flex-start。 */
.dtl-flow__cell > :last-child{flex:1 1 auto;min-height:0;}
.dtl-flow__body,.dtl-flow__list{justify-content:space-between;}
/* 内容块（lead / 列表 / 代码框）竖向堆叠 */
.dtl-flow__body{display:flex;flex-direction:column;gap:var(--dtl-space-2);width:100%;min-width:0;}
/* 说明文字一律单行：放不下就三个点（用户 2026-11-02：所有文字不折行，三格高度才守得住）。 */
.dtl-flow__lead{font-size:var(--dtl-font-sm);line-height:var(--dtl-line-sm);color:var(--dtl-fg-2);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;}
/* 说明小字（安装格：其他 Agent 的安装 Skill） */
.dtl-flow__sub{font-size:var(--dtl-font-xs);line-height:var(--dtl-line-sm);color:var(--dtl-fg-3);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;}
/* 安装命令 + 复制按钮：外框是核心 Surface（圆角契约唯一真源，别手搓 border + radius），
   这里只管横向排布。 */
.dshpc-surface.dtl-flow__code{display:flex;align-items:center;gap:var(--dtl-space-2);
  width:100%;box-sizing:border-box;}
.dtl-flow__cmd{flex:1 1 auto;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:var(--dtl-font-sm);color:var(--dtl-fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
/* 右侧两个图标按钮（GitHub / npm）：不参与拉伸，各自保持图标钮的方形尺寸 */
.dtl-flow__code > button{flex:none;}
/* 窄面板：三格落成一列，分隔转横向（必须写在基础分隔规则之后，同权重靠顺序取胜） */
@media (max-width:900px){
  .dtl-flow__grid{grid-template-columns:minmax(0,1fr);}
  .dtl-flow__sep{width:auto;height:0;margin:0 var(--dtl-flow-pad);
    border-left:0;border-top:1px dashed var(--dtl-border);}
  /* 落成一列时箭头朝下：整枚 ring 转 90°（圆对称，箭头与右移量一起转朝下） */
  .dtl-flow__sep .dtl-flow__node .dtl-flow__ring{transform:rotate(90deg);}
}

/* 台账目录：表格式（有表头行），比「一行塞四样」清楚 */
.dtl-tbl{display:flex;flex-direction:column;min-width:0;}
.dtl-tbl__head,.dtl-tbl__row{display:grid;
  grid-template-columns:minmax(0,1fr) minmax(0,1.5fr) 92px 132px;
  gap:var(--dtl-space-3);align-items:center;padding:var(--dtl-space-2) var(--dtl-space-2);}
.dtl-tbl__head{font-size:var(--dtl-font-sm);line-height:var(--dtl-line-sm);color:var(--dtl-fg-3);
  background:var(--dtl-table-head-bg);border-radius:var(--dtl-radius-xs);}
.dtl-tbl__row{border-top:1px solid var(--dtl-border-faint);}
.dtl-tbl__row:hover{background:var(--dtl-table-row-hover);}
.dtl-tbl__cell{min-width:0;font-size:var(--dtl-font-md);line-height:var(--dtl-line-md);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
/* 路径本身就是复制钮（排障第一个问题：这是哪个目录） */
.dtl-tbl__path{min-width:0;padding:0;border:0;background:none;cursor:pointer;text-align:left;
  font-size:var(--dtl-font-sm);line-height:var(--dtl-line-sm);color:var(--dtl-fg-3);
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.dtl-tbl__path:hover{color:var(--dtl-business);text-decoration:underline;}
.dtl-tbl__edit{display:flex;align-items:center;gap:var(--dtl-space-2);
  padding:var(--dtl-space-2);border-top:1px solid var(--dtl-border-faint);}

/* 身份表：名字列单行，超长省略（表格是定宽列，换行会把行高撑歪） */
.dtl-roster__name{display:block;min-width:0;font-size:var(--dtl-font-md);
  line-height:var(--dtl-line-md);color:var(--dtl-fg);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
/* 弹窗页脚：左边放进行中的骨架（删除要逐本台账走网络，慢），右边是「创建新用户」组合框。
   组合框靠 style 里的 margin-left:auto 贴右 —— 这里不用 space-between，否则只有一个子元素时会跑到左边。 */
.dtl-modal__foot{display:flex;align-items:center;gap:var(--dtl-space-3);width:100%;}
.dtl-modal__busy{flex:none;display:flex;align-items:center;min-width:56px;}
/* 身份表不要表头（用户 2026-11-02）：核心 Table 没有「隐藏表头」的档，只能把 thead 藏掉 */
.dtl-users-table thead{display:none;}
/* 身份表顶满弹窗正文（用户 2026-11-02）：四周不留白 ⇒ 用负 margin 抵消核心 body 的
   padding（17px 18px，核心没开变量，只能写死；核心改内距这里要跟着改）。 */
.dtl-users__wrap{margin:-17px -18px;}
/* 「使用」+ 删除：右对齐两个并排按钮 */
.dtl-users__acts{display:flex;align-items:center;justify-content:flex-end;
  gap:var(--dtl-space-1);}
/* 行与行之间的间隔线改虚线（用户 2026-11-02）：只换线型，颜色 / 宽度沿用核心。
   核心那条是 4 个类（.dshpc-table--plain .row + .row .cell）⇒ 这里必须也到 5 个类才压得住
   （同权重拼不过注入顺序：核心样式在组件首渲染时注入，晚于本文件）。 */
.dtl-users__wrap .dshpc-table--plain .dshpc-table__row + .dshpc-table__row .dshpc-table__cell{
  border-top-style:dashed;}
.dtl-form{display:flex;align-items:center;gap:var(--dtl-space-2);margin-top:var(--dtl-space-2);}
.dtl-form__grow{flex:1 1 auto;min-width:0;}

@media (prefers-reduced-motion: reduce){
  .dshpc-surface.dtl-stat{transition:none;}
}
`;
