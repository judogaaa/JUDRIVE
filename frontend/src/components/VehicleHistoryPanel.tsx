import { useMemo, useState } from 'react'
import type { TrendPoint } from '../api/fleet'
import type { SessionSummary } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import { formatSessionDateTime } from '../lib/formatLocale'
import { AnomalyTrendChart } from './AnomalyTrendChart'

interface VehicleHistoryPanelProps {
  sessions: SessionSummary[]
  activeSessionId: string
  onSelectSession: (sessionId: string) => void
  trendPoints: TrendPoint[]
  trendError: string | null
}

export function VehicleHistoryPanel({
  sessions,
  activeSessionId,
  onSelectSession,
  trendPoints,
  trendError,
}: VehicleHistoryPanelProps) {
  const { t, locale } = useI18n()
  const [tab, setTab] = useState<'checks' | 'trend'>('checks')

  const chartPoints = useMemo(
    () =>
      trendPoints.filter(
        (point) =>
          !point.skipped &&
          point.status !== 'check_failed' &&
          typeof point.anomaly_score === 'number',
      ),
    [trendPoints],
  )

  return (
    <section className="panel diag-history" aria-labelledby="history-title">
      <div className="diag-history__head">
        <h2 id="history-title" className="panel__title">
          {t('history.title')}
        </h2>
        <div className="diag-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'checks'}
            className={tab === 'checks' ? 'diag-tab diag-tab--active' : 'diag-tab'}
            onClick={() => setTab('checks')}
          >
            {t('history.tab.checks')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'trend'}
            className={tab === 'trend' ? 'diag-tab diag-tab--active' : 'diag-tab'}
            onClick={() => setTab('trend')}
          >
            {t('history.tab.trend')}
          </button>
        </div>
      </div>
      {tab === 'checks' ? (
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
                  <span className="history-item__id">{session.session_id}</span>
                  <span className="history-item__date">{formatSessionDateTime(locale, session.checked_at)}</span>
                  {active ? <span className="history-item__mark">{t('history.selected')}</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : trendError ? (
        <p className="panel__error" role="alert">
          {trendError}
        </p>
      ) : (
        <AnomalyTrendChart points={chartPoints} />
      )}
    </section>
  )
}
