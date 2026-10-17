/**
 * 看板首页（`main` 槽整页内容）：6 统计卡 + 近 8 周趋势图 + 两区任务列表。
 * 定稿见 docs/design/features/board-home.md §二（2026-10-17 专家组改版）；
 * 按钮矩阵归「任务按钮与会话交接」任务（写入路径 A/B 未拍板），本页**不画**任务动作按钮。
 *
 * 刷新纪律（2026-10-17 拍板）：挂载首读 + 手动刷新按钮，**不轮询**；空态三分
 * （未就绪不渲染 / 真空引导卡 / 筛选空小字）。
 */
import { createElement as h, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { LocaleKey, Translate } from './locales'
import { boardSnapshot, boardSubscribe, refresh, setQuery, type Query, type Scope, type StatusFilter } from './store'
import { selectView, type WorkspaceGroup } from './rows'
import { TaskRowView } from './task-row'
import { BarChart, Button, EmptyState, ensureUiBase, SearchInput, Segmented, Select, StatCard } from './ui'

type Tab = 'tasks' | 'stats'

/** 整页容器：占满中栏、自己滚动。 */
const pageStyle: Record<string, string | number> = {
  height: '100%', width: '100%', boxSizing: 'border-box', overflow: 'auto',
  padding: '24px 22px', color: 'var(--dtl-fg)',
}
const headerStyle: Record<string, string | number> = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--dtl-space-3)', flexWrap: 'wrap',
  marginBottom: 'var(--dtl-space-4)',
}
const titleStyle: Record<string, string | number> = { fontSize: 'var(--dtl-font-xl)', fontWeight: 600 }
/** 统计区：左 2/3 卡网格 + 右 1/3 趋势图（窄屏堆叠）。 */
const statsAreaStyle: Record<string, string | number> = {
  display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 'var(--dtl-space-3)',
  marginBottom: 'var(--dtl-space-4)',
}
const cardsGridStyle: Record<string, string | number> = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(148px,1fr))', gap: 'var(--dtl-space-3)',
}
const chartCardStyle: Record<string, string | number> = {
  display: 'flex', flexDirection: 'column', gap: 'var(--dtl-space-2)', padding: 'var(--dtl-space-3) var(--dtl-space-4)',
}
const filterRowStyle: Record<string, string | number> = {
  display: 'flex', alignItems: 'center', gap: 'var(--dtl-space-2)', flexWrap: 'wrap',
  marginBottom: 'var(--dtl-space-3)',
}
const searchWrapStyle: Record<string, string | number> = { flex: '1 1 220px', minWidth: 0 }
const hintStyle: Record<string, string | number> = { fontSize: 'var(--dtl-font-sm)', color: 'var(--dtl-fg-2)' }
const regionHeadStyle: Record<string, string | number> = {
  display: 'flex', alignItems: 'baseline', gap: 'var(--dtl-space-2)',
  margin: 'var(--dtl-space-4) 0 var(--dtl-space-2)', fontSize: 'var(--dtl-font-lg)', fontWeight: 600,
}
const groupHeadStyle: Record<string, string | number> = {
  display: 'flex', alignItems: 'center', gap: 'var(--dtl-space-2)', width: '100%',
  padding: 'var(--dtl-space-2) var(--dtl-space-3)', border: 0, borderRadius: 'var(--dtl-radius-md)',
  background: 'var(--dtl-surface-2)', color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer',
}
const groupCountStyle: Record<string, string | number> = { fontSize: 'var(--dtl-font-xs)', color: 'var(--dtl-fg-3)', fontWeight: 400 }

/** 分组默认折叠阈值（组内太多条时先收起，用户点开）。 */
const GROUP_COLLAPSE_OVER = 30

