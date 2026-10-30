/**
 * UI 基础层：样式单源 + 薄包裹（**一类控件只有一份实现**）。
 *
 * 纪律（用户 2026-10-28：「以后就全用我们的核心空间库」）：
 *  1. **控件一律来自 `dsh-plugin-core/ui`**（Button / IconButton / Input / Picker /
 *     Segmented / Chip / StripCard），本文件只做「本插件需要的形状」薄包裹，
 *     **不再自绘任何控件皮肤**——旧的 `.dtl-btn / .dtl-input / .dtl-select` 等一套已删除；
 *  2. **样式**：颜色 / 圆角 / 字号一律 `var(--dtl-*)`（定义只在 tokens.ts），
 *     业务文件不许再写第二份 `var(--dsw-*)`、不许自造 `--dtl-*`；
 *  3. 官方 primitives 只留「官方做得更好」的（Tooltip / MarkdownText / 图标）。
 */

import {
	IconSearchOutlineRegular,
	Tooltip,
} from "@deepseek-ai/dsh-client-ui-primitives";
import {
	Button as CoreButton,
	Chip as CoreChip,
	IconButton as CoreIconButton,
	Input as CoreInput,
	Picker as CorePicker,
	type PickerGroup,
	Loader as CoreLoader,
	Segmented as CoreSegmented,
	showLoading as CoreShowLoading,
	type LoadingHandle,
} from "dsh-plugin-core/ui";
import { type CSSProperties, createElement as h, type ReactNode } from "react";
import { UI_CONTROLS_CSS, UI_TOKENS_CSS } from "./tokens";

