import { useMemo, useState } from 'react'
import { ArrowRight, Search } from 'lucide-react'
import type { VehicleSummary } from '../api/types'
import { useI18n } from '../i18n/I18nContext'

interface FleetViewProps {
  vehicles: VehicleSummary[]
  fleetError: string | null
  onOpenDiagnosis: (vehicleId: string) => void
}

type SortKey = 'plate' | 'sessions'

export function FleetView({ vehicles, fleetError, onOpenDiagnosis }: FleetViewProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [engineFilter, setEngineFilter] = useState('')
  const [sort, setSort] = useState<SortKey>('plate')

  const engines = useMemo(() => {
    const set = new Set(vehicles.map((v) => v.engine_model))
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [vehicles])

  const filtered = useMemo(() => {
    const q = fold(query.trim())
    let rows = vehicles
    if (engineFilter) rows = rows.filter((v) => v.engine_model === engineFilter)
    if (!q) return sortRows(rows, sort)
    rows = rows.filter((v) => {
      const model = v.model && v.model !== v.make ? v.model : ''
      const hay = fold([v.vehicle_id, v.garage_no, v.make, model, v.engine_model, v.vehicle_type].join(' '))
      return hay.includes(q)
    })
    return sortRows(rows, sort)
  }, [query, engineFilter, sort, vehicles])

  return (
    <>
      <header className="page-header page-header--compact">
        <h1>{t('fleet.title')}</h1>
        <p>{t('fleet.subtitle')}</p>
      </header>

      {fleetError ? (
        <p className="panel__error" role="alert">
          {fleetError}
        </p>
      ) : (
        <section className="panel">
          <div className="toolbar-bar">
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
            <label className="field">
              <span>{t('chief.filter.engine')}</span>
              <select value={engineFilter} onChange={(e) => setEngineFilter(e.target.value)}>
                <option value="">{t('chief.filter.all')}</option>
                {engines.map((engine) => (
                  <option key={engine} value={engine}>
                    {engine}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t('fleet.sortLabel')}</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="plate">{t('fleet.col.plate')}</option>
                <option value="sessions">{t('fleet.col.sessions')}</option>
              </select>
            </label>
          </div>
          <p className="toolbar-meta">{t('fleet.count', { shown: filtered.length, total: vehicles.length })}</p>

          <div className="fleet-table-wrap">
            <table className="fleet-table">
              <thead>
                <tr>
                  <th>{t('fleet.col.plate')}</th>
                  <th>{t('fleet.col.garage')}</th>
                  <th>{t('fleet.col.model')}</th>
                  <th>{t('fleet.col.engine')}</th>
                  <th>{t('fleet.col.sessions')}</th>
                  <th aria-hidden />
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
                    <td>{displayMake(v.make, v.model)}</td>
                    <td>{v.engine_model}</td>
                    <td>{v.sessions.length}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenDiagnosis(v.vehicle_id)
                        }}
                      >
                        {t('fleet.actionDiagnose')}
                        <ArrowRight size={16} aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 ? <p className="panel__subtitle">{t('fleet.empty', { query })}</p> : null}
        </section>
      )}
    </>
  )
}

function sortRows(rows: VehicleSummary[], sort: SortKey): VehicleSummary[] {
  const copy = [...rows]
  if (sort === 'sessions') {
    copy.sort((a, b) => b.sessions.length - a.sessions.length || a.vehicle_id.localeCompare(b.vehicle_id))
  } else {
    copy.sort((a, b) => a.vehicle_id.localeCompare(b.vehicle_id))
  }
  return copy
}

function displayMake(make: string, model: string | null): string {
  if (!model || model === make || model.startsWith(make)) return model || make
  return `${make} ${model}`
}

function fold(value: string): string {
  const map: Record<string, string> = {
    а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x',
  }
  return value
    .toLowerCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
}