export function BoardHome(props: { t: Translate; onBack: () => void }): ReactNode {
  const { t, onBack } = props
  ensureUiBase()
  const state = useSyncExternalStore(boardSubscribe, boardSnapshot)
  const [tab, setTab] = useState<Tab>('tasks')

  // 打开面板首读（后端纯按需，无推送无轮询）。
  useEffect(() => { void refresh() }, [])

  const board = state.board
  const view = useMemo(() => selectView(state), [state])
  const stats = board?.stats
  const days = (value: number | null | undefined): string =>
    value === null || value === undefined ? t('daysNone') : t('daysValue', { n: value })

  /** 统计卡 → 筛选联动（卡即入口：点一下跳到对应视角）。 */
  const card = (label: LocaleKey, value: string, hint: string, patch: Partial<Query>): ReactNode =>
    h(StatCard, {
      label: t(label),
      value,
      hint,
      active: isActive(state.query, patch),
      onClick: () => { setQuery(patch) },
    })

  const chartBuckets = useMemo(() => (board?.closed.weekly ?? []).map((bucket) => ({
    label: bucket.week.slice(5),
    value: bucket.count,
    title: t('chartBucket', { week: bucket.week, n: bucket.count }),
  })), [board, t])

  return h('div', { style: pageStyle },
    h('div', { style: { display: 'flex', justifyContent: 'center' } },
      h('div', { style: { width: '100%', maxWidth: '1120px', minWidth: 0, boxSizing: 'border-box' } },
        h('div', { style: headerStyle },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--dtl-space-3)', minWidth: 0 } },
            h(Button, { variant: 'outline', size: 'md', onClick: onBack }, `← ${t('backToConversation')}`),
            h('div', { style: titleStyle }, t('panelTitle')),
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--dtl-space-2)' } },
            h(Segmented<Tab>, {
              id: 'dtl-tab',
              value: tab,
              label: t('panelTitle'),
              items: [
                { value: 'tasks', label: t('tabTasks') },
                { value: 'stats', label: t('tabStats') },
              ],
              onChange: setTab,
            }),
            h(Button, {
              variant: 'outline',
              size: 'md',
              icon: h(IconRefreshOutlineRegular, { size: 16 }),
              disabled: state.refreshing,
              title: t('refresh'),
              onClick: () => { void refresh() },
            }, state.refreshing ? t('refreshing') : t('refresh')),
          ),
        ),

        tab === 'stats'
          // 统计报表尚未开建（另立任务）：占位说明，不画假图表。
          ? h('div', { style: hintStyle }, t('statsPlaceholder'))
          : h('div', null,
            // ── 统计卡 + 趋势图 ──
            stats === undefined
              ? null
              : h('div', { style: statsAreaStyle },
                h('div', { style: cardsGridStyle },
                  card('statMyActive', String(stats.myActive), t('statMyActiveHint', { n: stats.myBlocked }), { scope: 'mine', status: 'all', workspace: '' }),
                  card('statOpen', String(stats.open), t('statOpenHint', { n: days(stats.oldestOpenDays) }), { scope: 'all', status: 'open', workspace: '' }),
                  card('statDoing', String(stats.doing), t('statDoingHint', { n: stats.doing - stats.myActive + stats.myBlocked }), { scope: 'all', status: 'active', workspace: '' }),
                  card('statBlocked', String(stats.blocked), t('statBlockedHint', { n: days(stats.longestBlockedDays) }), { scope: 'all', status: 'blocked', workspace: '' }),
                  card('statWeekDone', String(board?.closed.weekDone ?? 0), t('statWeekDoneHint'), { scope: 'all', status: 'all', workspace: '' }),
                  card('statStale', String(stats.stale), t('statStaleHint', { n: stats.staleDays }), { scope: 'all', status: 'stale', workspace: '' }),
                ),
                h('div', { className: 'dtl-card', style: chartCardStyle },
                  h('div', { style: { fontSize: 'var(--dtl-font-md)', fontWeight: 600 } }, t('chartTitle')),
                  chartBuckets.every((bucket) => bucket.value === 0)
                    ? h('div', { style: { ...hintStyle, padding: 'var(--dtl-space-4) 0' } }, t('chartEmpty'))
                    : h(BarChart, { buckets: chartBuckets, ariaLabel: t('chartTitle') }),
                  h('div', { style: { fontSize: 'var(--dtl-font-xs)', color: 'var(--dtl-fg-3)' } }, t('chartCaption')),
                ),
              ),

            // ── 筛选行（控件全同高 28px）──
            h('div', { style: filterRowStyle },
              h(Segmented<Scope>, {
                id: 'dtl-scope',
                value: state.query.scope,
                label: t('scopeLabel'),
                items: [
                  { value: 'mine', label: t('scopeMine') },
                  { value: 'all', label: t('scopeAll') },
                ],
                onChange: (next) => { setQuery({ scope: next }) },
              }),
              h(Segmented<StatusFilter>, {
                id: 'dtl-status',
                value: state.query.status,
                label: t('statusLabel'),
                items: [
                  { value: 'all', label: t('statusAll') },
                  { value: 'active', label: t('statusActive') },
                  { value: 'open', label: t('statusOpen') },
                  { value: 'blocked', label: t('statusBlocked') },
                  { value: 'stale', label: t('statusStale') },
                ],
                onChange: (next) => { setQuery({ status: next }) },
              }),
              h(Select<string>, {
                value: state.query.workspace,
                ariaLabel: t('workspaceLabel'),
                width: 180,
                options: [
                  { value: '', label: t('workspaceAll') },
                  ...(board?.workspaces ?? []).map((workspace) => ({ value: workspace.id, label: workspace.title })),
                ],
                onChange: (next) => { setQuery({ workspace: next }) },
              }),
              h('div', { style: searchWrapStyle },
                h(SearchInput, {
                  value: state.query.keyword,
                  placeholder: t('searchPlaceholder'),
                  ariaLabel: t('searchPlaceholder'),
                  onChange: (next) => { setQuery({ keyword: next }) },
                }),
              ),
            ),

            // ── 列表（两区；空态三分）──
            state.status === 'loading' && board === null
              ? null // 未就绪：不渲染
              : state.status === 'error' && board === null
                ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--dtl-space-2)' } },
                  h('span', { style: { color: 'var(--dtl-danger)', fontSize: 'var(--dtl-font-md)' } }, `${t('loadFailed')}：${state.error ?? ''}`),
                  h(Button, { variant: 'outline', size: 'sm', onClick: () => { void refresh() } }, t('retry')),
                )
                : board !== null && board.workspaces.length === 0
                  ? h(EmptyState, { tone: 'guide', title: t('emptyNoWorkspace'), hint: t('emptyNoWorkspaceHint') })
                  : view.total === 0
                    ? h(EmptyState, {
                      tone: isPristine(state.query) ? 'guide' : 'filtered',
                      title: isPristine(state.query) ? t('emptyNoTask') : t('emptyFiltered'),
                      hint: isPristine(state.query) ? t('emptyNoTaskHint') : undefined,
                    })
                    : h('div', null,
                      // 第一区：我的待办（跨工作区平铺，工作区为一列）
                      view.mine.length === 0
                        ? null
                        : h('div', null,
                          h('div', { style: regionHeadStyle },
                            h('span', null, `${t('regionMine')} ${view.mine.length}`),
                            h('span', { style: { fontSize: 'var(--dtl-font-xs)', color: 'var(--dtl-fg-3)', fontWeight: 400 } }, t('regionMineHint')),
                          ),
                          view.mine.map(row => h(TaskRowView, { key: row.key, t, row, showWorkspace: true })),
                        ),
                      // 第二区：按工作区分组（组可折叠）
                      view.groups.length === 0
                        ? null
                        : h('div', null,
                          h('div', { style: regionHeadStyle },
                            h('span', null, t('regionWorkspaces')),
                            h('span', { style: { fontSize: 'var(--dtl-font-xs)', color: 'var(--dtl-fg-3)', fontWeight: 400 } }, t('showingCount', { n: view.total - view.mine.length })),
                          ),
                          view.groups.map(group => h(WorkspaceGroupView, { key: group.workspaceId, t, group })),
                        ),
                    ),
          ),
      ),
    ),
  )
}

