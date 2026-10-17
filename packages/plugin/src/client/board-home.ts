/**
 * 看板首页（`main` 槽整页内容）：6 统计卡 + 近 8 周趋势图 + 两区任务列表。
 * 定稿见 docs/design/features/board-home.md §二（2026-10-17 专家组改版）；
 * 按钮矩阵归「任务按钮与会话交接」任务（写入路径 A/B 未拍板），本页**不画**任务动作按钮。
 *
 * 刷新纪律（2026-10-17 拍板）：挂载首读 + 手动刷新按钮，**不轮询**；空态三分
 * （未就绪不渲染 / 真空引导卡 / 筛选空小字）。
 */
import { createElement as h, useEffect, useMemo, useState, useSyncExternalStore, type ChangeEvent, type ReactNode } from 'react'
import {
  IconChecklistOutlineRegular, IconFlatListOutlineRegular, IconFolderOpenOutlineRegular, IconRefreshOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { LocaleKey, Translate } from './locales'
import { boardSnapshot, boardSubscribe, refresh, setQuery, type StatusFilter } from './store'
import { isMine, selectView, type WorkspaceGroup } from './rows'
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
const hintStyle: Record<string, string | number> = { fontSize: 'var(--dtl-font-sm)', color: 'var(--dtl-fg-2)' }
/** 分区标题行：垂直居中（用户 2026-10-17：图标 / 标题 / 计数不许像下楼梯一样逐个低）。 */
const regionHeadRowStyle: Record<string, string | number> = {
  display: 'flex', alignItems: 'center', gap: 'var(--dtl-space-2)',
  margin: 'var(--dtl-space-4) 0 var(--dtl-space-2)',
}
const regionHeadTitleStyle: Record<string, string | number> = { fontSize: 'var(--dtl-font-lg)', fontWeight: 600 }
/** 工作区下拉最小宽度（用户 2026-10-17：内容自适应，下限 = 旧定宽 175 的 3/4 ≈ 131）。 */
const WORKSPACE_SELECT_MIN = 131
/** 搜索框宽度（用户 2026-10-17：两区同款，96×2 = 192）。 */
const SEARCH_WIDTH = 192

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
  // 工作区下拉候选（用户 2026-10-17）：不读系统全量工作区，只从「我的」任务里提取工作区并排重
  // ⇒ 没有我任务的工作区不出现；口径与第一区一致（isMine 同源）。
  const workspaceOptions = useMemo(() => [
    { value: '', label: t('workspaceAll') },
    ...[...new Map((board?.tasks ?? [])
      .filter((task) => isMine(task, board))
      .map((task) => [task.workspace.id, task.workspace.title]))]
      .map(([id, title]) => ({ value: id, label: title })),
  ], [board, t])
  const days = (value: number | null | undefined): string =>
    value === null || value === undefined ? t('daysNone') : t('daysValue', { n: value })

  /** 统计卡：纯展示（用户 2026-10-17：先全去掉点击，界面定稿后再议滚动 / 筛选联动）。 */
  const card = (label: LocaleKey, value: number, hint: string): ReactNode =>
    h(StatCard, {
      label: t(label),
      value,
      hint,
      interactive: false,
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
      title: chartScope === 'mine' ? `截至 ${end}（${t('chartOnlyMine')}）` : `截至 ${end}`,
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
                  // 第一行 · 操作台（纯展示）
                  card('statMyActive', stats.myActive, t('statMyActiveHint', { n: stats.myBlocked })),
                  card('statOpen', stats.open, t('statOpenHint', { n: days(stats.oldestOpenDays) })),
                  card('statDoing', stats.doing, t('statDoingHint', { n: stats.doing - stats.myActive + stats.myBlocked })),
                  // 阻塞 · 停滞合并卡：主数字 = 阻塞 + 停滞合计，小字拆开报数（用户 2026-10-18）
                  h(StatCard, {
                    label: t('statBlockedStale'),
                    value: stats.blocked + stats.stale,
                    hint: t('statBlockedSplit', { blocked: stats.blocked, stale: stats.stale }),
                    title: t('statStaleTitle', { n: stats.staleDays }),
                    interactive: false,
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

            // ── 列表 ──
            state.status === 'loading' && board === null
              ? null // 未就绪：不渲染
              : state.status === 'error' && board === null
                ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--dtl-space-2)' } },
                  h('span', { style: { color: 'var(--dtl-danger)', fontSize: 'var(--dtl-font-md)' } }, `${t('loadFailed')}：${state.error ?? ''}`),
                  h(Button, { variant: 'outline', size: 'sm', onClick: () => { void refresh() } }, t('retry')),
                )
                : board !== null && board.workspaces.length === 0
                  ? h(EmptyState, { tone: 'guide', title: t('emptyNoWorkspace'), hint: t('emptyNoWorkspaceHint') })
                  : h('div', null,
                      // 第一区：我的待办——定死全量、不过滤（用户 2026-10-17），空了给引导卡；
                      // 标题行右侧挂搜索框（只作用第三区），计数用小圆徽
                      h('div', { style: regionHeadRowStyle },
                        h('span', { style: { color: 'var(--dtl-fg-3)', display: 'inline-flex', flex: 'none' } },
                          h(IconChecklistOutlineRegular, { size: 16 })),
                        h('span', { style: regionHeadTitleStyle }, t('regionMine')),
                        view.mine.length > 0
                          ? h('span', { className: 'dtl-count' }, t('mineCount', { n: view.mine.length }))
                          : null,
                        h('span', { style: { flex: '1 1 auto' } }),
                        // 工作区下拉：内容自适应、下限 131（用户 2026-10-17）
                        h(Select<string>, {
                          value: workspaceOptions.some((option) => option.value === state.query.workspace)
                            ? state.query.workspace
                            : '',
                          options: workspaceOptions,
                          ariaLabel: t('workspaceLabel'),
                          minWidth: WORKSPACE_SELECT_MIN,
                          onChange: (next) => { setQuery({ workspace: next }) },
                        }),
                        // 搜索框：在下拉右边、与「其他待办」同宽 192（用户 2026-10-17）
                        h('div', { style: { width: `${SEARCH_WIDTH}px`, flex: 'none' } },
                          h(SearchInput, {
                            value: state.query.keyword,
                            placeholder: t('searchPlaceholder'),
                            ariaLabel: t('searchPlaceholder'),
                            onChange: (next) => { setQuery({ keyword: next }) },
                          }),
                        ),
                      ),
                      view.mine.length === 0
                        ? h(EmptyState, { tone: 'guide', title: t('mineEmpty'), hint: t('mineEmptyHint') })
                        : view.mine.map(row => h(TaskRowView, {
                          key: row.key, t, row, variant: 'mine', staleDays: board?.stats.staleDays ?? null,
                        })),
                      // 第二区：其他待办 —— **永远渲染**（用户 2026-10-18：选「进行中」没数据也不能整块消失）；
                      // 标题行：图标 + 名 + 状态滑轨（带全量角标）+ 搜索（最右）；表格区无数据给虚线空态
                      h('div', null,
                        h('div', { style: regionHeadRowStyle },
                          h('span', { style: { color: 'var(--dtl-fg-3)', display: 'inline-flex', flex: 'none' } },
                            h(IconFlatListOutlineRegular, { size: 16 })),
                          h('span', { style: { ...regionHeadTitleStyle, fontSize: 'var(--dtl-font-md)' } }, t('regionOthers')),
                          h('span', { style: { flex: '1 1 auto' } }),
                          // 状态滑轨：角标 = 第二区**全量**计数（不受滑轨自身影响）；0 不标数字
                          h(Segmented<StatusFilter>, {
                            id: 'dtl-others-status',
                            value: state.query.status,
                            label: t('statusLabel'),
                            items: [
                              { value: 'all', label: t('statusAll'), badge: orZero(view.othersCounts.total) },
                              { value: 'active', label: t('statusActive'), badge: orZero(view.othersCounts.doing) },
                              { value: 'open', label: t('statusOpen'), badge: orZero(view.othersCounts.open) },
                              { value: 'blocked', label: t('statusBlocked'), badge: orZero(view.othersCounts.blocked) },
                              { value: 'stale', label: t('statusStale'), badge: orZero(view.othersCounts.stale) },
                            ],
                            onChange: (next) => { setQuery({ status: next }) },
                          }),
                          h('div', { style: { width: `${SEARCH_WIDTH}px`, flex: 'none' } },
                            h(SearchInput, {
                              value: state.query.othersKeyword,
                              placeholder: t('searchPlaceholder'),
                              ariaLabel: t('searchPlaceholder'),
                              onChange: (next) => { setQuery({ othersKeyword: next }) },
                            }),
                          ),
                        ),
                        view.groups.length === 0
                          // 空态：虚线框 + 两排字 + 按钮（参考 dispatch 空态；按钮先接「回会话」，
                          // 真正的「起会话建任务」归会话交接任务）
                          ? h('div', { className: 'dtl-empty-guide', style: { marginTop: 'var(--dtl-space-2)' } },
                            h('div', { style: { fontSize: 'var(--dtl-font-lg)', fontWeight: 600, marginBottom: 'var(--dtl-space-1)' } }, t('othersEmptyTitle')),
                            h('div', { style: { fontSize: 'var(--dtl-font-md)', color: 'var(--dtl-fg-2)', marginBottom: 'var(--dtl-space-3)' } }, t('othersEmptyHint')),
                            h(Button, { variant: 'primary', size: 'md', onClick: onBack }, t('othersEmptyAction')),
                          )
                          : h('div', { style: { marginTop: 'var(--dtl-space-2)' } },
                            view.groups.map(group => h(WorkspaceGroupView, {
                              key: group.workspaceId, t, group, staleDays: board?.stats.staleDays ?? null,
                            })),
                          ),
                      ),
                    ),
          ),
      ),
    ),
  )
}

