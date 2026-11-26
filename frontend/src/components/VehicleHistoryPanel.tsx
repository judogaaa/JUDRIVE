import { useEffect, useState } from 'react'
import { ChartNoAxesCombined, Check, List } from 'lucide-react'
import { fetchVehicleDiagnosisHistory } from '../api/client'
import type { TrendPoint } from '../api/fleet'
import type { SessionSummary } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import { formatSessionDateTime } from '../lib/formatLocale'
import { AnomalyTrendChart } from './AnomalyTrendChart'

interface VehicleHistoryPanelProps {
  vehicleId: string
  sessions: SessionSummary[]
  activeSessionId: string
  onSelectSession: (sessionId: string) => void
}

type TrendState = { status: 'loading' | 'error' } | { status: 'ready'; points: TrendPoint[] }

export function VehicleHistoryPanel({ vehicleId, sessions, activeSessionId, onSelectSession }: VehicleHistoryPanelProps) {
  const { t, locale } = useI18n()
  const [tab, setTab] = useState<'checks' | 'trend'>('checks')
  const [trend, setTrend] = useState<TrendState>({ status: 'loading' })
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (tab !== 'trend' || !vehicleId) return
    let cancelled = false
    setTrend({ status: 'loading' })
    fetchVehicleDiagnosisHistory(vehicleId)
      .then((points) => { if (!cancelled) setTrend({ status: 'ready', points }) })
      .catch(() => { if (!cancelled) setTrend({ status: 'error' }) })
    return () => { cancelled = true }
  }, [vehicleId, tab, retry])

  return (
    <section className="panel diagnosis-history" aria-labelledby="history-title">
      <div className="diagnosis-history__head">
        <h2 id="history-title" className="panel__title">{t('history.title')}</h2>
        <span className="panel__subtitle">{sessions.length}</span>
      </div>
      <div className="history-toggle" role="group" aria-label={t('history.title')}>
        <button type="button" aria-pressed={tab === 'checks'} onClick={() => setTab('checks')}>
          <List size={16} aria-hidden />{t('history.checks')}
        </button>
        <button type="button" aria-pressed={tab === 'trend'} onClick={() => setTab('trend')}>
          <ChartNoAxesCombined size={16} aria-hidden />{t('history.trend')}
        </button>
      </div>
      {tab === 'checks' ? (
        <>
          {sessions.length === 0 ? <p className="panel__subtitle">{t('history.empty')}</p> : null}
          <ul className="history-list">
            {sessions.map((session) => {
              const active = session.session_id === activeSessionId
              return (
                <li key={session.session_id}>
                  <button
                    type="button"
                    className={active ? 'history-item history-item--active' : 'history-item'}
                    aria-current={active ? 'true' : undefined}
                    onClick={() => onSelectSession(session.session_id)}
                  >
                    <span className="history-item__id">{active ? <Check size={14} aria-hidden /> : null}{session.session_id}</span>
                    <span className="history-item__date">{formatSessionDateTime(locale, session.checked_at)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : trend.status === 'loading' ? (
        <p className="panel__subtitle" role="status">{t('insight.loading')}</p>
      ) : trend.status === 'error' ? (
        <div className="history-error" role="status">
          <p className="panel__subtitle">{t('history.trendUnavailable')}</p>
          <button type="button" className="btn btn--secondary" onClick={() => setRetry((n) => n + 1)}>{t('history.retry')}</button>
        </div>
      ) : (
        <AnomalyTrendChart points={'points' in trend ? trend.points.filter((p) => !p.skipped && p.status !== 'check_failed') : []} />
      )}
    </section>
  )
}
