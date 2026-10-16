/**
 * 看板首页（`main` 槽整页内容）：4 统计卡（可点联动筛选）+ 筛选行 + 统一任务列表。
 * 定稿见 docs/design/features/board-home.md §二；按钮矩阵归「任务按钮与会话交接」任务（写入路径 A/B 未拍板），
 * 本页**不画**任务动作按钮——不先斩后奏。
 *
 * 刷新纪律（2026-10-17 拍板）：挂载首读 + 手动刷新按钮，**不轮询**；空态三分（未就绪不渲染 / 真空引导卡 / 筛选空小字）。
 */
import { createElement as h, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Button, IconRefreshOutlineRegular, SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives'
import type { LocaleKey, Translate } from './locales'
import {
  boardSnapshot, boardSubscribe, HISTORY_PAGE, loadMoreHistory, refresh, setQuery,
  type Bucket,
} from './store'
import type { RangeKey } from './format'
import { selectRows } from './rows'
import { EmptyState, ensureUiBase, SearchInput, Select, StatCard } from './ui'
import { TaskRowView } from './task-row'

type Tab = 'tasks' | 'stats'

/** 整页容器：占满中栏、自己滚动。 */
const pageStyle: Record<string, string> = {
  height: '100%', width: '100%', boxSizing: 'border-box', overflow: 'auto',
  padding: '24px 22px', color: 'var(--dtl-fg)',
}
const headerStyle: Record<string, string> = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--dtl-space-3)', flexWrap: 'wrap',
  marginBottom: 'var(--dtl-space-4)',
}
const titleStyle: Record<string, string | number> = { fontSize: 'var(--dtl-font-xl)', fontWeight: 600 }
const statsGridStyle: Record<string, string> = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 'var(--dtl-space-3)',
  marginBottom: 'var(--dtl-space-4)',
}
const filterRowStyle: Record<string, string> = {
  display: 'flex', alignItems: 'center', gap: 'var(--dtl-space-2)', flexWrap: 'wrap',
  marginBottom: 'var(--dtl-space-3)',
}
const hintStyle: Record<string, string> = { fontSize: 'var(--dtl-font-sm)', color: 'var(--dtl-fg-2)' }