/** 角标：>0 才给数字，0 = undefined（不标）。 */
function orZero(n: number): number | undefined {
  return n > 0 ? n : undefined
}

/** 一个工作区分组（其他待办表格段）：段头（点+名+统计）→ 列头行 → 任务行。
 *  统计口径（用户 2026-10-18）：共 N｜待办 N｜进行中 N 常显（0 也显）；
 *  阻塞 / 停滞**只在 >0 时出现**。 */
function WorkspaceGroupView(props: { t: Translate; group: WorkspaceGroup; staleDays?: number | null }): ReactNode {
  const { t, group, staleDays } = props
  const [open, setOpen] = useState(group.rows.length <= GROUP_COLLAPSE_OVER)
  const stats = [
    t('groupTotal', { n: group.total }),
    t('groupOpen', { n: group.openCount }),
    t('groupDoing', { n: group.doingCount }),
    ...(group.blockedCount > 0 ? [t('groupBlocked', { n: group.blockedCount })] : []),
    ...(group.staleCount > 0 ? [t('groupStale', { n: group.staleCount })] : []),
  ].join(' ｜ ')
  return h('div', { className: 'dtl-group' },
    h('button', {
      type: 'button',
      className: 'dtl-group__head',
      'aria-expanded': open,
      title: open ? t('collapseAria') : t('expandAria'),
      onClick: () => { setOpen(!open) },
    },
      // 段头标识：工作区的官方图标就是文件夹（用户 2026-10-18）；包里没有 ⇒ 回落成竖线
      IconFolderOpenOutlineRegular === undefined
        ? h('span', { className: 'dtl-group__bar' })
        : h('span', { style: { display: 'inline-flex', flex: 'none', color: 'var(--dtl-business)' } },
            h(IconFolderOpenOutlineRegular, { size: 14 })),
      h('span', { className: 'dtl-group__name dtl-ellipsis' }, group.title),
      h('span', { style: { flex: '1 1 auto' } }),
      h('span', { className: 'dtl-group__stats' }, stats),
    ),
    open
      ? h('div', null,
        // 无列头行（用户 2026-10-18：表头就是段头——左工作区名、右统计，不放「任务/创建人」那排）
        group.rows.map(row => h(TaskRowView, {
          key: row.key, t, row, variant: 'others', staleDays,
        })),
      )
      : null,
  )
}

