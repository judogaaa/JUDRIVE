import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { fetchVehicleInsight, type TrendPoint, type VehicleFleetRow, type VehicleInsight } from '../api/fleet'
import { useI18n } from '../i18n/I18nContext'
import { formatSessionDateTime } from '../lib/formatLocale'
import { resolveErrorMessage } from '../lib/i18nError'
import { AnomalyTrendChart } from './AnomalyTrendChart'

interface VehicleInsightPanelProps {
  vehicleId: string | null
  onClose: () => void
  onOpenDiagnosis: (vehicleId: string, sessionId: string) => void
  onOpenTickets?: (vehicleId: string) => void
}

export function VehicleInsightPanel({ vehicleId, onClose, onOpenDiagnosis, onOpenTickets }: VehicleInsightPanelProps) {
  const { t, locale } = useI18n()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [row, setRow] = useState<VehicleFleetRow | null>(null)
  const [history, setHistory] = useState<VehicleInsight['history']>([])
  const [trend, setTrend] = useState<TrendPoint[]>([])

  useEffect(() => {
    if (!vehicleId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchVehicleInsight(vehicleId)
      .then((data) => {
        if (cancelled) return
        setRow(data.vehicle)
        setHistory(data.history)
        setTrend(data.trend_points)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(resolveErrorMessage(t, err, 'error.insight'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [vehicleId, t])

  if (!vehicleId) return null

  return (
    <div className="source-drawer" role="dialog" aria-modal="true">
      <div className="source-drawer__backdrop" onClick={onClose} />
      <div className="source-drawer__panel">
        <header className="source-drawer__header">
          <div>
            <p className="source-drawer__eyebrow">{t('insight.title')}</p>
            <h3>{vehicleId}</h3>
            {row ? (
              <p className="source-drawer__meta">
                {row.category_reason} · {row.latest_session_id}
              </p>
            ) : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('insight.close')}>
            <X size={18} aria-hidden />
          </button>
        </header>

        {loading ? <p className="panel__subtitle">{t('insight.loading')}</p> : null}
        {error ? <p className="panel__error">{error}</p> : null}

        {row ? (
          <>
            <AnomalyTrendChart points={trend} />
            {row.early_warnings.length ? (
              <ul className="insight-warnings">
                {row.early_warnings.map((w) => (
                  <li key={w.code}>
                    <strong>{w.code}</strong> — {w.message}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="workflow-actions">
              <button
                type="button"
                className="btn btn--primary btn--block"
                onClick={() => onOpenDiagnosis(row.vehicle_id, row.latest_session_id)}
              >
                {t('insight.openDiagnosis')}
              </button>
              {onOpenTickets ? (
                <button type="button" className="btn btn--secondary btn--block" onClick={() => onOpenTickets(row.vehicle_id)}>
                  {t('nav.tickets')}
                </button>
              ) : null}
            </div>
            <ul className="history-list" style={{ maxHeight: 'none', marginTop: '1rem' }}>
              {history.map((h) => (
                <li key={h.session_id}>
                  <button
                    type="button"
                    className="history-item"
                    onClick={() => onOpenDiagnosis(vehicleId, h.session_id)}
                  >
                    <span className="history-item__id">
                      {h.session_id} · {h.status}
                      {h.anomaly_type ? ` · ${h.anomaly_type}` : ''}
                    </span>
                    <span className="history-item__date">{formatSessionDateTime(locale, h.checked_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  )
}