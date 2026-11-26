import { useCallback, useMemo, useState } from 'react'
import { Play } from 'lucide-react'
import { fetchDiagnosis } from '../api/client'
import type { DiagnoseResponse, SessionSummary, VehicleSummary } from '../api/types'
import { AgentChat } from '../components/AgentChat'
import { ManualSearchPanel } from '../components/ManualSearchPanel'
import { VehicleHistoryPanel } from '../components/VehicleHistoryPanel'
import { VerdictCard } from '../components/VerdictCard'
import { VoiceCapture } from '../components/VoiceCapture'
import { useI18n } from '../i18n/I18nContext'

interface DiagnosisViewProps {
  vehicles: VehicleSummary[]
  fleetError: string | null
  vehicleId: string
  sessionId: string
  onVehicleChange: (id: string) => void
  onSessionChange: (id: string) => void
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

export function DiagnosisView({
  vehicles,
  fleetError,
  vehicleId,
  sessionId,
  onVehicleChange,
  onSessionChange,
}: DiagnosisViewProps) {
  const { t } = useI18n()
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

  const runDiagnosis = async () => {
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
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка')
    } finally {
      if (gen === requestGen.current) setLoading(false)
    }
  }

  return (
    <>
      <header className="page-header">
        <h1>{t('diag.title')}</h1>
        <p>{t('diag.subtitle')}</p>
      </header>

      <div className="workspace">
      <aside className="workspace-side">
      <section className="panel diag-context">
        {fleetError ? (
          <p className="panel__error" role="alert">
            {fleetError}
          </p>
        ) : (
          <>
            <div className="context-grid">
              <label className="field">
                <span>{t('diag.search')}</span>
                <input
                  value={vehicleQuery}
                  onChange={(e) => setVehicleQuery(e.target.value)}
                  placeholder="Фильтр списка…"
                  aria-label="Фильтр транспорта"
                />
              </label>
              <label className="field">
                <span>{t('diag.vehicle')}</span>
                <select value={vehicleId} onChange={(e) => onVehicleSelect(e.target.value)}>
                  {vehicleOptions.map((v) => (
                    <option key={v.vehicle_id} value={v.vehicle_id}>
                      {v.vehicle_id} · {v.garage_no} · {v.engine_model}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t('diag.check')}</span>
                <select value={sessionId} onChange={(e) => onSessionSelect(e.target.value)}>
                  {sessions.map((s) => (
                    <option key={s.session_id} value={s.session_id}>
                      {s.session_id} · {formatCheckedAt(s.checked_at)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedVehicle ? (
              <div className="vehicle-meta" aria-label="Паспорт ТС">
                <span>{selectedVehicle.make}</span>
                <span>{selectedVehicle.model ?? '—'}</span>
                <span>{selectedVehicle.vehicle_type}</span>
                <span>{selectedVehicle.engine_model}</span>
              </div>
            ) : null}

            <button
              type="button"
              className="btn btn--primary btn--block"
              disabled={loading || !vehicleId || !sessionId}
              onClick={() => void runDiagnosis()}
            >
              <Play size={18} aria-hidden />
              {loading ? t('diag.running') : t('diag.run')}
            </button>
            <VoiceCapture
              disabled={loading || !vehicleId || !sessionId}
              onText={(text) => {
                if (isDiagnoseVoiceCommand(text)) void runDiagnosis()
              }}
            />
          </>
        )}
      </section>

      <VerdictCard result={result} loading={loading} error={error} />
      {vehicleId ? (
        <DiagnosisSideColumn
          sessions={[...sessions].sort((a, b) => b.checked_at.localeCompare(a.checked_at))}
          sessionId={sessionId}
          engineModel={selectedVehicle?.engine_model ?? null}
          onSessionSelect={onSessionSelect}
        />
      ) : null}
      </aside>
      {vehicleId && sessionId ? (
        <div className="workspace-chat">
          <AgentChat vehicleId={vehicleId} sessionId={sessionId} diagnoseResult={result} />
        </div>
      ) : null}
      </div>
    </>
  )
}

function isDiagnoseVoiceCommand(text: string): boolean {
  const q = text.toLowerCase()
  return /диагност|diagnost|tekshir|талда|निदान|নির্ণয়/.test(q)
}

function DiagnosisSideColumn({
  sessionId,
  sessions,
  engineModel,
  onSessionSelect,
}: {
  sessionId: string
  sessions: SessionSummary[]
  engineModel: string | null
  onSessionSelect: (id: string) => void
}) {
  return (
    <div className="diag-stack">
      <VehicleHistoryPanel sessions={sessions} activeSessionId={sessionId} onSelectSession={onSessionSelect} />
      <ManualSearchPanel engineModel={engineModel} />
    </div>
  )
}