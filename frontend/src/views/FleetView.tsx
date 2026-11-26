import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { VehicleSummary } from '../api/types'
import { useI18n } from '../i18n/I18nContext'

interface FleetViewProps {
  vehicles: VehicleSummary[]
  fleetError: string | null
  onOpenDiagnosis: (vehicleId: string) => void
}

export function FleetView({ vehicles, fleetError, onOpenDiagnosis }: FleetViewProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return vehicles
    return vehicles.filter((v) => {
      const hay = [v.vehicle_id, v.garage_no, v.make, v.model ?? '', v.engine_model, v.vehicle_type]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [query, vehicles])

  return (
    <>
      <header className="page-header">
        <h1>{t('fleet.title')}</h1>
        <p>{t('fleet.subtitle')}</p>
      </header>

      {fleetError ? (
        <p className="panel__error" role="alert">
          {fleetError}
        </p>
      ) : (
        <section className="panel">
          <label className="field">
            <span>Поиск по госномеру, гаражному номеру, модели или двигателю</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Search size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Например B418HK98 или ЯМЗ-536"
                style={{ flex: 1 }}
              />
            </div>
          </label>

          <div className="fleet-table-wrap">
            <table className="fleet-table">
              <thead>
                <tr>
                  <th>Госномер</th>
                  <th>Гараж</th>
                  <th>Марка / модель</th>
                  <th>Двигатель</th>
                  <th>Сессий</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr
                    key={v.vehicle_id}
                    onClick={() => onOpenDiagnosis(v.vehicle_id)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onOpenDiagnosis(v.vehicle_id)
                      }
                    }}
                  >
                    <td>{v.vehicle_id}</td>
                    <td>{v.garage_no}</td>
                    <td>
                      {v.make} {v.model ?? '—'}
                    </td>
                    <td>{v.engine_model}</td>
                    <td>{v.sessions.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 ? (
            <p className="panel__subtitle" style={{ marginTop: '1rem' }}>
              Ничего не найдено по запросу «{query}».
            </p>
          ) : null}
        </section>
      )}
    </>
  )
}