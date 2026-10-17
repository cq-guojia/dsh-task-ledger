/**
 * 任务列表行（宿主**无表格件** ⇒ 自绘）：整行一张卡，样式照抄 dispatch-table 任务配置卡
 * （`dsh-task-dispatch-table/src/client/task-list.tsx` TaskCard：surface-1 底 + 1px 边框 +
 * 左缘 6×36 状态条 + 标题行尾灰徽 + 第二行小字）：
 *  - 状态条 / pill：doing=蓝（默认态无标记）/ blocked=黄 / stale=红 / open=灰（无转圈）；
 *  - 第一行：标题加粗 + `[YYYY-MM-DD 创建]` 灰徽 + 阻塞/停滞 pill；
 *  - 第二行小字：工作区 · #标签；
 *  - 右侧（**灰字**，用户 2026-10-17：不要蓝）：`2026-10-17 开始丨已进行 12 天`，当天 = `丨今天`；
 *    悬停换成按钮排（继续 / 结束 / 释放——icon + 字，加大号，**悬停立刻出浮动说明**）。
 *    按钮点击行为归「任务按钮与会话交接」任务。
 * ⚠️ 模拟数据（用户 2026-10-17 明确要求看效果）：`mockTone` 会无视真实状态强改色条/pill，
 *    仅由 board-home 第一区前两行传入，验收后删除。
 */
import { createElement as h, type ReactNode } from 'react'
import {
  IconCheckOutlineRegular, IconPlayOutlineRegular, IconUsersOutlineRegular,
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

/** 状态条语义（异常优先：stale 盖过 blocked）；mockTone 强改（仅限第一区演示）。 */
function toneOf(row: Row, mockTone?: 'blocked' | 'stale'): Tone {
  if (mockTone !== undefined) return mockTone
  if (row.kind !== 'task') return 'closed'
  if (row.task.stale === true) return 'stale'
  if (row.task.status === 'blocked') return 'blocked'
  if (row.task.status === 'open') return 'open'
  return 'doing'
}

/** 工作区徽标：色块首字母 + 名（第二行小字用，随内容定宽）。 */
function WorkspaceTag(props: { workspace: Workspace | undefined }): ReactNode {
  if (props.workspace === undefined) return null
  const initial = props.workspace.title.trim().slice(0, 1)
  return h('span', {
    className: 'dtl-ellipsis',
    style: { display: 'inline-flex', alignItems: 'center', gap: 'var(--dtl-space-1)', minWidth: 0, maxWidth: '200px' },
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

export function TaskRowView(props: {
  t: Translate
  row: Row
  showWorkspace?: boolean
  /** ⚠️ 模拟数据：无视真实状态强改异常态（仅第一区前两行演示用）。 */
  mockTone?: 'blocked' | 'stale'
}): ReactNode {
  const { t, row, mockTone } = props
  const tags = (row.kind === 'task' ? row.task.tags : row.record.tags) ?? []
  const tone = toneOf(row, mockTone)

  // 创建日期（第一行灰徽只给日期，口径同 dispatch 卡 `[YYYY-MM-DD 创建]`）。
  const created = row.kind === 'task' ? row.task.created ?? null : row.record.created ?? null
  const createdDay = created !== null && created !== undefined && Date.parse(created) >= 0
    ? formatDateTime(created).slice(0, 10)
    : null

  // 右侧灰字：`2026-10-17 开始丨已进行 12 天`（当天 = 丨今天）；开始日取 started 缺则 created。
  const parts: string[] = []
  if (row.kind === 'task') {
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
      // 状态条：贴卡片左缘、与两行正文等高（dispatch 同款几何）
      h('span', { className: `dtl-rail dtl-rail--${tone}` }),
      h('div', { style: { flex: '1 1 auto', minWidth: 0 } },
        h('div', { className: 'dtl-taskrow__l1' },
          h('span', { className: 'dtl-taskrow__title dtl-ellipsis', title: titleOf(row) }, titleOf(row)),
          createdDay === null ? null : h('span', { className: 'dtl-taskrow__stamp' }, `[${t('fieldCreatedStamp', { day: createdDay })}]`),
          tone === 'blocked' ? h('span', { className: 'dtl-pill dtl-pill--blocked' }, t('statusBlocked')) : null,
          tone === 'stale' ? h('span', { className: 'dtl-pill dtl-pill--stale' }, t('statusStale')) : null,
        ),
        h('div', { className: 'dtl-taskrow__l2' },
          props.showWorkspace === true ? h(WorkspaceTag, { workspace: row.kind === 'task' ? row.task.workspace : row.record.workspace }) : null,
          tags.map(tag => h('span', { key: tag, className: 'dtl-minitag', title: `#${tag}` }, `#${tag}`)),
        ),
      ),
      h('span', { className: 'dtl-taskrow__when' }, parts.length === 0 ? t('timeUnknown') : parts.join('丨')),
      // 悬停按钮排：icon + 字，hover 立刻浮出说明（CSS ::after，不用慢半拍的原生 title）
      row.kind === 'task'
        ? h('span', { className: 'dtl-taskrow__actions' },
          h('button', { type: 'button', className: 'dtl-minibtn', 'data-tip': t('tipResume') },
            h(IconPlayOutlineRegular, { size: 14 }), t('actionResume')),
          h('button', { type: 'button', className: 'dtl-minibtn', 'data-tip': t('tipFinish') },
            h(IconCheckOutlineRegular, { size: 14 }), t('actionFinish')),
          h('button', { type: 'button', className: 'dtl-minibtn', 'data-tip': t('tipRelease') },
            h(IconUsersOutlineRegular, { size: 14 }), t('actionRelease')),
        )
        : null,
    ),
  )
}
