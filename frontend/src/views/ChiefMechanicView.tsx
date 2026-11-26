import { useEffect, useState, type ReactNode } from 'react'
import { AlertOctagon, AlertTriangle, CheckCircle2, Filter, Search } from 'lucide-react'
import {
  fetchFleetDashboard,
  type FleetDashboard,
  type FleetDashboardFilters,
  type VehicleFleetRow,
} from '../api/fleet'
import { VehicleInsightPanel } from '../components/VehicleInsightPanel'

interface ChiefMechanicViewProps {
  onOpenDiagnosis: (vehicleId: string, sessionId?: string) => void
}

const CATEGORY_LABELS = {
  normal: 'Норма',
  attention: 'Требует внимания',
  quarantine: 'Карантин',
} as const

export function ChiefMechanicView({ onOpenDiagnosis }: ChiefMechanicViewProps) {
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
        if (!cancelled) setError(err instanceof Error ? err.message : 'Ошибка сводки')
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
        <h1>Главный механик</h1>
        <p>
          Сводка по последней проверке каждого ТС (50 машин). Категории взаимоисключающие; карантин не выводится из
          одного ML-score. Данные синтетические, Mock ML.
        </p>
      </header>

      {error ? <p className="panel__error">{error}</p> : null}
      {loading && !data ? <p className="panel__subtitle">Загрузка аналитики…</p> : null}

      {data ? (
        <>
          <section className="chief-summary" aria-label="Сводка категорий">
            <SummaryCard
              tone="ok"
              icon={<CheckCircle2 size={20} />}
              label={CATEGORY_LABELS.normal}
              value={data.summary.normal}
              hint={`Последние ML: normal ${data.session_stats.latest_by_status.normal ?? 0}`}
            />
            <SummaryCard
              tone="warn"
              icon={<AlertTriangle size={20} />}
              label={CATEGORY_LABELS.attention}
              value={data.summary.attention}
              hint={`ML последняя сессия: ${data.session_stats.latest_by_status.anomaly ?? 0} anomaly · ${data.session_stats.latest_by_status.check_failed ?? 0} failed`}
            />
            <SummaryCard
              tone="danger"
              icon={<AlertOctagon size={20} />}
              label={CATEGORY_LABELS.quarantine}
              value={data.summary.quarantine}
              hint="High + обоснование или заявка"
            />
          </section>

          <section className="panel chief-stats">
            <h2 className="panel__title">Статистика сессий (195)</h2>
            <p className="panel__subtitle">
              Исходы ML по всем проверкам, не путать с категориями парка. Последняя сессия на ТС: 25 / 23 / 2.
            </p>
            <div className="stats-grid">
              <StatBlock title="По статусу" items={data.session_stats.by_status} />
              <StatBlock title="По двигателю (сессии)" items={data.session_stats.by_engine_model} />
              <StatBlock title="Типы отклонений" items={data.session_stats.by_anomaly_type} />
            </div>
          </section>

          <section className="panel">
            <h2 className="panel__title">Очередь внимания</h2>
            <p className="panel__subtitle">Сортировка по priority_score без LLM.</p>
            <ul className="priority-queue">
              {data.priority_queue.slice(0, 12).map((row) => (
                <li key={row.vehicle_id}>
                  <QueueRow row={row} onClick={() => setSelectedVehicle(row.vehicle_id)} />
                </li>
              ))}
            </ul>
          </section>

          {data.early_warnings_fleet.length ? (
            <section className="panel">
              <h2 className="panel__title">Ранние предупреждения</h2>
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
              Фильтры и список
            </h2>
            <div className="chief-filters">
              <label className="field">
                <span>Поиск</span>
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
                    <ChiefTableRow key={row.vehicle_id} row={row} onClick={() => setSelectedVehicle(row.vehicle_id)} />
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

function QueueRow({ row, onClick }: { row: VehicleFleetRow; onClick: () => void }) {
  return (
    <button type="button" className="queue-row" onClick={onClick}>
      <span className={`badge badge--${row.category}`}>{CATEGORY_LABELS[row.category]}</span>
      <span className="queue-row__id">
        {row.vehicle_id} · {row.anomaly_type ?? row.latest_status}
      </span>
      <span className="queue-row__meta">prio {row.priority_score}</span>
    </button>
  )
}

function ChiefTableRow({ row, onClick }: { row: VehicleFleetRow; onClick: () => void }) {
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
        <span className={`badge badge--${row.category}`}>{CATEGORY_LABELS[row.category]}</span>
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