/** 基础层样式（tokens + 业务容器类；幂等注入）。 */
const UI_BASE_CSS = `
/* 统计卡：8 块（2×4）+ 右图表卡位
   ⚠️ 卡高 = --dtl-stat-h 定死，**不跟内容走**（用户 2026-10-29）：小字缺行、小字换行
   都不许改卡高，否则两个页面的卡一错位就被一眼看出来。文字一律贴顶（不用居中：
   缺小字时居中的卡会显得空）。 */
.dtl-stat{display:flex;flex-direction:column;justify-content:flex-start;gap:var(--dtl-space-1);
  height:var(--dtl-stat-h);box-sizing:border-box;overflow:hidden;
  padding:var(--dtl-space-3) var(--dtl-space-4);text-align:left;}
/* 三行文字各自的行高必须显式写死，--dtl-stat-h 的算式才对得上（别让行高继承宿主） */
.dtl-stat__label{font-size:var(--dtl-font-sm);line-height:var(--dtl-line-sm);color:var(--dtl-fg-2);}
.dtl-stat__value{font-size:var(--dtl-font-stat);font-weight:600;line-height:1.15;font-variant-numeric:tabular-nums;}
/* 大数字后面紧跟的小字（历史页「28 完成 27 · 取消 1」那行）：基线对齐、不参与大字号 */
.dtl-stat__main{display:flex;align-items:baseline;gap:var(--dtl-space-2);min-width:0;}
.dtl-stat__sub{font-size:var(--dtl-font-xs);font-weight:400;line-height:var(--dtl-line-xs);
  color:var(--dtl-fg-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}
/* 小字锁单行：卡高定死，换行会被 overflow 裁掉 ⇒ 宁可省略号 */
.dtl-stat__hint{font-size:var(--dtl-font-xs);line-height:var(--dtl-line-xs);color:var(--dtl-fg-3);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

/* 局部加载：核心 Loader（三块脉动）居中，只占没数据的那一块，不盖整页 */
.dtl-loading{display:flex;align-items:center;justify-content:center;padding:var(--dtl-space-4) 0;}

/* 统计区整体：左 8 块（2 行 × 4 列）+ 右图表卡，参考图同款分栏。
   ⚠️ 列数写死 4 → 2，绝不给 3：3 列会排出 3+1 的非对称（用户 2026-10-17）。
   行高也定死成 --dtl-stat-h（不是 1fr）⇒ 行不随内容涨，卡与卡之间永远等高。
   两侧等高仍由 .dtl-stats 的 stretch + 图卡 height:100% 保证。 */
.dtl-stats{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:var(--dtl-space-3);align-items:stretch;}
.dtl-stats__cards{display:grid;grid-auto-flow:column;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:repeat(2,var(--dtl-stat-h));
  gap:var(--dtl-space-3);}
@media (max-width:960px){.dtl-stats{grid-template-columns:minmax(0,1fr);}}
@media (max-width:640px){.dtl-stats__cards{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(4,var(--dtl-stat-h));}}

/* ── 历史页顶部：图表卡在左、4 块数显在右（今天 / 本周 / 本月 / 本季度）──────
   2 列 × 2 行，块高 = --dtl-stat-h（与待办页统计卡同高，总高不变）；
   块宽 = 高 × 1.92（用户 2026-10-30 两次加宽），样式直接吃待办页那套 .dtl-stat，不另写皮肤。 */
.dtl-stats--history{grid-template-columns:minmax(0,1fr) auto;}
.dtl-stats--history .dtl-stats__cards{grid-auto-flow:row;
  grid-template-columns:repeat(2,calc(var(--dtl-stat-h) * 1.92));
  grid-template-rows:repeat(2,var(--dtl-stat-h));}
@media (max-width:960px){.dtl-stats--history{grid-template-columns:minmax(0,1fr);}}

/* 历史日柱：柱间距 2px、悬停虚线框 + 浮卡。
   翻页按钮**飘**在图区右上角（绝对定位，不单独占一行）——压在柱子上也无妨（用户 2026-10-29）。 */
/* z-index:1 同趋势图：浮卡要被下方那排 input / select 压着还是压过去，全靠这层 */
.dtl-hist{position:relative;z-index:1;height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:var(--dtl-space-2);
  /* 单列（≤960）时 height:100% 解析成 auto，光靠 flex 撑不出高度 ⇒ 用右侧两行卡的总高兜底，
     两栏并排时这个值恰好等于 stretch 给的高度，等于没改 */
  min-height:calc(var(--dtl-stat-h) * 2 + var(--dtl-space-3));
  /* 上边共多留 25px（用户 2026-10-30：10 + 10 + 5）：border-box + 卡高不变 ⇒
     压的是图区，外框高度一点没变 */
  padding:calc(var(--dtl-space-3) + 25px) var(--dtl-space-4) var(--dtl-space-3);}
.dtl-hist__nav{position:absolute;top:var(--dtl-space-2);right:var(--dtl-space-3);z-index:2;
  display:flex;gap:var(--dtl-space-2);}
/* 翻页箭头 = 「有底、无边框」款（用户 2026-10-30）：核心 IconButton 没有「实心无描边」这一档
   （plain 无底 / outline 有底带边）⇒ 这里给它换底、把描边抹平。底取 --dtl-btn-soft（不透明，
   压得住下面的刻度线）。hover 仍走核心那档灰底；disabled 的弱化改用 fg-dim 字色表达。 */
.dtl-hist__nav .dshpc-iconbtn{background:var(--dtl-btn-soft);border-color:transparent;}
.dtl-hist__nav .dshpc-iconbtn:disabled{opacity:1;color:var(--dtl-fg-dim);}
.dtl-hist__plot{position:relative;flex:1 1 auto;min-height:0;}
/* 刻度线四档：顶/底实线，中间两条虚线（用户 2026-10-29：中间要有两根刻度线） */
.dtl-hist__grid{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;pointer-events:none;}
.dtl-hist__gridline{border-top:1px solid var(--dtl-border);}
.dtl-hist__gridline--dashed{border-top-style:dashed;}
.dtl-hist__gridline--base{border-top-color:var(--dtl-border-strong);}
/* 顶部那条不画（它正好从右上角那排控件后面穿过）⇒ 留一个等距占位，让下面的线仍落在
   ¾ / ½ / ¼ / 0 四档刻度上，与 y 轴五个数字一一对应 */
.dtl-hist__gridline--none{border-top:none;}
.dtl-hist__cols{position:absolute;inset:0;display:flex;justify-content:flex-start;gap:2px;}
.dtl-hist__col{position:relative;flex:none;display:flex;flex-direction:column;justify-content:flex-end;
  transition:filter var(--dtl-dur-fast) var(--dtl-ease);}
.dtl-hist__col:hover{filter:brightness(1.1);}
.dtl-hist__col:hover::after{content:"";position:absolute;inset:0;border:1px dashed var(--dtl-fg-3);
  border-radius:var(--dtl-radius-xs);pointer-events:none;}
/* 柱体：顶端两角 2px 圆角（底端贴基线保持直角）；overflow 把内部分段的方角裁成圆角
   （与首页趋势图的柱子**同一套**：父级圆角 + overflow 裁切 + ::after 斜纹，见 .dtl-chart-stripe） */
.dtl-hist__bar{position:relative;width:100%;display:flex;flex-direction:column-reverse;
  border-radius:2px 2px 0 0;overflow:hidden;
  /* 入场：柱子从基线逐列升起来（只动 transform，不碰高度 ⇒ 不动布局、不影响 hover 命中）。
     延迟取列上内联的 --lc-d：**整屏错峰总时长固定 120ms**，由 JS 按「第几列 / 共几列」算好
     （原来按列序号 ×24ms 累加、还封了 20，宽屏上就变成「前 20 根慢慢来、后面一批同时冒」，
     看着像分批出现 —— 用户 2026-10-30 抓到的问题）。
     backwards 必须：延迟期间先停在起始帧，否则会先满怀高度再闪回 0。 */
  transform-origin:bottom;
  animation:dtl-bar-in .3s var(--dtl-ease) backwards;
  animation-delay:var(--lc-d,0ms);}
@keyframes dtl-bar-in{from{transform:scaleY(0);}to{transform:scaleY(1);}}
@media (prefers-reduced-motion: reduce){.dtl-hist__bar{animation:none;}}
/* 浮卡：日期 → 新建任务 → 结案任务（总计）→ 虚线 → 明细（一工作区一行），0 值不列。
   恒在柱子**下方**：上方会被图表顶边挤出屏幕、hover 判定又带来闪跳（用户 2026-10-29 都放下面）；
   top 让出 6px 间隙 + 12px 的 x 轴日期行，不压刻度。
   底色取 --dtl-tip-bg（掺一档前景色的浅灰）：纯卡底色在浅色主题下跟白底糊住、边界看不清
   （用户 2026-10-30 试过官方 Tooltip 又退回自绘，就是为了这个底色）。 */
.dtl-hist__tip{position:absolute;left:50%;top:calc(100% + 18px);z-index:3;transform:translateX(-50%);
  padding:var(--dtl-space-2);border:1px solid var(--dtl-tip-border);border-radius:var(--dtl-radius-sm);
  background:var(--dtl-tip-bg);white-space:nowrap;font-size:var(--dtl-font-xs);line-height:1.5;
  color:var(--dtl-tip-fg);opacity:0;pointer-events:none;transition:opacity var(--dtl-dur-fast) var(--dtl-ease);}
.dtl-hist__col:hover .dtl-hist__tip{opacity:1;}
.dtl-hist__tip-date{color:var(--dtl-tip-fg-dim);font-variant-numeric:tabular-nums;}
.dtl-hist__tip-row{display:flex;align-items:center;gap:var(--dtl-space-1);
  font-variant-numeric:tabular-nums;}
/* 总计行（结案任务）：加粗，它是明细之和，不属于任何一个工作区颜色 */
.dtl-hist__tip-total{display:flex;align-items:center;gap:var(--dtl-space-1);
  font-weight:600;font-variant-numeric:tabular-nums;}
/* 总计与明细之间的分隔虚线（用户 2026-10-30） */
.dtl-hist__tip-sep{border-top:1px dashed var(--dtl-tip-border);margin:var(--dtl-space-1) 0;
  height:0;}
.dtl-hist__tip-dot{display:inline-block;width:8px;height:8px;flex:none;}
/* 总计行的图例块：8×8 方块里几条**横向**色带上下等分（与柱子的分段同向） */
.dtl-hist__tip-dot--split{display:inline-flex;flex-direction:column;overflow:hidden;}
.dtl-hist__tip-dot--split > span{flex:1 1 0;min-height:0;}
.dtl-hist__tip-count{margin-left:auto;padding-left:var(--dtl-space-3);color:var(--dtl-tip-fg);}
/* x 轴日期行：高度定死 10px（文字绝对定位，不吃行高），首末钳制靠内联 left / right */
.dtl-hist__labels{display:flex;gap:2px;margin-top:2px;flex:none;height:10px;}
/* 新增量曲线：铺满 plot 的 SVG，0-100 百分比坐标（preserveAspectRatio:none 拉伸），
   non-scaling-stroke 保证线宽不随拉伸变形；只描边不填充，色与趋势图「新增」同源 */
.dtl-hist__line{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;}
.dtl-hist__line polyline{fill:none;stroke:var(--dtl-chart-added);stroke-width:1.5;
  vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round;}
.dtl-hist__label{position:relative;flex:none;font-size:10px;line-height:1;color:var(--dtl-fg-3);
  font-variant-numeric:tabular-nums;}
/* 日期文字以列中心为锚点向两侧展开（用户 2026-10-30：不从卡片最左 / 最右起排）；
   首列 / 末列由内联 left / right 钳回边界内 */
.dtl-hist__label > span{position:absolute;top:0;left:50%;transform:translateX(-50%);white-space:nowrap;}

/* ── 趋势图（首页右上卡：每周两根柱 + 新增曲线；2026-10-30 改版，画法对齐历史页）──────
   柱高是百分比 ⇒ 祖先链必须有**确定高度**（卡 height:100% → body flex:1 → plot 绝对铺满）；
   2026-10-17 真机教训：百分比高度没有确定父高时整列柱消失，只剩数字。 */
/* position:relative 是给右上角那对「飘」着的翻页箭头当定位上下文（浮卡已改官方 Tooltip 的
   传送门，不再需要 z-index）。
   上下留白不对称（用户 2026-10-30：图例离顶太远、离图太近）⇒ 顶 10 / 图例与图之间 12。 */
/* position:relative 既给右上角那对「飘」着的翻页箭头当定位上下文，也配合 z-index:1 —— 浮卡是
   卡里的绝对定位子元素，不把整张卡抬成一层压过页面下方那排 input / select，就会被它们挡住
   （用户 2026-10-30 连报两次，别删这个 z-index）。 */
.dtl-trend{position:relative;z-index:1;height:100%;box-sizing:border-box;display:flex;
  flex-direction:column;gap:var(--dtl-space-3);
  padding:10px var(--dtl-space-4) var(--dtl-space-4);}
.dtl-trend__legend{display:flex;align-items:center;flex-wrap:wrap;gap:var(--dtl-space-3);
  font-size:var(--dtl-font-xs);color:var(--dtl-fg-3);}
/* 图例色块：直角方块，与柱子同一造型（用户 2026-10-29：不要圆角） */
.dtl-trend__dot{display:inline-block;width:8px;height:8px;margin-right:4px;border-radius:0;
  vertical-align:middle;}
/* 上下两半的色块（用户 2026-10-30）：上半 = 柱子里叠在上面那一段 ——
   已结案（取消红在上 / 完成蓝在下）、未结（进行中绿在上 / 待认领琥珀在下）。 */
.dtl-trend__dot--split{display:inline-flex;flex-direction:column;overflow:hidden;}
.dtl-trend__dot--split > span{flex:1 1 0;min-height:0;}
/* 「只看我的」：跟在图例后面（右侧那角留给翻页箭头，用户 2026-10-30） */
.dtl-trend__mine{display:inline-flex;align-items:center;gap:4px;cursor:pointer;
  font-size:var(--dtl-font-xs);color:var(--dtl-fg-3);}
.dtl-trend__mine input{margin:0;accent-color:var(--dtl-business);}
/* 翻页箭头：**飘**在卡片右上角（绝对定位，不跟图例挤一排 —— 放一排会把整排文字行撑高，
   用户 2026-10-30）；底取 --dtl-btn-soft（不透明，压得住下面的刻度线），与历史页同款 */
.dtl-trend__nav{position:absolute;top:var(--dtl-space-2);right:var(--dtl-space-3);z-index:2;
  display:flex;gap:var(--dtl-space-1);}
.dtl-trend__nav .dshpc-iconbtn{background:var(--dtl-btn-soft);border-color:transparent;}
.dtl-trend__body{flex:1 1 auto;min-height:0;display:flex;gap:var(--dtl-space-2);}
.dtl-trend__axis{display:flex;flex-direction:column;justify-content:space-between;flex:none;
  padding-bottom:12px;font-size:10px;line-height:1;text-align:right;font-variant-numeric:tabular-nums;
  color:var(--dtl-fg-3);}
.dtl-trend__plot{position:relative;flex:1 1 auto;min-width:0;}
/* 刻度线五档：顶部不画（正好从右上角控件后面穿过）、中间三档（¾ / ½ / ¼）**全虚线**、
   底部基线实线（用户 2026-10-30：中间的线都用虚线，不要实线） */
.dtl-trend__grid{position:absolute;inset:0;display:flex;flex-direction:column;
  justify-content:space-between;pointer-events:none;}
.dtl-trend__gridline{border-top:1px solid var(--dtl-border);}
.dtl-trend__gridline--dashed{border-top-style:dashed;}
.dtl-trend__gridline--none{border-top:none;}
.dtl-trend__gridline--base{border-top-color:var(--dtl-border-strong);}
/* 柱序居左、组宽固定（组宽 / 组间距由 trend-chart.ts 内联给，这里只管排布） */
.dtl-trend__cols{position:absolute;inset:0;display:flex;justify-content:flex-start;}
.dtl-trend__col{position:relative;flex:none;display:flex;flex-direction:column;justify-content:flex-end;
  transition:filter var(--dtl-dur-fast) var(--dtl-ease);}
.dtl-trend__col:hover{filter:brightness(1.1);}
/* hover：整组（两根柱）一个虚线框，不是一根一个（用户 2026-10-30） */
.dtl-trend__col:hover::after{content:"";position:absolute;inset:0;border:1px dashed var(--dtl-fg-3);
  border-radius:var(--dtl-radius-xs);pointer-events:none;}
.dtl-trend__bars{display:flex;align-items:flex-end;justify-content:flex-start;flex:1 1 auto;min-height:0;}
/* 柱宽**固定** 11.25px（= trend-chart.ts 的 BAR_W，组宽 / 一屏几周都按它算，改一处两边一起改）：
   某周没有未结时只剩一根柱，**不许被拉宽**（用户 2026-10-30）。柱顶 2px 圆角、非零柱 2px 下限。
   入场动画沿用历史页那套 transform（只动 transform，不碰高度 ⇒ 不动布局） */
.dtl-trend__bar{position:relative;flex:none;width:11.25px;min-height:2px;
  border-radius:2px 2px 0 0;overflow:hidden;
  transform-origin:bottom;animation:dtl-bar-in .3s var(--dtl-ease) backwards;
  animation-delay:var(--lc-d,0ms);}
@media (prefers-reduced-motion: reduce){.dtl-trend__bar{animation:none;}}
/* 结案柱 = 完成 business 蓝（用户 2026-10-30：绿的不好看）；未结柱底 = 待认领琥珀 */
.dtl-trend__bar--closed{background-color:var(--dtl-chart-done);}
.dtl-trend__bar--open{background-color:var(--dtl-chart-open);}
/* 叠在柱顶端的那一段（用户 2026-10-30）：结案柱顶 = 取消红、未结柱顶 = 进行中绿；圆角交给父级裁 */
.dtl-trend__seg{position:absolute;left:0;right:0;top:0;}
.dtl-trend__seg--cancelled{background-color:var(--dtl-danger);}
.dtl-trend__seg--doing{background-color:var(--dtl-chart-doing);}
/* 柱面斜纹：**两个图表共用这一条**（历史页 .dtl-hist__bar / 首页 .dtl-trend__bar）——
   一根柱铺一层 45° 覆盖层（伪元素画在最上面），不碰任何分段的底色，也不依赖谁先谁后；
   父级圆角 + overflow 裁切把覆盖层一起裁成圆角（用户 2026-10-30：同一个东西只留一种实现）。
   斜条 2px、条间（柱色本体）4px、透明度见 --dtl-chart-stripe */
.dtl-hist__bar::after,.dtl-trend__bar::after{content:"";position:absolute;inset:0;
  pointer-events:none;background-image:repeating-linear-gradient(45deg,
  var(--dtl-chart-stripe) 0 2px,transparent 2px 6px);}
/* x 轴日期行：高度定死 10px（文字绝对定位，不吃行高），首末钳制靠内联 left / right */
.dtl-trend__labels{display:flex;margin-top:2px;flex:none;height:10px;}
.dtl-trend__label{position:relative;flex:none;font-size:10px;line-height:1;color:var(--dtl-fg-3);
  font-variant-numeric:tabular-nums;}
.dtl-trend__label > span{position:absolute;top:0;left:50%;transform:translateX(-50%);white-space:nowrap;}
/* 新增量曲线：铺满 plot 的 SVG，0-100 百分比坐标（preserveAspectRatio:none 拉伸），
   non-scaling-stroke 保证线宽不随拉伸变形。
   z-index 2 ⇒ **压在柱子上面**（用户 2026-10-30），浮卡再高一层；线色走中性灰
   （柱子已经是蓝的，曲线再用蓝就分不清了） */
.dtl-trend__line{position:absolute;inset:0;z-index:2;width:100%;height:100%;pointer-events:none;}
.dtl-trend__line polyline{fill:none;stroke:var(--dtl-chart-line);stroke-width:1.5;
  vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round;}
/* hover 浮卡：恒在柱子**下方**（上方会被卡片顶边挤出屏幕）；深灰底 + 浅字同历史页 */
.dtl-trend__tip{position:absolute;left:50%;top:calc(100% + 18px);z-index:3;transform:translateX(-50%);
  padding:var(--dtl-space-2);border:1px solid var(--dtl-tip-border);border-radius:var(--dtl-radius-sm);
  background:var(--dtl-tip-bg);white-space:nowrap;
  font-size:var(--dtl-font-xs);line-height:1.5;color:var(--dtl-tip-fg);
  opacity:0;pointer-events:none;transition:opacity var(--dtl-dur-fast) var(--dtl-ease);}
.dtl-trend__col:hover .dtl-trend__tip{opacity:1;}
.dtl-trend__tip-row{font-variant-numeric:tabular-nums;}
/* 未结的拆分行：缩进 + 淡一档，读起来是「未结」的注脚 */
.dtl-trend__tip-row--sub{padding-left:10px;color:var(--dtl-tip-fg-dim);}
.dtl-trend__foot{font-size:var(--dtl-font-xs);color:var(--dtl-fg-3);}

/* 页面滚动到底的留白：实体块跟着内容走（滚到最底时最后一条卡不贴浏览器底边） */
.dtl-page-foot{height:24px;flex:none;}

/* 按工作区分组（用户 2026-10-30）：组头是核心 SectionHead（自带 12px 下边距），
   这里只补组与组之间的留白 —— 首个组不再多一层 */
.dtl-group + .dtl-group{margin-top:var(--dtl-space-4);}
/* 组头左侧的细竖线（替代图标）+ 组名后的分档条数（0 的档由 JS 直接不渲染，不占位） */
.dtl-group__rule{width:3px;height:14px;flex:none;background:var(--dtl-fg-3);
  border-radius:var(--dtl-radius-xs);}
.dtl-group__count{margin-left:var(--dtl-space-2);font-size:var(--dtl-font-xs);font-weight:400;
  color:var(--dtl-fg-3);white-space:nowrap;}
/* 组头整体右移 4px（与任务卡左缘留一点视觉差，用户 2026-10-30） */
.dtl-group__head{padding-left:var(--dtl-space-1);}

/* 任务行 = 一张卡（样式照抄 dispatch-table TaskCard：surface-1 底 + 1px 边框 + 左缘状态条；
   hover 只亮主行；右侧 时间⇄按钮排 互换） */
.dtl-taskrow{background:var(--dtl-surface-1);border:1px solid var(--dtl-border);
  border-radius:var(--dtl-radius-sm);margin-bottom:10px;}
.dtl-taskrow__row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:inherit;
  cursor:pointer;transition:background-color var(--dtl-dur-fast) var(--dtl-ease);}
.dtl-taskrow__row:hover{background:var(--dtl-card-hover);}

/* 状态条：贴卡片左缘、与正文两行等高的竖向色条（dispatch StatusRail 同款 6×36） */
.dtl-rail{display:inline-block;width:6px;height:36px;flex:none;border-radius:var(--dtl-radius-xs);}
.dtl-rail--doing{background:var(--dtl-success);}
.dtl-rail--backlog{background:var(--dtl-warning);}
.dtl-rail--overdue{background:var(--dtl-overdue);}
.dtl-rail--stale{background:var(--dtl-danger);}
.dtl-rail--open{background:var(--dtl-fg-3);}

/* 第一行：标题（上来就是标题）+ [YYYY-MM-DD 创建] 灰徽 + 异常 pill（baseline 对齐，dispatch 同款） */
.dtl-taskrow__l1{display:flex;align-items:baseline;gap:6px;min-width:0;}
.dtl-taskrow__title{font-size:var(--dtl-font-lg);font-weight:600;line-height:var(--dtl-line-md);min-width:0;flex:0 1 auto;}
.dtl-taskrow__stamp{flex:none;font-size:var(--dtl-font-xs);color:var(--dtl-fg-3);white-space:nowrap;
  font-variant-numeric:tabular-nums;}
/* 第二行小字：状态标签 · 异常标签 · #标签（行距拉开，用户 2026-10-17：第一二行别贴着） */
.dtl-taskrow__l2{display:flex;align-items:center;gap:var(--dtl-space-2);margin-top:6px;
  font-size:var(--dtl-font-sm);color:var(--dtl-fg-2);min-width:0;}
/* 右侧（用户 2026-10-28）：执行人名（常驻）/ 时间（hover 让位）/ 动作钮。
   hover 只收时间那一截，人名不动 —— 按钮出现时两者保持同一个 gap。
   人名走核心 Button 的 link 档（品牌蓝），这里不再有它的样式。 */
.dtl-taskrow__meta{flex:none;overflow:hidden;text-overflow:ellipsis;
  font-size:var(--dtl-font-xs);color:var(--dtl-fg-3);white-space:nowrap;
  font-variant-numeric:tabular-nums;}
.dtl-taskrow__actions{display:none;flex:none;gap:6px;align-items:center;}
.dtl-taskrow__row:hover .dtl-taskrow__meta{display:none;}
.dtl-taskrow__row:hover .dtl-taskrow__actions{display:inline-flex;}
/* 次级图标钮（复制 ID / 查看）：动作排里**常驻**，故比旁边那几个描边动作钮浅一档
   （用户 2026-10-28：灰一点、别抢眼）——灰字、无底无边；hover 才回到正常字色。
   明暗都靠 --dtl-fg-3（别名随宿主主题变），不写第二套颜色。 */
.dtl-taskrow__actions .dtl-iconbtn--muted{color:var(--dtl-fg-3);}
.dtl-taskrow__actions .dtl-iconbtn--muted:hover:not(:disabled){color:var(--dtl-fg);}

/* 工作区 / #标签 都是核心可点 Chip（business 档），含最大宽 / 省略号 / 跑马灯，本文件不写皮肤。 */

/* Tooltip 垫片（见 ui.ts 的 Tip）：只是挂官方气泡的真 DOM 锚点，不占额外版面。 */
.dtl-tip{display:inline-flex;min-width:0;}

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
export function ensureUiBase(): void {
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

/* ── 分段控件 ─────────────────────────────────────────────────────── */

/** 一段（一个可选值）。 */
export interface SegmentedItem<Value extends string = string> {
	readonly value: Value;
	readonly label: string;
	/** 段内角标数字（或已缩写字符串如「1.2K」）；`undefined` / 空串 / "0" 不显示。 */
	readonly badge?: number | string;
}

/** 分段控件（单选）：改由核心 `Segmented` 承担（size/滑块动画全在 core，外观只有一套、无需指定变体，
 *  见 core/src/ui/Segmented.ts 头注：2026-10-26 起已删除 variant 轴）。
 *  本地 `badge` 是「灰字计数」语义 ⇒ 映射到 core 的 `count`（core 的 `badge` 是红色危险圆标）。 */
export function Segmented<Value extends string>(props: {
	items: readonly SegmentedItem<Value>[];
	value: Value;
	onChange: (next: Value) => void;
	size?: "sm" | "md" | "lg";
	/** 最外层 1px 描边框（透传核心 `bordered`；落在同色底上时用描边把轮廓勾出来）。 */
	bordered?: boolean;
	/** 选中片配色（透传核心 `tone`；内置色名走核心两主题配色，business = 业务主色）。 */
	tone?: "business" | "success" | "warning" | "danger" | { bg: string; fg: string };
	label: string;
	id?: string;
	style?: CSSProperties;
}): ReactNode {
	return h(CoreSegmented<Value>, {
		items: props.items.map((item) => ({
			value: item.value,
			label: item.label,
			count: item.badge,
		})),
		value: props.value,
		onChange: props.onChange,
		// size 不兜底：不传就吃核心默认档 lg（2026-10-26 用户对图拍板：跟核心 demo 一致，
		// 之前适配层自作主张降成 md 导致比 demo 矮一档）
		size: props.size,
		bordered: props.bordered === true,
		tone: props.tone,
		label: props.label,
		id: props.id,
		style: props.style,
	});
}

/* ── 按钮 / 图标钮 ────────────────────────────────────────────────── */

/** 按钮：改由核心 `Button` 承担（18 档 variant 里本地用 primary/secondary/outline/ghost/link）。
 *  `loading` = 核心自带的前置小圈 + 自动禁用（转圈动画只此一份，不自绘）。
 *  宽度三件（width/minWidth/maxWidth）核心已支持：给 maxWidth + 纯文字 ⇒ 核心自动省略号 +
 *  hover 跑马灯，本层原样透传，别再自己写截断。 */
export function Button(props: {
	children?: ReactNode;
	onClick?: () => void;
	variant?: "primary" | "secondary" | "outline" | "ghost" | "link";
	size?: "sm" | "md" | "lg";
	icon?: ReactNode;
	loading?: boolean;
	disabled?: boolean;
	title?: string;
	width?: number | string;
	minWidth?: number | string;
	maxWidth?: number | string;
}): ReactNode {
	return h(
		CoreButton,
		{
			variant: props.variant,
			size: props.size ?? "md",
			icon: props.icon,
			loading: props.loading,
			disabled: props.disabled,
			title: props.title,
			width: props.width,
			minWidth: props.minWidth,
			maxWidth: props.maxWidth,
			onClick: props.onClick,
		},
		props.children,
	);
}

/** 图标钮：改由核心 `IconButton` 承担。
 *  `className` 只用于挂本文件的修饰类（如 `.dtl-iconbtn--muted`），不覆盖核心皮肤。 */
export function IconButton(props: {
	icon: ReactNode;
	label: string;
	onClick?: () => void;
	variant?: "plain" | "outline";
	size?: "sm" | "md" | "lg";
	disabled?: boolean;
	title?: string;
	className?: string;
}): ReactNode {
	return h(CoreIconButton, {
		icon: props.icon,
		label: props.label,
		onClick: props.onClick,
		variant: props.variant ?? "plain",
		size: props.size ?? "md",
		disabled: props.disabled,
		title: props.title,
		className: props.className,
	});
}

/* ── 提示 ─────────────────────────────────────────────────────────── */

/** 悬停提示（本插件**唯一**挂 Tooltip 的入口）。
 *
 *  ⚠️ 官方 `Tooltip` 给子元素挂 `ref` 来当锚点（`children.ref` → `cloneElement`），
 *  而核心控件（Button / IconButton / Chip）都是**裸函数组件**（无 forwardRef）⇒ ref 被 React
 *  丢掉、锚点永远 null、气泡静默不出现。所以这里统一垫一层**真 DOM 的 span** 当锚点：
 *  悬停/聚焦事件冒泡到 span 照样触发，按钮仍由核心控件渲染。
 *  `display:inline-flex` 让垫片不改变原控件在 flex 行里的尺寸与对齐。 */
export function Tip(props: {
	label: string;
	/** 被提示的元素（Tooltip 只接受单个元素）。 */
	children: ReactNode;
	side?: "top" | "bottom" | "right";
	maxWidth?: number;
}): ReactNode {
	return h(Tooltip, {
		label: props.label,
		side: props.side ?? "bottom",
		portal: true,
		maxWidth: props.maxWidth ?? 240,
		children: h("span", { className: "dtl-tip" }, props.children),
	});
}

/** 加载图标：核心 `Loader` 原样透出（无背景、无定位；形态 `ring` / `blocks`、尺寸 xs~xl 都走核心档位）。 */
export const Loader = CoreLoader;

/**
 * 全局加载提示：核心 `showLoading` 的**默认位（屏幕下方居中、无遮罩）**，不传定位参数
 * （用户 2026-10-28：就地摆进面板内容区不好看，就用全局那个默认位置）。
 *
 *  ⚠️ 它**不会自动消失**：谁开的谁 `close()`（句柄可重复关，第二次是空操作）；
 *  同屏只有一张卡，后一次调用顶掉前一次 ⇒ 打开面板 / 首读这种场合直接开、数据到了就关。
 */
export function showLoading(text?: string): LoadingHandle {
	return CoreShowLoading({ text });
}

/** 核心封装的 Toast 卡（灰/绿/红/黄，随明暗；默认 info 灰卡、位置 bottom-center）。
 *  无关闭句柄，靠 `durationMs` 自退。 */
export { notify } from "dsh-plugin-core/ui";

/** 分区标题（icon + 标题 + 右槽）：列表按工作区分组的组头，核心原样，不再包一层。 */
export { SectionHead } from "dsh-plugin-core/ui";

/* ── 输入 / 下拉 / 搜索 ───────────────────────────────────────────── */

/** 下拉：改由核心 `Picker`（单选、受控、portal 菜单）承担。
 *  宽度由核心 `Picker` 原生支持（`width`/`minWidth`/`maxWidth` 落到位触发器内联样式，
 * 超长省略号 + hover 跑马灯）；给了 `width` 即锁定定宽，否则在 min/max 间自适应。 */
export function Select<Value extends string>(props: {
	value: Value;
	options: readonly { value: Value; label: string }[];
	onChange: (next: Value) => void;
	ariaLabel: string;
	/** 定宽（px 或任意 CSS 长度）；给了即忽略 min/max，触发器固定此宽。 */
	width?: number | string;
	/** 最小宽度（px 或任意 CSS 长度）。 */
	minWidth?: number | string;
	/** 最大宽度（px 或任意 CSS 长度）；超长内容省略号截断。 */
	maxWidth?: number | string;
	size?: "sm" | "md" | "lg";
	/** 下拉内搜索框（核心 Picker 原生）。 */
	searchable?: boolean;
	/** 分组（核心 Picker 原生）；给了 `groups` 就按组渲染，`options` 仅作无分组兜底。 */
	groups?: PickerGroup[];
	/** 触发器（选择框）文字前的图标（核心 Picker 原生 `icon`）；选了什么它都在。 */
	icon?: ReactNode;
}): ReactNode {
	return h(CorePicker, {
		groups: props.groups,
		options: props.options.map((option) => ({
			value: option.value,
			label: option.label,
		})),
		value: props.value,
		onChange: (next: string | string[]) => {
			props.onChange(next as Value);
		},
		size: props.size ?? "md",
		searchable: props.searchable === true,
		ariaLabel: props.ariaLabel,
		mode: "single",
		width: props.width,
		minWidth: props.minWidth,
		maxWidth: props.maxWidth,
		icon: props.icon,
	});
}

/** 搜索框：核心 `Input`（`type=search`）自带左侧图标槽（`icon`），这里只传放大镜图标。 */
export function SearchInput(props: {
	value: string;
	placeholder: string;
	onChange: (next: string) => void;
	ariaLabel: string;
	size?: "sm" | "md" | "lg";
}): ReactNode {
	return h(CoreInput, {
		type: "search",
		value: props.value,
		onChange: props.onChange,
		placeholder: props.placeholder,
		size: props.size ?? "md",
		"aria-label": props.ariaLabel,
		icon: h(IconSearchOutlineRegular, { size: 16 }),
	});
}

/* ── 卡 / chip / 空态 ─────────────────────────────────────────────── */

/** 统计卡：主数字 + 灰色口径小字；点一下联动下方列表筛选。
 *  `value` 为 0 时显示「—」（用户 2026-10-17 定稿：0 会被读成「没数据 / 出错了」）；
 *  `hint` 可以是富文本（如把「停滞」两字标红）；
 *  `interactive: false` = 纯展示卡（统计台：首页没有已结案可筛，不装可点）。 */
export function StatCard(props: {
	label: string;
	/** 数字，或调用方拼好的富文本（如「28 完成 27 · 取消 1」里的「28 + 小字」组合）。 */
	value: ReactNode;
	hint?: ReactNode;
	active?: boolean;
	interactive?: boolean;
	/** 0 照实显示成 `0`（默认把 0 显示成「—」，历史页的计数需要真 0）。 */
	showZero?: boolean;
	title?: string;
	onClick?: () => void;
}): ReactNode {
	ensureUiBase();
	const interactive =
		props.interactive !== false && props.onClick !== undefined;
	const zero = props.value === 0 || props.value === "0";
	const shown = zero && props.showZero !== true ? "—" : props.value;
	return h(
		interactive ? "button" : "div",
		{
			type: interactive ? "button" : undefined,
			className: `dtl-card dtl-stat${interactive ? " dtl-card--clickable" : ""}`,
			"data-active": props.active === true,
			title: props.title,
			onClick: interactive ? props.onClick : undefined,
		},
		h("span", { className: "dtl-stat__label" }, props.label),
		h("span", { className: "dtl-stat__value" }, shown),
		props.hint === undefined || props.hint === null || props.hint === ""
			? null
			: h("span", { className: "dtl-stat__hint" }, props.hint),
	);
}

/** 本地 7 档语义色 → 核心 `Chip` 档。core 缺 doing / backlog / overdue / stale / person 的独立色：
 *  overdue 与 stale 都落到 danger、doing 与 person 落到 business（需 core 补 tone 才能精确）。
 *  待认领用 `slate`（实心灰）而不是 `neutral`：neutral 那层浅灰跟 #标签 长得一模一样，
 *  状态标签要跟任务行左缘那条灰竖线一个色（用户 2026-10-30）。 */
const CHIP_TONE: Record<
	"neutral" | "open" | "backlog" | "doing" | "overdue" | "stale" | "person",
	"neutral" | "slate" | "business" | "success" | "warning" | "danger"
> = {
	neutral: "neutral",
	open: "slate",
	backlog: "warning",
	doing: "success",
	overdue: "danger",
	stale: "danger",
	person: "business",
};

/**
 * 标签：状态 / 工作区 / #标签 都走它，只换 tone（核心 `Chip` 承担）。
 * 传 `maxWidth` ⇒ 核心自动折叠省略号 + hover 跑马灯，本层不再自己算宽度。
 */
export function Tag(props: {
	text: string;
	tone?:
		| "neutral"
		| "open"
		| "backlog"
		| "doing"
		| "overdue"
		| "stale"
		| "person";
	/** 悬停说明（**始终**显示，状态标记的解释走它）。走官方 Tooltip。 */
	tip?: string;
	/** 给了就是可点的标签（核心 Chip 自动渲染成 button + hover 加深），如工作区 / #标签。 */
	onClick?: () => void;
	/** 最大宽：核心在超长时折叠省略号 + hover 跑马灯。 */
	maxWidth?: number | string;
}): ReactNode {
	ensureUiBase();
	const { text, tone = "neutral", tip, onClick, maxWidth } = props;
	const chip = h(CoreChip, { tone: CHIP_TONE[tone], onClick, maxWidth }, text);
	if (tip === undefined) return chip;
	// Chip 是核心裸组件 ⇒ 必须走 Tip 垫真 DOM 锚点，直接套 Tooltip 永不显气泡。
	return h(Tip, { label: tip, children: chip });
}

/** 空态：真空引导卡（虚线）。 */
export function EmptyState(props: {
	title: string;
	hint?: string;
}): ReactNode {
	ensureUiBase();
	return h(
		"div",
		{ className: "dtl-empty-guide" },
		h(
			"div",
			{
				style: {
					fontSize: "var(--dtl-font-lg)",
					fontWeight: 600,
					marginBottom: "var(--dtl-space-1)",
				},
			},
			props.title,
		),
		props.hint === undefined
			? null
			: h(
					"div",
					{
						style: { fontSize: "var(--dtl-font-md)", color: "var(--dtl-fg-2)" },
					},
					props.hint,
				),
	);
}

/** 台账图标（黑白线条，描边走 currentColor ⇒ 随主题 / 选中态反色）。
 *  侧栏条目与右上浮标共用这一份（图标只画一次，别处不许再画第二个）。 */
export function LedgerIcon(props: { size?: number }): ReactNode {
	const size = props.size ?? 18;
	const stroke = {
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 7,
		strokeLinecap: "round",
		strokeLinejoin: "round",
	} as const;
	return h(
		"svg",
		{ width: size, height: size, viewBox: "0 0 128 128", "aria-hidden": true },
		h("path", {
			d: "M96 34 A10 10 0 0 1 106 44 V102 A10 10 0 0 1 96 112 H32 A10 10 0 0 1 22 102 V44 A10 10 0 0 1 32 34 Z",
			...stroke,
		}),
		h("path", { d: "M50 22 V46 M78 22 V46", ...stroke }),
		h("path", { d: "M44 66 H84 M44 86 H70", ...stroke }),
	);
}
