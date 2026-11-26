import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { fetchVehicleInsight, type TrendPoint, type VehicleFleetRow, type VehicleInsight } from '../api/fleet'
import { AnomalyTrendChart } from './AnomalyTrendChart'

interface VehicleInsightPanelProps {
  vehicleId: string | null
  onClose: () => void
  onOpenDiagnosis: (vehicleId: string, sessionId: string) => void
}

function formatWhen(value: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return value
  }
}

export function VehicleInsightPanel({ vehicleId, onClose, onOpenDiagnosis }: VehicleInsightPanelProps) {
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
        if (!cancelled) setError(err instanceof Error ? err.message : 'Ошибка загрузки')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [vehicleId])

  if (!vehicleId) return null

  return (
    <div className="source-drawer" role="dialog" aria-modal="true">
      <div className="source-drawer__backdrop" onClick={onClose} />
      <div className="source-drawer__panel">
        <header className="source-drawer__header">
          <div>
            <p className="source-drawer__eyebrow">История ТС</p>
            <h3>{vehicleId}</h3>
            {row ? (
              <p className="source-drawer__meta">
                {row.category_reason} · {row.latest_session_id}
              </p>
            ) : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </header>

        {loading ? <p className="panel__subtitle">Загрузка…</p> : null}
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
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() => onOpenDiagnosis(row.vehicle_id, row.latest_session_id)}
            >
              Открыть в диагностике
            </button>
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
                    <span className="history-item__date">{formatWhen(h.checked_at)}</span>
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