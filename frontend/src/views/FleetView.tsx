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
            <span>{t('fleet.searchLabel')}</span>
            <div className="search-field">
              <Search size={16} aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('fleet.searchPlaceholder')}
                aria-label={t('fleet.searchLabel')}
              />
            </div>
          </label>

          <div className="fleet-table-wrap">
            <table className="fleet-table">
              <thead>
                <tr>
                  <th>{t('fleet.col.plate')}</th>
                  <th>{t('fleet.col.garage')}</th>
                  <th>{t('fleet.col.model')}</th>
                  <th>{t('fleet.col.engine')}</th>
                  <th>{t('fleet.col.sessions')}</th>
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
              {t('fleet.empty', { query })}
            </p>
          ) : null}
        </section>
      )}
    </>
  )
}