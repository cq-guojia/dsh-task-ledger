/**
 * 任务列表行（宿主**无表格件** ⇒ 自绘，几何参照官方 `DisclosureRow`，状态走官方 `StateDot`）。
 * 定稿见 docs/design/features/board-home.md §二 与 docs/design/ui-style.md：
 * 状态语义 open=idle / doing=ongoing / blocked=warning / 已结案=done。
 *
 * 行展开 = 过程文档路径 + 过程正文（在办走 `GET /task` 取正文；已结案只有路径——
 * host 没有按历史行取正文的路由，不编造内容）。
 */
import { createElement as h, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, MarkdownText, StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { fetchTaskDetail } from './api'
import { formatDateTime } from './format'
import type { Translate } from './locales'
import type { Row } from './rows'
import { Chip } from './ui'
import type { TaskDetail } from './types'

/** 行的状态点语义（在办三态 + 已结案）。 */
function dotOf(row: Row): 'idle' | 'ongoing' | 'warning' | 'done' {
  if (row.kind === 'closed') return 'done'
  if (row.task.status === 'blocked') return 'warning'
  if (row.task.status === 'doing') return 'ongoing'
  return 'idle'
}

/** 行标题：在办 = 任务名（缺则任务号）；已结案 = 任务包名（缺则「完成了什么」首句）。 */
function titleOf(row: Row): string {
  if (row.kind === 'task') return row.task.title ?? row.task.id
  const title = row.record.workpackage ?? row.record.summary
  return title !== undefined && title !== '' ? title : row.record.src ?? '—'
}

/** 行的「谁」：负责人优先，没有就创建人，都没有 = 未认领。 */
function whoOf(row: Row): string | null {
  if (row.kind === 'task') return row.task.owner ?? row.task.creator ?? null
  return row.record.owner ?? null
}

export function TaskRowView(props: { t: Translate; row: Row }): ReactNode {
  const { t, row } = props
  const [open, setOpen] = useState(false)

  // 官方 MarkdownText 要求 labels 引用稳定（新身份会丢弃渲染缓存）⇒ 按 t 记忆一次。
  const mdLabels = useMemo(() => ({ code: { copyLabel: t('mdCopy'), copiedLabel: t('mdCopied') }, footnotes: t('mdFootnotes') }), [t])

  /** 行的时间：在办 doing/blocked 看开始、其余看创建；已结案看结案。 */
  const stamp = row.kind === 'closed'
    ? { value: row.record.time ?? row.record.created ?? null, label: t('fieldFinished') }
    : row.task.status === 'open'
      ? { value: row.task.created ?? null, label: t('fieldCreated') }
      : { value: row.task.started ?? row.task.created ?? null, label: t('fieldStarted') }
  const when = stamp.value === null || stamp.value === undefined || stamp.value === ''
    ? t('timeUnknown')
    : formatDateTime(stamp.value, { fallback: t('timeUnknown') })
  const who = whoOf(row)
  const workspace = row.kind === 'task' ? row.task.workspace : row.record.workspace
  const category = row.kind === 'task' ? row.task.category : row.record.category
  const tags = (row.kind === 'task' ? row.task.tags : row.record.tags) ?? []
  const logPath = row.kind === 'task' ? row.task.worklog : row.record.log

  return h('div', { className: 'dtl-row', 'data-open': open },
    h('button', {
      type: 'button',
      className: 'dtl-row-head',
      'aria-expanded': open,
      title: open ? t('collapseAria') : t('expandAria'),
      onClick: () => { setOpen(!open) },
    },
      h(StateDot, { state: dotOf(row) }),
      h('span', {
        style: { flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--dtl-font-md)' },
        title: titleOf(row),
      }, titleOf(row)),
      category === null || category === undefined || category === ''
        ? null
        : h(Chip, { text: category }),
      tags.slice(0, 2).map(tag => h(Chip, { key: tag, text: `#${tag}` })),
      h('span', { style: { display: 'flex', alignItems: 'center', gap: 'var(--dtl-space-2)', color: 'var(--dtl-fg-3)', fontSize: 'var(--dtl-font-xs)', whiteSpace: 'nowrap' } },
        workspace === undefined ? null : h('span', null, workspace.title),
        h('span', { title: stamp.value ?? undefined }, `${stamp.label} ${when}`),
        h('span', null, who === null || who === '' ? t('ownerUnclaimed') : `@${who}`),
      ),
      h(open ? IconChevronDownOutlineRegular : IconChevronRightOutlineRegular, { size: 16 }),
    ),
    open
      ? h('div', { className: 'dtl-row-body' },
        // 过程文档路径（真实值；没有工作区文件服务可点开 ⇒ 只展示路径，不假装能跳转）
        h('div', { style: { margin: 'var(--dtl-space-2) 0', fontSize: 'var(--dtl-font-sm)', color: 'var(--dtl-fg-2)' } },
          `${t('worklogTitle')}·${t('worklogPath')}：${
            logPath === null || logPath === undefined || logPath === '' ? t('worklogMissing') : logPath
          }`,
        ),
        // 已结案：host 没有「按历史行取正文」的路由 ⇒ 只渲染已有的「完成了什么」，不编造正文。
        row.kind === 'closed'
          ? h('div', { style: { fontSize: 'var(--dtl-font-md)', color: 'var(--dtl-fg-2)' } }, row.record.summary ?? '')
          : h(WorklogBody, { t, workspaceId: row.task.workspace.id, taskId: row.task.id, labels: mdLabels }),
      )
      : null,
  )
}

/** 在办行的过程正文：**展开才取**（首屏不为正文付代价），且只在挂载时取一次（不随重渲染重取）。 */
function WorklogBody(props: {
  t: Translate
  workspaceId: string
  taskId: string
  labels: { code: { copyLabel: string; copiedLabel: string }; footnotes: string }
}): ReactNode {
  const { t, workspaceId, taskId, labels } = props
  const [detail, setDetail] = useState<TaskDetail | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    fetchTaskDetail(workspaceId, taskId)
      .then((body) => { if (alive) setDetail(body) })
      .catch((error: unknown) => {
        if (alive) setFailed(error instanceof Error ? error.message : String(error))
      })
    return () => { alive = false }
  }, [workspaceId, taskId])

  if (failed !== null) {
    return h('div', { style: { color: 'var(--dtl-danger)', fontSize: 'var(--dtl-font-sm)' } }, `${t('loadFailed')}：${failed}`)
  }
  if (detail === null) return h('div', { style: { color: 'var(--dtl-fg-3)', fontSize: 'var(--dtl-font-sm)' } }, t('loading'))
  if (detail.worklog === null) {
    return h('div', { style: { color: 'var(--dtl-fg-3)', fontSize: 'var(--dtl-font-sm)' } }, t('worklogMissing'))
  }
  return h('div', { className: 'dtl-worklog' }, h(MarkdownText, { text: detail.worklog, labels, variant: 'compact' }))
}
