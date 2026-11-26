import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchDiagnosis, fetchVehicles } from './api/client'
import type { DiagnoseResponse, VehicleSummary } from './api/types'
import { ManualSearchPanel } from './components/ManualSearchPanel'
import { VerdictCard } from './components/VerdictCard'
import './App.css'

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

export default function App() {
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([])
  const [fleetError, setFleetError] = useState<string | null>(null)
  const [vehicleId, setVehicleId] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [result, setResult] = useState<DiagnoseResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchVehicles()
      .then((list) => {
        if (cancelled) return
        setVehicles(list)
        if (list.length > 0) {
          setVehicleId(list[0].vehicle_id)
          setSessionId(list[0].sessions[0]?.session_id ?? '')
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setFleetError(err instanceof Error ? err.message : 'Не удалось загрузить автопарк')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.vehicle_id === vehicleId) ?? null,
    [vehicleId, vehicles],
  )

  const sessions = selectedVehicle?.sessions ?? []

  const resetVerdict = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  const onVehicleChange = (nextId: string) => {
    setVehicleId(nextId)
    const vehicle = vehicles.find((v) => v.vehicle_id === nextId)
    setSessionId(vehicle?.sessions[0]?.session_id ?? '')
    resetVerdict()
  }

  const onSessionChange = (nextSession: string) => {
    setSessionId(nextSession)
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
    <div className="app-shell">
      <header className="app-header">
        <MotionBrand />
        <p className="app-header__tag">Этапы 01–02: Mock ML + RAG</p>
      </header>

      <main className="app-main">
        <section className="panel">
          <h1 className="panel__title">Диагностика по записи</h1>
          <p className="panel__subtitle">
            Выберите транспорт и сессию проверки, затем запросите результат у заглушки ML через backend.
          </p>

          {fleetError ? (
            <p className="panel__error" role="alert">
              {fleetError}
            </p>
          ) : (
            <div className="form-grid">
              <label className="field">
                <span>Госномер</span>
                <select value={vehicleId} onChange={(e) => onVehicleChange(e.target.value)}>
                  {vehicles.map((v) => (
                    <option key={v.vehicle_id} value={v.vehicle_id}>
                      {v.vehicle_id} · {v.garage_no} · {v.engine_model}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Сессия</span>
                <select value={sessionId} onChange={(e) => onSessionChange(e.target.value)}>
                  {sessions.map((s) => (
                    <option key={s.session_id} value={s.session_id}>
                      {s.session_id} · {formatCheckedAt(s.checked_at)}
                    </option>
                  ))}
                </select>
              </label>

              {selectedVehicle ? (
                <div className="vehicle-chip">
                  <span>{selectedVehicle.make}</span>
                  <span>{selectedVehicle.model ?? '—'}</span>
                  <span>{selectedVehicle.vehicle_type}</span>
                </div>
              ) : null}

              <button
                type="button"
                className="primary-button"
                disabled={loading || !vehicleId || !sessionId}
                onClick={() => void runDiagnosis()}
              >
                Получить результат диагностики
              </button>
            </div>
          )}
        </section>

        <VerdictCard result={result} loading={loading} error={error} />
        <ManualSearchPanel engineModel={selectedVehicle?.engine_model ?? null} />
      </main>
    </div>
  )
}

function MotionBrand() {
  return (
    <div className="brand">
      <span className="brand__mark" aria-hidden />
      <div>
        <p className="brand__name">JUDRIVE</p>
        <p className="brand__caption">Цифровой механик</p>
      </div>
    </div>
  )
}