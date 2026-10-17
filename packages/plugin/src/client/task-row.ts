/**
 * 任务行（宿主**无表格件** ⇒ 自绘），**两种形态**（用户 2026-10-17 定稿：两区视觉必须不同，
 * 且**互不重用**）：
 *
 * A. `mine`（我的待办）= 整行一张卡，样式照抄 dispatch-table 任务配置卡：
 *    左缘 6×36 状态条 + 标题行 + 第二行工作区/标签；右侧灰字时长；悬停出
 *    「继续 / 结束 / 释放」；最右常驻「查看」放大镜钮。
 *
 * B. `others`（其他待办）= 真表格行（参考 Stripe Payments 表）：**无卡片、无外框**，
 *    行 = 一条淡分隔线格：状态圆点 + 任务（标题+标签两行）+ 创建人 + 执行人 +
 *    状态 + 时长 + 查看。圆点颜色：灰=待认领 / 浅蓝=进行中（比「我的」蓝灰一档）/
 *    黄=阻塞 / 红=停滞；停滞 pill 悬停给**配置出来的**阈值解释（staleDays 由 host 下发）。
 *
 * 按钮点击行为（含查看）归「任务按钮与会话交接」任务，本文件只做样子与提示。
 */
import { createElement as h, type ReactNode } from 'react'
import {
  IconCheckOutlineRegular, IconChevronRightOutlineRegular, IconSearchOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { formatDateTime } from './format'
import type { Translate } from './locales'
import type { Row } from './rows'

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

export function TaskRowView(props: {
  t: Translate
  row: Row
  /** 形态：我的待办（卡片）/ 其他待办（表格行）——两区视觉必须不同、互不重用。 */
  variant: 'mine' | 'others'
  /** 停滞阈值天数（host 配置值，供停滞 pill 的悬停解释；null = 不解释，不编造）。 */
  staleDays?: number | null
}): ReactNode {
  const { t, row, variant, staleDays } = props
  const tone = toneOf(row)
  const isTask = row.kind === 'task'
  const tags = (row.kind === 'task' ? row.task.tags : row.record.tags) ?? []

  // 创建日期（第一行灰徽只给日期）。
  const created = row.kind === 'task' ? row.task.created ?? null : row.record.created ?? null
  const createdDay = created !== null && created !== undefined && Date.parse(created) >= 0
    ? formatDateTime(created).slice(0, 10)
    : null

  // 停滞 pill 的悬停解释：内容来自 host 配置（STALE_DAYS），不是前端拍脑袋。
  const staleTip = staleDays === null || staleDays === undefined
    ? undefined
    : t('statStaleTitle', { n: staleDays })

  // 「查看」：两区都有、统一最右、放大镜图标（用户 2026-10-17）。
  const viewButton = h('button', {
    type: 'button', className: 'dtl-viewbtn', 'data-tip': t('viewDetail'), title: t('viewDetail'),
  }, h(IconSearchOutlineRegular, { size: 14 }))

  // 异常 pill（阻塞=黄 / 停滞=红；停滞带配置解释）。
  const blockedPill = tone === 'blocked'
    ? h('span', { className: 'dtl-pill dtl-pill--blocked' }, t('statusBlocked'))
    : null
  const stalePill = tone === 'stale'
    ? h('span', { className: 'dtl-pill dtl-pill--stale', title: staleTip }, t('statusStale'))
    : null

  // 第一行公共：标题 + 创建徽 + 异常 pill。
  const titleLine = h('div', { className: 'dtl-taskrow__l1' },
    h('span', { className: 'dtl-taskrow__title dtl-ellipsis', title: titleOf(row) }, titleOf(row)),
    createdDay === null ? null : h('span', { className: 'dtl-taskrow__stamp' }, `[${t('fieldCreatedStamp', { day: createdDay })}]`),
    blockedPill,
    stalePill,
  )

  // 时长（表格行「时长」列）：已进行 N 天 / 今天。
  const duration = !isTask || row.task.ageDays === null || row.task.ageDays === undefined
    ? '—'
    : row.task.ageDays === 0 ? t('ageToday') : t('ageDaysText', { n: row.task.ageDays })

  // ── 形态 B：其他待办 = 真表格行（无卡片、无外框，一行一格）──
  if (variant === 'others') {
    const creator = isTask ? row.task.creator : row.record.owner
    const owner = isTask ? row.task.owner : null
    const creatorText = creator === null || creator === undefined || creator === '' ? '—' : `@${creator}`
    const ownerText = owner === null || owner === undefined || owner === '' ? t('ownerUnclaimed') : `@${owner}`
    return h('div', { className: 'dtl-taskrow dtl-taskrow--others' },
      h('div', { className: 'dtl-taskrow__row' },
        h('span', { className: `dtl-bar dtl-bar--${tone}` }),
        h('div', { className: 'dtl-tcell dtl-tcell--title' },
          titleLine,
          h('div', { className: 'dtl-taskrow__l2' },
            tags.map(tag => h('span', { key: tag, className: 'dtl-minitag', title: `#${tag}` }, `#${tag}`)),
          ),
        ),
        h('span', { className: 'dtl-tcell dtl-tcell--who', title: creatorText }, creatorText),
        h('span', { className: 'dtl-tcell dtl-tcell--who', title: ownerText }, ownerText),
        h('span', { className: 'dtl-tcell dtl-tcell--status' },
          tone === 'blocked' ? blockedPill : tone === 'stale' ? stalePill : null,
          tone === 'doing' || tone === 'open'
            ? h('span', { className: `dtl-statustext dtl-statustext--${tone}` },
                tone === 'open' ? t('statusOpen') : t('statusActive'))
            : null,
        ),
        h('span', { className: 'dtl-tcell dtl-tcell--time' }, duration),
        viewButton,
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
          tags.map(tag => h('span', { key: tag, className: 'dtl-minitag', title: `#${tag}` }, `#${tag}`)),
        ),
      ),
      h('span', { className: 'dtl-taskrow__when' }, parts.length === 0 ? t('timeUnknown') : parts.join('丨')),
      isTask
        ? h('span', { className: 'dtl-taskrow__actions' },
          h('button', { type: 'button', className: 'dtl-minibtn', 'data-tip': t('tipResume') },
            h(IconChevronRightOutlineRegular, { size: 14 }), t('actionResume')),
          h('button', { type: 'button', className: 'dtl-minibtn', 'data-tip': t('tipFinish') },
            h(IconCheckOutlineRegular, { size: 14 }), t('actionFinish')),
          // 释放：官方 rc.2 无断链图标（已全量核实）⇒ 纯文字，不用叉
          h('button', { type: 'button', className: 'dtl-minibtn', 'data-tip': t('tipRelease') }, t('actionRelease')),
        )
        : null,
      viewButton,
    ),
  )
}
