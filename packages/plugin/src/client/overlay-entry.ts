/**
 * 右上浮标入口（`shell.overlay` list 条目，全帧浮层，条目并排添加不替换）。
 * 定位用宿主变量 `--dsh-frame-overlay-top`（标题栏净空 + 20px），**不写死 top 值**；
 * 浮层默认 `pointer-events:none`、子元素自动恢复 ⇒ 自绘条目不挡下方应用。
 *
 * 角标 = 我名下进行中计数（host 统计真值，SSE 已否 ⇒ 取自同一份快照，>0 才画）；
 * 0→n 跳变时一次脉冲动画，不自动消失。宿主**无**通知 API ⇒ 「通知」就是这个角标。
 */
import { createElement as h, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { Translate } from './locales'
import { boardSnapshot, boardSubscribe } from './store'
import { ensureUiBase, LedgerIcon } from './ui'

export function OverlayEntry(props: { t: Translate; onOpen: () => void }): ReactNode {
  const { t, onOpen } = props
  ensureUiBase()
  const state = useSyncExternalStore(boardSubscribe, boardSnapshot)
  const count = state.board?.stats.myActive ?? 0
  const previous = useRef(0)
  const [pulse, setPulse] = useState(0)

  // 0→n 跳变播一次脉冲；计数归零不播（角标本就不渲染）。
  useEffect(() => {
    if (count > previous.current) setPulse(value => value + 1)
    previous.current = count
  }, [count])

  return h('div', {
    style: {
      position: 'absolute',
      top: 'var(--dsh-frame-overlay-top,20px)',
      right: '12px',
      zIndex: 'var(--dtl-z-badge,20)',
      pointerEvents: 'auto',
    },
  },
    h('button', {
      type: 'button',
      title: t('openBoard'),
      'aria-label': t('openBoard'),
      onClick: onOpen,
      style: {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
        height: '32px',
        padding: 0,
        border: '1px solid var(--dtl-border)',
        borderRadius: 'var(--dtl-radius-sm)',
        background: 'var(--dtl-solid)',
        color: 'var(--dtl-on-solid)',
        boxShadow: 'var(--dtl-shadow-1)',
        cursor: 'pointer',
      },
    },
      h(LedgerIcon, { size: 18 }),
      count > 0
        ? h('span', { key: pulse, className: 'dtl-badge', 'data-pulse': pulse > 0, title: t('badgeTitle') }, String(count))
        : null,
    ),
  )
}
