import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Play, Search } from 'lucide-react'
import { fetchDiagnosis } from '../api/client'
import type { DiagnoseResponse, SessionSummary, VehicleSummary } from '../api/types'
import { AgentChat } from '../components/AgentChat'
import { VehicleHistoryPanel } from '../components/VehicleHistoryPanel'
import { VerdictCard } from '../components/VerdictCard'
import { useI18n } from '../i18n/I18nContext'
import { formatSessionDateTime } from '../lib/formatLocale'
import { displayVehicleModel, matchesVehicle } from '../lib/vehicle'
import { resolveErrorMessage } from '../lib/i18nError'

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
  const [searchOpen, setSearchOpen] = useState(false)
  const [result, setResult] = useState<DiagnoseResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.vehicle_id === vehicleId) ?? null,
    [vehicleId, vehicles],
  )

  const sessions = selectedVehicle?.sessions ?? []

  const vehicleOptions = useMemo(() => vehicles.filter((v) => matchesVehicle(v, vehicleQuery)), [vehicleQuery, vehicles])

  const requestGen = useMemo(() => ({ current: 0 }), [])

  const resetVerdict = useCallback(() => {
    requestGen.current += 1
    setResult(null)
    setError(null)
    setLoading(false)
  }, [requestGen])

  useEffect(() => () => { requestGen.current += 1 }, [requestGen])

  const onVehicleSelect = (nextId: string) => {
    setSearchOpen(false)
    setVehicleQuery('')
    if (nextId === vehicleId) return
    onVehicleChange(nextId)
    const vehicle = vehicles.find((v) => v.vehicle_id === nextId)
    if (vehicle) {
      const latest = [...vehicle.sessions].sort((a, b) => b.checked_at.localeCompare(a.checked_at))[0]
      onSessionChange(latest?.session_id ?? '')
    }
    resetVerdict()
  }

  const onSessionSelect = (nextSession: string) => {
    if (nextSession === sessionId) return
    onSessionChange(nextSession)
    resetVerdict()
  }

  const runDiagnosis = useCallback(async () => {
    if (!vehicleId || !sessionId || loading) return
    const gen = ++requestGen.current
    const pair = `${vehicleId}:${sessionId}`
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const response = await fetchDiagnosis(vehicleId, sessionId)
      if (gen !== requestGen.current) return
      if (`${response.vehicle_id}:${response.session_id}` !== pair) throw new Error(t('verdict.error.title'))
      setResult(response)
    } catch (err: unknown) {
      if (gen !== requestGen.current) return
      setError(resolveErrorMessage(t, err, 'error.unknown'))
    } finally {
      if (gen === requestGen.current) setLoading(false)
    }
  }, [loading, requestGen, sessionId, t, vehicleId])

  const sortedSessions: SessionSummary[] = [...sessions].sort((a, b) => b.checked_at.localeCompare(a.checked_at))

  const plateValue = selectedVehicle
    ? `${selectedVehicle.vehicle_id} · ${displayVehicleModel(selectedVehicle.make, selectedVehicle.model)}`
    : ''

  return (
    <div className="diag-page">
      <header className="page-header page-header--compact diagnosis-heading"><h1>{t('diag.title')}</h1></header>
      {fleetError ? (
        <p className="panel__error" role="alert">
          {fleetError}
        </p>
      ) : (
        <div className="diag-split">
          <section className="diag-col" aria-label={t('diag.title')}>
            <div className="field vehicle-combo" onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) { setSearchOpen(false); setVehicleQuery('') }
            }}>
              <span>{t('diag.vehicle')}</span>
              <div className="diagnosis-search-field">
                <Search size={17} aria-hidden />
                <input
                  value={searchOpen ? vehicleQuery : plateValue}
                  onChange={(e) => { setSearchOpen(true); setVehicleQuery(e.target.value) }}
                  onFocus={() => { setSearchOpen(true); setVehicleQuery('') }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { setSearchOpen(false); setVehicleQuery(''); e.currentTarget.blur() }
                    if (e.key === 'Enter' && searchOpen && vehicleOptions.length === 1) onVehicleSelect(vehicleOptions[0].vehicle_id)
                  }}
                  placeholder={t('fleet.searchPlaceholder')}
                  aria-label={t('diag.search')}
                  autoComplete="off"
                  aria-expanded={searchOpen}
                  aria-controls={searchOpen ? 'diagnosis-vehicle-options' : undefined}
                />
                <ChevronDown size={16} aria-hidden />
              </div>
              {searchOpen ? (
                <ul className="vehicle-combo__list" id="diagnosis-vehicle-options" aria-label={t('diag.vehicle')}>
                  {vehicleOptions.length === 0 ? <li className="panel__subtitle">{t('fleet.empty', { query: vehicleQuery })}</li> : null}
                  {vehicleOptions.map((v) => (
                    <li key={v.vehicle_id}>
                      <button type="button" aria-current={v.vehicle_id === vehicleId ? 'true' : undefined} onClick={() => onVehicleSelect(v.vehicle_id)}>
                        <strong>{v.vehicle_id} · {displayVehicleModel(v.make, v.model)}</strong>
                        <span>{v.garage_no} · {v.engine_model}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {selectedVehicle ? (
                <p className="diag-toolbar__hint">{t('diag.garage')} {selectedVehicle.garage_no} · {selectedVehicle.engine_model}</p>
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
              vehicleId={vehicleId}
              sessions={sortedSessions}
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
