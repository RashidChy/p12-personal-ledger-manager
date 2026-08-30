/** Small shared presentational pieces used across every section. */
import { useEffect, useRef, type ReactNode } from 'react'

export type Tone = 'neutral' | 'positive' | 'warning' | 'critical' | 'info' | 'accent'

/** Text prefix so a tone is never signalled by colour alone. */
const TONE_MARK: Record<Tone, string> = {
  neutral: '•',
  positive: '✓',
  warning: '!',
  critical: '×',
  info: 'i',
  accent: '★',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`badge ${tone}`}>
      <span aria-hidden="true">{TONE_MARK[tone]}</span>
      {children}
    </span>
  )
}

export function Notice({
  tone = 'info',
  title,
  children,
  onDismiss,
}: {
  tone?: Tone
  title?: string
  children: ReactNode
  onDismiss?: () => void
}) {
  return (
    <div className={`notice ${tone}`} role={tone === 'critical' ? 'alert' : 'status'}>
      <span className="notice-icon" aria-hidden="true">
        {TONE_MARK[tone]}
      </span>
      <div style={{ flex: 1 }}>
        {title ? <strong>{title} </strong> : null}
        {children}
      </div>
      {onDismiss ? (
        <button type="button" className="ghost small" onClick={onDismiss}>
          Dismiss
        </button>
      ) : null}
    </div>
  )
}

export function StatCard({
  label,
  value,
  note,
  tone = 'neutral',
  badge,
}: {
  label: string
  value: ReactNode
  note?: ReactNode
  tone?: 'neutral' | 'accent' | 'positive' | 'warning' | 'critical'
  badge?: ReactNode
}) {
  return (
    <div className="card">
      <div className={`kpi ${tone}`}>
        <span className="kpi-label">{label}</span>
        <span className="kpi-value">{value}</span>
        {badge}
        {note ? <span className="kpi-note">{note}</span> : null}
      </div>
    </div>
  )
}

export function Meter({ percent, over = false, label }: { percent: number; over?: boolean; label: string }) {
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div
      className={`meter ${over ? 'over' : ''}`}
      role="meter"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <span style={{ width: `${clamped}%` }} />
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children ? <div className="small">{children}</div> : null}
    </div>
  )
}

/** Accessible modal: focus trap, Escape to close, backdrop click to close. */
export function Modal({
  title,
  description,
  onClose,
  children,
  labelledBy = 'modal-title',
}: {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  labelledBy?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const node = ref.current
    const focusable = node?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    focusable?.[0]?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !node) return
      const items = [...node.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )].filter((el) => el.offsetParent !== null)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      previouslyFocused.current?.focus?.()
    }
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={ref}>
        <h2 id={labelledBy}>{title}</h2>
        {description ? <p className="modal-sub">{description}</p> : null}
        {children}
      </div>
    </div>
  )
}

/** Deletion is always confirmed, and the confirmation names what will go. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: {
  title: string
  message: ReactNode
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal title={title} onClose={onCancel} labelledBy="confirm-title">
      <div className="stack-sm">
        <div className="notice warning">
          <span className="notice-icon" aria-hidden="true">!</span>
          <div>{message}</div>
        </div>
        <div className="form-actions">
          <button type="button" className="danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function Method({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="method">
      <summary>{summary}</summary>
      {children}
    </details>
  )
}
