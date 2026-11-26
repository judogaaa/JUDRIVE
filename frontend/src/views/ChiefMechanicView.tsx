import { useEffect, useState, type ReactNode } from 'react'
import { AlertOctagon, AlertTriangle, CheckCircle2, Filter, Search } from 'lucide-react'
import {
  fetchFleetDashboard,
  type FleetDashboard,
  type FleetDashboardFilters,
  type VehicleFleetRow,
} from '../api/fleet'
import { VehicleInsightPanel } from '../components/VehicleInsightPanel'
import { useI18n } from '../i18n/I18nContext'

interface ChiefMechanicViewProps {
  onOpenDiagnosis: (vehicleId: string, sessionId?: string) => void
}

export function ChiefMechanicView({ onOpenDiagnosis }: ChiefMechanicViewProps) {
  const { t } = useI18n()

  const categoryLabel = (row: VehicleFleetRow) => {
    if (row.category === 'quarantine') {
      return row.quarantine_confirmed ? t('chief.cat.quarantineConfirmed') : t('chief.cat.quarantineRec')
    }
    if (row.category === 'attention') return t('chief.cat.attention')
    return t('chief.cat.normal')
  }
  const [data, setData] = useState<FleetDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<FleetDashboardFilters>({})
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchFleetDashboard(filters)
      .then((payload) => {
        if (!cancelled) setData(payload)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t('error.dashboard'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filters])

  return (
    <>
      <header className="page-header">
        <h1>{t('chief.title')}</h1>
        <p>{t('chief.subtitle')}</p>
      </header>

      {error ? <p className="panel__error">{error}</p> : null}
      {loading && !data ? <p className="panel__subtitle">{t('chief.loading')}</p> : null}

      {data ? (
        <>
          <section className="chief-summary" aria-label="Сводка категорий">
            <SummaryCard
              tone="ok"
              icon={<CheckCircle2 size={20} />}
              label={t('chief.cat.normal')}
              value={data.summary.normal}
              hint={`Последняя проверка без отклонений: ${data.session_stats.latest_by_status.normal ?? 0}`}
            />
            <SummaryCard
              tone="warn"
              icon={<AlertTriangle size={20} />}
              label={t('chief.cat.attention')}
              value={data.summary.attention}
              hint={`Отклонения: ${data.session_stats.latest_by_status.anomaly ?? 0} · сбой записи: ${data.session_stats.latest_by_status.check_failed ?? 0}`}
            />
            <SummaryCard
              tone="danger"
              icon={<AlertOctagon size={20} />}
              label={t('chief.cat.quarantineRec')}
              value={data.summary.quarantine}
              hint={t('chief.quarantineCardHint')}
            />
          </section>

          <section className="panel">
            <h2 className="panel__title">{t('chief.queueTitle')}</h2>
            <p className="panel__subtitle">{t('chief.queueHint')}</p>
            <ul className="priority-queue">
              {data.priority_queue.slice(0, 12).map((row) => (
                <li key={row.vehicle_id}>
                  <QueueRow row={row} label={categoryLabel(row)} onClick={() => setSelectedVehicle(row.vehicle_id)} />
                </li>
              ))}
            </ul>
          </section>

          <section className="panel chief-stats">
            <h2 className="panel__title">{t('chief.analyticsTitle')}</h2>
            <p className="panel__subtitle">
              Всего проверок: {data.session_stats.total_sessions}. По последней проверке каждой машины: норма{' '}
              {data.session_stats.latest_by_status.normal ?? 0}, отклонение{' '}
              {data.session_stats.latest_by_status.anomaly ?? 0}, сбой записи{' '}
              {data.session_stats.latest_by_status.check_failed ?? 0}.
            </p>
            <div className="stats-grid">
              <StatBlock title={t('chief.stat.status')} items={data.session_stats.by_status} />
              <StatBlock title={t('chief.stat.engine')} items={data.session_stats.by_engine_model} />
              <StatBlock title={t('chief.stat.anomaly')} items={data.session_stats.by_anomaly_type} />
            </div>
          </section>

          {data.early_warnings_fleet.length ? (
            <section className="panel">
              <h2 className="panel__title">{t('chief.warningsTitle')}</h2>
              <ul className="insight-warnings">
                {data.early_warnings_fleet.slice(0, 15).map((w) => (
                  <li key={`${w.vehicle_id}-${w.code}`}>
                    <button type="button" className="chat-source-link" onClick={() => setSelectedVehicle(w.vehicle_id)}>
                      {w.vehicle_id}
                    </button>
                    — {w.message}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="panel">
            <h2 className="panel__title">
              <Filter size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} aria-hidden />
              {t('chief.filtersTitle')}
            </h2>
            <div className="chief-filters">
              <label className="field">
                <span>{t('diag.search')}</span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <Search size={16} aria-hidden />
                  <input
                    value={filters.q ?? ''}
                    onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value || undefined }))}
                    placeholder="Госномер, гараж, двигатель…"
                    style={{ flex: 1 }}
                  />
                </div>
              </label>
              <label className="field">
                <span>Категория</span>
                <select
                  value={filters.category ?? ''}
                  onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value || undefined }))}
                >
                  <option value="">Все</option>
                  <option value="normal">Норма</option>
                  <option value="attention">Требует внимания</option>
                  <option value="quarantine">Карантин</option>
                </select>
              </label>
              <label className="field">
                <span>Двигатель</span>
                <select
                  value={filters.engine_model ?? ''}
                  onChange={(e) => setFilters((f) => ({ ...f, engine_model: e.target.value || undefined }))}
                >
                  <option value="">Все</option>
                  {data.engine_models.map((engine) => (
                    <option key={engine} value={engine}>
                      {engine}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Тип ТС</span>
                <select
                  value={filters.vehicle_type ?? ''}
                  onChange={(e) => setFilters((f) => ({ ...f, vehicle_type: e.target.value || undefined }))}
                >
                  <option value="">Все</option>
                  {data.vehicle_types.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="fleet-table-wrap" style={{ marginTop: '1rem' }}>
              <table className="fleet-table">
                <thead>
                  <tr>
                    <th>ТС</th>
                    <th>Категория</th>
                    <th>Последняя</th>
                    <th>Score</th>
                    <th>Причина</th>
                  </tr>
                </thead>
                <tbody>
                  {data.vehicles.map((row) => (
                    <ChiefTableRow
                      key={row.vehicle_id}
                      row={row}
                      label={categoryLabel(row)}
                      onClick={() => setSelectedVehicle(row.vehicle_id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      <VehicleInsightPanel
        vehicleId={selectedVehicle}
        onClose={() => setSelectedVehicle(null)}
        onOpenDiagnosis={(id, sessionId) => {
          setSelectedVehicle(null)
          onOpenDiagnosis(id, sessionId)
        }}
      />
    </>
  )
}

function SummaryCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string
  value: number
  hint: string
  tone: 'ok' | 'warn' | 'danger'
  icon: ReactNode
}) {
  return (
    <article className={`summary-card summary-card--${tone}`}>
      <span className="summary-card__icon" aria-hidden>
        {icon}
      </span>
      <p className="summary-card__value">{value}</p>
      <p className="summary-card__label">{label}</p>
      <p className="summary-card__hint">{hint}</p>
    </article>
  )
}

function StatBlock({ title, items }: { title: string; items: Record<string, number> }) {
  const entries = Object.entries(items).sort((a, b) => b[1] - a[1])
  return (
    <div className="stat-block">
      <h3>{title}</h3>
      <ul>
        {entries.map(([key, count]) => (
          <li key={key}>
            <span>{key}</span>
            <strong>{count}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

function QueueRow({ row, label, onClick }: { row: VehicleFleetRow; label: string; onClick: () => void }) {
  return (
    <button type="button" className="queue-row" onClick={onClick}>
      <span className={`badge badge--${row.category}`}>{label}</span>
      <span className="queue-row__id">
        {row.vehicle_id} · {row.anomaly_type ?? row.latest_status}
      </span>
      <span className="queue-row__meta">prio {row.priority_score}</span>
    </button>
  )
}

function ChiefTableRow({ row, label, onClick }: { row: VehicleFleetRow; label: string; onClick: () => void }) {
  return (
    <tr
      onClick={onClick}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <td>
        {row.vehicle_id}
        <br />
        <span className="ticket-row__meta">{row.engine_model}</span>
      </td>
      <td>
        <span className={`badge badge--${row.category}`}>{label}</span>
        {row.needs_rerecord ? <span className="badge badge--rerecord">Повтор записи</span> : null}
      </td>
      <td>
        {row.latest_session_id}
        <br />
        <span className="ticket-row__meta">{row.latest_status}</span>
      </td>
      <td>{row.anomaly_score != null ? row.anomaly_score.toFixed(2) : '—'}</td>
      <td>{row.category_reason}</td>
    </tr>
  )
}