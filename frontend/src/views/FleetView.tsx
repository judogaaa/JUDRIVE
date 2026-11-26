import { useMemo, useState } from 'react'
import { ArrowRight, ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import type { VehicleSummary } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import { formatSessionDateTime } from '../lib/formatLocale'
import { displayVehicleModel, matchesVehicle } from '../lib/vehicle'

interface FleetViewProps {
  vehicles: VehicleSummary[]
  fleetError: string | null
  onRetryFleet?: () => void
  onOpenDiagnosis: (vehicleId: string, sessionId?: string) => void
  onOpenTickets?: (vehicleId: string) => void
}

type SortKey = 'plate' | 'sessions' | 'make'

export function FleetView({ vehicles, fleetError, onRetryFleet, onOpenDiagnosis, onOpenTickets }: FleetViewProps) {
  const { t, locale } = useI18n()
  const [query, setQuery] = useState('')
  const [engineFilter, setEngineFilter] = useState('')
  const [makeFilter, setMakeFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sort, setSort] = useState<SortKey>('plate')
  const [desc, setDesc] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  const fleetStatus = (vehicle: VehicleSummary): 'normal' | 'anomaly' | 'failed' | 'unknown' => {
    if (vehicle.latest_signal_quality === 'bad' || vehicle.latest_status === 'check_failed') return 'failed'
    if (vehicle.latest_status === 'anomaly') return 'anomaly'
    if (vehicle.latest_status === 'normal') return 'normal'
    return 'unknown'
  }
  const statusLabel = (status: ReturnType<typeof fleetStatus>) => {
    if (status === 'normal') return t('verdict.normal.title')
    if (status === 'anomaly') return t('verdict.anomaly.title')
    if (status === 'failed') return t('verdict.failed.title')
    return '—'
  }

  const options = useMemo(() => {
    const engines = new Map<string, number>()
    const makes = new Map<string, number>()
    const types = new Map<string, number>()
    const statuses = new Map<string, number>()
    for (const vehicle of vehicles) {
      engines.set(vehicle.engine_model, (engines.get(vehicle.engine_model) ?? 0) + 1)
      makes.set(vehicle.make, (makes.get(vehicle.make) ?? 0) + 1)
      types.set(vehicle.vehicle_type, (types.get(vehicle.vehicle_type) ?? 0) + 1)
      const status = fleetStatus(vehicle)
      statuses.set(status, (statuses.get(status) ?? 0) + 1)
    }
    return { engines, makes, types, statuses }
  }, [vehicles])

  const filtered = useMemo(() => {
    const q = query.trim()
    let rows = vehicles
    if (engineFilter) rows = rows.filter((vehicle) => vehicle.engine_model === engineFilter)
    if (makeFilter) rows = rows.filter((vehicle) => vehicle.make === makeFilter)
    if (typeFilter) rows = rows.filter((vehicle) => vehicle.vehicle_type === typeFilter)
    if (statusFilter) rows = rows.filter((vehicle) => fleetStatus(vehicle) === statusFilter)
    if (q) rows = rows.filter((vehicle) => matchesVehicle(vehicle, q))
    const copy = [...rows]
    copy.sort((a, b) => {
      const direction = desc ? -1 : 1
      if (sort === 'sessions') return (a.sessions.length - b.sessions.length) * direction
      if (sort === 'make') return a.make.localeCompare(b.make, 'ru') * direction
      return a.vehicle_id.localeCompare(b.vehicle_id) * direction
    })
    return copy
  }, [query, engineFilter, makeFilter, typeFilter, statusFilter, sort, desc, vehicles])

  const active = vehicles.find((vehicle) => vehicle.vehicle_id === selected) ?? null
  const hasFilters = Boolean(query || engineFilter || makeFilter || typeFilter || statusFilter)
  const reset = () => {
    setQuery('')
    setEngineFilter('')
    setMakeFilter('')
    setTypeFilter('')
    setStatusFilter('')
  }

  const toggleSort = (key: SortKey) => {
    if (sort === key) setDesc((value) => !value)
    else {
      setSort(key)
      setDesc(false)
    }
  }

  const sortMark = (key: SortKey) => {
    if (sort !== key) return null
    return desc ? <ChevronDown size={13} aria-hidden /> : <ChevronUp size={13} aria-hidden />
  }

  return (
    <>
      <header className="page-header page-header--compact">
        <div>
          <p className="eyebrow">{t('nav.fleet')}</p>
          <h1>{t('fleet.title')}</h1>
          <p>{t('fleet.subtitle')}</p>
        </div>
      </header>

      {fleetError ? (
        <div className="panel__error" role="alert">
          <span>{fleetError}</span>
          {onRetryFleet ? (
            <button type="button" className="btn btn--secondary" onClick={onRetryFleet}>
              {t('history.retry')}
            </button>
          ) : null}
        </div>
      ) : (
        <section className="panel fleet-panel">
          <div className="toolbar-bar">
            <label className="field fleet-search">
              <span>{t('fleet.searchLabel')}</span>
              <div className="search-field">
                <Search size={18} aria-hidden />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('fleet.searchPlaceholder')}
                  aria-label={t('fleet.searchLabel')}
                />
              </div>
            </label>
            <label className="field">
              <span>{t('fleet.col.model')}</span>
              <select value={makeFilter} onChange={(event) => setMakeFilter(event.target.value)}>
                <option value="">{t('chief.filter.all')} ({vehicles.length})</option>
                {[...options.makes.entries()].map(([name, count]) => (
                  <option key={name} value={name}>
                    {name} ({count})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t('chief.filter.engine')}</span>
              <select value={engineFilter} onChange={(event) => setEngineFilter(event.target.value)}>
                <option value="">{t('chief.filter.all')} ({vehicles.length})</option>
                {[...options.engines.entries()].map(([name, count]) => (
                  <option key={name} value={name}>
                    {name} ({count})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t('chief.filter.vehicleType')}</span>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="">{t('chief.filter.all')} ({vehicles.length})</option>
                {[...options.types.entries()].map(([name, count]) => (
                  <option key={name} value={name}>
                    {name} ({count})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t('fleet.col.status')}</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">{t('chief.filter.all')} ({vehicles.length})</option>
                {(['normal', 'anomaly', 'failed'] as const).map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)} ({options.statuses.get(status) ?? 0})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn--secondary fleet-reset"
              onClick={reset}
              disabled={!hasFilters}
              aria-label={t('fleet.resetFilters')}
            >
              <X size={16} aria-hidden />
              {t('fleet.resetFilters')}
            </button>
          </div>

          <p className="toolbar-meta">{t('fleet.count', { shown: filtered.length, total: vehicles.length })}</p>

          <div className="fleet-table-wrap">
            <table className="fleet-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" className="sort-btn" onClick={() => toggleSort('plate')}>
                      {t('fleet.col.plate')} {sortMark('plate')}
                    </button>
                  </th>
                  <th>{t('fleet.col.garage')}</th>
                  <th>
                    <button type="button" className="sort-btn" onClick={() => toggleSort('make')}>
                      {t('fleet.col.model')} {sortMark('make')}
                    </button>
                  </th>
                  <th>{t('fleet.col.engine')}</th>
                  <th>{t('fleet.col.status')}</th>
                  <th>
                    <button type="button" className="sort-btn" onClick={() => toggleSort('sessions')}>
                      {t('fleet.col.sessions')} {sortMark('sessions')}
                    </button>
                  </th>
                  <th aria-label={t('tickets.more')} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((vehicle) => (
                  <tr
                    key={vehicle.vehicle_id}
                    tabIndex={0}
                    onClick={() => setSelected(vehicle.vehicle_id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelected(vehicle.vehicle_id)
                      }
                    }}
                  >
                    <td>
                      <strong>{vehicle.vehicle_id}</strong>
                    </td>
                    <td>{vehicle.garage_no}</td>
                    <td>{displayVehicleModel(vehicle.make, vehicle.model)}</td>
                    <td>{vehicle.engine_model}</td>
                    <td>
                      <span className={`badge badge--${fleetStatus(vehicle) === 'normal' ? 'normal' : fleetStatus(vehicle) === 'failed' || fleetStatus(vehicle) === 'anomaly' ? 'attention' : 'rerecord'}`}>
                        {statusLabel(fleetStatus(vehicle))}
                      </span>
                    </td>
                    <td>{vehicle.sessions.length}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--secondary"
                        onClick={(event) => {
                          event.stopPropagation()
                          setSelected(vehicle.vehicle_id)
                        }}
                      >
                        {t('tickets.more')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 ? <p className="empty-state__text">{t('fleet.empty', { query })}</p> : null}
        </section>
      )}

      {active ? (
        <div className="drawer-scrim" role="presentation" onClick={() => setSelected(null)}>
          <aside className="history-drawer" role="dialog" aria-modal="true" aria-labelledby="fleet-drawer-title" onClick={(event) => event.stopPropagation()}>
            <div className="history-drawer__head">
              <div>
                <p className="eyebrow">{t('diag.vehiclePassport')}</p>
                <h2 id="fleet-drawer-title">{active.vehicle_id}</h2>
              </div>
              <button type="button" className="icon-btn" onClick={() => setSelected(null)} aria-label={t('common.close')}>
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="vehicle-summary vehicle-summary--drawer">
              <span className="vehicle-summary__item">
                <span>{t('fleet.col.model')}</span>
                {displayVehicleModel(active.make, active.model)}
              </span>
              <span className="vehicle-summary__item">
                <span>{t('diag.garage')}</span>
                {active.garage_no}
              </span>
              <span className="vehicle-summary__item">
                <span>{t('diag.engine')}</span>
                {active.engine_model}
              </span>
              <span className="vehicle-summary__item">
                <span>{t('chief.filter.vehicleType')}</span>
                {active.vehicle_type}
              </span>
              <span className="vehicle-summary__item">
                <span>{t('fleet.col.status')}</span>
                {statusLabel(fleetStatus(active))}
              </span>
            </div>

            <h3 className="drawer-section-title">{t('history.title')}</h3>
            <ul className="history-list history-list--drawer">
              {[...active.sessions]
                .sort((a, b) => b.checked_at.localeCompare(a.checked_at))
                .map((session) => (
                  <li key={session.session_id}>
                    <button
                      type="button"
                      className="history-item"
                      onClick={() => onOpenDiagnosis(active.vehicle_id, session.session_id)}
                    >
                      <span className="history-item__id">{session.session_id}</span>
                      <span className="history-item__date">{formatSessionDateTime(locale, session.checked_at)}</span>
                    </button>
                  </li>
                ))}
            </ul>

            <div className="workflow-actions">
              <button type="button" className="btn btn--primary" onClick={() => onOpenDiagnosis(active.vehicle_id)}>
                {t('fleet.actionDiagnose')}
                <ArrowRight size={18} aria-hidden />
              </button>
              {onOpenTickets ? (
                <button type="button" className="btn btn--secondary" onClick={() => onOpenTickets(active.vehicle_id)}>
                  {t('nav.tickets')}
                </button>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  )
}
