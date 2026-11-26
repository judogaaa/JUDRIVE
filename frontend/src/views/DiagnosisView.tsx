import { useCallback, useEffect, useMemo, useState } from 'react'
import { History, Play, X } from 'lucide-react'
import { fetchDiagnosis } from '../api/client'
import type { DiagnoseResponse, SessionSummary, VehicleSummary } from '../api/types'
import { AgentChat } from '../components/AgentChat'
import { VehicleHistoryPanel } from '../components/VehicleHistoryPanel'
import { VerdictCard } from '../components/VerdictCard'
import { useI18n } from '../i18n/I18nContext'
import { formatSessionDateTime } from '../lib/formatLocale'

interface DiagnosisViewProps {
  vehicles: VehicleSummary[]
  fleetError: string | null
  vehicleId: string
  sessionId: string
  onVehicleChange: (id: string) => void
  onSessionChange: (id: string) => void
}

export function DiagnosisView({
  vehicles,
  fleetError,
  vehicleId,
  sessionId,
  onVehicleChange,
  onSessionChange,
}: DiagnosisViewProps) {
  const { t, locale } = useI18n()
  const [vehicleQuery, setVehicleQuery] = useState('')
  const [result, setResult] = useState<DiagnoseResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.vehicle_id === vehicleId) ?? null,
    [vehicleId, vehicles],
  )

  const sessions = selectedVehicle?.sessions ?? []

  const vehicleOptions = useMemo(() => {
    const q = vehicleQuery.trim().toLowerCase()
    if (!q) return vehicles
    return vehicles.filter((v) => {
      const hay = [v.vehicle_id, v.garage_no, v.make, v.model ?? '', v.engine_model].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [vehicleQuery, vehicles])

  const requestGen = useMemo(() => ({ current: 0 }), [])

  const resetVerdict = useCallback(() => {
    requestGen.current += 1
    setResult(null)
    setError(null)
    setLoading(false)
  }, [requestGen])

  const onVehicleSelect = (nextId: string) => {
    onVehicleChange(nextId)
    const vehicle = vehicles.find((v) => v.vehicle_id === nextId)
    if (vehicle) {
      const latest = [...vehicle.sessions].sort((a, b) => b.checked_at.localeCompare(a.checked_at))[0]
      if (latest) onSessionChange(latest.session_id)
    }
    resetVerdict()
  }

  const onSessionSelect = (nextSession: string) => {
    onSessionChange(nextSession)
    resetVerdict()
  }

  const runDiagnosis = useCallback(async () => {
    if (!vehicleId || !sessionId) return
    const gen = ++requestGen.current
    const pair = `${vehicleId}:${sessionId}`
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const response = await fetchDiagnosis(vehicleId, sessionId)
      if (gen !== requestGen.current) return
      if (`${response.vehicle_id}:${response.session_id}` !== pair) return
      setResult(response)
    } catch (err: unknown) {
      if (gen !== requestGen.current) return
      setError(err instanceof Error ? err.message : t('error.unknown'))
    } finally {
      if (gen === requestGen.current) setLoading(false)
    }
  }, [requestGen, sessionId, t, vehicleId])

  useEffect(() => {
    if (!historyOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHistoryOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [historyOpen])

  const sortedSessions: SessionSummary[] = [...sessions].sort((a, b) => b.checked_at.localeCompare(a.checked_at))

  return (
    <div className="diag-page">
      <header className="page-header page-header--compact">
        <h1>{t('diag.title')}</h1>
      </header>

      {fleetError ? (
        <p className="panel__error" role="alert">
          {fleetError}
        </p>
      ) : (
        <section className="diag-toolbar" aria-label={t('diag.title')}>
          <label className="field">
            <span>{t('diag.search')}</span>
            <input
              value={vehicleQuery}
              onChange={(e) => setVehicleQuery(e.target.value)}
              placeholder={t('diag.filterPlaceholder')}
              aria-label={t('diag.search')}
            />
          </label>
          <label className="field">
            <span>{t('diag.vehicle')}</span>
            <select value={vehicleId} onChange={(e) => onVehicleSelect(e.target.value)}>
              {vehicleOptions.map((v) => (
                <option key={v.vehicle_id} value={v.vehicle_id}>
                  {v.vehicle_id} · {v.engine_model}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>{t('diag.engine')}</span>
            <p className="diag-toolbar__value">{selectedVehicle?.engine_model ?? '—'}</p>
          </div>
          <label className="field">
            <span>{t('diag.check')}</span>
            <select value={sessionId} onChange={(e) => onSessionSelect(e.target.value)}>
              {sessions.map((s) => (
                <option key={s.session_id} value={s.session_id}>
                  {s.session_id} · {formatSessionDateTime(locale, s.checked_at)}
                </option>
              ))}
            </select>
          </label>
          <div className="diag-toolbar__actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={loading || !vehicleId || !sessionId}
              onClick={() => void runDiagnosis()}
            >
              <Play size={16} aria-hidden />
              {loading ? t('diag.running') : t('diag.run')}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={!vehicleId}
              onClick={() => setHistoryOpen(true)}
            >
              <History size={16} aria-hidden />
              {t('diag.history')}
            </button>
          </div>
        </section>
      )}

      <div className="diag-work">
        <div className="diag-work__verdict">
          <VerdictCard result={result} loading={loading} error={error} vehicleId={vehicleId} />
        </div>
        {vehicleId && sessionId ? (
          <div className="diag-work__chat">
            <AgentChat
              vehicleId={vehicleId}
              sessionId={sessionId}
              diagnoseResult={result}
              onDiagnoseCommand={() => void runDiagnosis()}
            />
          </div>
        ) : null}
      </div>

      {historyOpen ? (
        <div className="drawer-scrim" role="presentation" onClick={() => setHistoryOpen(false)}>
          <aside
            className="history-drawer"
            role="dialog"
            aria-label={t('history.title')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="history-drawer__head">
              <h2>{t('history.title')}</h2>
              <button type="button" className="icon-btn" onClick={() => setHistoryOpen(false)} aria-label={t('common.close')}>
                <X size={18} aria-hidden />
              </button>
            </div>
            <VehicleHistoryPanel
              sessions={sortedSessions}
              activeSessionId={sessionId}
              onSelectSession={(id) => {
                onSessionSelect(id)
                setHistoryOpen(false)
              }}
            />
          </aside>
        </div>
      ) : null}
    </div>
  )
}
