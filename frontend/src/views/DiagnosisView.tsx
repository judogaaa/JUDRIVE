import { useCallback, useMemo, useState } from 'react'
import { Play } from 'lucide-react'
import { fetchDiagnosis } from '../api/client'
import type { DiagnoseResponse, SessionSummary, VehicleSummary } from '../api/types'
import { AgentChat } from '../components/AgentChat'
import { ManualSearchPanel } from '../components/ManualSearchPanel'
import { VehicleHistoryPanel } from '../components/VehicleHistoryPanel'
import { VerdictCard } from '../components/VerdictCard'

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

  const resetVerdict = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  const onVehicleSelect = (nextId: string) => {
    onVehicleChange(nextId)
    const vehicle = vehicles.find((v) => v.vehicle_id === nextId)
    if (vehicle?.sessions[0]) onSessionChange(vehicle.sessions[0].session_id)
    resetVerdict()
  }

  const onSessionSelect = (nextSession: string) => {
    onSessionChange(nextSession)
    resetVerdict()
  }

  const runDiagnosis = async () => {
    if (!vehicleId || !sessionId) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const response = await fetchDiagnosis(vehicleId, sessionId)
      setResult(response)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <header className="page-header">
        <h1>Диагностика</h1>
        <p>Выберите транспорт и сессию, получите вердикт ML, уточните в чате и подтвердите заявку при необходимости.</p>
      </header>

      <section className="panel diag-context">
        {fleetError ? (
          <p className="panel__error" role="alert">
            {fleetError}
          </p>
        ) : (
          <>
            <div className="context-grid">
              <label className="field">
                <span>Поиск и госномер</span>
                <input
                  value={vehicleQuery}
                  onChange={(e) => setVehicleQuery(e.target.value)}
                  placeholder="Фильтр списка…"
                  aria-label="Фильтр транспорта"
                />
              </label>
              <label className="field">
                <span>Транспорт</span>
                <select value={vehicleId} onChange={(e) => onVehicleSelect(e.target.value)}>
                  {vehicleOptions.map((v) => (
                    <option key={v.vehicle_id} value={v.vehicle_id}>
                      {v.vehicle_id} · {v.garage_no} · {v.engine_model}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Сессия проверки</span>
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
              {loading ? 'Запрос к Mock ML…' : 'Получить результат диагностики'}
            </button>
          </>
        )}
      </section>

      <VerdictCard result={result} loading={loading} error={error} />

      <div className="diag-layout">
        {vehicleId ? (
          <DiagnosisSideColumn
            sessions={sessions}
            sessionId={sessionId}
            engineModel={selectedVehicle?.engine_model ?? null}
            onSessionSelect={onSessionSelect}
          />
        ) : null}
        {vehicleId && sessionId ? (
          <AgentChat vehicleId={vehicleId} sessionId={sessionId} diagnoseResult={result} />
        ) : null}
      </div>
    </>
  )
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