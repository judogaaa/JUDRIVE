import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { fetchVehicleInsight, setQuarantineRecommendation, type TrendPoint, type VehicleFleetRow, type VehicleInsight } from '../api/fleet'
import { useI18n } from '../i18n/I18nContext'
import { formatSessionDateTime } from '../lib/formatLocale'
import { resolveErrorMessage } from '../lib/i18nError'
import { AnomalyTrendChart } from './AnomalyTrendChart'

interface VehicleInsightPanelProps {
  vehicleId: string | null
  onClose: () => void
  onOpenDiagnosis: (vehicleId: string, sessionId: string) => void
  onChanged?: () => void
  onOpenTickets?: (vehicleId: string) => void
}

export function VehicleInsightPanel({ vehicleId, onClose, onOpenDiagnosis, onOpenTickets, onChanged }: VehicleInsightPanelProps) {
  const { t, locale } = useI18n()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [row, setRow] = useState<VehicleFleetRow | null>(null)
  const [history, setHistory] = useState<VehicleInsight['history']>([])
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [reason, setReason] = useState('')
  const [ack, setAck] = useState(false)
  const [saving, setSaving] = useState(false)
  const [retry, setRetry] = useState(0)
  const savingRef = useRef(false)
  const vehicleRef = useRef(vehicleId)
  vehicleRef.current = vehicleId

  useEffect(() => {
    setRow(null)
    setHistory([])
    setTrend([])
    setReason('')
    setAck(false)
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
  }, [vehicleId, t, retry])

  const saveRecommendation = async () => {
    if (!row || row.vehicle_id !== vehicleId || !ack || reason.trim().length < 10 || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError(null)
    try {
      const data = await setQuarantineRecommendation(row.vehicle_id, row.latest_session_id, row.category !== 'quarantine', reason.trim())
      onChanged?.()
      if (vehicleRef.current !== data.vehicle.vehicle_id) return
      setRow(data.vehicle)
      setReason('')
      setAck(false)
    } catch (err) {
      if (vehicleRef.current === row.vehicle_id) setError(resolveErrorMessage(t, err, 'error.insight'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  if (!vehicleId) return null

  return (
    <div className="source-drawer" role="dialog" aria-modal="true">
      <div className="source-drawer__backdrop" onClick={onClose} />
      <div className="source-drawer__panel">
        <header className="source-drawer__header">
          <div>
            <p className="source-drawer__eyebrow">{t('insight.title')}</p>
            <h3>{vehicleId}</h3>
            {row?.vehicle_id === vehicleId ? (
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
        {error ? (
          <div className="panel__error" role="alert">
            <span>{error}</span>
            <button type="button" className="btn btn--secondary" onClick={() => setRetry((value) => value + 1)}>
              {t('history.retry')}
            </button>
          </div>
        ) : null}

        {row?.vehicle_id === vehicleId ? (
          <>
            <AnomalyTrendChart points={trend} />
            {row.latest_status === 'anomaly' && !row.needs_rerecord ? (
              <section className="panel" style={{ margin: '1rem 0' }}>
                <h4>{t('chief.recommendation.title')}</h4>
                {row.quarantine_basis && <p>{row.quarantine_basis}</p>}
                <p className="panel__subtitle">{t('chief.recommendation.hint')}</p>
                <label className="field">
                  <span>{t('chief.recommendation.reason')}</span>
                  <textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} rows={3} disabled={saving} />
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0' }}>
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} disabled={saving} />
                  {t('chief.recommendation.ack')}
                </label>
                <button type="button" className="btn btn--secondary btn--block" disabled={!ack || reason.trim().length < 10 || saving} aria-busy={saving}
                  onClick={() => void saveRecommendation()}>
                  {t(row.category === 'quarantine' ? 'chief.recommendation.cancel' : 'chief.recommendation.save')}
                </button>
              </section>
            ) : null}
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