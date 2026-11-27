import { useEffect, useRef } from 'react'
import { CalendarClock, Check, X } from 'lucide-react'
import type { SessionSummary } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import { formatSessionDateTime } from '../lib/formatLocale'

interface SessionChooserProps {
  open: boolean
  sessions: SessionSummary[]
  activeSessionId: string
  onSelect: (sessionId: string) => void
  onClose: () => void
}

export function SessionChooser({ open, sessions, activeSessionId, onSelect, onClose }: SessionChooserProps) {
  const { t, locale } = useI18n()
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="session-chooser" role="dialog" aria-modal="true" aria-labelledby="session-chooser-title">
      <div className="session-chooser__backdrop" onClick={onClose} />
      <div className="session-chooser__panel">
        <header className="session-chooser__head">
          <div>
            <p className="eyebrow">{t('diag.check')}</p>
            <h2 id="session-chooser-title">{t('diag.sessionChooserTitle')}</h2>
            <p>{t('diag.sessionChooserHint')}</p>
          </div>
          <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} aria-hidden />
          </button>
        </header>
        <ul className="session-chooser__list">
          {sessions.map((session) => {
            const active = session.session_id === activeSessionId
            return (
              <li key={session.session_id}>
                <button
                  type="button"
                  className={active ? 'session-option session-option--active' : 'session-option'}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => {
                    onSelect(session.session_id)
                    onClose()
                  }}
                >
                  <span className="session-option__icon" aria-hidden>
                    <CalendarClock size={17} />
                  </span>
                  <span className="session-option__text">
                    <strong>{session.session_id}</strong>
                    <span>{formatSessionDateTime(locale, session.checked_at)}</span>
                  </span>
                  {active ? (
                    <span className="session-option__mark">
                      <Check size={15} aria-hidden />
                      {t('history.selected')}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
