import { useMemo, useState } from 'react'
import { ArrowRight, Search, X } from 'lucide-react'
import type { VehicleSummary } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import { formatSessionDateTime } from '../lib/formatLocale'
import { displayVehicleModel, matchesVehicle } from '../lib/vehicle'

interface FleetViewProps {
  vehicles: VehicleSummary[]
  fleetError: string | null
  onOpenDiagnosis: (vehicleId: string, sessionId?: string) => void
}

type SortKey = 'plate' | 'sessions' | 'make'

export function FleetView({ vehicles, fleetError, onOpenDiagnosis }: FleetViewProps) {
  const { t, locale } = useI18n()
  const [query, setQuery] = useState('')
  const [engineFilter, setEngineFilter] = useState('')
  const [makeFilter, setMakeFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sort, setSort] = useState<SortKey>('plate')
  const [desc, setDesc] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  const options = useMemo(() => {
    const engines = new Map<string, number>()
    const makes = new Map<string, number>()
    const types = new Map<string, number>()
    for (const v of vehicles) {
      engines.set(v.engine_model, (engines.get(v.engine_model) ?? 0) + 1)
      makes.set(v.make, (makes.get(v.make) ?? 0) + 1)
      types.set(v.vehicle_type, (types.get(v.vehicle_type) ?? 0) + 1)
    }
    return { engines, makes, types }
  }, [vehicles])

  const filtered = useMemo(() => {
    const q = query.trim()
    let rows = vehicles
    if (engineFilter) rows = rows.filter((v) => v.engine_model === engineFilter)
    if (makeFilter) rows = rows.filter((v) => v.make === makeFilter)
    if (typeFilter) rows = rows.filter((v) => v.vehicle_type === typeFilter)
    if (q) rows = rows.filter((v) => matchesVehicle(v, q))
    const copy = [...rows]
    copy.sort((a, b) => {
      const dir = desc ? -1 : 1
      if (sort === 'sessions') return (a.sessions.length - b.sessions.length) * dir
      if (sort === 'make') return a.make.localeCompare(b.make) * dir
      return a.vehicle_id.localeCompare(b.vehicle_id) * dir
    })
    return copy
  }, [query, engineFilter, makeFilter, typeFilter, sort, desc, vehicles])

  const active = vehicles.find((v) => v.vehicle_id === selected) ?? null
  const reset = () => {
    setQuery('')
    setEngineFilter('')
    setMakeFilter('')
    setTypeFilter('')
  }

  const toggleSort = (key: SortKey) => {
    if (sort === key) setDesc((v) => !v)
    else {
      setSort(key)
      setDesc(false)
    }
  }

  return (
    <>
      <header className="page-header page-header--compact">
        <h1>{t('fleet.title')}</h1>
      </header>
      {fleetError ? (
        <p className="panel__error" role="alert">{fleetError}</p>
      ) : (
        <section className="panel">
          <div className="toolbar-bar">
            <label className="field">
              <span>{t('fleet.searchLabel')}</span>
              <div className="search-field">
                <Search size={18} aria-hidden />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('fleet.searchPlaceholder')} />
              </div>
            </label>
            <label className="field">
              <span>{t('fleet.col.model')}</span>
              <select value={makeFilter} onChange={(e) => setMakeFilter(e.target.value)}>
                <option value="">{t('chief.filter.all')} ({vehicles.length})</option>
                {[...options.makes.entries()].map(([name, count]) => (
                  <option key={name} value={name}>{name} ({count})</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t('chief.filter.engine')}</span>
              <select value={engineFilter} onChange={(e) => setEngineFilter(e.target.value)}>
                <option value="">{t('chief.filter.all')} ({vehicles.length})</option>
                {[...options.engines.entries()].map(([name, count]) => (
                  <option key={name} value={name}>{name} ({count})</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t('chief.filter.vehicleType')}</span>
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">{t('chief.filter.all')} ({vehicles.length})</option>
                {[...options.types.entries()].map(([name, count]) => (
                  <option key={name} value={name}>{name} ({count})</option>
                ))}
              </select>
            </label>
            <button type="button" className="icon-btn" onClick={reset} aria-label={t('common.close')}><X size={18} /></button>
          </div>
          <p className="toolbar-meta">{t('fleet.count', { shown: filtered.length, total: vehicles.length })}</p>
          <div className="fleet-table-wrap">
            <table className="fleet-table">
              <thead>
                <tr>
                  <th><button type="button" className="sort-btn" onClick={() => toggleSort('plate')}>{t('fleet.col.plate')} {sort === 'plate' ? (desc ? '↓' : '↑') : ''}</button></th>
                  <th>{t('fleet.col.garage')}</th>
                  <th><button type="button" className="sort-btn" onClick={() => toggleSort('make')}>{t('fleet.col.model')} {sort === 'make' ? (desc ? '↓' : '↑') : ''}</button></th>
                  <th>{t('fleet.col.engine')}</th>
                  <th><button type="button" className="sort-btn" onClick={() => toggleSort('sessions')}>{t('fleet.col.sessions')} {sort === 'sessions' ? (desc ? '↓' : '↑') : ''}</button></th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.vehicle_id}>
                    <td>{v.vehicle_id}</td>
                    <td>{v.garage_no}</td>
                    <td>{displayVehicleModel(v.make, v.model)}</td>
                    <td>{v.engine_model}</td>
                    <td>{v.sessions.length}</td>
                    <td>
                      <button type="button" className="btn btn--secondary" onClick={() => setSelected(v.vehicle_id)}>
                        {t('tickets.more')}
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
      {active ? (
        <div className="drawer-scrim" role="presentation" onClick={() => setSelected(null)}>
          <aside className="history-drawer" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="history-drawer__head">
              <h2>{active.vehicle_id}</h2>
              <button type="button" className="icon-btn" onClick={() => setSelected(null)} aria-label={t('common.close')}><X size={18} /></button>
            </div>
            <p>{displayVehicleModel(active.make, active.model)} · {active.garage_no} · {active.engine_model} · {active.vehicle_type}</p>
            <ul className="history-list">
              {[...active.sessions].sort((a, b) => b.checked_at.localeCompare(a.checked_at)).slice(0, 8).map((s) => (
                <li key={s.session_id}>
                  <button type="button" className="history-item" onClick={() => onOpenDiagnosis(active.vehicle_id, s.session_id)}>
                    <span>{s.session_id}</span>
                    <span>{formatSessionDateTime(locale, s.checked_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn--primary" onClick={() => onOpenDiagnosis(active.vehicle_id)}>
              {t('fleet.actionDiagnose')} <ArrowRight size={18} />
            </button>
          </aside>
        </div>
      ) : null}
    </>
  )
}
