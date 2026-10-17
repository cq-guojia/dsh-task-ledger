/**
 * 任务列表行（宿主**无表格件** ⇒ 自绘）：两行式（用户 2026-10-17 定稿，参照 GitHub 通知列表）：
 *  - 上行小字：工作区徽标（第一区专用列）+ 任务号 + 状态 pill（**只有** 阻塞=黄 / 停滞=红 / 待认领=灰；
 *    进行中是默认态不出任何标记，**没有转圈**）+ 右侧「已做 N 天」；
 *  - 下行主字：标题加粗；第三小行：分类 + 标签 chip。
 * 悬停时右侧 时间⇄按钮排 互换（继续 / 结束 / 转移）——按钮**先只做样子**，
 * 点击行为归「任务按钮与会话交接」任务（写入路径 A/B 未拍板）；详情侧栏也归该任务，本行不做展开。
 */
import { createElement as h, type ReactNode } from 'react'
import { formatDateTime } from './format'
import type { Translate } from './locales'
import type { Row } from './rows'
import { Chip } from './ui'
import type { Workspace } from './types'

/** 行标题：在办 = 任务名（缺则任务号）；已结案 = 任务包名（缺则「完成了什么」首句）。 */
function titleOf(row: Row): string {
  if (row.kind === 'task') return row.task.title ?? row.task.id
  const title = row.record.workpackage ?? row.record.summary
  return title !== undefined && title !== '' ? title : row.record.src ?? '—'
}

/** 状态 pill：blocked=黄 / stale=红 / open=灰；doing 是默认态不出标记。 */
function pillsOf(row: Row): ('blocked' | 'stale' | 'open')[] {
  if (row.kind !== 'task') return []
  const pills: ('blocked' | 'stale' | 'open')[] = []
  if (row.task.status === 'blocked') pills.push('blocked')
  if (row.task.stale === true) pills.push('stale')
  if (row.task.status === 'open') pills.push('open')
  return pills
}

/** 工作区徽标（第一区专用列）：色块首字母 + 标题，定宽、超出省略（不猜官方图标名）。 */
function WorkspaceTag(props: { workspace: Workspace | undefined }): ReactNode {
  if (props.workspace === undefined) return null
  const initial = props.workspace.title.trim().slice(0, 1)
  return h('span', {
    className: 'dtl-ellipsis',
    style: { display: 'inline-flex', alignItems: 'center', gap: 'var(--dtl-space-1)', flex: '0 0 140px', minWidth: 0, color: 'var(--dtl-fg-2)', fontSize: 'var(--dtl-font-xs)' },
    title: props.workspace.title,
  },
    h('span', {
      style: {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
        width: '16px', height: '16px', borderRadius: 'var(--dtl-radius-xs)',
        background: 'var(--dtl-business-soft)', color: 'var(--dtl-business)', fontSize: '10px', fontWeight: 600,
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
  const pills = pillsOf(row)

  // 右侧时间：在办 = 「已做 N 天」（host 算的 ageDays，前端不重复判时）；已结案 = 结案时刻。
  const days = row.kind === 'task' ? row.task.ageDays : null
  const when = row.kind === 'task'
    ? (days === null ? t('timeUnknown') : t('rowAge', { n: days }))
    : `${t('fieldFinished')} ${formatDateTime(row.record.time ?? row.record.created ?? '', { fallback: t('timeUnknown') })}`

  return h('div', { className: 'dtl-taskrow' },
    h('div', { className: 'dtl-taskrow__top' },
      props.showWorkspace === true ? h(WorkspaceTag, { workspace: row.kind === 'task' ? row.task.workspace : row.record.workspace }) : null,
      h('span', { className: 'dtl-taskrow__id', title: id }, id),
      pills.map(pill => h('span', {
        key: pill,
        className: `dtl-pill dtl-pill--${pill}`,
      }, t(pill === 'blocked' ? 'statusBlocked' : pill === 'stale' ? 'statusStale' : 'statusOpen'))),
      h('span', { style: { flex: '1 1 auto', minWidth: 0 } }),
      h('span', { className: 'dtl-taskrow__age' }, when),
      row.kind === 'task'
        ? h('span', { className: 'dtl-taskrow__actions' },
          h('button', { type: 'button', className: 'dtl-minibtn', title: t('actionResume') }, t('actionResume')),
          h('button', { type: 'button', className: 'dtl-minibtn', title: t('actionFinish') }, t('actionFinish')),
          h('button', { type: 'button', className: 'dtl-minibtn', title: t('actionTransfer') }, t('actionTransfer')),
        )
        : null,
    ),
    h('div', { className: 'dtl-taskrow__title dtl-ellipsis', title: titleOf(row) }, titleOf(row)),
    (category === null || category === undefined || category === '') && tags.length === 0
      ? null
      : h('div', { className: 'dtl-taskrow__meta' },
        category === null || category === undefined || category === '' ? null : h(Chip, { text: category }),
        tags.map(tag => h(Chip, { key: tag, text: `#${tag}` })),
      ),
  )
}
