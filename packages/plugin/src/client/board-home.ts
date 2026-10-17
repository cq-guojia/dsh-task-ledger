/**
 * 看板首页（`main` 槽整页内容）：6 统计卡 + 近 8 周趋势图 + 两区任务列表。
 * 定稿见 docs/design/features/board-home.md §二（2026-10-17 专家组改版）；
 * 按钮矩阵归「任务按钮与会话交接」任务（写入路径 A/B 未拍板），本页**不画**任务动作按钮。
 *
 * 刷新纪律（2026-10-17 拍板）：挂载首读 + 手动刷新按钮，**不轮询**；空态三分
 * （未就绪不渲染 / 真空引导卡 / 筛选空小字）。
 */
import { createElement as h, useEffect, useMemo, useState, useSyncExternalStore, type ChangeEvent, type ReactNode } from 'react'
import { IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { LocaleKey, Translate } from './locales'
import { boardSnapshot, boardSubscribe, refresh, setQuery, type Query, type Scope, type StatusFilter } from './store'
import { selectView, type WorkspaceGroup } from './rows'
import type { PeriodCounts } from './types'
import { TaskRowView } from './task-row'
import {
  Button, ChartLegend, EmptyState, ensureUiBase, GroupedBarChart, SearchInput, Segmented, Select, StatCard,
} from './ui'

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
/** 统计区：左 8 块（2 行 × 4 列）+ 右趋势图，参考图同款分栏。
 *  列数写死 4 → 2（媒体查询在 ui.ts 的 .dtl-stats / .dtl-stats__cards 里），
 *  绝不给 3 列——3 列会排出 3+1 的非对称（用户 2026-10-17：必须上下对称）。 */
const statsRowStyle: Record<string, string | number> = { marginBottom: 'var(--dtl-space-4)' }
const chartCardStyle: Record<string, string | number> = {
  display: 'flex', flexDirection: 'column', gap: 'var(--dtl-space-2)', padding: 'var(--dtl-space-2) var(--dtl-space-3)',
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
  const card = (label: LocaleKey, value: number, hint: string, patch: Partial<Query>): ReactNode =>
    h(StatCard, {
      label: t(label),
      value,
      hint,
      active: isActive(state.query, patch),
      onClick: () => { setQuery(patch) },
    })

  /** 统计台卡：不可点（首页没有已结案可筛），hover 给具体日期区间。 */
  const periodCard = (label: LocaleKey, period: PeriodCounts | undefined): ReactNode =>
    h(StatCard, {
      label: t(label),
      value: period?.done ?? 0,
      hint: t('statCreatedHint', { n: period?.created ?? 0 }),
      interactive: false,
      title: period === undefined ? undefined : t('periodRange', { from: period.from, to: period.to }),
    })

  const [chartScope, setChartScope] = useState<'all' | 'mine'>('all')
  const chartWeeks = useMemo(() => (board === null ? [] : board.closed.weekly[chartScope]).map((bucket) => {
    // 容错：host 旧版可能不带 end（客户端/宿主版本错配时），退回用 week，绝不崩面板。
    const end = bucket.end ?? bucket.week ?? ''
    return {
      label: end.slice(5) || bucket.week?.slice(5) || '',
      done: bucket.done,
      remaining: bucket.remaining,
      created: bucket.created,
      title: `截至 ${end}｜${t('chartLegendDone')} ${bucket.done}｜${t('chartLegendRemaining')} ${bucket.remaining}｜${t('chartLegendCreated')} ${bucket.created}`,
    }
  }), [board, chartScope, t])
  const chartEmpty = chartWeeks.every((week) => week.done === 0 && week.created === 0 && week.remaining === 0)

  return h('div', { style: pageStyle },
    h('div', { style: { display: 'flex', justifyContent: 'center' } },
      h('div', { style: { width: '100%', maxWidth: '1280px', minWidth: 0, boxSizing: 'border-box' } },
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
            // ── 统计区：左 8 块（操作台 4 + 统计台 4）+ 右趋势图 ──
            stats === undefined
              ? null
              : h('div', { className: 'dtl-stats', style: statsRowStyle },
                h('div', { className: 'dtl-stats__cards' },
                  // 第一行 · 操作台（可点联动筛选）
                  card('statMyActive', stats.myActive, t('statMyActiveHint', { n: stats.myBlocked }), { scope: 'mine', status: 'all', workspace: '' }),
                  card('statOpen', stats.open, t('statOpenHint', { n: days(stats.oldestOpenDays) }), { scope: 'all', status: 'open', workspace: '' }),
                  card('statDoing', stats.doing, t('statDoingHint', { n: stats.doing - stats.myActive + stats.myBlocked }), { scope: 'all', status: 'active', workspace: '' }),
                  // 阻塞 · 停滞合并卡：主数字 = 阻塞数；有停滞时小字把「停滞」标红
                  h(StatCard, {
                    label: t('statBlockedStale'),
                    value: stats.blocked,
                    hint: stats.stale === 0
                      ? undefined
                      : h('span', null,
                        h('span', { style: { color: 'var(--dtl-danger)', fontWeight: 600 } }, t('statStaleWord')),
                        ` ${t('statStaleHint', { n: stats.stale })}`,
                      ),
                    active: isActive(state.query, { scope: 'all', status: 'blocked', workspace: '' }),
                    title: t('statStaleTitle', { n: stats.staleDays }),
                    onClick: () => { setQuery({ scope: 'all', status: 'blocked', workspace: '' }) },
                  }),
                  // 第二行 · 统计台（自然周期，不可点）
                  periodCard('statWeekDone', board?.trend.thisWeek),
                  periodCard('statLastWeekDone', board?.trend.lastWeek),
                  periodCard('statMonthDone', board?.trend.thisMonth),
                  periodCard('statLastMonthDone', board?.trend.lastMonth),
                ),
                h('div', { className: 'dtl-card', style: chartCardStyle },
                  // 右上角只留一个「只看我的」小复选框：勾上 = 我的，不勾 = 所有（用户 2026-10-17）
                  h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end' } },
                    h('label', { className: 'dtl-check' },
                      h('input', {
                        type: 'checkbox',
                        checked: chartScope === 'mine',
                        onChange: (event: ChangeEvent<HTMLInputElement>) => { setChartScope(event.target.checked ? 'mine' : 'all') },
                      }),
                      t('chartOnlyMine'),
                    ),
                  ),
                  chartEmpty
                    ? h('div', { style: { ...hintStyle, padding: 'var(--dtl-space-4) 0' } }, t('chartEmpty'))
                    : h(GroupedBarChart, {
                      weeks: chartWeeks,
                      ariaLabel: t('chartTitle'),
                      doneLabel: t('chartLegendDone'),
                      remainingLabel: t('chartLegendRemaining'),
                      createdLabel: t('chartLegendCreated'),
                    }),
                  h(ChartLegend, { doneLabel: t('chartLegendDone'), remainingLabel: t('chartLegendRemaining'), createdLabel: t('chartLegendCreated') }),
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
