import type { SessionSummary } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import { formatSessionDateTime } from '../lib/formatLocale'

interface VehicleHistoryPanelProps {
  sessions: SessionSummary[]
  activeSessionId: string
  onSelectSession: (sessionId: string) => void
}

export function VehicleHistoryPanel({ sessions, activeSessionId, onSelectSession }: VehicleHistoryPanelProps) {
  const { t, locale } = useI18n()

  return (
    <section className="panel" aria-labelledby="history-title">
      <h2 id="history-title" className="panel__title">
        {t('history.title')}
      </h2>
      <p className="panel__subtitle">{t('history.subtitle')}</p>
      <ul className="history-list">
        {sessions.map((session) => {
          const active = session.session_id === activeSessionId
          return (
            <li key={session.session_id}>
              <button
                type="button"
                className={active ? 'history-item history-item--active' : 'history-item'}
                onClick={() => onSelectSession(session.session_id)}
              >
                <span className="history-item__id">{session.session_id}</span>
                <span className="history-item__date">{formatSessionDateTime(locale, session.checked_at)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}