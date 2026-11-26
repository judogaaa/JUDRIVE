import type { SessionSummary } from '../api/types'

interface VehicleHistoryPanelProps {
  sessions: SessionSummary[]
  activeSessionId: string
  onSelectSession: (sessionId: string) => void
}

function formatCheckedAt(value: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

export function VehicleHistoryPanel({ sessions, activeSessionId, onSelectSession }: VehicleHistoryPanelProps) {
  return (
    <section className="panel" aria-labelledby="history-title">
      <h2 id="history-title" className="panel__title">
        История проверок
      </h2>
      <p className="panel__subtitle">Сессии диагностики по выбранному транспорту.</p>
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
                <span className="history-item__date">{formatCheckedAt(session.checked_at)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}