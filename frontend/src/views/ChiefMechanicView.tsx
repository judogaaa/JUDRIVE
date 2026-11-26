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
  onOpenTickets?: (vehicleId: string) => void
}

export function ChiefMechanicView({ onOpenDiagnosis, onOpenTickets }: ChiefMechanicViewProps) {
  const { t } = useI18n()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [tab, setTab] = useState<'overview' | 'queue' | 'analytics' | 'warnings' | 'fleet'>('overview')

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
    fetch('/api/auth/session', { credentials: 'include' })
      .then((r) => r.json())
      .then((body: { authenticated?: boolean }) => {
        if (!cancelled) setAuthed(Boolean(body.authenticated))
      })
      .catch(() => {
        if (!cancelled) setAuthed(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!authed) return
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
  }, [filters, authed])

  if (authed === null) {
    return <p className="panel__subtitle">{t('chief.loading')}</p>
  }

  if (!authed) {
    return <ChiefLogin onSuccess={() => setAuthed(true)} />
  }

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
          <nav className="chief-tabs" aria-label={t('chief.title')}>
            {(
              [
                ['overview', t('chief.tab.overview')],
                ['queue', t('chief.tab.queue')],
                ['analytics', t('chief.tab.analytics')],
                ['warnings', t('chief.tab.warnings')],
                ['fleet', t('chief.tab.fleet')],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={tab === id ? 'chip-button chip-button--on' : 'chip-button'}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className="chip-button"
              onClick={() => {
                void fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then(() => setAuthed(false))
              }}
            >
              {t('auth.logout')}
            </button>
          </nav>

          <section className="chief-summary" hidden={tab !== 'overview'} aria-label={t('chief.summaryCategories')}>
            <SummaryCard
              tone="ok"
              icon={<CheckCircle2 size={20} />}
              label={t('chief.cat.normal')}
              value={data.summary.normal}
              hint={t('chief.hint.normal', { count: data.session_stats.latest_by_status.normal ?? 0 })}
              onOpen={() => {
                setFilters((prev) => ({ ...prev, category: 'normal' }))
                setTab('fleet')
              }}
            />
            <SummaryCard
              tone="warn"
              icon={<AlertTriangle size={20} />}
              label={t('chief.cat.attention')}
              value={data.summary.attention}
              hint={t('chief.hint.attention', {
                anomaly: data.session_stats.latest_by_status.anomaly ?? 0,
                failed: data.session_stats.latest_by_status.check_failed ?? 0,
              })}
              onOpen={() => {
                setFilters((prev) => ({ ...prev, category: 'attention' }))
                setTab('fleet')
              }}
            />
            <SummaryCard
              tone="danger"
              icon={<AlertOctagon size={20} />}
              label={t('chief.cat.quarantineRec')}
              value={data.summary.quarantine}
              hint={t('chief.quarantineCardHint')}
              onOpen={() => {
                setFilters((prev) => ({ ...prev, category: 'quarantine' }))
                setTab('fleet')
              }}
            />
          </section>

          <section className="panel" hidden={tab !== 'queue'}>
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

          <section className="panel chief-stats" hidden={tab !== 'analytics'}>
            <h2 className="panel__title">{t('chief.analyticsTitle')}</h2>
            <p className="panel__subtitle">
              {t('chief.analytics.intro', {
                total: data.session_stats.total_sessions,
                normal: data.session_stats.latest_by_status.normal ?? 0,
                anomaly: data.session_stats.latest_by_status.anomaly ?? 0,
                failed: data.session_stats.latest_by_status.check_failed ?? 0,
              })}
            </p>
            <div className="stats-grid">
              <StatBlock
                title={t('chief.stat.status')}
                items={{
                  [t('verdict.normal.title')]: data.session_stats.by_status.normal ?? 0,
                  [t('verdict.anomaly.title')]: data.session_stats.by_status.anomaly ?? 0,
                  [t('verdict.failed.title')]: data.session_stats.by_status.check_failed ?? 0,
                }}
              />
              <StatBlock title={t('chief.stat.engine')} items={data.session_stats.by_engine_model} />
              <StatBlock title={t('chief.stat.anomaly')} items={data.session_stats.by_anomaly_type} />
            </div>
          </section>

          {data.early_warnings_fleet.length ? (
            <section className="panel" hidden={tab !== 'warnings'}>
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

          <section className="panel" hidden={tab !== 'fleet'}>
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
                    placeholder={t('chief.filter.searchPlaceholder')}
                    style={{ flex: 1 }}
                  />
                </div>
              </label>
              <label className="field">
                <span>{t('chief.filter.category')}</span>
                <select
                  value={filters.category ?? ''}
                  onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value || undefined }))}
                >
                  <option value="">{t('chief.filter.all')}</option>
                  <option value="normal">{t('chief.cat.normal')}</option>
                  <option value="attention">{t('chief.cat.attention')}</option>
                  <option value="quarantine">{t('chief.cat.quarantine')}</option>
                </select>
              </label>
              <label className="field">
                <span>{t('chief.filter.engine')}</span>
                <select
                  value={filters.engine_model ?? ''}
                  onChange={(e) => setFilters((f) => ({ ...f, engine_model: e.target.value || undefined }))}
                >
                  <option value="">{t('chief.filter.all')}</option>
                  {data.engine_models.map((engine) => (
                    <option key={engine} value={engine}>
                      {engine}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t('chief.filter.vehicleType')}</span>
                <select
                  value={filters.vehicle_type ?? ''}
                  onChange={(e) => setFilters((f) => ({ ...f, vehicle_type: e.target.value || undefined }))}
                >
                  <option value="">{t('chief.filter.all')}</option>
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
                    <th>{t('chief.col.vehicle')}</th>
                    <th>{t('chief.col.category')}</th>
                    <th>{t('chief.col.latest')}</th>
                    <th>{t('chief.col.score')}</th>
                    <th>{t('chief.col.reason')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.vehicles.map((row) => (
                    <ChiefTableRow
                      key={row.vehicle_id}
                      row={row}
                      label={categoryLabel(row)}
                      rerecordLabel={t('chief.badge.rerecord')}
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
        onOpenTickets={
          onOpenTickets
            ? (id) => {
                setSelectedVehicle(null)
                onOpenTickets(id)
              }
            : undefined
        }
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
  onOpen,
}: {
  label: string
  value: number
  hint: string
  tone: 'ok' | 'warn' | 'danger'
  icon: ReactNode
  onOpen: () => void
}) {
  return (
    <button type="button" className={`summary-card summary-card--${tone}`} onClick={onOpen}>
      <span className="summary-card__icon" aria-hidden>
        {icon}
      </span>
      <p className="summary-card__value">{value}</p>
      <p className="summary-card__label">{label}</p>
      <p className="summary-card__hint">{hint}</p>
    </button>
  )
}

function ChiefLogin({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useI18n()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!response.ok) {
        setError(response.status === 503 ? t('auth.unavailable') : t('auth.error'))
        return
      }
      onSuccess()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <section className="panel auth-card">
      <h1>{t('auth.title')}</h1>
      <p className="panel__subtitle">{t('chief.subtitle')}</p>
      <label className="field">
        <span>{t('auth.user')}</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
      </label>
      <label className="field">
        <span>{t('auth.password')}</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>
      {error ? <p className="panel__error">{error}</p> : null}
      <button type="button" className="btn btn--primary" disabled={busy || !username || !password} onClick={() => void submit()}>
        {t('auth.submit')}
      </button>
    </section>
    </div>
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

function ChiefTableRow({
  row,
  label,
  rerecordLabel,
  onClick,
}: {
  row: VehicleFleetRow
  label: string
  rerecordLabel: string
  onClick: () => void
}) {
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
        {row.needs_rerecord ? <span className="badge badge--rerecord">{rerecordLabel}</span> : null}
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