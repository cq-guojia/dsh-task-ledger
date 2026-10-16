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
export const UI_TOKENS_CSS = `
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
`
