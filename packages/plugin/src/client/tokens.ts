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
export const UI_TOKENS_CSS = `
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
 * 控件皮肤（L2）：**一类控件唯一实现**，抄 dispatch 表 controls-css 的规矩——
 * 只消费 var(--dtl-*)，一个颜色 / 尺寸 / 圆角 / 字号字面量都不许出现；
 * 高度只取三档，有边框的变体用 1px 真边框 + 内部 padding 补回 ⇒ 有边 / 无边同高。
 */
export const UI_CONTROLS_CSS = `
/* ── 分段控件（滑动块）：已改由核心 Segmented 承担，外观 / 尺寸 / 滑块动画全部在 core，
   本文件不再写任何分段控件样式（core 0.5.0 起删掉 variant 轴，外观只有一套）。── */

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
.dtl-input{box-sizing:border-box;width:100%;border:1px solid var(--dtl-border);border-radius:var(--dtl-radius-md);
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
