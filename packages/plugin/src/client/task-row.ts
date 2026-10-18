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
 *    状态一律**标签型、四色**（用户 2026-10-18：原来是一排素字 / pill，现在与人员**位置互换**）：
 *    灰=待认领 / 蓝=进行中 / 黄=阻塞 / 红=停滞；停滞标签悬停给**配置出来的**阈值解释
 *    （staleDays 由 host 下发）。圆点颜色同色系。
 *
 * 按钮（含查看）**不各判各的**：权限一律问 `resolveActions()`（rows.ts），本文件只按返回值画。
 *
 * 按钮点击行为（含查看）归「任务按钮与会话交接」任务，本文件只做样子与提示。
 */
import { createElement as h, type ReactNode } from 'react'
import {
  IconCheckOutlineRegular, IconChevronRightOutlineRegular, IconDownloadOutlineRegular, IconSearchOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { formatDateTime } from './format'
import type { Translate } from './locales'
import { CLOSED_ACTIONS, resolveActions, type Row } from './rows'
import type { BoardPayload } from './types'
import { Tag } from './ui'

type Tone = 'doing' | 'blocked' | 'stale' | 'open' | 'closed'

/** 行标题：在办 = 任务名（缺则任务号）；已结案 = 任务包名（缺则「完成了什么」首句）。 */
function titleOf(row: Row): string {
  if (row.kind === 'task') return row.task.title ?? row.task.id
  const title = row.record.workpackage ?? row.record.summary
  return title !== undefined && title !== '' ? title : row.record.src ?? '—'
}

/** 状态语义（异常优先：stale 盖过 blocked）。 */
function toneOf(row: Row): Tone {
  if (row.kind !== 'task') return 'closed'
  if (row.task.stale === true) return 'stale'
  if (row.task.status === 'blocked') return 'blocked'
  if (row.task.status === 'open') return 'open'
  return 'doing'
}

/**
 * ⚠️ 调试态（用户 2026-10-18）：第二区标签行把**四种状态全部写死**摆出来、不走 tone 判断，
 * 好一次看全四枚色块长什么样（第一个「进行中」，其后阻塞 / 停滞 / 待认领）。
 * 定稿后：删掉这个常量，标签行换回按 `tone` 取一枚。
 */
const DEBUG_TONES = ['doing', 'blocked', 'stale', 'open'] as const

/** 状态文案（已结案没有在办状态 ⇒ 不给标签）。 */
function statusLabel(tone: Tone, t: Translate): string | null {
  if (tone === 'stale') return t('statusStale')
  if (tone === 'blocked') return t('statusBlocked')
  if (tone === 'open') return t('statusOpen')
  if (tone === 'doing') return t('statusActive')
  return null
}

export function TaskRowView(props: {
  t: Translate
  row: Row
  /** 形态：我的待办（卡片）/ 全部待办（表格行）——两区视觉必须不同、互不重用。 */
  variant: 'mine' | 'others'
  /** 停滞阈值天数（host 配置值，供停滞标签的悬停解释；null = 不解释，不编造）。 */
  staleDays?: number | null
  /** 快照：**只**用来问动作权限（是不是我的 / 能不能认领），判定一律走 `resolveActions`。 */
  board: BoardPayload | null
}): ReactNode {
  const { t, row, variant, staleDays, board } = props
  const tone = toneOf(row)
  const isTask = row.kind === 'task'
  const tags = (row.kind === 'task' ? row.task.tags : row.record.tags) ?? []

  // 创建日期（第一行灰徽只给日期）。
  const created = row.kind === 'task' ? row.task.created ?? null : row.record.created ?? null
  const createdDay = created !== null && created !== undefined && Date.parse(created) >= 0
    ? formatDateTime(created).slice(0, 10)
    : null

  // 停滞标签的悬停解释：内容来自 host 配置（STALE_DAYS），不是前端拍脑袋。
  const staleTip = staleDays === null || staleDays === undefined
    ? undefined
    : t('statStaleTitle', { n: staleDays })

  // 动作权限：**唯一**判定（用户 2026-10-18）——两区同一套，不许各判各的；本文件只按返回值画。
  const actions = isTask ? resolveActions(row.task, board) : CLOSED_ACTIONS

  // 动作钮：四个 + 查看，各一份（两区共用，不许各画一套）
  // 「查看」：两区都有、统一最右、放大镜图标（用户 2026-10-17）。
  const viewButton = h('button', {
    type: 'button', className: 'dtl-viewbtn', 'data-tip': t('viewDetail'), title: t('viewDetail'),
  }, h(IconSearchOutlineRegular, { size: 14 }))
  const claimButton = h('button', { type: 'button', className: 'dtl-minibtn', 'data-tip': t('tipClaim') },
    h(IconDownloadOutlineRegular, { size: 14 }), t('actionClaim'))
  const resumeButton = h('button', { type: 'button', className: 'dtl-minibtn', 'data-tip': t('tipResume') },
    h(IconChevronRightOutlineRegular, { size: 14 }), t('actionResume'))
  const finishButton = h('button', { type: 'button', className: 'dtl-minibtn', 'data-tip': t('tipFinish') },
    h(IconCheckOutlineRegular, { size: 14 }), t('actionFinish'))
  // 释放：官方 rc.2 无断链图标（已全量核实）⇒ 纯文字，不用叉
  const releaseButton = h('button', { type: 'button', className: 'dtl-minibtn', 'data-tip': t('tipRelease') },
    t('actionRelease'))

  // 状态标签：调试态下第二区**不走判断**（见 DEBUG_TONES），这里只留「我的待办」卡用的异常标签。
  // 恢复判断式展示时：把 `statusLabel(tone, t)` 按 tone 取一枚摆进标签行即可（tone==='closed' 不摆）。
  // 「我的待办」卡的异常标签（阻塞=黄 / 停滞=红；进行中只靠左缘色条，不再重复一枚）
  const alarmTag = tone === 'blocked' || tone === 'stale'
    ? h(Tag, { text: statusLabel(tone, t) ?? '', tone, title: tone === 'stale' ? staleTip : undefined })
    : null

  // 第一行（「我的待办」卡）：标题 + 创建徽 + 异常标签
  const titleLine = h('div', { className: 'dtl-taskrow__l1' },
    h('span', { className: 'dtl-taskrow__title dtl-ellipsis', title: titleOf(row) }, titleOf(row)),
    createdDay === null ? null : h('span', { className: 'dtl-taskrow__stamp' }, `[${t('fieldCreatedStamp', { day: createdDay })}]`),
    alarmTag,
  )

  // 第一行（表格行）：独立类族，不沾卡片基类（用户 2026-10-18）。
  // 只有标题 —— 创建信息挪到最右、状态进标签行，标题行不再重复一遍。
  const orowTitleLine = h('div', { className: 'dtl-orow__title' },
    h('span', { className: 'dtl-orow__name dtl-ellipsis', title: titleOf(row) }, titleOf(row)),
  )

  // ── 形态 B：全部待办 = 真表格行（无卡片、无外框，一行一格）──
  if (variant === 'others') {
    const creator = isTask ? row.task.creator : row.record.owner
    const owner = isTask ? row.task.owner : null
    const hasOwner = !(owner === null || owner === undefined || owner === '')
    const who = creator === null || creator === undefined || creator === '' ? '—' : `@${creator}`
    const createdOk = created !== null && created !== undefined && Date.parse(created) >= 0
    // 执行人的悬停提示：**什么时候开始执行**（任务上的 started；没有就报「时间未知」，不编）
    const startedOk = isTask && row.task.started !== null && row.task.started !== undefined
      && Date.parse(row.task.started) >= 0
    const ownerTip = t('startedAt', {
      who: String(owner),
      when: startedOk ? formatDateTime(String(row.task.started)) : t('timeUnknown'),
    })
    // 标签行：**状态在最前**（原执行人位），#标签跟在后面（用户 2026-10-18 位置互换）。
    // ⚠️ 调试态（用户 2026-10-18）：状态**全量写死**四枚摆出来、不走 tone 判断 ——
    // 先看全四种长什么样；定下来之后这里换回按 tone 取一枚（statusTag）。
    const tagLine = h('div', { className: 'dtl-orow__tags' },
      DEBUG_TONES.map(tone => h(Tag, { key: tone, text: statusLabel(tone, t) ?? '', tone })),
      tags.map(tag => h(Tag, { key: tag, text: `#${tag}` })),
    )
    return h('div', { className: 'dtl-orow' },
      h('div', { className: 'dtl-orow__row' },
        // 行标识：上下居中圆点（段头是文件夹/竖线，两处刻意不同）
        h('span', { className: `dtl-dot dtl-dot--${tone}` }),
        h('div', { className: 'dtl-tcell dtl-tcell--title' },
          orowTitleLine,
          tagLine,
        ),
        // 执行人列（原状态位）：有执行人 ⇒ 一枚 @名字 标签，悬停给「谁 什么时候开始执行」
        // （页面不许跳：右侧槽位宽度是常驻的，hover 只换可见性 ⇒ 这个提示不会跟着飘）
        h('span', { className: 'dtl-tcell dtl-tcell--status' },
          hasOwner ? h(Tag, { text: `@${String(owner)}`, tone: 'person', title: ownerTip }) : null),
        // 最右**一个槽**：创建信息 ⇄ 操作钮二选一（用户 2026-10-18：悬停就把创建信息整条干掉，
        // 按钮顶上那一格；两个都常驻布局 ⇒ 行宽不变、页面不跳）
        h('span', { className: 'dtl-orow__slot' },
          h('span', { className: 'dtl-orow__created' },
            t('createdAt', { who, when: createdOk ? formatDateTime(String(created)) : t('timeUnknown') })),
          // 动作排：**同一排、同一间距**（用户 2026-10-18：查看钮不许单独一档间距）；
          // 谁出来由 resolveActions 说了算 —— 我的 ⇒ 继续/结束/释放，待认领 ⇒ 认领
          h('span', { className: 'dtl-orow__actions' },
            actions.claim ? claimButton : null,
            actions.resume ? resumeButton : null,
            actions.finish ? finishButton : null,
            actions.release ? releaseButton : null,
            actions.view ? viewButton : null,
          ),
        ),
      ),
    )
  }

  // ── 形态 A：我的待办 = 卡片（dispatch 任务配置卡同款）──
  const parts: string[] = []
  if (isTask) {
    const startRaw = row.task.started ?? row.task.created
    if (startRaw !== undefined && startRaw !== null && startRaw !== '' && Date.parse(startRaw) >= 0) {
      parts.push(`${formatDateTime(startRaw).slice(0, 10)} ${t('fieldStarted')}`)
    }
    if (row.task.ageDays !== null && row.task.ageDays !== undefined) {
      parts.push(row.task.ageDays === 0 ? t('ageToday') : t('ageDaysText', { n: row.task.ageDays }))
    }
  } else {
    parts.push(`${t('fieldFinished')} ${formatDateTime(row.record.time ?? row.record.created ?? '', { fallback: t('timeUnknown') })}`)
  }
  return h('div', { className: 'dtl-taskrow' },
    h('div', { className: 'dtl-taskrow__row' },
      h('span', { className: `dtl-rail dtl-rail--${tone}` }),
      h('div', { style: { flex: '1 1 auto', minWidth: 0 } },
        titleLine,
        h('div', { className: 'dtl-taskrow__l2' },
          h('span', { className: 'dtl-wstag dtl-ellipsis', title: row.kind === 'task' ? row.task.workspace.title : '' },
            row.kind === 'task' ? row.task.workspace.title : ''),
          tags.map(tag => h(Tag, { key: tag, text: `#${tag}` })),
        ),
      ),
      h('span', { className: 'dtl-taskrow__when' }, parts.length === 0 ? t('timeUnknown') : parts.join('丨')),
      // 动作排：继续 / 结束 / 释放 + 查看 —— **同一排、同一间距**
      // （用户 2026-10-18：查看钮原来是独立的一格，离前面的按钮远一档）
      // 谁出来由 resolveActions 说了算（与下面「全部待办」**同一个方法**，不再各判各的）
      h('span', { className: 'dtl-taskrow__actions' },
        actions.resume ? resumeButton : null,
        actions.finish ? finishButton : null,
        actions.release ? releaseButton : null,
        actions.view ? viewButton : null,
      ),
    ),
  )
}