/** 一个工作区分组：标题行（可点折叠）+ 行列表。 */
function WorkspaceGroupView(props: { t: Translate; group: WorkspaceGroup }): ReactNode {
  const { t, group } = props
  const [open, setOpen] = useState(group.rows.length <= GROUP_COLLAPSE_OVER)
  return h('div', { style: { marginBottom: 'var(--dtl-space-3)' } },
    h('button', {
      type: 'button',
      className: 'dtl-row-head',
      style: groupHeadStyle,
      'aria-expanded': open,
      title: open ? t('collapseAria') : t('expandAria'),
      onClick: () => { setOpen(!open) },
    },
      h('span', { className: 'dtl-ellipsis', style: { flex: '1 1 auto', fontSize: 'var(--dtl-font-md)', fontWeight: 600 } }, group.title),
      h('span', { style: groupCountStyle }, t('groupHint', { doing: group.doingCount, open: group.openCount })),
    ),
    open
      ? h('div', { style: { marginTop: 'var(--dtl-space-2)' } },
        group.rows.map(row => h(TaskRowView, { key: row.key, t, row })),
      )
      : null,
  )
}

/** 卡片高亮：当前 query 是否正好落在该卡对应的视角上。 */
function isActive(query: Query, patch: Partial<Query>): boolean {
  return Object.entries(patch).every(([key, value]) => query[key as keyof Query] === value)
}

/** 是否「什么都没筛」：真空才给引导卡，一有筛选就只能是「筛选空」。 */
function isPristine(query: Query): boolean {
  return query.scope === 'all' && query.status === 'all' && query.workspace === '' && query.keyword.trim() === ''
}
