/**
 * 任务列表行（宿主**无表格件** ⇒ 自绘）：两行式，视觉对齐参考图（会话列表 / 定时任务器）：
 *  - 左侧 3px 状态色条：doing=蓝 / blocked=黄 / stale=红 / open=灰（替代一切状态图标，无转圈）；
 *  - 第一行：标题加粗（上来就是标题）+ [YYYY-MM-DD 创建] 小徽 + 阻塞/停滞 pill + 标签（10px 小 chip）；
 *    右侧「已做 N 天」绿底软 pill，悬停整排换成动作按钮（继续 / 结束 / 转移——**只做样子**，
 *    点击行为归「任务按钮与会话交接」任务）；
 *  - 第二行小字灰：工作区 · #任务号 · 创建时刻。
 * 详情侧栏归「任务按钮与会话交接」任务，本行不做展开、不做点击。
 */
import { createElement as h, type ReactNode } from 'react'
import { formatDateTime } from './format'
import type { Translate } from './locales'
import type { Row } from './rows'
import type { Workspace } from './types'

/** 行标题：在办 = 任务名（缺则任务号）；已结案 = 任务包名（缺则「完成了什么」首句）。 */
function titleOf(row: Row): string {
  if (row.kind === 'task') return row.task.title ?? row.task.id
  const title = row.record.workpackage ?? row.record.summary
  return title !== undefined && title !== '' ? title : row.record.src ?? '—'
}

/** 左侧色条语义：异常优先（stale 盖过 blocked），doing 是默认态。 */
function toneOf(row: Row): 'doing' | 'blocked' | 'stale' | 'open' | 'closed' {
  if (row.kind !== 'task') return 'closed'
  if (row.task.stale === true) return 'stale'
  if (row.task.status === 'blocked') return 'blocked'
  if (row.task.status === 'open') return 'open'
  return 'doing'
}

/** 工作区徽标（第一区专用列）：色块首字母 + 标题，定宽、超出省略（不猜官方图标名）。 */
function WorkspaceTag(props: { workspace: Workspace | undefined }): ReactNode {
  if (props.workspace === undefined) return null
  const initial = props.workspace.title.trim().slice(0, 1)
  return h('span', {
    className: 'dtl-ellipsis',
    style: { display: 'inline-flex', alignItems: 'center', gap: 'var(--dtl-space-1)', flex: '0 0 140px', minWidth: 0, color: 'var(--dtl-fg-2)' },
    title: props.workspace.title,
  },
    h('span', {
      style: {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
        width: '14px', height: '14px', borderRadius: 'var(--dtl-radius-xs)',
        background: 'var(--dtl-business-soft)', color: 'var(--dtl-business)', fontSize: '9px', fontWeight: 600,
      },
    }, initial === '' ? '·' : initial),
    props.workspace.title,
  )
}

export function TaskRowView(props: { t: Translate; row: Row; showWorkspace?: boolean }): ReactNode {
  const { t, row } = props
  const category = row.kind === 'task' ? row.task.category : row.record.category
  const tags = (row.kind === 'task' ? row.task.tags : row.record.tags) ?? []
  const id = row.kind === 'task' ? row.task.id : row.record.src ?? ''
  const tone = toneOf(row)

  // 创建时刻（第一行小徽只给日期；第二行给整点分）。
  const created = row.kind === 'task' ? row.task.created ?? null : row.record.created ?? null
  const createdDay = created !== null && created !== undefined && Date.parse(created) >= 0
    ? formatDateTime(created).slice(0, 10)
    : null
  // 右侧时间：在办 = 「已做 N 天」（host 算的 ageDays，前端不重复判时）；已结案 = 结案时刻。
  const when = row.kind === 'task'
    ? (row.task.ageDays === null || row.task.ageDays === undefined ? t('timeUnknown') : t('rowAge', { n: row.task.ageDays }))
    : `${t('fieldFinished')} ${formatDateTime(row.record.time ?? row.record.created ?? '', { fallback: t('timeUnknown') })}`
  const isTask = row.kind === 'task'

  return h('div', { className: 'dtl-taskrow', 'data-tone': tone },
    h('div', { className: 'dtl-taskrow__l1' },
      h('span', { className: 'dtl-taskrow__title dtl-ellipsis', title: titleOf(row) }, titleOf(row)),
      createdDay === null ? null : h('span', { className: 'dtl-taskrow__stamp' }, t('fieldCreatedStamp', { day: createdDay })),
      tone === 'blocked' ? h('span', { className: 'dtl-pill dtl-pill--blocked' }, t('statusBlocked')) : null,
      tone === 'stale' ? h('span', { className: 'dtl-pill dtl-pill--stale' }, t('statusStale')) : null,
      tags.map(tag => h('span', { key: tag, className: 'dtl-minitag', title: `#${tag}` }, `#${tag}`)),
      h('span', { style: { flex: '1 1 auto', minWidth: 0 } }),
      h('span', { className: 'dtl-taskrow__age' }, when),
      isTask
        ? h('span', { className: 'dtl-taskrow__actions' },
          h('button', { type: 'button', className: 'dtl-minibtn', title: t('actionResume') }, t('actionResume')),
          h('button', { type: 'button', className: 'dtl-minibtn', title: t('actionFinish') }, t('actionFinish')),
          h('button', { type: 'button', className: 'dtl-minibtn', title: t('actionTransfer') }, t('actionTransfer')),
        )
        : null,
    ),
    h('div', { className: 'dtl-taskrow__l2' },
      props.showWorkspace === true ? h(WorkspaceTag, { workspace: row.kind === 'task' ? row.task.workspace : row.record.workspace }) : null,
      h('span', { className: 'dtl-ellipsis' }, `#${id}`),
      created === null || created === undefined || created === ''
        ? null
        : h('span', { style: { whiteSpace: 'nowrap' } }, `${t('fieldCreated')} ${formatDateTime(created, { fallback: t('timeUnknown') })}`),
      category === null || category === undefined || category === '' ? null : h('span', { className: 'dtl-ellipsis' }, category),
    ),
  )
}
