/**
 * 任务行（宿主**无表格件** ⇒ 自绘），**两种形态**（用户 2026-10-17 定稿：两区视觉必须不同）：
 *
 * A. `mine`（我的待办）= 整行一张卡，样式照抄 dispatch-table 任务配置卡：
 *    左缘 6×36 状态条 + 标题行 + 第二行工作区/标签；右侧灰字时长；悬停出
 *    「继续 / 结束 / 释放」；最右常驻「查看」放大镜钮。
 *
 * B. `others`（其他待办）= 表格行（参考 GitHub 通知列表）：
 *    **无卡片、无色条**，状态用 8px 圆点（灰=待认领 / 浅蓝=进行中[比「我的」蓝灰一档] /
 *    黄=阻塞 / 红=停滞）；标题 + [创建] 徽 + 异常 pill；第二行分类/标签；
 *    右列显示**创建人 / 执行人**（定宽省略）；最右常驻「查看」。别人的任务不出「继续」
 *    （我的任务在第一区，天然不会出现在这里）。
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
import type { Workspace } from './types'

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

/** 工作区徽标：蓝底胶囊（只铺底，字色回正文）。 */
function WorkspaceTag(props: { workspace: Workspace | undefined }): ReactNode {
  if (props.workspace === undefined) return null
  return h('span', {
    className: 'dtl-wstag dtl-ellipsis',
    title: props.workspace.title,
  }, props.workspace.title)
}

export function TaskRowView(props: {
  t: Translate
  row: Row
  /** 形态：我的待办（卡片）/ 其他待办（表格行）——两区视觉必须不同。 */
  variant: 'mine' | 'others'
}): ReactNode {
  const { t, row, variant } = props
  const tags = (row.kind === 'task' ? row.task.tags : row.record.tags) ?? []
  const tone = toneOf(row)
  const isTask = row.kind === 'task'

  // 创建日期（第一行灰徽只给日期，口径同 dispatch 卡 [YYYY-MM-DD 创建]）。
  const created = row.kind === 'task' ? row.task.created ?? null : row.record.created ?? null
  const createdDay = created !== null && created !== undefined && Date.parse(created) >= 0
    ? formatDateTime(created).slice(0, 10)
    : null

  // 右侧灰字：`2026-10-17 开始丨已进行 12 天`（当天 = 丨今天）。
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

  // 「查看」：两区都有、统一最右、放大镜图标（用户 2026-10-17）。
  const viewButton = h('button', {
    type: 'button', className: 'dtl-viewbtn', 'data-tip': t('viewDetail'), title: t('viewDetail'),
  }, h(IconSearchOutlineRegular, { size: 14 }))

  // 第一行公共：标题 + 创建徽 + 异常 pill。
  const titleLine = h('div', { className: 'dtl-taskrow__l1' },
    h('span', { className: 'dtl-taskrow__title dtl-ellipsis', title: titleOf(row) }, titleOf(row)),
    createdDay === null ? null : h('span', { className: 'dtl-taskrow__stamp' }, `[${t('fieldCreatedStamp', { day: createdDay })}]`),
    tone === 'blocked' ? h('span', { className: 'dtl-pill dtl-pill--blocked' }, t('statusBlocked')) : null,
    tone === 'stale' ? h('span', { className: 'dtl-pill dtl-pill--stale' }, t('statusStale')) : null,
  )

  // 第二行公共：工作区（仅 mine 形态）+ 分类 / 标签。
  const metaLine = h('div', { className: 'dtl-taskrow__l2' },
    variant === 'mine' && isTask ? h(WorkspaceTag, { workspace: row.task.workspace }) : null,
    tags.map(tag => h('span', { key: tag, className: 'dtl-minitag', title: `#${tag}` }, `#${tag}`)),
  )

  if (variant === 'others') {
    // 右列：创建人 / 执行人（定宽省略；别人执行是常态，creator 与 owner 都必显）。
    const creator = isTask ? row.task.creator : row.record.owner
    const owner = isTask ? row.task.owner : null
    return h('div', { className: 'dtl-taskrow dtl-taskrow--others' },
      h('div', { className: 'dtl-taskrow__row' },
        h('span', { className: `dtl-dot dtl-dot--${tone}` }),
        h('div', { style: { flex: '1 1 auto', minWidth: 0 } },
          titleLine,
          metaLine,
        ),
        h('span', { className: 'dtl-taskrow__who dtl-ellipsis', title: `${t('fieldCreator')} ${creator ?? '—'}` },
          `${t('fieldCreator')} ${creator === null || creator === undefined || creator === '' ? '—' : `@${creator}`}`),
        h('span', { className: 'dtl-taskrow__who dtl-ellipsis', title: `${t('fieldOwner')} ${owner ?? '—'}` },
          `${t('fieldOwner')} ${owner === null || owner === undefined || owner === '' ? t('ownerUnclaimed') : `@${owner}`}`),
        viewButton,
      ),
    )
  }

  // mine 形态：卡片 + 状态条 + 悬停动作排 + 常驻查看。
  return h('div', { className: 'dtl-taskrow' },
    h('div', { className: 'dtl-taskrow__row' },
      h('span', { className: `dtl-rail dtl-rail--${tone}` }),
      h('div', { style: { flex: '1 1 auto', minWidth: 0 } },
        titleLine,
        metaLine,
      ),
      h('span', { className: 'dtl-taskrow__when' }, parts.length === 0 ? t('timeUnknown') : parts.join('丨')),
      isTask
        ? h('span', { className: 'dtl-taskrow__actions' },
          // 别人的任务不出「继续」（我的都在第一区）；结束 / 释放同理只对己任务有意义。
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