export function BoardHome(props: { t: Translate; onBack: () => void }): ReactNode {
  const { t, onBack } = props
  ensureUiBase()
  const state = useSyncExternalStore(boardSubscribe, boardSnapshot)
  const [tab, setTab] = useState<Tab>('tasks')

  // 打开面板首读（后端纯按需，无推送无轮询）。
  useEffect(() => { void refresh() }, [])

  const board = state.board
  const rows = useMemo(() => selectRows(state), [state])
  const tagOptions = useMemo(
    () => [{ value: '', label: t('tagAll') }, ...(state.filters?.tags ?? []).map(tag => ({ value: tag, label: `#${tag}` }))],
    [state.filters, t],
  )

  /** 统计卡 → 筛选联动（点第二下不反选：档位语义是「切到这一档」，不是开关）。 */
  const card = (label: LocaleKey, value: string, bucket: Bucket, range: RangeKey): ReactNode =>
    h(StatCard, {
      label: t(label),
      value,
      active: state.query.bucket === bucket && (bucket !== 'closed' || state.query.range === range),
      onClick: () => { setQuery({ bucket, range, limit: HISTORY_PAGE }) },
    })

  return h('div', { style: pageStyle },
    h('div', { style: { display: 'flex', justifyContent: 'center' } },
      h('div', { style: { width: '100%', maxWidth: '1120px', minWidth: 0, boxSizing: 'border-box' } },
        h('div', { style: headerStyle },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--dtl-space-3)', minWidth: 0 } },
            h(Button, { variant: 'outline', size: 'md', onClick: onBack }, `← ${t('backToConversation')}`),
            h('div', { style: titleStyle }, t('panelTitle')),
          ),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--dtl-space-2)' } },
            h(SegmentedControl<Tab>, {
              id: 'dtl-tab',
              value: tab,
              label: t('panelTitle'),
              options: [
                { value: 'tasks', label: t('tabTasks') },
                { value: 'stats', label: t('tabStats') },
              ],
              onChange: setTab,
            }),
            h(Button, {
              variant: 'outline',
              size: 'md',
              icon: h(IconRefreshOutlineRegular, { size: 16 }),
              title: t('refresh'),
              disabled: state.refreshing,
              onClick: () => { void refresh() },
            }, state.refreshing ? t('refreshing') : t('refresh')),
          ),
        ),

        tab === 'stats'
          // 统计报表尚未开建（另立任务）：占位说明，不画假图表。
          ? h('div', { style: hintStyle }, t('statsPlaceholder'))
          : h('div', null,
            // ── 统计卡区 ──
            board === null
              ? null
              : h('div', { style: statsGridStyle },
                card('statMyActive', String(board.stats.myActive), 'mine', 'all'),
                card('statOpen', String(board.stats.open), 'open', 'all'),
                card('statWeekDone', String(board.closed.weekDone), 'closed', 'week'),
                card('statYearDone', board.closed.yearCapped ? t('countCapped') : String(board.closed.yearDone), 'closed', 'year'),
              ),

            // ── 筛选行 ──
            h('div', { style: filterRowStyle },
              h(SegmentedControl<Bucket>, {
                id: 'dtl-bucket',
                value: state.query.bucket,
                label: t('bucketLabel'),
                options: [
                  { value: 'all', label: t('bucketAll') },
                  { value: 'mine', label: t('bucketMine') },
                  { value: 'open', label: t('bucketOpen') },
                  { value: 'closed', label: t('bucketClosed') },
                ],
                onChange: (next) => { setQuery({ bucket: next, limit: HISTORY_PAGE }) },
              }),
              h(Select<RangeKey>, {
                value: state.query.range,
                ariaLabel: t('rangeLabel'),
                options: [
                  { value: 'all', label: t('rangeAll') },
                  { value: 'week', label: t('rangeWeek') },
                  { value: 'month', label: t('rangeMonth') },
                  { value: 'year', label: t('rangeYear') },
                ],
                onChange: (next) => { setQuery({ range: next, limit: HISTORY_PAGE }) },
              }),
              h(Select<string>, {
                value: state.query.tag,
                ariaLabel: t('tagAll'),
                options: tagOptions,
                onChange: (next) => { setQuery({ tag: next, limit: HISTORY_PAGE }) },
              }),
              h(SearchInput, {
                value: state.query.keyword,
                placeholder: t('searchPlaceholder'),
                ariaLabel: t('searchPlaceholder'),
                onChange: (next) => { setQuery({ keyword: next }) },
              }),
            ),

            // ── 列表（空态三分）──
            state.status === 'loading' && board === null
              ? null // 未就绪：不渲染
              : state.status === 'error' && board === null
                ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--dtl-space-2)' } },
                  h('span', { style: { color: 'var(--dtl-danger)', fontSize: 'var(--dtl-font-md)' } }, `${t('loadFailed')}：${state.error ?? ''}`),
                  h(Button, { variant: 'outline', size: 'sm', onClick: () => { void refresh() } }, t('retry')),
                )
                : board !== null && board.workspaces.length === 0
                  ? h(EmptyState, { tone: 'guide', title: t('emptyNoWorkspace'), hint: t('emptyNoWorkspaceHint') })
                  : state.query.bucket === 'closed' && state.historyStatus === 'loading' && state.history.length === 0
                    ? h('div', { style: hintStyle }, t('loading'))
                    : state.query.bucket === 'closed' && state.historyStatus === 'error'
                      ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--dtl-space-2)' } },
                        h('span', { style: { color: 'var(--dtl-danger)', fontSize: 'var(--dtl-font-md)' } }, `${t('loadFailed')}：${state.historyError ?? ''}`),
                        h(Button, { variant: 'outline', size: 'sm', onClick: () => { setQuery({}) } }, t('retry')),
                      )
                      : rows.length === 0
                        ? h(EmptyState, {
                          tone: isPristine(state) ? 'guide' : 'filtered',
                          title: isPristine(state) ? t('emptyNoTask') : t('emptyFiltered'),
                          hint: isPristine(state) ? t('emptyNoTaskHint') : undefined,
                        })
                        : h('div', null,
                          rows.map(row => h(TaskRowView, { key: row.key, t, row })),
                          h('div', { style: { ...filterRowStyle, marginTop: 'var(--dtl-space-3)', color: 'var(--dtl-fg-3)', fontSize: 'var(--dtl-font-xs)' } },
                            h('span', null, t('showingCount', { n: rows.length })),
                            state.query.bucket === 'closed' && state.history.length >= state.query.limit
                              ? h(Button, {
                                variant: 'outline',
                                size: 'sm',
                                disabled: state.historyStatus === 'loading',
                                onClick: () => { loadMoreHistory() },
                              }, state.historyStatus === 'loading' ? t('loading') : t('loadMore'))
                              : null,
                          ),
                        ),
          ),
      ),
    ),
  )
}

/** 是否「什么都没筛」：真空才给引导卡，一有筛选就只能是「筛选空」。 */
function isPristine(state: ReturnType<typeof boardSnapshot>): boolean {
  const { query } = state
  return query.bucket === 'all' && query.range === 'all' && query.tag === '' && query.keyword.trim() === ''
}
