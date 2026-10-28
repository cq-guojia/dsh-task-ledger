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
  --dtl-danger-soft:color-mix(in srgb,var(--dtl-danger) 8%,transparent);

  /* ── 交互底 ──────────────────────────────────────────────────── */
  /* 卡 / 行 hover 高亮：淡蓝（灰高亮在卡底上几乎看不出来） */
  --dtl-card-hover:rgba(37,99,235,.07);

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

  /* ── 动效 ────────────────────────────────────────────────────── */
  --dtl-dur-fast:var(--ds-transition-duration-fast,.12s);
  --dtl-ease:var(--ds-ease-in-out,cubic-bezier(.4,0,.2,1));
}

/* ── 明暗差异的唯一落点 ─────────────────────────────────────────
   只放 alias 表达不了的固定面 / 半透明底；颜色若能靠 alias 自动跟随，一律不写在这里。 */
body[data-ds-dark-theme]{
  /* 暗色下蓝要更亮、透明度更高才压得住深底 */
  --dtl-card-hover:rgba(96,165,250,.13);
  /* 语义色浅底在深色下压到 12% / 5%（8% 在深底上偏重） */
  --dtl-business-soft:color-mix(in srgb,var(--dtl-business) 12%,transparent);
  --dtl-danger-soft:color-mix(in srgb,var(--dtl-danger) 5%,transparent);
}
`;

/**
 * 业务壳样式（L2）：核心控件（Button / IconButton / Input / Picker / Segmented / Chip /
 * StripCard）自己的皮肤全在 core，本文件**不再重写任何控件外观**——只留本插件独有的
 * 容器类。颜色 / 圆角 / 字号一律只消费 `var(--dtl-*)`。
 */
export const UI_CONTROLS_CSS = `
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
