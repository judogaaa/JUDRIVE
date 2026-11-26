import { useCallback, useMemo, useState } from 'react'
import { Play } from 'lucide-react'
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

  const sortedSessions: SessionSummary[] = [...sessions].sort((a, b) => b.checked_at.localeCompare(a.checked_at))

  const plateValue = selectedVehicle
    ? `${selectedVehicle.vehicle_id} · ${selectedVehicle.make}${selectedVehicle.model ? ` ${selectedVehicle.model}` : ''}`
    : ''

  return (
    <div className="diag-page">
      {fleetError ? (
        <p className="panel__error" role="alert">
          {fleetError}
        </p>
      ) : (
        <div className="diag-split">
          <section className="diag-col" aria-label={t('diag.title')}>
            <div className="field vehicle-combo">
              <span>{t('diag.vehicle')}</span>
              <input
                value={vehicleQuery || plateValue}
                onChange={(e) => setVehicleQuery(e.target.value)}
                onFocus={() => {
                  if (!vehicleQuery && plateValue) setVehicleQuery('')
                }}
                placeholder={t('diag.filterPlaceholder')}
                aria-label={t('diag.search')}
                role="combobox"
                aria-expanded={vehicleQuery.trim().length > 0}
              />
              {vehicleQuery.trim() ? (
                <ul className="vehicle-combo__list" role="listbox">
                  {vehicleOptions.slice(0, 8).map((v) => (
                    <li key={v.vehicle_id}>
                      <button
                        type="button"
                        onClick={() => {
                          onVehicleSelect(v.vehicle_id)
                          setVehicleQuery('')
                        }}
                      >
                        {v.vehicle_id} · {v.garage_no} · {v.make} {v.model ?? ''} · {v.engine_model}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {selectedVehicle ? (
                <p className="diag-toolbar__hint">
                  {selectedVehicle.make}
                  {selectedVehicle.model ? ` ${selectedVehicle.model}` : ''} · {t('diag.garage')} {selectedVehicle.garage_no} · {selectedVehicle.engine_model}
                </p>
              ) : null}
            </div>
            <label className="field">
              <span>{t('diag.check')}</span>
              <select value={sessionId} onChange={(e) => onSessionSelect(e.target.value)}>
                {sessions.map((s) => (
                  <option key={s.session_id} value={s.session_id}>
                    {formatSessionDateTime(locale, s.checked_at)} · {s.session_id}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn--primary btn--block"
              disabled={loading || !vehicleId || !sessionId}
              onClick={() => void runDiagnosis()}
            >
              <Play size={18} aria-hidden />
              {loading ? t('diag.running') : t('diag.run')}
            </button>
            <VerdictCard result={result} loading={loading} error={error} vehicleId={vehicleId} />
            <VehicleHistoryPanel
              sessions={sortedSessions.slice(0, 6)}
              activeSessionId={sessionId}
              onSelectSession={onSessionSelect}
            />
          </section>
          <section className="diag-col diag-col--chat">
            {vehicleId && sessionId ? (
              <AgentChat
                vehicleId={vehicleId}
                sessionId={sessionId}
                diagnoseResult={result}
                onDiagnoseCommand={() => void runDiagnosis()}
              />
            ) : null}
          </section>
        </div>
      )}
    </div>
  )
}
